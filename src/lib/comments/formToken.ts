import { createHmac, timingSafeEqual } from 'node:crypto'

const MIN_FORM_AGE_MS = 3_000
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1_000

const sign = (postId: number, issuedAt: number, secret: string): string =>
  createHmac('sha256', secret).update(`form:${postId}:${issuedAt}`).digest('base64url')

export const createFormToken = (
  postId: number,
  secret: string,
  issuedAt = Date.now(),
): string => `${issuedAt}.${sign(postId, issuedAt, secret)}`

export const verifyFormToken = (
  token: string,
  postId: number,
  secret: string,
  now = Date.now(),
): boolean => {
  if (token.length > 128) return false

  const separator = token.indexOf('.')
  if (separator <= 0) return false

  const issuedAt = Number(token.slice(0, separator))
  const signature = token.slice(separator + 1)
  if (!Number.isSafeInteger(issuedAt) || !signature) return false

  const age = now - issuedAt
  if (age < MIN_FORM_AGE_MS || age > MAX_FORM_AGE_MS) return false

  const expected = sign(postId, issuedAt, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
