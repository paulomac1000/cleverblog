import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildMediaRewriteMap, buildRenderHTML, collectUnrewrittenUrls } from './render-html'
import type { NormalizedPost } from './types'

const inputPath = path.join(process.cwd(), 'migration-data/normalized/pages.json')
const MIGRATION_VERSION = process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

const main = async () => {
  const pages = JSON.parse(await readFile(inputPath, 'utf8')) as NormalizedPost[]
  const payload = await getPayload({ config })
  const mediaMap = await buildMediaRewriteMap()
  const unrewritten: { collection: 'pages'; wordpressId: number; urls: string[] }[] = []

  let created = 0
  let updated = 0

  for (const page of pages) {
    const existing = await payload.find({
      collection: 'pages',
      limit: 1,
      overrideAccess: true,
      where: { 'legacy.wordpressId': { equals: page.wordpressId } },
    })

    const renderHTML = buildRenderHTML(page.originalHTML, mediaMap)
    const leftoverUrls = collectUnrewrittenUrls(renderHTML)
    if (leftoverUrls.length) {
      unrewritten.push({ collection: 'pages', wordpressId: page.wordpressId, urls: leftoverUrls })
    }

    const importedAt = new Date().toISOString()

    const data = {
      title: page.title,
      slug: page.slug,
      excerpt: page.excerpt,
      contentFormat: 'legacy-html' as const,
      publishedAt: page.publishedAt ?? undefined,
      provenance: { origin: 'wordpress' as const, sourceVisibility: 'public' as const },
      legacy: {
        wordpressId: page.wordpressId,
        wordpressGuid: page.wordpressGuid ?? undefined,
        originalUrl: page.originalUrl,
        originalHTML: page.originalHTML,
        renderHTML,
        sourceHash: page.sourceHash,
        importedAt,
        migrationVersion: MIGRATION_VERSION,
      },
      _status: page.status === 'publish' ? ('published' as const) : ('draft' as const),
    }

    if (existing.docs[0]) {
      const priorImportedAt = (existing.docs[0].legacy as { importedAt?: string } | null)?.importedAt
      await payload.update({
        collection: 'pages',
        id: existing.docs[0].id,
        data: {
          ...data,
          legacy: {
            ...data.legacy,
            importedAt: priorImportedAt ?? importedAt,
          },
        },
        draft: page.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      updated += 1
    } else {
      await payload.create({
        collection: 'pages',
        data,
        draft: page.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      created += 1
    }
  }

  console.log(`pages import: ${created} created, ${updated} updated (${pages.length} pages)`)

  const reportPath = path.join(process.cwd(), 'migration-data/reports/unrewritten-media-urls.json')
  let prior: unknown[] = []
  try {
    prior = JSON.parse(await readFile(reportPath, 'utf8')) as unknown[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const priorOthers = prior.filter(
    (entry) => (entry as { collection?: string }).collection !== 'pages',
  )
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify([...priorOthers, ...unrewritten], null, 2)}\n`)
  console.log(
    `pages import: unrewritten WP media urls in ${unrewritten.length} pages (see migration-data/reports/unrewritten-media-urls.json)`,
  )

  process.exit(process.exitCode ?? 0)
}

await main()
