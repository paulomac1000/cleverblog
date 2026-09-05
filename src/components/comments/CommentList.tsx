import config from '@payload-config'
import { getPayload } from 'payload'

import { t, tf } from '@/i18n/messages'
import type { Locale } from '@/i18n/config'
import { CommentsThread, type ThreadComment, type ThreadRoot } from '@/components/comments/CommentsThread'

type Props = {
  postId: number
  locale: Locale
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

const getSafeAuthorUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export async function CommentList({ postId, locale }: Props) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'comments',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    sort: 'createdAt',
    where: {
      and: [
        { post: { equals: postId } },
        { status: { equals: 'approved' } },
      ],
    },
  })

  const commentById = new Map(result.docs.map((comment) => [comment.id, comment]))
  const translationsByComment = new Map<number, string>()
  if (locale === 'en' && result.docs.length > 0) {
    const cached = await payload.find({
      collection: 'comment-translations',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      where: {
        and: [
          { comment: { in: result.docs.map((c) => c.id) } },
          { locale: { equals: 'en' } },
          { status: { equals: 'ready' } },
        ],
      },
    })
    for (const tr of cached.docs) {
      const cid = getRelationshipId(tr.comment)
      if (cid !== null) translationsByComment.set(cid, tr.text)
    }
  }
  const authorById = new Map(result.docs.map((comment) => [comment.id, comment.authorName]))
  const rootComments: typeof result.docs = []
  const repliesByRoot = new Map<number, typeof result.docs>()

  for (const comment of result.docs) {
    const directParentId = getRelationshipId(comment.parent)
    if (!directParentId || !commentById.has(directParentId)) {
      rootComments.push(comment)
      continue
    }

    let rootId = directParentId
    const visited = new Set<number>([comment.id])

    while (!visited.has(rootId)) {
      visited.add(rootId)
      const ancestor = commentById.get(rootId)
      if (!ancestor) break

      const parentId = getRelationshipId(ancestor.parent)
      if (!parentId || !commentById.has(parentId)) break
      rootId = parentId
    }

    if (rootId === comment.id) {
      rootComments.push(comment)
      continue
    }

    const replies = repliesByRoot.get(rootId) ?? []
    replies.push(comment)
    repliesByRoot.set(rootId, replies)
  }

  const dateFormatter = new Intl.DateTimeFormat('pl-PL')
  const toThreadComment = (
    comment: (typeof result.docs)[number],
    parentAuthor: string | null,
    translated: string | null,
  ): ThreadComment => ({
    id: comment.id,
    authorName: comment.authorName,
    authorUrl: getSafeAuthorUrl(comment.authorUrl),
    createdAt:
      typeof comment.createdAt === 'string' ? comment.createdAt : String(comment.createdAt),
    createdAtText: dateFormatter.format(new Date(comment.createdAt)),
    replyToText: parentAuthor ? tf(locale, 'comments.replyTo')(parentAuthor) : null,
    content: comment.content,
    translated,
  })

  const tree: ThreadRoot[] = rootComments.map((root) => {
    const rootParentId = getRelationshipId(root.parent)
    const rootParentAuthor = rootParentId ? authorById.get(rootParentId) ?? null : null
    const replies = (repliesByRoot.get(root.id) ?? []).map((reply) => {
      const replyParentId = getRelationshipId(reply.parent)
      const replyParentAuthor = replyParentId ? authorById.get(replyParentId) ?? null : null
      return toThreadComment(
        reply,
        replyParentAuthor,
        translationsByComment.get(reply.id) ?? null,
      )
    })
    return {
      root: toThreadComment(root, rootParentAuthor, translationsByComment.get(root.id) ?? null),
      replies,
    }
  })

  return (
    <section aria-labelledby="comments-heading" style={{ borderTop: '1px solid var(--border)', marginTop: 48, paddingTop: 32 }}>
      <h2 id="comments-heading">{tf(locale, 'comments.heading')(result.docs.length)}</h2>
      <CommentsThread
        locale={locale}
        postId={postId}
        strings={{
          empty: t(locale, 'comments.empty'),
          machineTranslated: t(locale, 'comments.machineTranslated'),
          showOriginal: t(locale, 'comments.showOriginal'),
          showTranslation: t(locale, 'comments.showTranslation'),
        }}
        tree={tree}
      />
    </section>
  )
}
