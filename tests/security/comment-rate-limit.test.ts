import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { consumeCommentRateLimit } from '@/lib/comments/rateLimit'

const SECRET = 'test-secret-test-secret-test-secret!'

describe('comment rate limit', () => {
  let now: number

  beforeEach(() => {
    now = 1_000_000
  })

  afterEach(() => {
    // drain any buckets created by these tests so suites stay isolated
    for (let i = 0; i < 30; i += 1) {
      consumeCommentRateLimit(`cleanup-${i}`, SECRET, now + 10 * 60 * 1_000 * 2)
    }
  })

  it('allows up to five attempts inside a window', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(consumeCommentRateLimit('1.2.3.4', SECRET, now).allowed).toBe(true)
    }
  })

  it('blocks the sixth attempt and reports retry time', () => {
    for (let i = 0; i < 5; i += 1) {
      consumeCommentRateLimit('5.6.7.8', SECRET, now)
    }
    const blocked = consumeCommentRateLimit('5.6.7.8', SECRET, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('resets the window after it expires', () => {
    for (let i = 0; i < 5; i += 1) {
      consumeCommentRateLimit('9.10.11.12', SECRET, now)
    }
    expect(consumeCommentRateLimit('9.10.11.12', SECRET, now).allowed).toBe(false)
    const afterWindow = consumeCommentRateLimit(
      '9.10.11.12',
      SECRET,
      now + 10 * 60 * 1_000 + 1,
    )
    expect(afterWindow.allowed).toBe(true)
  })

  it('isolates buckets per client', () => {
    for (let i = 0; i < 5; i += 1) {
      consumeCommentRateLimit('a', SECRET, now)
    }
    expect(consumeCommentRateLimit('b', SECRET, now).allowed).toBe(true)
  })

  it('evicts the oldest live bucket at saturation and still admits new clients', () => {
    const blocked = 'saturation-target'
    for (let i = 0; i < 5; i += 1) {
      consumeCommentRateLimit(blocked, SECRET, now)
    }
    expect(consumeCommentRateLimit(blocked, SECRET, now).allowed).toBe(false)

    for (let i = 0; i < 2_500; i += 1) {
      consumeCommentRateLimit(`rotating-${i}`, SECRET, now)
    }

    const newcomer = consumeCommentRateLimit('brand-new-client', SECRET, now)
    expect(newcomer.allowed).toBe(true)

    let admitted = 0
    for (let i = 0; i < 100; i += 1) {
      if (consumeCommentRateLimit(`post-saturation-${i}`, SECRET, now).allowed) admitted += 1
    }
    expect(admitted).toBe(100)
  })
})
