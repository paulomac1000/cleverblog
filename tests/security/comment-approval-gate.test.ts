import { describe, expect, it } from 'vitest'

import { Comments } from '@/collections/Comments'
import { assertCommentApprovalAllowed } from '@/hooks/enforceCommentApprovalGate'

const agentUser = { role: 'agent-moderator' }
const editorUser = { role: 'editor' }

const protectedFields = [
  'post',
  'parent',
  'authorName',
  'authorEmail',
  'authorUrl',
  'content',
  'submissionHash',
  'legacyWordPressId',
]

const getUpdateAccess = (fieldName: string) => {
  const field = Comments.fields.find(
    (candidate) => 'name' in candidate && candidate.name === fieldName,
  )

  if (!field || !('access' in field) || typeof field.access?.update !== 'function') {
    throw new Error(`Missing update access for comment field ${fieldName}`)
  }

  return field.access.update
}

const canUpdateField = async (fieldName: string, user: unknown): Promise<boolean> =>
  Boolean(await getUpdateAccess(fieldName)({ req: { user } } as never))

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

  it('blocks agent-moderator from mutating protected comment fields', async () => {
    for (const field of protectedFields) {
      await expect(canUpdateField(field, agentUser)).resolves.toBe(false)
    }
  })

  it('keeps protected comment fields editable by editors', async () => {
    for (const field of protectedFields) {
      await expect(canUpdateField(field, editorUser)).resolves.toBe(true)
    }
  })
})
