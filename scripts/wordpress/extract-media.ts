import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type WpMediaItem = {
  ID: number
  post_title: string
  post_name: string
  post_status: string
  post_date: string
  post_date_gmt: string
  guid: string
  post_mime_type: string
}

export type NormalizedMedia = {
  wordpressId: number
  slug: string
  title: string
  mimeType: string
  originalUrl: string
  uploadsPath: string | null
  sha256: string | null
  missing: boolean
}

export const sha256Bytes = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex')

export const uploadsPathFromGuid = (guid: string): string | null => {
  const marker = '/wp-content/uploads/'
  const idx = guid.indexOf(marker)
  if (idx === -1) return null
  const rel = guid.slice(idx + marker.length).split('?')[0]
  return rel.length > 0 ? decodeURIComponent(rel) : null
}

export const normalizeMedia = (
  items: WpMediaItem[],
  fileBytes: (uploadsRelPath: string) => Buffer | null,
): { normalized: NormalizedMedia[]; missing: NormalizedMedia[]; unmapped: NormalizedMedia[] } => {
  const normalized: NormalizedMedia[] = []
  const missing: NormalizedMedia[] = []
  const unmapped: NormalizedMedia[] = []

  for (const item of items) {
    const base: NormalizedMedia = {
      wordpressId: item.ID,
      slug: item.post_name,
      title: item.post_title,
      mimeType: item.post_mime_type,
      originalUrl: item.guid,
      uploadsPath: null,
      sha256: null,
      missing: true,
    }

    const rel = uploadsPathFromGuid(item.guid)
    if (rel === null) {
      unmapped.push(base)
      continue
    }

    const bytes = fileBytes(rel)
    if (bytes === null) {
      missing.push({ ...base, uploadsPath: rel })
      continue
    }

    normalized.push({ ...base, uploadsPath: rel, sha256: sha256Bytes(bytes), missing: false })
  }

  return { normalized, missing, unmapped }
}

const main = async () => {
  const rawDir = path.join(process.cwd(), 'migration-data/raw')
  const outDir = path.join(process.cwd(), 'migration-data/normalized')
  const uploadsRoot = path.join(rawDir, 'uploads')

  const items = JSON.parse(await readFile(path.join(rawDir, 'media.json'), 'utf8')) as WpMediaItem[]
  const { normalized, missing, unmapped } = normalizeMedia(items, (rel) => {
    try {
      return readFileSync(path.join(uploadsRoot, rel))
    } catch {
      return null
    }
  })

  await mkdir(outDir, { recursive: true })
  await writeFile(
    path.join(outDir, 'media-manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), media: normalized }, null, 2),
  )
  if (missing.length > 0 || unmapped.length > 0) {
    await writeFile(
      path.join(outDir, 'media-manifest-issues.json'),
      JSON.stringify({ missing, unmapped }, null, 2),
    )
  }
  console.log(
    `media normalized: ${normalized.length} ok, ${missing.length} missing, ${unmapped.length} unmapped`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('extract-media.ts')) {
  await main()
}
