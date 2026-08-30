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

export type UnresolvedMedia = {
  wordpressId: number
  slug: string
  title: string
  mimeType: string
  originalUrl: string
  uploadsPath: string | null
  pathSource: 'attached-file' | 'guid' | null
  /** why the item could not be imported */
  reason: 'missing-file' | 'unsafe-path' | 'malformed-guid' | 'no-path'
}

export type MediaDecision = 'recover' | 'retire' | 'replace'

export type MediaDecisionEntry = {
  wordpressId: number
  uploadsPath: string | null
  decision: MediaDecision
  replacementNote?: string
}

export type MediaDecisionArtifact = {
  generatedAt: string
  decisions: MediaDecisionEntry[]
}

export type MediaIssue = {
  wordpressId: number
  slug: string
  originalUrl: string
  uploadsPath: string | null
  pathSource: 'attached-file' | 'guid' | null
  reason: UnresolvedMedia['reason']
  status: 'unresolved'
  decision: MediaDecision | null
  replacementNote?: string
}

export type MediaManifest = {
  generatedAt: string
  media: NormalizedMedia[]
  unresolved: UnresolvedMedia[]
}

export const sha256Bytes = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex')

export const safeDecode = (raw: string): string | null => {
  try {
    return decodeURIComponent(raw)
  } catch {
    // malformed percent-encoding is an issue, never a crash
    return null
  }
}

export const uploadsPathFromGuid = (guid: string): string | null => {
  const marker = '/wp-content/uploads/'
  const idx = guid.indexOf(marker)
  if (idx === -1) return null
  const raw = guid.slice(idx + marker.length).split('?')[0]
  if (raw.length === 0) return null
  const decoded = safeDecode(raw)
  return decoded !== null && isSafeUploadsPath(decoded) ? decoded : null
}

/**
 * Path resolver safety: rejects absolute paths, `..` traversal (also after
 * percent-decoding) and backslashes. Canonical check happens against the
 * uploads root by the caller via readFileSync containment.
 */
export const isSafeUploadsPath = (rel: string): boolean => {
  if (rel.length === 0 || rel.startsWith('/') || rel.includes('\\')) return false
  const decoded = safeDecode(rel)
  if (decoded === null) return false
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
): {
  normalized: NormalizedMedia[]
  unresolved: UnresolvedMedia[]
} => {
  const normalized: NormalizedMedia[] = []
  const unresolved: UnresolvedMedia[] = []

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

    const attached = meta?.attachedFile?.trim()
    let resolved: { rel: string; source: 'attached-file' | 'guid' } | null = null
    let reason: UnresolvedMedia['reason'] = 'no-path'

    if (attached) {
      // Authoritative metadata exists: it is the only accepted path source.
      // Unsafe content is an issue — never a silent fallback to the GUID.
      if (isSafeUploadsPath(attached)) {
        resolved = { rel: attached, source: 'attached-file' }
      } else {
        unresolved.push({
          ...base,
          uploadsPath: attached,
          pathSource: 'attached-file',
          reason: 'unsafe-path',
        })
        continue
      }
    } else {
      const fromGuid = uploadsPathFromGuid(item.guid)
      if (fromGuid) {
        resolved = { rel: fromGuid, source: 'guid' }
      } else if (meta && item.guid.includes('/wp-content/uploads/')) {
        reason = 'malformed-guid'
      }
    }

    if (!resolved) {
      unresolved.push({
        ...base,
        uploadsPath: attached ?? null,
        pathSource: attached ? 'attached-file' : null,
        reason,
      })
      continue
    }

    const bytes = fileBytes(resolved.rel)
    if (bytes === null) {
      unresolved.push({
        ...base,
        uploadsPath: resolved.rel,
        pathSource: resolved.source,
        reason: 'missing-file',
      })
      continue
    }

    normalized.push({
      ...base,
      uploadsPath: resolved.rel,
      pathSource: resolved.source,
      sha256: sha256Bytes(bytes),
      missing: false,
    })
  }

  return { normalized, unresolved }
}

