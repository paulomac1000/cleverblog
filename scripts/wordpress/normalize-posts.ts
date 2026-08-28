import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { NormalizedPost, RawWordPressPost } from './types'

const ROOT = process.cwd()
const inputPath = path.join(ROOT, 'migration-data/raw/posts.json')
const outputPath = path.join(ROOT, 'migration-data/normalized/posts.json')

export const sourceHash = (post: RawWordPressPost): string =>
  createHash('sha256')
    .update(JSON.stringify({
      ID: post.ID,
      title: post.post_title,
      slug: post.post_name,
      status: post.post_status,
      date: post.post_date,
      content: post.post_content,
    }))
    .digest('hex')

export const normalizePost = (post: RawWordPressPost): NormalizedPost => {
  const wordpressId = Number(post.ID)
  if (!Number.isSafeInteger(wordpressId) || wordpressId <= 0) {
    throw new Error(`Invalid WordPress post ID: ${String(post.ID)}`)
  }
  const slug = post.post_name.trim() || `wordpress-${wordpressId}`
  const queryUrl = `/?p=${wordpressId}`

  return {
    wordpressId,
    title: post.post_title.trim(),
    slug,
    status: post.post_status,
    publishedAt: post.post_date ? new Date(`${post.post_date.replace(' ', 'T')}Z`).toISOString() : null,
    excerpt: (post.post_excerpt ?? '').trim(),
    originalHTML: post.post_content,
    wordpressGuid: post.guid?.trim() || null,
    originalUrl: queryUrl,
    sourceHash: sourceHash(post),
    commentsEnabled: post.comment_status !== 'closed',
    redirects: [queryUrl],
  }
}

export const normalizePosts = (posts: RawWordPressPost[]): NormalizedPost[] => {
  const seen = new Set<number>()
  return posts.map((post) => {
    const normalized = normalizePost(post)
    if (seen.has(normalized.wordpressId)) {
      throw new Error(`Duplicate WordPress post ID: ${normalized.wordpressId}`)
    }
    seen.add(normalized.wordpressId)
    return normalized
  })
}

async function main() {
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as RawWordPressPost[]
  const normalized = normalizePosts(raw)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  console.log(`Normalized ${normalized.length} WordPress posts -> ${outputPath}`)
}

if (process.argv[1]?.endsWith('normalize-posts.ts')) {
  await main()
}
