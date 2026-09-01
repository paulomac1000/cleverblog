import { describe, expect, it } from 'vitest'

import { assertCommentApprovalAllowed } from '@/hooks/enforceCommentApprovalGate'

const agentUser = { role: 'agent-moderator' }
const editorUser = { role: 'editor' }

describe('comment approval gate', () => {
  it('blocks agent identities from approving a comment', () => {
    expect(() =>
      assertCommentApprovalAllowed({
        data: { status: 'approved' },
        user: agentUser,
      }),
    ).toThrowError(/not allowed to approve/)
  })

  it('blocks agents when the document stays approved through an update', () => {
    expect(() =>
      assertCommentApprovalAllowed({
        data: {},
        originalDoc: { status: 'approved' },
        user: agentUser,
      }),
    ).toThrowError(/not allowed to approve/)
  })

  it('allows admin and editor to approve', () => {
    expect(() =>
      assertCommentApprovalAllowed({
        data: { status: 'approved' },
        user: editorUser,
      }),
    ).not.toThrow()
  })

  it('allows agents to classify spam or leave pending', () => {
    expect(() =>
      assertCommentApprovalAllowed({
        data: { status: 'spam' },
        user: agentUser,
      }),
    ).not.toThrow()
    expect(() =>
      assertCommentApprovalAllowed({
        data: { status: 'pending' },
        user: agentUser,
      }),
    ).not.toThrow()
  })
})
