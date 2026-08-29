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

export type WpAttachmentMeta = {
  attachedFile?: string
  alt?: string
}

export type NormalizedMedia = {
  wordpressId: number
  slug: string
  title: string
  mimeType: string
  originalUrl: string
  uploadsPath: string | null
  pathSource: 'attached-file' | 'guid' | null
  sha256: string | null
  alt: string | null
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

/**
 * Path resolver safety: rejects absolute paths, `..` traversal (also after
 * percent-decoding) and backslashes. Canonical check happens against the
 * uploads root by the caller via readFileSync containment.
 */
export const isSafeUploadsPath = (rel: string): boolean => {
  if (rel.length === 0 || rel.startsWith('/') || rel.includes('\\')) return false
  const decoded = decodeURIComponent(rel)
  const segments = decoded.split('/')
  return !segments.some((segment) => segment === '..' || segment === '')
}

const resolvePathSource = (
  item: WpMediaItem,
  meta: WpAttachmentMeta | undefined,
): { rel: string | null; source: 'attached-file' | 'guid' | null } => {
  const attached = meta?.attachedFile?.trim()
  if (attached && isSafeUploadsPath(attached)) {
    return { rel: attached, source: 'attached-file' }
  }
  const fromGuid = uploadsPathFromGuid(item.guid)
  if (fromGuid && isSafeUploadsPath(fromGuid)) {
    return { rel: fromGuid, source: 'guid' }
  }
  return { rel: null, source: null }
}

export const normalizeMedia = (
  items: WpMediaItem[],
  attachmentMeta: Record<string, WpAttachmentMeta>,
  fileBytes: (uploadsRelPath: string) => Buffer | null,
): { normalized: NormalizedMedia[]; missing: NormalizedMedia[]; unmapped: NormalizedMedia[] } => {
  const normalized: NormalizedMedia[] = []
  const missing: NormalizedMedia[] = []
  const unmapped: NormalizedMedia[] = []

  for (const item of items) {
    const meta = attachmentMeta[String(item.ID)]
    const alt = meta?.alt?.trim() ? meta.alt.trim() : null
    const base: NormalizedMedia = {
      wordpressId: item.ID,
      slug: item.post_name,
      title: item.post_title,
      mimeType: item.post_mime_type,
      originalUrl: item.guid,
      uploadsPath: null,
      pathSource: null,
      sha256: null,
      alt,
      missing: true,
    }

    const { rel, source } = resolvePathSource(item, meta)
    if (rel === null || source === null) {
      unmapped.push(base)
      continue
    }

    const bytes = fileBytes(rel)
    if (bytes === null) {
      missing.push({ ...base, uploadsPath: rel, pathSource: source })
      continue
    }

    normalized.push({
      ...base,
      uploadsPath: rel,
      pathSource: source,
      sha256: sha256Bytes(bytes),
      missing: false,
    })
  }

  return { normalized, missing, unmapped }
}

const main = async () => {
  const rawDir = path.join(process.cwd(), 'migration-data/raw')
  const outDir = path.join(process.cwd(), 'migration-data/normalized')
  const reportsDir = path.join(process.cwd(), 'migration-data/reports')
  const sourceDir = path.join(process.cwd(), 'migration-data/source')
  const uploadsRoot = path.join(rawDir, 'uploads')

  const items = JSON.parse(await readFile(path.join(rawDir, 'media.json'), 'utf8')) as WpMediaItem[]
  const attachmentMeta = JSON.parse(
    await readFile(path.join(rawDir, 'attachment-meta.json'), 'utf8'),
  ) as Record<string, WpAttachmentMeta>

  const { normalized, missing, unmapped } = normalizeMedia(items, attachmentMeta, (rel) => {
    try {
      const abs = path.join(uploadsRoot, rel)
      if (!path.resolve(abs).startsWith(path.resolve(uploadsRoot))) return null
      return readFileSync(abs)
    } catch {
      return null
    }
  })

  await mkdir(outDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })
  await mkdir(sourceDir, { recursive: true })

  await writeFile(
    path.join(outDir, 'media-manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), media: normalized }, null, 2),
  )

  // Persistent, sanitised report (committed to git): unresolved media with an
  // explicit recover|retire decision field for the cutover gate.
  const issues = {
    generatedAt: new Date().toISOString(),
    unresolved: [
      ...missing.map((m) => ({
        wordpressId: m.wordpressId,
        slug: m.slug,
        originalUrl: m.originalUrl,
        uploadsPath: m.uploadsPath,
        pathSource: m.pathSource,
        status: 'unresolved' as const,
        decision: null as 'recover' | 'retire' | null,
      })),
      ...unmapped.map((m) => ({
        wordpressId: m.wordpressId,
        slug: m.slug,
        originalUrl: m.originalUrl,
        uploadsPath: m.uploadsPath,
        pathSource: m.pathSource,
        status: 'unresolved' as const,
        decision: null as 'recover' | 'retire' | null,
      })),
    ],
  }
  await writeFile(path.join(reportsDir, 'media-issues.json'), JSON.stringify(issues, null, 2))

  // Stable, portable source map (committed): WP identity + checksums only,
  // no target-database IDs.
  const sourceMap = normalized.map((m) => ({
    wordpressId: m.wordpressId,
    slug: m.slug,
    mimeType: m.mimeType,
    originalUrl: m.originalUrl,
    uploadsPath: m.uploadsPath,
    pathSource: m.pathSource,
    sha256: m.sha256,
    altFromMeta: m.alt,
  }))
  await writeFile(
    path.join(sourceDir, 'media-source.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), media: sourceMap }, null, 2),
  )

  console.log(
    `media normalized: ${normalized.length} ok, ${missing.length} missing, ${unmapped.length} unmapped`,
  )
  console.log(`report: migration-data/reports/media-issues.json (${issues.unresolved.length} unresolved)`)
  console.log(`stable source map: migration-data/source/media-source.json (${sourceMap.length} entries)`)
}

if (process.argv[1] && process.argv[1].endsWith('extract-media.ts')) {
  await main()
}
