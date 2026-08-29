import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildMediaRewriteMap, buildRenderHTML } from './render-html'
import type { NormalizedPost } from './types'

const inputPath = path.join(process.cwd(), 'migration-data/normalized/pages.json')
const MIGRATION_VERSION = process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

const main = async () => {
  const pages = JSON.parse(await readFile(inputPath, 'utf8')) as NormalizedPost[]
  const payload = await getPayload({ config })

  let created = 0
  let updated = 0

  for (const page of pages) {
    const existing = await payload.find({
      collection: 'pages',
      limit: 1,
      overrideAccess: true,
      where: { 'legacy.wordpressId': { equals: page.wordpressId } },
    })

    const data = {
      title: page.title,
      slug: page.slug,
      excerpt: page.excerpt,
      contentFormat: 'legacy-html' as const,
      provenance: { origin: 'wordpress' as const, sourceVisibility: 'public' as const },
      legacy: {
        wordpressId: page.wordpressId,
        wordpressGuid: page.wordpressGuid ?? undefined,
        originalUrl: page.originalUrl,
        originalHTML: page.originalHTML,
        renderHTML: buildRenderHTML(
          page.originalHTML,
          await buildMediaRewriteMap(),
        ),
        sourceHash: page.sourceHash,
        importedAt: new Date().toISOString(),
        migrationVersion: MIGRATION_VERSION,
      },
      _status: page.status === 'publish' ? ('published' as const) : ('draft' as const),
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'pages',
        id: existing.docs[0].id,
        data,
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
  process.exit(process.exitCode ?? 0)
}

await main()
