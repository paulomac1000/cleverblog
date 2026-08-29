import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { sha256Bytes, type MediaManifest } from './extract-media'

const uploadsRoot = path.join(process.cwd(), 'migration-data/raw/uploads')
const manifestPath = path.join(process.cwd(), 'migration-data/normalized/media-manifest.json')
const MIGRATION_VERSION = process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

const readFileSyncSafe = (absPath: string): Buffer | null => {
  try {
    return readFileSync(absPath)
  } catch {
    return null
  }
}

const main = async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as MediaManifest
  const payload = await getPayload({ config })

  let created = 0
  let updated = 0
  const drifted: { wordpressId: number; stored: string | null; manifest: string | null; actual: string }[] = []

  for (const media of manifest.media) {

    // Alt priority: WordPress meta alt (usually empty in this dataset), then the
    // attachment title as the deterministic fallback. The Media collection
    // requires alt, so it is never null.
    const data = {
      alt: media.alt || media.title || media.slug,
      legacy: {
        wordpressId: media.wordpressId,
        originalUrl: media.originalUrl,
        sha256: media.sha256 as string,
        migrationVersion: MIGRATION_VERSION,
      },
    }

    if (!media.uploadsPath) {
      drifted.push({ wordpressId: media.wordpressId, stored: null, manifest: media.sha256, actual: 'NO-PATH' })
      continue
    }

    // Import-time hashing: hash the bytes that are about to be uploaded and
    // compare against the manifest produced at extract time. Catches anything
    // that mutated between extract and import (fail closed, never store a
    // hash that does not describe the uploaded bytes).
    const actualBytes = readFileSyncSafe(path.join(uploadsRoot, media.uploadsPath))
    if (actualBytes === null) {
      drifted.push({
        wordpressId: media.wordpressId,
        stored: null,
        manifest: media.sha256,
        actual: 'FILE-GONE',
      })
      continue
    }
    const actualHash = sha256Bytes(actualBytes)
    if (actualHash !== media.sha256) {
      drifted.push({ wordpressId: media.wordpressId, stored: null, manifest: media.sha256, actual: actualHash })
      continue
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
      // physically imported at create time; any mismatch with what we are about
      // to store must stop the import instead of quietly lying.
      const storedHash = (prior.legacy as { sha256?: string } | null)?.sha256 ?? null
      if (storedHash !== actualHash) {
        drifted.push({ wordpressId: media.wordpressId, stored: storedHash, manifest: media.sha256, actual: actualHash })
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
        data: {
          ...data,
          legacy: { ...data.legacy, importedAt: new Date().toISOString() },
        },
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

  const unresolvedCount = manifest.unresolved?.length ?? 0
  console.log(
    `media import: ${created} created, ${updated} updated, ${drifted.length} drifted, ${unresolvedCount} unresolved (see migration-data/reports/media-issues.json)`,
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
  process.exit(process.exitCode ?? 0)
}

await main()
