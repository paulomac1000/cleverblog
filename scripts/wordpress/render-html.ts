import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

// sanitize-html is CJS; createRequire keeps tsx scripts working without
// ESM interop surprises (this module is script-only, never app code).
const require_ = createRequire(import.meta.url)
const sanitizeHtml = require_('sanitize-html') as typeof import('sanitize-html')

type MediaSourceEntry = {
  wordpressId: number
  originalUrl: string
  uploadsPath: string | null
  sha256: string
}

export type RenderHTMLOptions = {
  retiredUploadsPaths?: Set<string>
}

type MediaIssueDecision = 'recover' | 'retire' | 'replace' | null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const decodeBasicHtmlEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * Reads the generated media-issues shape and extracts human-approved
 * retire paths. The parser is deliberately strict: a malformed generated
 * report must stop the importer instead of silently disabling retirement.
 */
export const buildRetiredUploadsPaths = (value: unknown): Set<string> => {
  if (!isRecord(value) || !Array.isArray(value.unresolved)) {
    throw new Error('media-issues.json must contain unresolved[]')
  }

  const retired = new Set<string>()

  for (const [index, raw] of value.unresolved.entries()) {
    if (!isRecord(raw)) {
      throw new Error(`media-issues.json.unresolved[${index}] must be an object`)
    }

    const decision = raw.decision
    if (
      decision !== null &&
      decision !== 'recover' &&
      decision !== 'retire' &&
      decision !== 'replace'
    ) {
      throw new Error(
        `media-issues.json.unresolved[${index}].decision must be recover, retire, replace, or null`,
      )
    }

    if (
      raw.uploadsPath !== null &&
      typeof raw.uploadsPath !== 'string'
    ) {
      throw new Error(
        `media-issues.json.unresolved[${index}].uploadsPath must be a string or null`,
      )
    }

    if (
      raw.replacementNote !== undefined &&
      raw.replacementNote !== null &&
      typeof raw.replacementNote !== 'string'
    ) {
      throw new Error(
        `media-issues.json.unresolved[${index}].replacementNote must be a string when present`,
      )
    }

    if (decision === 'retire' && typeof raw.uploadsPath === 'string') {
      const uploadsPath = raw.uploadsPath.trim()
      if (uploadsPath) retired.add(uploadsPath)
    }
  }

  return retired
}

/**
 * Deterministic media rewrite map from the committed portable source map:
 * WP attachment URL (absolute + relative variants) -> Payload-served file URL
 * with the unique final name (<wpId>-<basename>).
 */
