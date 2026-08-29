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
  const drifted: { wordpressId: number; stored: string | null; current: string | null }[] = []

  for (const media of manifest.media) {
    if (media.missing || !media.uploadsPath) {
      skippedMissing += 1
      continue
    }

    // Alt priority: WordPress meta alt (usually empty in this dataset), then the
    // attachment title as the deterministic fallback. The Media collection
    // requires alt, so it is never null.
    const data = {
      alt: media.alt || media.title || media.slug,
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

    const prior = existing.docs[0]
    if (prior) {
      // Hash drift policy: fail closed. The stored sha256 describes the bytes
      // physically imported at create time; a changed manifest hash means the
      // source mutated and the import must stop instead of quietly lying.
      const storedHash = (prior.legacy as { sha256?: string } | null)?.sha256 ?? null
      if (storedHash !== media.sha256) {
        drifted.push({ wordpressId: media.wordpressId, stored: storedHash, current: media.sha256 })
        continue
      }
      await payload.update({
        collection: 'media',
        id: prior.id,
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      updated += 1
    } else {
      await payload.create({
        collection: 'media',
        data,
        filePath: path.join(uploadsRoot, media.uploadsPath),
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      created += 1
    }
  }

  if (drifted.length > 0) {
    console.error('HASH DRIFT detected for', drifted.length, 'media items:', JSON.stringify(drifted, null, 2))
    process.exitCode = 1
  }

  console.log(
    `media import: ${created} created, ${updated} updated, ${skippedMissing} skipped (missing/unmapped), ${drifted.length} drifted`,
  )

  const all = await payload.find({
    collection: 'media',
    limit: 1000,
    overrideAccess: true,
    where: { 'legacy.wordpressId': { not_equals: null } },
  })
  const mapping = Object.fromEntries(
    all.docs.map((doc) => [
      String(doc.legacy?.wordpressId),
      { payloadId: doc.id, sha256: doc.legacy?.sha256 },
    ]),
  )
  const fs = await import('node:fs/promises')
  const outDir = path.join(process.cwd(), 'migration-data/normalized/payload-id-maps')
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(
    path.join(outDir, 'media.json'),
    JSON.stringify(mapping, null, 2),
  )
  console.log(`payload-id map (generated, NOT portable, gitignored): ${Object.keys(mapping).length} entries`)
}

await main()
