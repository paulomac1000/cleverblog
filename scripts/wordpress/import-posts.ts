import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildMediaRewriteMap, buildRenderHTML, collectUnrewrittenUrls } from './render-html'

import type { NormalizedPost } from './types'

type UnrewrittenMediaEntry = {
  collection: string
  wordpressId: number
  urls: string[]
}

type ComparablePostInput = {
  title?: unknown
  slug?: unknown
  excerpt?: unknown
  contentFormat?: unknown
  commentsEnabled?: unknown
  publishedAt?: unknown
  categories?: unknown
  tags?: unknown
  legacy?: unknown
  _status?: unknown
}

const readJsonOrEmpty = async (filePath: string): Promise<UnrewrittenMediaEntry[]> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as UnrewrittenMediaEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return []
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

const normalizeRelationshipIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return value
    .flatMap((item): string[] => {
      if (item === null || item === undefined) return []

      if (typeof item === 'object') {
        const id = (item as { id?: unknown }).id
        return id === null || id === undefined ? [] : [String(id)]
      }

      return [String(item)]
    })
    .sort()
}

const comparableLegacy = (value: unknown) => {
  const legacy = asRecord(value)

  return {
    wordpressId: legacy.wordpressId ?? null,
    wordpressGuid: legacy.wordpressGuid ?? null,
    originalUrl: legacy.originalUrl ?? null,
    originalSlug: legacy.originalSlug ?? null,
    originalHTML: legacy.originalHTML ?? null,
    renderHTML: legacy.renderHTML ?? null,
    sourceHash: legacy.sourceHash ?? null,
  }
}

const comparablePost = (value: ComparablePostInput) => ({
  title: value.title ?? '',
  slug: value.slug ?? '',
  excerpt: value.excerpt ?? '',
  contentFormat: value.contentFormat ?? null,
  commentsEnabled: value.commentsEnabled === true,
  publishedAt: value.publishedAt ?? null,
  categories: normalizeRelationshipIds(value.categories),
  tags: normalizeRelationshipIds(value.tags),
  legacy: comparableLegacy(value.legacy),
  _status: value._status ?? null,
})

const sameImportedPost = (existing: ComparablePostInput, target: ComparablePostInput): boolean =>
  JSON.stringify(comparablePost(existing)) === JSON.stringify(comparablePost(target))

const inputPath = path.join(process.cwd(), 'migration-data/normalized/posts.json')
const MIGRATION_VERSION = process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

async function main() {
  const posts = JSON.parse(await readFile(inputPath, 'utf8')) as NormalizedPost[]
  const payload = await getPayload({ config })
  const mediaMap = await buildMediaRewriteMap()

  // term-relations.json: one-time capture from live WP (objectId -> termId).
  const relations = JSON.parse(
    await readFile(path.join(process.cwd(), 'migration-data/raw/term-relations.json'), 'utf8'),
  ) as { objectId: number; termId: number; taxonomy: string }[]

  const resolveTermIds = async (
    collection: 'categories' | 'tags',
    termIds: number[],
  ): Promise<number[]> => {
    const resolved: number[] = []

    for (const termId of termIds) {
      const found = await payload.find({
        collection,
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { legacyWordPressId: { equals: termId } },
      })

      if (!found.docs[0]) {
        throw new Error(
          `Taxonomy relation cannot be resolved: ${collection} term wp:${termId} is missing in Payload`,
        )
      }

      resolved.push(found.docs[0].id)
    }

    return resolved
  }

  const unrewritten: {
    collection: string
    wordpressId: number
    urls: string[]
  }[] = []

  let created = 0
  let updated = 0
  let unchanged = 0

  for (const post of posts) {
    const postRelations = relations.filter((relation) => relation.objectId === post.wordpressId)

    const categoryIds = await resolveTermIds(
      'categories',
      postRelations
        .filter((relation) => relation.taxonomy === 'category')
        .map((relation) => relation.termId),
    )

    const tagIds = await resolveTermIds(
      'tags',
      postRelations
        .filter((relation) => relation.taxonomy === 'post_tag')
        .map((relation) => relation.termId),
    )

    const existing = await payload.find({
      collection: 'posts',
      depth: 0,
      draft: post.status !== 'publish',
      limit: 1,
      overrideAccess: true,
      where: { 'legacy.wordpressId': { equals: post.wordpressId } },
    })

    const renderHTML = buildRenderHTML(post.originalHTML, mediaMap)
    const leftoverUrls = collectUnrewrittenUrls(renderHTML)

    if (leftoverUrls.length) {
      unrewritten.push({
        collection: 'posts',
        wordpressId: post.wordpressId,
        urls: leftoverUrls,
      })
    }

    const importedAt = new Date().toISOString()

    const data = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      contentFormat: 'legacy-html' as const,
      commentsEnabled: post.commentsEnabled,
      publishedAt: post.publishedAt ?? undefined,
      verification: { status: 'imported' as const },
      review: { status: 'approved' as const },
      provenance: {
        origin: 'wordpress' as const,
        sourceVisibility: 'public' as const,
      },
      categories: categoryIds,
      tags: tagIds,
      legacy: {
        wordpressId: post.wordpressId,
        wordpressGuid: post.wordpressGuid ?? undefined,
        originalUrl: post.originalUrl,
        originalSlug: post.slug,
        originalHTML: post.originalHTML,
        renderHTML,
        sourceHash: post.sourceHash,
        importedAt,
        migrationVersion: MIGRATION_VERSION,
      },
      _status: post.status === 'publish' ? ('published' as const) : ('draft' as const),
    }

    if (existing.docs[0]) {
      if (sameImportedPost(existing.docs[0], data)) {
        unchanged += 1
        console.log(`unchanged wp:${post.wordpressId}`)
        continue
      }

      const priorImportedAt = existing.docs[0].legacy?.importedAt

      await payload.update({
        collection: 'posts',
        id: existing.docs[0].id,
        data: {
          ...data,
          legacy: {
            ...data.legacy,
            importedAt: priorImportedAt ?? importedAt,
          },
        },
        draft: post.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })

      updated += 1
      console.log(`updated wp:${post.wordpressId} -> payload:${existing.docs[0].id}`)
    } else {
      const createdPost = await payload.create({
        collection: 'posts',
        data,
        draft: post.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })

      created += 1
      console.log(`created wp:${post.wordpressId} -> payload:${createdPost.id}`)
    }
  }

  console.log(
    `posts import: ${created} created, ${updated} updated, ${unchanged} unchanged (${posts.length} posts)`,
  )

  const reportPath = path.join(
    process.cwd(),
    'migration-data/reports/unrewritten-media-urls.json',
  )
  const prior = await readJsonOrEmpty(reportPath)
  const others = prior.filter((entry) => entry.collection !== 'posts')

  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(
    reportPath,
    `${JSON.stringify([...others, ...unrewritten], null, 2)}\n`,
  )

  console.log(
    `posts import: unrewritten WP media urls in ${unrewritten.length} posts (see migration-data/reports/unrewritten-media-urls.json)`,
  )
}

await main()
process.exit(process.exitCode ?? 0)
