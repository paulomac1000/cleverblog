import { afterEach, describe, expect, it, vi } from 'vitest'

import { submitComment } from '@/actions/submitComment'
import { createFormToken } from '@/lib/comments/formToken'
import {
  consumeCommentRateLimit,
  consumeGlobalCommentAdmission,
} from '@/lib/comments/rateLimit'

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-verified-client-ip': '203.0.113.10' })),
}))
vi.mock('payload', () => ({
  getPayload: vi.fn(() => {
    throw new Error('getPayload must not be called when Turnstile verification fails')
  }),
}))
vi.mock('@/lib/comments/verifyTurnstile', () => ({
  verifyTurnstile: vi.fn(async () => false),
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

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

describe('submitComment global admission ordering', () => {
  it('does not charge shared admission for failed Turnstile verification', async () => {
    const secret = 'turnstile-ordering-secret-000000000000'
    vi.stubEnv('COMMENTS_ENABLED', 'true')
    vi.stubEnv('TURNSTILE_SITE_KEY', 'test-site-key')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret-key')
    vi.stubEnv('COMMENT_SECURITY_SECRET', secret)

    const formData = new FormData()
    formData.set('postId', '123')
    formData.set('formToken', createFormToken(123, secret, Date.now() - 5_000))
    formData.set('cf-turnstile-response', 'invalid-token')

    for (let index = 0; index < 2; index += 1) {
      await expect(
        submitComment({ message: '', status: 'idle' }, formData),
      ).resolves.toEqual({
        message: 'Weryfikacja antyspamowa nie powiodła się. Spróbuj ponownie.',
        status: 'error',
      })
    }

    const now = 5_000_000
    for (let index = 0; index < 10; index += 1) {
      expect(consumeGlobalCommentAdmission(secret, now + index).allowed).toBe(true)
    }
  })
})
