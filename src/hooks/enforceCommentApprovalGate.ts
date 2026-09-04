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

  // Optimistic concurrency for the moderation workbench: the client sends
  // _expectedStatus (the status it saw). If the doc changed in the meantime,
  // reject with a conflict so the row is refetched instead of blindly
  // overwriting another moderator's decision.
  const expectedStatus = next._expectedStatus
  if (typeof expectedStatus === 'string' && expectedStatus !== '') {
    delete next._expectedStatus
    if (previous.status !== expectedStatus) {
      throw new Error(
        'Komentarz zmienił status w międzyczasie. Odśwież listę i spróbuj ponownie.',
      )
    }
  }

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
