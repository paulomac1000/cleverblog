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

/**
 * Deterministic media rewrite map from the committed portable source map:
 * WP attachment URL (absolute + relative variants) -> Payload-served file URL
 * with the unique final name (<wpId>-<basename>).
 */
export const buildMediaRewriteMap = async (): Promise<Map<string, string>> => {
  const sourcePath = path.join(process.cwd(), 'migration-data/source/media-source.json')
  const source = JSON.parse(await readFile(sourcePath, 'utf8')) as { media: MediaSourceEntry[] }
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
 * Builds the render working copy: media URLs rewritten to Payload, sanitized.
 * legacy.originalHTML is the immutable historical snapshot and is never the
 * input target of this transformation (the result is stored separately).
 */
export const buildRenderHTML = (html: string, mediaMap: Map<string, string>): string => {
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

  const out = apply(normalizeVariantUrls(html, mediaMap))
  return sanitizeHtml(out, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'h1', 'h2']),
    allowedAttributes: {
      '*': ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
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
