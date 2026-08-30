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

const readJsonOrEmpty = async (filePath: string): Promise<UnrewrittenMediaEntry[]> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as UnrewrittenMediaEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return []
  }
}

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

  const unrewritten: { collection: string; wordpressId: number; urls: string[] }[] = []

  for (const post of posts) {
    const postRelations = relations.filter((r) => r.objectId === post.wordpressId)
    const categoryIds = await resolveTermIds(
      'categories',
      postRelations.filter((r) => r.taxonomy === 'category').map((r) => r.termId),
    )
    const tagIds = await resolveTermIds(
      'tags',
      postRelations.filter((r) => r.taxonomy === 'post_tag').map((r) => r.termId),
    )

    const existing = await payload.find({
      collection: 'posts',
      limit: 1,
      overrideAccess: true,
      where: { 'legacy.wordpressId': { equals: post.wordpressId } },
    })

    const renderHTML = buildRenderHTML(post.originalHTML, mediaMap)
    const leftoverUrls = collectUnrewrittenUrls(renderHTML)
    if (leftoverUrls.length) {
      unrewritten.push({ collection: 'posts', wordpressId: post.wordpressId, urls: leftoverUrls })
    }

    const data = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      contentFormat: 'legacy-html' as const,
      commentsEnabled: post.commentsEnabled,
      publishedAt: post.publishedAt ?? undefined,
      verification: { status: 'imported' as const },
      review: { status: 'approved' as const },
      provenance: { origin: 'wordpress' as const, sourceVisibility: 'public' as const },
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
        importedAt: new Date().toISOString(),
        migrationVersion: MIGRATION_VERSION,
      },
      _status: post.status === 'publish' ? ('published' as const) : ('draft' as const),
    }

    if (existing.docs[0]) {
      const priorImportedAt = (existing.docs[0].legacy as { importedAt?: string } | null)?.importedAt
      await payload.update({
        collection: 'posts',
        id: existing.docs[0].id,
        data: {
          ...data,
          legacy: {
            ...data.legacy,
            importedAt: priorImportedAt ?? new Date().toISOString(),
          },
        },
        draft: post.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      console.log(`updated wp:${post.wordpressId} -> payload:${existing.docs[0].id}`)
    } else {
      const created = await payload.create({
        collection: 'posts',
        data,
        draft: post.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      console.log(`created wp:${post.wordpressId} -> payload:${created.id}`)
    }
  }

  const reportPath = path.join(process.cwd(), 'migration-data/reports/unrewritten-media-urls.json')
  const prior = await readJsonOrEmpty(reportPath)
  const others = prior.filter((entry) => entry.collection !== 'posts')
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify([...others, ...unrewritten], null, 2)}\n`)
  console.log(
    `posts import: unrewritten WP media urls in ${unrewritten.length} posts (see migration-data/reports/unrewritten-media-urls.json)`,
  )
}

await main()
process.exit(process.exitCode ?? 0)
