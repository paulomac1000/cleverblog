import type { CollectionBeforeChangeHook } from 'payload'

import { getUserRole } from '@/access/roles'

type AnyRecord = Record<string, unknown>

const objectValue = (value: unknown): AnyRecord =>
  value && typeof value === 'object' ? (value as AnyRecord) : {}

export const assertCommentApprovalAllowed = ({
  data,
  originalDoc,
  user,
}: {
  data: unknown
  originalDoc?: unknown
  user?: unknown
}): void => {
  const next = objectValue(data)
  const previous = objectValue(originalDoc)
  const status = next.status ?? previous.status

  if (status !== 'approved') return

  const role = getUserRole(user)
  if (role?.startsWith('agent-')) {
    throw new Error(
      'Agent identities are not allowed to approve comments. Set spam/hidden or leave pending; approval belongs to admin/editor.',
    )
  }
}

export const enforceCommentApprovalGate: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  assertCommentApprovalAllowed({ data, originalDoc, user: req.user })
  return data
}