export const buildMediaRewriteMap = async (): Promise<Map<string, string>> => {
  const sourcePath = path.join(
    process.cwd(),
    'migration-data/source/media-source.json',
  )
  const source = JSON.parse(await readFile(sourcePath, 'utf8')) as {
    media: MediaSourceEntry[]
  }
  const map = new Map<string, string>()

  const put = (key: string, value: string) => {
    if (map.has(key) && map.get(key) !== value) {
      // Ambiguous alias (two attachments would claim the same URL): drop it so
      // the original URL survives visibly and the leak check can flag it.
      map.delete(key)
      return
    }

    map.set(key, value)
  }

  for (const entry of source.media) {
    if (!entry.uploadsPath) continue

    const finalName = `${entry.wordpressId}-${path.basename(entry.uploadsPath)}`
    const newUrl = `/api/media/file/${finalName}`
    const marker = '/wp-content/uploads/'
    const idx = entry.originalUrl.indexOf(marker)

    const rels = new Set<string>([entry.uploadsPath])

    if (idx !== -1) {
      rels.add(entry.originalUrl.slice(idx + marker.length))
    }

    // Both the attachment GUID path and authoritative _wp_attached_file path
    // are valid aliases for the same imported Payload media record.
    for (const rel of rels) {
      put(rel, newUrl)
    }
  }

  return map
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeGeneratedVariantPath = (uploadsPath: string): string =>
  uploadsPath.replace(
    /(?:-\d+x\d+|-scaled)(?=\.(?:jpe?g|png|gif|webp|avif)$)/i,
    '',
  )

const uploadsPathFromMediaUrl = (rawUrl: string): string | null => {
  const value = decodeBasicHtmlEntities(rawUrl.trim())
  const marker = '/wp-content/uploads/'
  const markerIndex = value.toLowerCase().indexOf(marker)

  if (markerIndex === -1) return null

  const pathWithSuffix = value.slice(markerIndex + marker.length)
  const suffixIndex = pathWithSuffix.search(/[?#]/)
  const encodedPath =
    suffixIndex === -1
      ? pathWithSuffix
      : pathWithSuffix.slice(0, suffixIndex)

  if (!encodedPath) return null

  return safeDecodeURIComponent(encodedPath) ?? encodedPath
}

const getAttribute = (tag: string, name: string): string | null => {
  const pattern = new RegExp(
    `\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  )
  const match = tag.match(pattern)
  const value = match?.[1] ?? match?.[2] ?? match?.[3]

  return value === undefined ? null : decodeBasicHtmlEntities(value)
}

const referencesRetiredMedia = (
  src: string,
  retiredUploadsPaths: Set<string>,
): boolean => {
  const uploadsPath = uploadsPathFromMediaUrl(src)
  if (!uploadsPath) return false

  if (retiredUploadsPaths.has(uploadsPath)) return true

  const normalizedVariant = normalizeGeneratedVariantPath(uploadsPath)
  return (
    normalizedVariant !== uploadsPath &&
    retiredUploadsPaths.has(normalizedVariant)
  )
}

const containsRetiredImage = (
  html: string,
  retiredUploadsPaths: Set<string>,
): boolean => {
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? []

  return imageTags.some((tag) => {
    const src = getAttribute(tag, 'src')
    return src !== null && referencesRetiredMedia(src, retiredUploadsPaths)
  })
}

/**
 * Retirement is applied only to the derived render working copy.
 *
 * A retired image inside a <figure> removes the complete figure so captions,
 * wrappers and dead anchors do not survive as orphan markup. A standalone
 * retired <img> removes only that image.
 */
const removeRetiredMedia = (
  html: string,
  retiredUploadsPaths: Set<string>,
): string => {
  if (retiredUploadsPaths.size === 0) return html

  const withoutFigures = html.replace(
    /<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi,
    (figure) =>
      containsRetiredImage(figure, retiredUploadsPaths) ? '' : figure,
  )

  return withoutFigures.replace(/<img\b[^>]*>/gi, (img) => {
    const src = getAttribute(img, 'src')
    if (src === null) return img

    return referencesRetiredMedia(src, retiredUploadsPaths) ? '' : img
  })
}

// WP generated variants are normalized only inside WP uploads URLs and only
// when the stripped path resolves to a known attachment in the rewrite map.
// Unknown variants survive unchanged so migration reporting can flag them.
const normalizeVariantUrls = (
  html: string,
  mediaMap: Map<string, string>,
): string =>
  html.replace(
    /(?:(?:https?:)?\/\/[^\s"'<>)]*)?\/wp-content\/uploads\/[^\s"'<>)]*/gi,
    (url) => {
      const normalizedUrl = url.replace(
        /(?:-\d+x\d+|-scaled)(?=\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$))/i,
        '',
      )

      if (normalizedUrl === url) return url

      const marker = '/wp-content/uploads/'
      const markerIndex = normalizedUrl.toLowerCase().indexOf(marker)
      if (markerIndex === -1) return url

      const relWithSuffix = normalizedUrl.slice(markerIndex + marker.length)
      const suffixIndex = relWithSuffix.search(/[?#]/)
      const rel =
        suffixIndex === -1
          ? relWithSuffix
          : relWithSuffix.slice(0, suffixIndex)

      return mediaMap.has(rel) ? normalizedUrl : url
    },
  )

/**
 * Builds the render working copy:
 *   1. intentionally retired media is removed,
 *   2. known generated variants are normalized,
 *   3. resolvable media URLs are rewritten to Payload,
 *   4. the working copy is sanitized.
 *
 * legacy.originalHTML is never mutated.
 */
export const buildRenderHTML = (
  html: string,
  mediaMap: Map<string, string>,
  options: RenderHTMLOptions = {},
): string => {
  const retiredUploadsPaths =
    options.retiredUploadsPaths ?? new Set<string>()

  const apply = (input: string): string => {
    let out = input

    for (const [rel, newUrl] of mediaMap) {
      out = out.replace(
        new RegExp(
          `(?:https?:\\/\\/[^"'\\s)]+|\\/\\/[^"'\\s)]+)?\\/wp-content\\/uploads\\/${escapeRegExp(rel)}(?=[?#"')\\s]|$)`,
          'gi',
        ),
        newUrl,
      )
    }

    return out
  }

  const withoutRetired = removeRetiredMedia(html, retiredUploadsPaths)
  const rewritten = apply(normalizeVariantUrls(withoutRetired, mediaMap))

  return sanitizeHtml(rewritten, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'figure',
      'figcaption',
      'h1',
      'h2',
    ]),
    allowedAttributes: {
      '*': [
        'href',
        'src',
        'alt',
        'title',
        'class',
        'id',
        'target',
        'rel',
      ],
    },
  })
}

// URLs that still point at WP after the rewrite: unlinked references or
// unresolved attachments. Kept visible on purpose; callers report them.
export const collectUnrewrittenUrls = (html: string): string[] =>
  [
    ...new Set(
      html.match(
        /(?:https?:\/\/|\/\/)[^\s"'<>]*\/wp-content\/uploads\/[^\s"'<>]+|\/wp-content\/uploads\/[^\s"'<>]+/gi,
      ) ?? [],
    ),
  ].sort()
