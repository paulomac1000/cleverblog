import { afterEach, describe, expect, it } from 'vitest'

import { getCommentConfig } from '@/lib/comments/config'

const setEnv = (values: Record<string, string | undefined>): void => {
  const keys = [
    'COMMENTS_ENABLED',
    'TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
    'COMMENT_SECURITY_SECRET',
  ]
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
}

describe('comment configuration gate', () => {
  afterEach(() => {
    setEnv({})
  })

  it('fails closed when COMMENTS_ENABLED is not true', () => {
    setEnv({
      COMMENTS_ENABLED: 'false',
      TURNSTILE_SITE_KEY: '0xsite',
      TURNSTILE_SECRET_KEY: '0xsecret',
      COMMENT_SECURITY_SECRET: 'x'.repeat(32),
    })
    expect(getCommentConfig()).toBeNull()
  })

  it('fails closed when any Turnstile key is missing', () => {
    setEnv({
      COMMENTS_ENABLED: 'true',
      TURNSTILE_SITE_KEY: '',
      TURNSTILE_SECRET_KEY: '0xsecret',
      COMMENT_SECURITY_SECRET: 'x'.repeat(32),
    })
    expect(getCommentConfig()).toBeNull()
  })

  it('fails closed when the security secret is too short', () => {
    setEnv({
      COMMENTS_ENABLED: 'true',
      TURNSTILE_SITE_KEY: '0xsite',
      TURNSTILE_SECRET_KEY: '0xsecret',
      COMMENT_SECURITY_SECRET: 'short',
    })
    expect(getCommentConfig()).toBeNull()
  })

  it('returns the configuration when every value is present', () => {
    setEnv({
      COMMENTS_ENABLED: 'true',
      TURNSTILE_SITE_KEY: '0xsite',
      TURNSTILE_SECRET_KEY: '0xsecret',
      COMMENT_SECURITY_SECRET: 'x'.repeat(32),
    })
    const config = getCommentConfig()
    expect(config).not.toBeNull()
    expect(config?.turnstileSiteKey).toBe('0xsite')
  })
})
