import { getUserRole } from '@/access/roles'

/**
 * Single source of truth for "who may approve comments". Consumed by the
 * server-side approval gate (authoritative) AND the admin UI (affordance:
 * disabled Approve controls for agent roles). Keeping both on this helper
 * prevents the UI and the server from ever disagreeing.
 */
export const canApproveComments = (user: unknown): boolean => {
  const role = getUserRole(user)
  return role === 'admin' || role === 'editor'
}

export const APPROVAL_TOOLTIP =
  'Rola agenta nie może zatwierdzać komentarzy. Zatwierdzenie wymaga redaktora lub administratora.'
