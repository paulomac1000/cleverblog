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
  for (const entry of source.media) {
    if (!entry.uploadsPath) continue
    const finalName = `${entry.wordpressId}-${path.basename(entry.uploadsPath)}`
    const newUrl = `/api/media/file/${finalName}`
    map.set(entry.originalUrl, newUrl)
    const marker = '/wp-content/uploads/'
    const idx = entry.originalUrl.indexOf(marker)
    if (idx !== -1) {
      const rel = entry.originalUrl.slice(idx + marker.length)
      map.set(rel, newUrl)
      map.set(`/wp-content/uploads/${rel}`, newUrl)
    }
  }
  return map
}

/**
 * Builds the render working copy: media URLs rewritten to Payload, sanitized.
 * legacy.originalHTML is the immutable historical snapshot and is never the
 * input target of this transformation (the result is stored separately).
 */
export const buildRenderHTML = (html: string, mediaMap: Map<string, string>): string => {
  let out = html
  for (const [from, to] of mediaMap) {
    out = out.split(from).join(to)
  }
  return sanitizeHtml(out, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'h1', 'h2']),
    allowedAttributes: {
      '*': ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
    },
  })
}
