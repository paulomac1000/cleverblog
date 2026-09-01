export type CommentConfig = {
  securitySecret: string
  turnstileSecretKey: string
  turnstileSiteKey: string
}

const readRequired = (name: string): string | null => {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export const getCommentConfig = (): CommentConfig | null => {
  if (process.env.COMMENTS_ENABLED !== 'true') return null

  const turnstileSiteKey = readRequired('TURNSTILE_SITE_KEY')
  const turnstileSecretKey = readRequired('TURNSTILE_SECRET_KEY')
  const securitySecret = readRequired('COMMENT_SECURITY_SECRET')

  if (!turnstileSiteKey || !turnstileSecretKey || !securitySecret || securitySecret.length < 32) {
    return null
  }

  return {
    securitySecret,
    turnstileSecretKey,
    turnstileSiteKey,
  }
}
