import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import {
  buildMediaRewriteMap,
  buildRenderHTML,
  buildRetiredUploadsPaths,
  collectUnrewrittenUrls,
} from './render-html'

import type { NormalizedPost } from './types'

type UnrewrittenMediaEntry = {
  collection: string
  wordpressId: number
  urls: string[]
}

type ComparablePageInput = {
  title?: unknown
  slug?: unknown
  excerpt?: unknown
  contentFormat?: unknown
  publishedAt?: unknown
  legacy?: unknown
  _status?: unknown
}

const readJsonOrEmpty = async (
  filePath: string,
): Promise<UnrewrittenMediaEntry[]> => {
  try {
    return JSON.parse(
      await readFile(filePath, 'utf8'),
    ) as UnrewrittenMediaEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    return []
  }
}

const asRecord = (
  value: unknown,
): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

const comparableLegacy = (value: unknown) => {
  const legacy = asRecord(value)

  return {
    wordpressId: legacy.wordpressId ?? null,
    wordpressGuid:
      legacy.wordpressGuid ?? null,
    originalUrl: legacy.originalUrl ?? null,
    originalHTML: legacy.originalHTML ?? null,
    renderHTML: legacy.renderHTML ?? null,
    sourceHash: legacy.sourceHash ?? null,
  }
}

const comparablePage = (
  value: ComparablePageInput,
) => ({
  title: value.title ?? '',
  slug: value.slug ?? '',
  excerpt: value.excerpt ?? '',
  contentFormat: value.contentFormat ?? null,
  publishedAt: value.publishedAt ?? null,
  legacy: comparableLegacy(value.legacy),
  _status: value._status ?? null,
})

const sameImportedPage = (
  existing: ComparablePageInput,
  target: ComparablePageInput,
): boolean =>
  JSON.stringify(comparablePage(existing)) ===
  JSON.stringify(comparablePage(target))

const inputPath = path.join(
  process.cwd(),
  'migration-data/normalized/pages.json',
)
const mediaIssuesPath = path.join(
  process.cwd(),
  'migration-data/reports/media-issues.json',
)
const MIGRATION_VERSION =
  process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

const main = async () => {
  const pages = JSON.parse(
    await readFile(inputPath, 'utf8'),
  ) as NormalizedPost[]

  const mediaIssues = JSON.parse(
    await readFile(mediaIssuesPath, 'utf8'),
  ) as unknown

  const retiredUploadsPaths =
    buildRetiredUploadsPaths(mediaIssues)

  const payload = await getPayload({ config })
  const mediaMap = await buildMediaRewriteMap()

  const unrewritten: {
    collection: 'pages'
    wordpressId: number
    urls: string[]
  }[] = []

  let created = 0
  let updated = 0
  let unchanged = 0

  for (const page of pages) {
    const existing = await payload.find({
      collection: 'pages',
      depth: 0,
      draft: page.status !== 'publish',
      limit: 1,
      overrideAccess: true,
      where: {
        'legacy.wordpressId': {
          equals: page.wordpressId,
        },
      },
    })

    const renderHTML = buildRenderHTML(
      page.originalHTML,
      mediaMap,
      { retiredUploadsPaths },
    )

    const leftoverUrls =
      collectUnrewrittenUrls(renderHTML)

    if (leftoverUrls.length) {
      unrewritten.push({
        collection: 'pages',
        wordpressId: page.wordpressId,
        urls: leftoverUrls,
      })
    }

    const importedAt = new Date().toISOString()

    const data = {
      title: page.title,
      slug: page.slug,
      excerpt: page.excerpt,
      contentFormat: 'legacy-html' as const,
      publishedAt:
        page.publishedAt ?? undefined,
      provenance: {
        origin: 'wordpress' as const,
        sourceVisibility: 'public' as const,
      },
      legacy: {
        wordpressId: page.wordpressId,
        wordpressGuid:
          page.wordpressGuid ?? undefined,
        originalUrl: page.originalUrl,
        originalHTML: page.originalHTML,
        renderHTML,
        sourceHash: page.sourceHash,
        importedAt,
        migrationVersion: MIGRATION_VERSION,
      },
      _status:
        page.status === 'publish'
          ? ('published' as const)
          : ('draft' as const),
    }

    if (existing.docs[0]) {
      if (sameImportedPage(existing.docs[0], data)) {
        unchanged += 1
        console.log(
          `unchanged wp:${page.wordpressId}`,
        )
        continue
      }

      const priorImportedAt =
        existing.docs[0].legacy?.importedAt

      await payload.update({
        collection: 'pages',
        id: existing.docs[0].id,
        data: {
          ...data,
          legacy: {
            ...data.legacy,
            importedAt:
              priorImportedAt ?? importedAt,
          },
        },
        draft: page.status !== 'publish',
        context: {
          wordpressMigration: true,
        },
        overrideAccess: true,
      })

      updated += 1
      console.log(
        `updated wp:${page.wordpressId} -> payload:${existing.docs[0].id}`,
      )
    } else {
      const createdPage =
        await payload.create({
          collection: 'pages',
          data,
          draft:
            page.status !== 'publish',
          context: {
            wordpressMigration: true,
          },
          overrideAccess: true,
        })

      created += 1
      console.log(
        `created wp:${page.wordpressId} -> payload:${createdPage.id}`,
      )
    }
  }

  console.log(
    `pages import: ${created} created, ${updated} updated, ${unchanged} unchanged (${pages.length} pages)`,
  )

  const reportPath = path.join(
    process.cwd(),
    'migration-data/reports/unrewritten-media-urls.json',
  )
  const prior = await readJsonOrEmpty(reportPath)
  const others = prior.filter(
    (entry) => entry.collection !== 'pages',
  )

  await mkdir(path.dirname(reportPath), {
    recursive: true,
  })
  await writeFile(
    reportPath,
    `${JSON.stringify(
      [...others, ...unrewritten],
      null,
      2,
    )}\n`,
  )

  console.log(
    `pages import: unrewritten WP media urls in ${unrewritten.length} pages (see migration-data/reports/unrewritten-media-urls.json)`,
  )
}

await main()
process.exit(process.exitCode ?? 0)
