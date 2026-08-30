import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { normalizePost, sourceHash } from './normalize-posts'
import type { NormalizedPost, RawWordPressPost } from './types'

const ROOT = process.cwd()
const inputPath = path.join(ROOT, 'migration-data/raw/pages.json')
const outputPath = path.join(ROOT, 'migration-data/normalized/pages.json')

export const normalizePages = (pages: RawWordPressPost[]): NormalizedPost[] => {
  const seen = new Set<number>()
  return pages.map((page) => {
    const normalized = normalizePost(page)

    if (page.post_parent === undefined) {
      throw new Error(
        'pages capture is missing post_parent; re-run capture with post_parent in the field list',
      )
    }

    const rawParent = page.post_parent
    const parent =
      typeof rawParent === 'string' && rawParent.trim() === ''
        ? Number.NaN
        : Number(rawParent)

    if (!Number.isSafeInteger(parent) || parent < 0) {
      throw new Error(
        `Invalid WordPress post_parent for wp:${normalized.wordpressId}: ${String(rawParent)}`,
      )
    }

    if (parent !== 0) {
      throw new Error(
        `Hierarchical pages are not supported in migration: wp:${normalized.wordpressId} has post_parent=${parent}`,
      )
    }

    if (seen.has(normalized.wordpressId)) {
      throw new Error(`Duplicate WordPress page ID: ${normalized.wordpressId}`)
    }
    seen.add(normalized.wordpressId)
    // Pages carry their own legacy identity: /?page_id=<id>, not /?p=<id>.
    const pageUrl = `/?page_id=${normalized.wordpressId}`
    return {
      ...normalized,
      originalUrl: pageUrl,
      redirects: [pageUrl],
      sourceHash: sourceHash(page),
    }
  })
}

const main = async () => {
  const pages = JSON.parse(await readFile(inputPath, 'utf8')) as RawWordPressPost[]
  const normalized = normalizePages(pages)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(normalized, null, 2))
  console.log(`Normalized ${normalized.length} WordPress pages -> ${outputPath}`)
}

if (process.argv[1]?.endsWith('normalize-pages.ts')) {
  await main()
}
