type TurnstileVerification = {
  success?: boolean
}

type VerifyTurnstileArgs = {
  remoteIP?: string
  secret: string
  token: string
}

export const verifyTurnstile = async ({
  remoteIP,
  secret,
  token,
}: VerifyTurnstileArgs): Promise<boolean> => {
  if (!token || token.length > 4_096) return false

  const body = new URLSearchParams({
    response: token,
    secret,
  })

  if (remoteIP) body.set('remoteip', remoteIP)

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body,
      cache: 'no-store',
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) return false

    const result = (await response.json()) as TurnstileVerification
    return result.success === true
  } catch {
    return false
  }
}
