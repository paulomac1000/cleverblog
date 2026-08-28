import { describe, expect, it } from 'vitest'

import { assertPostPublicationAllowed } from '../../src/hooks/enforcePostPublicationGate'

const approved = {
  _status: 'published',
  provenance: { sourceVisibility: 'public' },
  verification: { status: 'verified' },
  review: { status: 'approved' },
}

describe('post publication gate', () => {
  it('allows a reviewed and verified public post for a human editor', () => {
    expect(() =>
      assertPostPublicationAllowed({ data: approved, user: { role: 'editor' } }),
    ).not.toThrow()
  })

  it('denies agent publication even when all content gates pass', () => {
    expect(() =>
      assertPostPublicationAllowed({ data: approved, user: { role: 'agent-writer' } }),
    ).toThrow(/Agent identities are not allowed to publish/)
  })

  it('denies non-public provenance', () => {
    expect(() =>
      assertPostPublicationAllowed({
        data: { ...approved, provenance: { sourceVisibility: 'mixed' } },
        user: { role: 'editor' },
      }),
    ).toThrow(/sourceVisibility=public/)
  })

  it('permits the explicit local migration context for historical imports', () => {
    expect(() =>
      assertPostPublicationAllowed({
        context: { wordpressMigration: true },
        data: {
          _status: 'published',
          provenance: { sourceVisibility: 'public' },
          verification: { status: 'imported' },
          review: { status: 'approved' },
        },
        user: undefined,
      }),
    ).not.toThrow()
  })
})
