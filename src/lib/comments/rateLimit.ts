import { createHmac } from 'node:crypto'

const WINDOW_MS = 10 * 60 * 1_000
const MAX_ATTEMPTS = 5
const MAX_BUCKETS = 2_048

type RateLimitBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitBucket>()

const hashClient = (client: string, secret: string): string =>
  createHmac('sha256', secret).update(`rate:${client}`).digest('base64url')

const makeRoom = (now: number): number | null => {
  if (buckets.size < MAX_BUCKETS) return null

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  if (buckets.size < MAX_BUCKETS) return null

  let earliestResetAt = Number.POSITIVE_INFINITY
  for (const bucket of buckets.values()) {
    earliestResetAt = Math.min(earliestResetAt, bucket.resetAt)
  }

  return Math.max(1, Math.ceil((earliestResetAt - now) / 1_000))
}

export const consumeCommentRateLimit = (
  client: string,
  secret: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } => {
  const key = hashClient(client, secret)
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    const retryAfterSeconds = makeRoom(now)
    if (retryAfterSeconds !== null) {
      return { allowed: false, retryAfterSeconds }
    }

    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (current.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    }
  }

  current.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}
