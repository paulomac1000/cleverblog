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
    const marker = '/wp-content/uploads/'
    const idx = entry.originalUrl.indexOf(marker)
    if (idx === -1) continue
    const rel = entry.originalUrl.slice(idx + marker.length)
    // Key is the uploads-relative path; any absolute-origin or /blog prefix is
    // consumed by the rewrite regex in buildRenderHTML.
    put(rel, `/api/media/file/${finalName}`)
  }
  return map
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// WP post bodies reference resized variants (<stem>-WxH<ext>, <stem>-scaled<ext>)
// that exist only as generated files, not as attachments; normalize them to the
// attachment original before exact URL replacement.
const normalizeVariantUrls = (html: string): string =>
  html
    .replace(/(-\d+x\d+)(?=\.(?:jpe?g|png|gif|webp|avif)(?:[?#"]|$))/gi, '')
    .replace(/(-scaled)(?=\.(?:jpe?g|png|gif|webp|avif)(?:[?#"]|$))/gi, '')

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
          `(?:https?:\\/\\/[^"'\\s)]+)?\\/wp-content\\/uploads\\/${escapeRegExp(rel)}(?=[?#"')\\s]|$)`,
          'gi',
        ),
        newUrl,
      )
    }
    return out
  }
  const out = apply(normalizeVariantUrls(apply(html)))
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
  [...new Set(html.match(/https?:\/\/[^\s"'<>]*\/wp-content\/uploads\/[^\s"'<>]+/gi) ?? [])].sort()
