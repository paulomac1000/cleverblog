import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import type { WpCommentItem } from './map-comments'

const inputPath = path.join(process.cwd(), 'migration-data/raw/comments.json')
const allowlistPath = path.join(
  process.cwd(),
  'migration-data/source/pending-comment-allowlist.json',
)
const reportPath = path.join(
  process.cwd(),
  'migration-data/reports/pending-comments-import.json',
)

const parsePositiveInteger = (value: string, field: string): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid WordPress comment ${field}: ${JSON.stringify(value)}`)
  }
  return parsed
}

const parseCommentDateGMT = (value: string, wordpressId: number): string => {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new Error(
      `Invalid WordPress comment comment_date_gmt for wp:${wordpressId}: ${JSON.stringify(value)}`,
    )
  }

  const parsed = new Date(`${value.replace(' ', 'T')}Z`)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid WordPress comment comment_date_gmt for wp:${wordpressId}: ${JSON.stringify(value)}`,
    )
  }

  return parsed.toISOString()
}

type AllowlistFile = {
  wordpressIds: number[]
}

const main = async () => {
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as WpCommentItem[]
  const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8')) as AllowlistFile

  const allowlistIds = new Set(allowlist.wordpressIds)
  const selected = raw.filter((comment) =>
    allowlistIds.has(parsePositiveInteger(comment.comment_ID, 'comment_ID')),
  )

  const missing = [...allowlistIds].filter(
    (id) =>
      !selected.some(
        (comment) => parsePositiveInteger(comment.comment_ID, 'comment_ID') === id,
      ),
  )

  if (missing.length > 0) {
    throw new Error(`Allowlisted WordPress comment IDs not found in source: ${missing.join(', ')}`)
  }

  if (selected.length !== allowlistIds.size) {
    throw new Error('Allowlist selection mismatch')
  }

  const payload = await getPayload({ config })

  let created = 0
  let updated = 0
  const imported: Array<{ wordpressId: number; payloadId: number; status: string }> = []

  for (const comment of selected) {
    const wordpressId = parsePositiveInteger(comment.comment_ID, 'comment_ID')
    const postWordPressId = parsePositiveInteger(comment.comment_post_ID, 'comment_post_ID')
    const createdAt = parseCommentDateGMT(comment.comment_date_gmt, wordpressId)

    const found = await payload.find({
      collection: 'posts',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        'legacy.wordpressId': { equals: postWordPressId },
        _status: { equals: 'published' },
      },
    })

    const post = found.docs[0]
    if (!post) {
      throw new Error(`Allowlisted comment wp:${wordpressId} targets missing post wp:${postWordPressId}`)
    }

    const existing = await payload.find({
      collection: 'comments',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { legacyWordPressId: { equals: wordpressId } },
    })

    const data = {
      post: post.id,
      parent: null,
      authorName: comment.comment_author,
      authorEmail: comment.comment_author_email || undefined,
      authorUrl: comment.comment_author_url || undefined,
      content: comment.comment_content,
      status: 'pending' as const,
      legacyWordPressId: wordpressId,
      createdAt,
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'comments',
        id: existing.docs[0].id,
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      updated += 1
      imported.push({ wordpressId, payloadId: existing.docs[0].id, status: 'updated' })
      console.log(`updated pending comment wp:${wordpressId} -> payload:${existing.docs[0].id}`)
    } else {
      const createdComment = await payload.create({
        collection: 'comments',
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      created += 1
      imported.push({ wordpressId, payloadId: createdComment.id, status: 'created' })
      console.log(`created pending comment wp:${wordpressId} -> payload:${createdComment.id}`)
    }
  }

  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        allowlisted: allowlistIds.size,
        created,
        updated,
        imported,
      },
      null,
      2,
    )}\n`,
  )

  console.log(`pending comments import complete: ${created} created, ${updated} updated`)
  process.exit(0)
}

void main()
