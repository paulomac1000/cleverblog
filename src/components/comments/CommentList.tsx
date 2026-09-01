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

  const authorById = new Map(result.docs.map((comment) => [comment.id, comment.authorName]))

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
          {result.docs.map((comment) => {
            const parentId = getRelationshipId(comment.parent)
            const parentAuthor = parentId ? authorById.get(parentId) : null
            const authorUrl = getSafeAuthorUrl(comment.authorUrl)

            return (
              <li
                key={comment.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 18,
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

                <p style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{comment.content}</p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
