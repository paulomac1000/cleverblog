import type { ListViewServerPropsOnly } from 'payload'

import { canApproveComments } from '@/lib/auth/commentModeration'
import { CommentsWorkbench } from './CommentsWorkbench'

type Props = ListViewServerPropsOnly

/**
 * Server boundary for the custom Comments List View (registered at
 * Comments.admin.components.views.list.Component). Payload has already
 * prefetched the list; this component only resolves the serializable
 * moderation context — who may approve (shared policy with the server gate)
 * and post titles for relation rows — then hands off to the client
 * workbench. `payload`, the sanitized server config and the full user object
 * deliberately do NOT cross into the client component.
 */
export const CommentsListView = async (props: Props) => {
  const canApprove = canApproveComments(props.user)

  const posts = await props.payload.find({
    collection: 'posts',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    select: { title: true, slug: true },
  })
  const postTitles: Record<number, string> = {}
  for (const post of posts.docs) {
    postTitles[post.id] = post.title ?? post.slug ?? `#${post.id}`
  }

  // Deep link support: /admin/collections/comments?workbench=pending opens
  // straight in the moderation queue (linked from the dashboard widget).
  // Deep link support from the dashboard widget; the queue is pending-first
  // in every other case.
  const initialStatus = 'pending' as const

  return (
    <div style={{ padding: '0 var(--gutter-h, 24px)' }}>
      <h1 style={{ margin: '16px 0 4px', fontSize: 22 }}>Moderacja komentarzy</h1>
      <p className="cb-row__meta" style={{ marginTop: 0 }}>
        Kolejka domyślnie pokazuje komentarze oczekujące na decyzję.
      </p>
      <CommentsWorkbench
        canApprove={canApprove}
        postTitles={postTitles}
        initialStatus={initialStatus}
      />
    </div>
  )
}

export default CommentsListView
