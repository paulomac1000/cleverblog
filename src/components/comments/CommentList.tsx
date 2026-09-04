import config from '@payload-config'
import { getPayload } from 'payload'

type Props = {
  postId: number
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

export async function CommentList({ postId }: Props) {
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

  const renderComment = (comment: (typeof result.docs)[number], nested = false) => {
    const parentId = getRelationshipId(comment.parent)
    const parentAuthor = parentId ? authorById.get(parentId) : null
    const authorUrl = getSafeAuthorUrl(comment.authorUrl)

    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: nested ? '3px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: nested ? '14px 16px' : 18,
        }}
      >
        <div
          style={{
            alignItems: 'baseline',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 12px',
          }}
        >
          <strong>
            {authorUrl ? (
              <a href={authorUrl} rel="ugc nofollow external">
                {comment.authorName}
              </a>
            ) : (
              comment.authorName
            )}
          </strong>
          <time className="muted" dateTime={comment.createdAt} style={{ fontSize: '0.85rem' }}>
            {new Date(comment.createdAt).toLocaleDateString('pl-PL')}
          </time>
        </div>

        {parentAuthor ? (
          <div className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
            Odpowiedź do: {parentAuthor}
          </div>
        ) : null}

        <p
          style={{
            margin: '12px 0 0',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {comment.content}
        </p>
      </div>
    )
  }

  return (
    <section
      aria-labelledby="comments-heading"
      style={{
        borderTop: '1px solid var(--border)',
        marginTop: 48,
        paddingTop: 32,
      }}
    >
      <h2 id="comments-heading">Komentarze ({result.docs.length})</h2>

      {result.docs.length === 0 ? (
        <p className="muted">Brak komentarzy.</p>
      ) : (
        <ol style={{ display: 'grid', gap: 16, listStyle: 'none', margin: 0, padding: 0 }}>
          {rootComments.map((comment) => {
            const replies = repliesByRoot.get(comment.id) ?? []

            return (
              <li key={comment.id}>
                {renderComment(comment)}
                {replies.length > 0 ? (
                  <ol
                    style={{
                      display: 'grid',
                      gap: 10,
                      listStyle: 'none',
                      margin: '12px 0 0 24px',
                      padding: 0,
                    }}
                  >
                    {replies.map((reply) => (
                      <li key={reply.id}>{renderComment(reply, true)}</li>
                    ))}
                  </ol>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
