/**
 * Combined publish-readiness derivation for the Posts list. Mirrors the
 * server-side gate in src/hooks/enforcePostPublicationGate.ts exactly:
 *
 *   ready = provenance.sourceVisibility === 'public'
 *        && verification.status    === 'verified'
 *        && review.status          === 'approved'
 *
 * Explicit enum mapping (values from src/collections/Posts.ts):
 * - verification: imported | needs-review | verified | stale | historical | superseded
 * - review:       pending | approved | rejected
 * - provenance:   public | private | mixed | unknown
 */
export type PublishReadinessState = 'ready' | 'action-needed' | 'blocked'

const HARD_BLOCKED_REVIEW = new Set(['rejected'])
const HARD_BLOCKED_VERIFICATION = new Set(['superseded'])
const HARD_BLOCKED_VISIBILITY = new Set(['private'])

export type PublishReadinessInput = {
  verificationStatus?: string | null
  reviewStatus?: string | null
  sourceVisibility?: string | null
}

export const derivePublishReadiness = (
  input: PublishReadinessInput,
): PublishReadinessState => {
  if (
    HARD_BLOCKED_REVIEW.has(input.reviewStatus ?? '') ||
    HARD_BLOCKED_VERIFICATION.has(input.verificationStatus ?? '') ||
    HARD_BLOCKED_VISIBILITY.has(input.sourceVisibility ?? '')
  ) {
    return 'blocked'
  }

  const ready =
    input.verificationStatus === 'verified' &&
    input.reviewStatus === 'approved' &&
    input.sourceVisibility === 'public'

  return ready ? 'ready' : 'action-needed'
}

export const READINESS_LABEL: Record<PublishReadinessState, string> = {
  ready: 'Gotowy',
  'action-needed': 'Wymaga działania',
  blocked: 'Zablokowany',
}
