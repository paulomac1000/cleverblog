import config from '@payload-config'
import { getPayload, type Where } from 'payload'

import { WorkloadCard } from './WorkloadCard'

/**
 * Editorial workload dashboard (admin.components.beforeDashboard).
 *
 * Server Component using the Local API — no HTTP round trip. Counts are
 * administrative metadata surfaced inside the auth-gated /admin route, so
 * overrideAccess stays at its default (true): scoping to the requesting user
 * would require plumbing the request user into a component that Payload does
 * not hand one, for information that every admin/editor is allowed to see
 * anyway.
 */
export const WorkloadDashboard = async () => {
  const payload = await getPayload({ config })

  const [pendingComments, draftsAwaitingReview, notReady, recentlyPublished] = await Promise.all([
    payload.count({ collection: 'comments', where: { status: { equals: 'pending' } } }),
    payload.count({
      collection: 'posts',
      where: {
        and: [
          { 'review.status': { equals: 'pending' } },
          { 'verification.status': { not_equals: 'verified' } },
        ],
      } as Where,
    }),
    payload.count({
      collection: 'posts',
      where: {
        or: [
          { 'verification.status': { not_equals: 'verified' } },
          { 'review.status': { not_equals: 'approved' } },
        ],
      } as Where,
    }),
    payload.find({
      collection: 'posts',
      depth: 0,
      limit: 5,
      overrideAccess: true,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' } },
    }),
  ])

  return (
    <div className="cb-dashboard">
      <div className="cb-dashboard__grid">
        <WorkloadCard
          label="Komentarze do moderacji"
          value={pendingComments.totalDocs}
          href="/admin/collections/comments?workbench=pending"
        />
        <WorkloadCard
          label="Szkice do recenzji"
          value={draftsAwaitingReview.totalDocs}
          href="/admin/collections/posts"
        />
        <WorkloadCard
          label="Braki w gotowości (weryfikacja/recenzja)"
          value={notReady.totalDocs}
          href="/admin/collections/posts"
        />
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Ostatnio opublikowane</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {recentlyPublished.docs.map((post) => (
            <li key={post.id}>
              <a
                className="cb-workload-card__link"
                href={`/admin/collections/posts/${post.id}`}
              >
                {post.title ?? post.slug}
              </a>
            </li>
          ))}
          {recentlyPublished.docs.length === 0 ? (
            <li className="cb-row__meta">Brak opublikowanych wpisów.</li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}

export default WorkloadDashboard
