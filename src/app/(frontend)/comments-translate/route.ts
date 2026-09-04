import config from '@payload-config'
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
  postId?: number
  commentIds?: number[]
  locale?: string
}

const asId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null

const RETRY_DELAY_MS = 15 * 60_000

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const postId = asId(body.postId)
  const locale = body.locale
  const commentIds = Array.isArray(body.commentIds)
    ? body.commentIds.map(asId).filter((v): v is number => v !== null)
    : []

  if (!postId || commentIds.length === 0 || commentIds.length > MAX_TRANSLATION_BATCH) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  if (!locale || !MT_SUPPORTED_LOCALES.includes(locale as 'en')) {
    return NextResponse.json({ error: 'unsupported locale' }, { status: 400 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
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
  const cached = await payload.find({
    collection: 'comment-translations',
    depth: 0,
    limit: MAX_TRANSLATION_BATCH,
    overrideAccess: true,
    where: {
      and: [
        { comment: { in: commentIds } },
        { locale: { equals: locale } },
        { status: { equals: 'ready' } },
      ],
    },
  })
  const cachedByComment = new Map(
    cached.docs.map((t) => [getRelationshipId(t.comment), t.text]),
  )

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
      const outcome = await translateCommentText(comment.content)
      if (outcome.status === 'ready' && outcome.text) {
        await payload.create({
          collection: 'comment-translations',
          data: {
            comment: id,
            locale: locale as 'en',
            text: outcome.text,
            status: 'ready',
            provider: outcome.provider,
            model: outcome.model,
            sourceHash: outcome.sourceHash,
            translationVersion: 1,
          },
          overrideAccess: true,
        })
        results[id] = outcome.text
      } else if (outcome.status === 'failed') {
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
