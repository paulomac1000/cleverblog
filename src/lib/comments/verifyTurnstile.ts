type TurnstileVerification = {
  action?: string
  hostname?: string
  success?: boolean
}

type VerifyTurnstileArgs = {
  expectedAction: string
  expectedHostname: string
  remoteIP?: string
  secret: string
  token: string
}

export const verifyTurnstile = async ({
  expectedAction,
  expectedHostname,
  remoteIP,
  secret,
  token,
}: VerifyTurnstileArgs): Promise<boolean> => {
  if (!token || token.length > 2_048) return false

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
    return (
      result.success === true &&
      result.action === expectedAction &&
      result.hostname === expectedHostname
    )
  } catch {
    return false
  }
}
