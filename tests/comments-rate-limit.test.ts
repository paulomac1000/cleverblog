import { afterEach, describe, expect, it, vi } from 'vitest'

import { submitComment } from '@/actions/submitComment'
import { createFormToken } from '@/lib/comments/formToken'
import {
  consumeCommentRateLimit,
  consumeGlobalCommentAdmission,
} from '@/lib/comments/rateLimit'

const requestHeadersState = vi.hoisted(() => ({
  clientIP: '203.0.113.10',
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-verified-client-ip': requestHeadersState.clientIP })),
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
  requestHeadersState.clientIP = '203.0.113.10'
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

describe('submitComment per-IP capacity handling', () => {
  it('evicts oldest buckets instead of rejecting unseen clients when the store is full', async () => {
    vi.resetModules()
    const { submitComment: isolatedSubmitComment } = await import('@/actions/submitComment')

    const secret = 'per-ip-capacity-secret-0000000000000000'
    vi.stubEnv('COMMENTS_ENABLED', 'true')
    vi.stubEnv('TURNSTILE_SITE_KEY', 'test-site-key')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret-key')
    vi.stubEnv('COMMENT_SECURITY_SECRET', secret)

    const formData = new FormData()
    formData.set('postId', '123')
    formData.set('formToken', createFormToken(123, secret, Date.now() - 5_000))
    formData.set('cf-turnstile-response', 'invalid-token')

    const turnstileFailure = {
      message: 'Weryfikacja antyspamowa nie powiodła się. Spróbuj ponownie.',
      status: 'error',
    } as const

    const submitFrom = async (clientIP: string) => {
      requestHeadersState.clientIP = clientIP
      await expect(
        isolatedSubmitComment({ message: '', status: 'idle' }, formData),
      ).resolves.toEqual(turnstileFailure)
    }

    const firstClient = '2001:db8::1'
    const secondClient = '2001:db8::2'

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submitFrom(firstClient)
      await submitFrom(secondClient)
    }

    for (let index = 3; index <= 2_048; index += 1) {
      await submitFrom(`2001:db8::${index.toString(16)}`)
    }

    await submitFrom('198.51.100.200')

    // The first saturated bucket was evicted to admit the legitimate client.
    await submitFrom(firstClient)

    // Re-inserting that client at full capacity evicts the next-oldest bucket,
    // proving capacity is replaced rather than allowed to grow past MAX_BUCKETS.
    await submitFrom(secondClient)
  })
})
