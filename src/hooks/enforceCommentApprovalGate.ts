import type { CollectionBeforeChangeHook } from 'payload'

import { canApproveComments } from '@/lib/auth/commentModeration'

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

  if (!canApproveComments(user)) {
    throw new Error(
      'Rola agenta nie może zatwierdzać komentarzy. Zatwierdzenie wymaga redaktora lub administratora.',
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
