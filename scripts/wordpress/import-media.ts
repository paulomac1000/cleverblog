import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import type { NormalizedMedia } from './extract-media'

const uploadsRoot = path.join(process.cwd(), 'migration-data/raw/uploads')
const manifestPath = path.join(process.cwd(), 'migration-data/normalized/media-manifest.json')
const MIGRATION_VERSION = process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

const main = async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    media: NormalizedMedia[]
  }
  const payload = await getPayload({ config })

  let created = 0
  let updated = 0
  let skippedMissing = 0

  for (const media of manifest.media) {
    if (media.missing || !media.uploadsPath) {
      skippedMissing += 1
      continue
    }

    // Alt text is required by the Media collection; WordPress alt lives in postmeta
    // which is not part of the P1 capture, so the attachment title is the
    // deterministic fallback. Enrichment is a later, explicit pass.
    const data = {
      alt: media.title || media.slug,
      legacy: {
        wordpressId: media.wordpressId,
        originalUrl: media.originalUrl,
        sha256: media.sha256 as string,
        importedAt: new Date().toISOString(),
        migrationVersion: MIGRATION_VERSION,
      },
    }

    const existing = await payload.find({
      collection: 'media',
      limit: 1,
      overrideAccess: true,
      where: { 'legacy.wordpressId': { equals: media.wordpressId } },
    })

    const filePath = path.join(uploadsRoot, media.uploadsPath)

    if (existing.docs[0]) {
      await payload.update({
        collection: 'media',
        id: existing.docs[0].id,
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      updated += 1
    } else {
      await payload.create({
        collection: 'media',
        data,
        filePath,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      created += 1
    }
  }

  console.log(
    `media import: ${created} created, ${updated} updated, ${skippedMissing} skipped (missing/unmapped)`,
  )

  const all = await payload.find({
    collection: 'media',
    limit: 1000,
    overrideAccess: true,
    where: { 'legacy.wordpressId': { not_equals: null } },
  })
  const mapping = Object.fromEntries(
    all.docs.map((doc) => [String(doc.legacy?.wordpressId), { payloadId: doc.id, sha256: doc.legacy?.sha256 }]),
  )
  const fs = await import('node:fs/promises')
  const mappingsDir = path.join(process.cwd(), 'migration-data/mappings')
  await fs.mkdir(mappingsDir, { recursive: true })
  await fs.writeFile(
    path.join(mappingsDir, 'media.json'),
    JSON.stringify(mapping, null, 2),
  )
  console.log(`media mapping written (${Object.keys(mapping).length} entries)`)
}

await main()