const mediaIdentity = (
  wordpressId: number,
  uploadsPath: string | null,
): string => JSON.stringify([wordpressId, uploadsPath])

const describeUploadsPath = (uploadsPath: string | null): string =>
  uploadsPath === null ? 'null' : JSON.stringify(uploadsPath)

export const applyMediaDecisions = (
  unresolved: UnresolvedMedia[],
  decisions: MediaDecisionEntry[],
): MediaIssue[] => {
  const unresolvedByIdentity = new Map<string, UnresolvedMedia>()
  const unresolvedByWordpressId = new Map<number, UnresolvedMedia[]>()

  for (const item of unresolved) {
    const key = mediaIdentity(item.wordpressId, item.uploadsPath)
    if (unresolvedByIdentity.has(key)) {
      throw new Error(
        `Duplicate unresolved media identity wp:${item.wordpressId} uploadsPath=${describeUploadsPath(item.uploadsPath)}`,
      )
    }

    unresolvedByIdentity.set(key, item)

    const sameId = unresolvedByWordpressId.get(item.wordpressId) ?? []
    sameId.push(item)
    unresolvedByWordpressId.set(item.wordpressId, sameId)
  }

  const decisionsByIdentity = new Map<string, MediaDecisionEntry>()

  for (const decision of decisions) {
    const key = mediaIdentity(decision.wordpressId, decision.uploadsPath)

    if (decisionsByIdentity.has(key)) {
      throw new Error(
        `Duplicate media decision for wp:${decision.wordpressId} uploadsPath=${describeUploadsPath(decision.uploadsPath)}`,
      )
    }

    if (!unresolvedByIdentity.has(key)) {
      const sameId = unresolvedByWordpressId.get(decision.wordpressId)

      if (sameId?.length) {
        throw new Error(
          `Media decision for wp:${decision.wordpressId} has stale uploadsPath=${describeUploadsPath(decision.uploadsPath)}; current unresolved uploadsPath=${sameId.map((item) => describeUploadsPath(item.uploadsPath)).join(', ')}`,
        )
      }

      throw new Error(
        `Media decision for wp:${decision.wordpressId} uploadsPath=${describeUploadsPath(decision.uploadsPath)} does not match any current unresolved media entry`,
      )
    }

    decisionsByIdentity.set(key, decision)
  }

  return unresolved.map((item) => {
    const decision = decisionsByIdentity.get(
      mediaIdentity(item.wordpressId, item.uploadsPath),
    )

    return {
      wordpressId: item.wordpressId,
      slug: item.slug,
      originalUrl: item.originalUrl,
      uploadsPath: item.uploadsPath,
      pathSource: item.pathSource,
      reason: item.reason,
      status: 'unresolved',
      decision: decision?.decision ?? null,
      ...(decision?.replacementNote !== undefined
        ? { replacementNote: decision.replacementNote }
        : {}),
    }
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseMediaDecisionArtifact = (value: unknown): MediaDecisionArtifact => {
  if (!isRecord(value)) {
    throw new Error('media-decisions.json must contain an object')
  }

  if (typeof value.generatedAt !== 'string' || !value.generatedAt.trim()) {
    throw new Error('media-decisions.json.generatedAt must be a non-empty string')
  }

  if (!Array.isArray(value.decisions)) {
    throw new Error('media-decisions.json.decisions must be an array')
  }

  const decisions = value.decisions.map((raw, index): MediaDecisionEntry => {
    if (!isRecord(raw)) {
      throw new Error(`media-decisions.json.decisions[${index}] must be an object`)
    }

    if (
      typeof raw.wordpressId !== 'number' ||
      !Number.isSafeInteger(raw.wordpressId) ||
      raw.wordpressId <= 0
    ) {
      throw new Error(
        `media-decisions.json.decisions[${index}].wordpressId must be a positive integer`,
      )
    }

    if (raw.uploadsPath !== null && typeof raw.uploadsPath !== 'string') {
      throw new Error(
        `media-decisions.json.decisions[${index}].uploadsPath must be a string or null`,
      )
    }

    if (
      raw.decision !== 'recover' &&
      raw.decision !== 'retire' &&
      raw.decision !== 'replace'
    ) {
      throw new Error(
        `media-decisions.json.decisions[${index}].decision must be recover, retire, or replace`,
      )
    }

    if (
      raw.replacementNote !== undefined &&
      typeof raw.replacementNote !== 'string'
    ) {
      throw new Error(
        `media-decisions.json.decisions[${index}].replacementNote must be a string when present`,
      )
    }

    return {
      wordpressId: raw.wordpressId,
      uploadsPath: raw.uploadsPath,
      decision: raw.decision,
      ...(raw.replacementNote !== undefined
        ? { replacementNote: raw.replacementNote }
        : {}),
    }
  })

  return {
    generatedAt: value.generatedAt,
    decisions,
  }
}

const readMediaDecisions = async (
  filePath: string,
): Promise<MediaDecisionArtifact> => {
  try {
    return parseMediaDecisionArtifact(
      JSON.parse(await readFile(filePath, 'utf8')) as unknown,
    )
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {
        generatedAt: new Date().toISOString(),
        decisions: [],
      }
    }

    throw error
  }
}

const main = async () => {
  const rawDir = path.join(process.cwd(), 'migration-data/raw')
  const outDir = path.join(process.cwd(), 'migration-data/normalized')
  const reportsDir = path.join(process.cwd(), 'migration-data/reports')
  const sourceDir = path.join(process.cwd(), 'migration-data/source')
  const uploadsRoot = path.join(rawDir, 'uploads')
  const decisionsPath = path.join(sourceDir, 'media-decisions.json')

  const items = JSON.parse(
    await readFile(path.join(rawDir, 'media.json'), 'utf8'),
  ) as WpMediaItem[]

  const attachmentMeta = JSON.parse(
    await readFile(path.join(rawDir, 'attachment-meta.json'), 'utf8'),
  ) as Record<string, WpAttachmentMeta>

  const { normalized, unresolved } = normalizeMedia(items, attachmentMeta, (rel) => {
    try {
      const abs = path.join(uploadsRoot, rel)
      if (!path.resolve(abs).startsWith(path.resolve(uploadsRoot))) return null
      return readFileSync(abs)
    } catch {
      return null
    }
  })

  const decisionArtifact = await readMediaDecisions(decisionsPath)
  const mediaIssues = applyMediaDecisions(
    unresolved,
    decisionArtifact.decisions,
  )

  await mkdir(outDir, { recursive: true })
  await mkdir(reportsDir, { recursive: true })
  await mkdir(sourceDir, { recursive: true })

  const manifest: MediaManifest = {
    generatedAt: new Date().toISOString(),
    media: normalized,
    unresolved,
  }

  await writeFile(
    path.join(outDir, 'media-manifest.json'),
    JSON.stringify(manifest, null, 2),
  )

  // Generated rehearsal report. Human decisions live separately in the
  // committed migration-data/source/media-decisions.json artifact and are
  // merged forward only when both WordPress ID and uploads path still match.
  const issues = {
    generatedAt: new Date().toISOString(),
    unresolved: mediaIssues,
  }

  await writeFile(
    path.join(reportsDir, 'media-issues.json'),
    JSON.stringify(issues, null, 2),
  )

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
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        media: sourceMap,
      },
      null,
      2,
    ),
  )

  console.log(
    `media normalized: ${normalized.length} ok, ${unresolved.length} unresolved`,
  )
  console.log(
    `report: migration-data/reports/media-issues.json (${issues.unresolved.length} unresolved)`,
  )
  console.log(
    `stable source map: migration-data/source/media-source.json (${sourceMap.length} entries)`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('extract-media.ts')) {
  await main()
}
