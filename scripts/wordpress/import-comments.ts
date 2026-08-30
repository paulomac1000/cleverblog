import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildCommentTree, selectApprovedComments } from './map-comments'

import type { WpCommentItem } from './map-comments'

const inputPath = path.join(process.cwd(), 'migration-data/raw/comments.json')
const reportPath = path.join(process.cwd(), 'migration-data/reports/comments-issues.json')
const MAX_COMMENT_DEPTH = 10

type CommentIssueReason =
  | 'parent-not-approved-or-missing-source'
  | 'parent-skipped'
  | 'parent-missing-in-payload'
  | 'post-missing-in-payload'

type CommentIssue = {
  wordpressId: number
  postWordPressId: number
  parentWordPressId: number | null
  flattened: boolean
  reasons: CommentIssueReason[]
}

const parseNonNegativeInteger = (value: string, field: string): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid WordPress comment ${field}: ${JSON.stringify(value)}`)
  }
  return parsed
}

const parsePositiveInteger = (value: string, field: string): number => {
  const parsed = parseNonNegativeInteger(value, field)
  if (parsed === 0) {
    throw new Error(`Invalid WordPress comment ${field}: expected a positive integer`)
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

const main = async () => {
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as WpCommentItem[]
  const approved = selectApprovedComments(raw)
  const tree = buildCommentTree(approved)
  const payload = await getPayload({ config })

  let created = 0
  let updated = 0
  let skipped = 0

  const sourceFlattenedIds = new Set(
    tree.flattened.map((comment) => String(parsePositiveInteger(comment.comment_ID, 'comment_ID'))),
  )
  const skippedCommentIds = new Set<string>()
  const processedCommentIds = new Set<string>()
  const issuesById = new Map<string, CommentIssue>()
  const postIdCache = new Map<number, number | null>()

  const addIssue = (
    comment: WpCommentItem,
    reason: CommentIssueReason,
    flattened: boolean,
  ): void => {
    const wordpressId = parsePositiveInteger(comment.comment_ID, 'comment_ID')
    const postWordPressId = parsePositiveInteger(comment.comment_post_ID, 'comment_post_ID')
    const rawParentId = parseNonNegativeInteger(comment.comment_parent, 'comment_parent')
    const key = String(wordpressId)

    const existing = issuesById.get(key)
    if (existing) {
      existing.flattened ||= flattened
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason)
      }
      return
    }

    issuesById.set(key, {
      wordpressId,
      postWordPressId,
      parentWordPressId: rawParentId === 0 ? null : rawParentId,
      flattened,
      reasons: [reason],
    })
  }

  for (const comment of tree.flattened) {
    addIssue(comment, 'parent-not-approved-or-missing-source', true)
  }

  const resolvePostId = async (wordpressId: number): Promise<number | null> => {
    if (postIdCache.has(wordpressId)) {
      return postIdCache.get(wordpressId) ?? null
    }

    const found = await payload.find({
      collection: 'posts',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        'legacy.wordpressId': { equals: wordpressId },
        _status: { equals: 'published' },
      },
    })

    const id = found.docs[0]?.id ?? null
    postIdCache.set(wordpressId, id)
    return id
  }

  let level = [...tree.roots]
  let depth = 0

  while (level.length > 0) {
    if (depth > MAX_COMMENT_DEPTH) {
      throw new Error(
        `WordPress comment tree exceeds maximum supported depth ${MAX_COMMENT_DEPTH}`,
      )
    }

    const nextLevel: WpCommentItem[] = []

    for (const comment of level) {
      const wordpressId = parsePositiveInteger(comment.comment_ID, 'comment_ID')
      const wordpressKey = String(wordpressId)
      const createdAt = parseCommentDateGMT(comment.comment_date_gmt, wordpressId)

      if (processedCommentIds.has(wordpressKey)) {
        throw new Error(`WordPress comment wp:${wordpressId} was reached more than once`)
      }
      processedCommentIds.add(wordpressKey)

      const postWordPressId = parsePositiveInteger(comment.comment_post_ID, 'comment_post_ID')
      const sourceParentId = parseNonNegativeInteger(comment.comment_parent, 'comment_parent')
      let parentPayloadId: number | null = null

      if (sourceParentId !== 0 && !sourceFlattenedIds.has(wordpressKey)) {
        const parentKey = String(sourceParentId)

        if (skippedCommentIds.has(parentKey)) {
          addIssue(comment, 'parent-skipped', true)
        } else {
          const parent = await payload.find({
            collection: 'comments',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            where: { legacyWordPressId: { equals: sourceParentId } },
          })

          if (parent.docs[0]) {
            parentPayloadId = parent.docs[0].id
          } else {
            addIssue(comment, 'parent-missing-in-payload', true)
          }
        }
      }

      const postPayloadId = await resolvePostId(postWordPressId)

      if (postPayloadId === null) {
        addIssue(comment, 'post-missing-in-payload', false)
        skippedCommentIds.add(wordpressKey)
        skipped += 1

        nextLevel.push(...(tree.children.get(wordpressKey) ?? []))
        continue
      }

      const existing = await payload.find({
        collection: 'comments',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { legacyWordPressId: { equals: wordpressId } },
      })

      const data = {
        post: postPayloadId,
        parent: parentPayloadId,
        authorName: comment.comment_author,
        authorEmail: comment.comment_author_email || undefined,
        authorUrl: comment.comment_author_url || undefined,
        content: comment.comment_content,
        status: 'approved' as const,
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
        console.log(`updated comment wp:${wordpressId} -> payload:${existing.docs[0].id}`)
      } else {
        const createdComment = await payload.create({
          collection: 'comments',
          data: {
            ...data,
            moderation: {
              moderatedAt: new Date().toISOString(),
            },
          },
          context: { wordpressMigration: true },
          overrideAccess: true,
        })
        created += 1
        console.log(`created comment wp:${wordpressId} -> payload:${createdComment.id}`)
      }

      nextLevel.push(...(tree.children.get(wordpressKey) ?? []))
    }

    level = nextLevel
    depth += 1
  }

  if (processedCommentIds.size !== approved.length) {
    const unreachable = approved
      .filter(
        (comment) =>
          !processedCommentIds.has(
            String(parsePositiveInteger(comment.comment_ID, 'comment_ID')),
          ),
      )
      .map((comment) => comment.comment_ID)

    throw new Error(
      `WordPress comment tree contains an unreachable/cyclic parent chain: ${unreachable.join(', ')}`,
    )
  }

  const issues = [...issuesById.values()].sort((a, b) => a.wordpressId - b.wordpressId)
  const flattened = issues
    .filter((issue) => issue.flattened)
    .map((issue) => issue.wordpressId)
    .sort((a, b) => a - b)

  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        approved: approved.length,
        created,
        updated,
        skipped,
        flattened,
        issues,
      },
      null,
      2,
    )}\n`,
  )

  console.log(
    `comments import: ${created} created, ${updated} updated, ${skipped} skipped (${approved.length} approved)`,
  )
  console.log(
    `comments import: ${issues.length} issue entries, ${flattened.length} flattened (see migration-data/reports/comments-issues.json)`,
  )

  if (skipped > 0) {
    console.error(
      `FAIL: comments import skipped ${skipped} approved comment(s) because their published Payload post could not be resolved; see migration-data/reports/comments-issues.json`,
    )
    process.exitCode = 1
  }
}

await main()
process.exit(process.exitCode ?? 0)
