import type { Access } from 'payload'

export const roleValues = [
  'admin',
  'editor',
  'agent-topic-scout',
  'agent-writer',
  'agent-moderator',
] as const

export type UserRole = (typeof roleValues)[number]

type RoleCarrier = { role?: unknown }

export const getUserRole = (user: unknown): UserRole | undefined => {
  if (!user || typeof user !== 'object') return undefined
  const role = (user as RoleCarrier).role
  return typeof role === 'string' && roleValues.includes(role as UserRole)
    ? (role as UserRole)
    : undefined
}

export const hasRole = (user: unknown, allowed: readonly UserRole[]): boolean => {
  const role = getUserRole(user)
  return role ? allowed.includes(role) : false
}

export const allowRoles = (...allowed: UserRole[]): Access => ({ req }) =>
  hasRole(req.user, allowed)

export const publicOrRoles = (...allowed: UserRole[]): Access => ({ req }) => {
  if (hasRole(req.user, allowed)) return true
  return { _status: { equals: 'published' } }
}
