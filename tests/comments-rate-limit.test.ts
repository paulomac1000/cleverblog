import { describe, expect, it } from 'vitest'

import {
  consumeCommentRateLimit,
  consumeGlobalCommentAdmission,
} from '@/lib/comments/rateLimit'

describe('consumeGlobalCommentAdmission', () => {
  it('allows submissions below the global limit', () => {
    const secret = 'global-under-limit-secret'
    const now = 1_000_000

    for (let index = 0; index < 9; index += 1) {
      expect(consumeGlobalCommentAdmission(secret, now + index)).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      })
    }
  })

  it('rejects submissions above ten per minute', () => {
    const secret = 'global-over-limit-secret'
    const now = 2_000_000

    for (let index = 0; index < 10; index += 1) {
      expect(consumeGlobalCommentAdmission(secret, now + index).allowed).toBe(true)
    }

    const rejected = consumeGlobalCommentAdmission(secret, now + 10)
    expect(rejected.allowed).toBe(false)
    expect(rejected.retryAfterSeconds).toBe(60)
  })

  it('recovers after the global window expires', () => {
    const secret = 'global-window-reset-secret'
    const now = 3_000_000

    for (let index = 0; index < 10; index += 1) {
      expect(consumeGlobalCommentAdmission(secret, now + index).allowed).toBe(true)
    }

    expect(consumeGlobalCommentAdmission(secret, now + 10).allowed).toBe(false)
    expect(consumeGlobalCommentAdmission(secret, now + 60_000)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it('is shared across submissions with different client keys', () => {
    const secret = 'global-shared-clients-secret'
    const now = 4_000_000

    for (let index = 0; index < 10; index += 1) {
      expect(
        consumeCommentRateLimit(`client-${index}`, secret, now + index).allowed,
      ).toBe(true)
      expect(consumeGlobalCommentAdmission(secret, now + index).allowed).toBe(true)
    }

    expect(consumeCommentRateLimit('client-10', secret, now + 10).allowed).toBe(true)
    expect(consumeGlobalCommentAdmission(secret, now + 10).allowed).toBe(false)
  })
})
