import { describe, expect, it } from 'vitest'

import { createFormToken, verifyFormToken } from '@/lib/comments/formToken'

const SECRET = 'test-secret-test-secret-test-secret!'

const nowMs = (): number => Date.now()

describe('comment form token', () => {
  it('round-trips a freshly issued token for the same post', () => {
    const token = createFormToken(7, SECRET, nowMs() - 10_000)
    expect(verifyFormToken(token, 7, SECRET)).toBe(true)
  })

  it('rejects a token signed for a different post id', () => {
    const token = createFormToken(7, SECRET, nowMs() - 10_000)
    expect(verifyFormToken(token, 8, SECRET)).toBe(false)
  })

  it('rejects a token verified with a different secret', () => {
    const token = createFormToken(7, SECRET, nowMs() - 10_000)
    expect(verifyFormToken(token, 7, 'other-secret-other-secret-other!!')).toBe(false)
  })

  it('rejects tokens younger than the minimum form age', () => {
    const token = createFormToken(7, SECRET, nowMs() - 1_000)
    expect(verifyFormToken(token, 7, SECRET)).toBe(false)
  })

  it('rejects tokens older than the maximum form age', () => {
    const token = createFormToken(7, SECRET, nowMs() - 3 * 60 * 60 * 1_000)
    expect(verifyFormToken(token, 7, SECRET)).toBe(false)
  })

  it('rejects tampered payloads', () => {
    const token = createFormToken(7, SECRET, nowMs() - 10_000)
    const separator = token.indexOf('.')
    const tampered = `${Number(token.slice(0, separator)) + 1}${token.slice(separator)}`
    expect(verifyFormToken(tampered, 7, SECRET)).toBe(false)
  })

  it('rejects malformed tokens', () => {
    expect(verifyFormToken('', 7, SECRET)).toBe(false)
    expect(verifyFormToken('noseparator', 7, SECRET)).toBe(false)
    expect(verifyFormToken('abc.def', 7, SECRET)).toBe(false)
    expect(verifyFormToken(`${'9'.repeat(20)}.sig`, 7, SECRET)).toBe(false)
  })
})
