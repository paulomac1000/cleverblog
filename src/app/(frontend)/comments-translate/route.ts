import config from '@payload-config'
import { isIP } from 'node:net'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import {
  consumeRateLimit,
  isMtEnabled,
  MAX_TRANSLATION_BATCH,
  MAX_TRANSLATION_INPUT_CHARS,
  MT_SUPPORTED_LOCALES,
  translateCommentText,
} from '@/lib/comments/translate'

type Body = {
  postId?: unknown
  commentIds?: unknown
  locale?: unknown
}

const asId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null

const RETRY_DELAY_MS = 15 * 60_000

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const parsed = body as Body

  const postId = asId(parsed.postId)
  const locale = typeof parsed.locale === 'string' ? parsed.locale : null
  if (
    !Array.isArray(parsed.commentIds) ||
    parsed.commentIds.some((id) => asId(id) === null)
  ) {
    return NextResponse.json({ error: 'invalid commentIds' }, { status: 400 })
  }
  const commentIds = [...new Set(parsed.commentIds.map((id) => asId(id) as number))]

  if (!postId || commentIds.length === 0 || commentIds.length > MAX_TRANSLATION_BATCH) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  if (!locale || !MT_SUPPORTED_LOCALES.includes(locale as 'en')) {
    return NextResponse.json({ error: 'unsupported locale' }, { status: 400 })
  }

  // Only the trusted ingress header is ever honored (it is always
  // overwritten upstream, so it cannot be spoofed).
  const headerIP = request.headers.get('x-verified-client-ip')?.trim() ?? ''
  const ip = isIP(headerIP) ? headerIP : 'unknown'
  const rate = consumeRateLimit(ip)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    )
  }

  const payload = await getPayload({ config })
  const comments = await payload.find({
    collection: 'comments',
    depth: 0,
    limit: MAX_TRANSLATION_BATCH,
    overrideAccess: true,
    where: {
      and: [
        { post: { equals: postId } },
        { status: { equals: 'approved' } },
        { id: { in: commentIds } },
      ],
    },
  })

  const approvedById = new Map(comments.docs.map((c) => [c.id, c]))
  const existing = await payload.find({
    collection: 'comment-translations',
    depth: 0,
    limit: MAX_TRANSLATION_BATCH,
    overrideAccess: true,
    where: {
      and: [
        { comment: { in: commentIds } },
        { locale: { equals: locale } },
      ],
    },
  })
  const cachedByComment = new Map<number, string>()
  const failedById = new Map<number, (typeof existing.docs)[number]>()
  for (const row of existing.docs) {
    const cid = getRelationshipId(row.comment)
    if (cid === null) continue
    if (row.status === 'ready') {
      cachedByComment.set(cid, row.text)
    } else {
      failedById.set(cid, row)
    }
  }

  const results: Record<number, string> = {}
  const missing: number[] = []
  for (const id of commentIds) {
    const comment = approvedById.get(id)
    if (!comment) continue
    const cachedText = cachedByComment.get(id)
    if (cachedText) {
      results[id] = cachedText
    } else if (
      typeof comment.content === 'string' &&
      comment.content.length > 0 &&
      comment.content.length <= MAX_TRANSLATION_INPUT_CHARS
    ) {
      missing.push(id)
    }
  }

  if (isMtEnabled()) {
    for (const id of missing) {
      const comment = approvedById.get(id)
      if (!comment || typeof comment.content !== 'string') continue
      const failedRow = failedById.get(id)
      if (failedRow?.nextRetryAt && new Date(failedRow.nextRetryAt).getTime() > Date.now()) {
        continue
      }
      const outcome = await translateCommentText(comment.content)
      if (outcome.status === 'ready' && outcome.text) {
        const readyData = {
          text: outcome.text,
          status: 'ready' as const,
          provider: outcome.provider,
          model: outcome.model,
          sourceHash: outcome.sourceHash,
          translationVersion: 1,
          nextRetryAt: null,
        }
        if (failedRow) {
          // Promote the previously failed row — create would collide on the
          // unique (comment, locale) index.
          await payload.update({
            collection: 'comment-translations',
            id: failedRow.id,
            data: readyData,
            overrideAccess: true,
          })
          results[id] = outcome.text
          continue
        }
        try {
          await payload.create({
            collection: 'comment-translations',
            data: { comment: id, locale: locale as 'en', ...readyData },
            overrideAccess: true,
          })
        } catch {
          // Lost a single-flight race: serve the winner's translation.
          const winner = await payload.find({
            collection: 'comment-translations',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            where: {
              and: [
                { comment: { equals: id } },
                { locale: { equals: locale as 'en' } },
                { status: { equals: 'ready' } },
              ],
            },
          })
          const winningText = winner.docs[0]?.text
          if (!winningText) throw new Error('translation race lost without a winner')
          results[id] = winningText
          continue
        }
        results[id] = outcome.text
      } else if (outcome.status === 'failed') {
        if (failedRow) {
          // Re-failure: push the cooldown forward instead of colliding.
          await payload.update({
            collection: 'comment-translations',
            id: failedRow.id,
            data: { nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS).toISOString() },
            overrideAccess: true,
          })
        } else {
          await payload.create({
            collection: 'comment-translations',
            data: {
              comment: id,
              locale: locale as 'en',
              text: '',
              status: 'failed',
              nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
            },
            overrideAccess: true,
          }).catch(() => undefined)
        }
      }
    }
  }

  return NextResponse.json({
    translations: results,
    originals: Object.fromEntries(
      commentIds
        .filter((id) => approvedById.has(id) && !(id in results))
        .map((id) => [id, approvedById.get(id)?.content ?? '']),
    ),
  })
}

const getRelationshipId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number'
  ) {
    return value.id
  }
  return null
}
