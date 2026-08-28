import type { CollectionBeforeChangeHook } from 'payload'

import { getUserRole } from '@/access/roles'

type AnyRecord = Record<string, unknown>

type PublicationGateInput = {
  context?: AnyRecord
  data: unknown
  originalDoc?: unknown
  user?: unknown
}

const objectValue = (value: unknown): AnyRecord =>
  value && typeof value === 'object' ? (value as AnyRecord) : {}

export const assertPostPublicationAllowed = ({
  context = {},
  data,
  originalDoc,
  user,
}: PublicationGateInput): void => {
  const next = objectValue(data)
  const previous = objectValue(originalDoc)
  const status = next._status ?? previous._status

  if (status !== 'published') return
  if (context.wordpressMigration === true) return

  const role = getUserRole(user)
  if (role?.startsWith('agent-')) {
    throw new Error('Agent identities are not allowed to publish posts. Save a draft instead.')
  }

  const provenance = objectValue(next.provenance ?? previous.provenance)
  const verification = objectValue(next.verification ?? previous.verification)
  const review = objectValue(next.review ?? previous.review)

  if (provenance.sourceVisibility !== 'public') {
    throw new Error('Publication requires provenance.sourceVisibility=public.')
  }
  if (verification.status !== 'verified') {
    throw new Error('Publication requires verification.status=verified.')
  }
  if (review.status !== 'approved') {
    throw new Error('Publication requires review.status=approved.')
  }
}

export const enforcePostPublicationGate: CollectionBeforeChangeHook = ({
  context,
  data,
  originalDoc,
  req,
}) => {
  assertPostPublicationAllowed({ context, data, originalDoc, user: req.user })
  return data
}
