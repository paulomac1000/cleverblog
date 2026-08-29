import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { normalizePost, sourceHash } from './normalize-posts'
import type { NormalizedPost, RawWordPressPost } from './types'

const ROOT = process.cwd()
const inputPath = path.join(ROOT, 'migration-data/raw/pages.json')
const outputPath = path.join(ROOT, 'migration-data/normalized/pages.json')

const normalizePages = (pages: RawWordPressPost[]): NormalizedPost[] => {
  const seen = new Set<number>()
  return pages.map((page) => {
    const normalized = normalizePost(page)
    if (seen.has(normalized.wordpressId)) {
      throw new Error(`Duplicate WordPress page ID: ${normalized.wordpressId}`)
    }
    seen.add(normalized.wordpressId)
    return { ...normalized, sourceHash: sourceHash(page) }
  })
}

const main = async () => {
  const pages = JSON.parse(await readFile(inputPath, 'utf8')) as RawWordPressPost[]
  const normalized = normalizePages(pages)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(normalized, null, 2))
  console.log(`Normalized ${normalized.length} WordPress pages -> ${outputPath}`)
}

await main()
