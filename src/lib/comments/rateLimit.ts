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

const makeRoom = (now: number): void => {
  if (buckets.size < MAX_BUCKETS) return

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  if (buckets.size < MAX_BUCKETS) return

  const oldestKey = buckets.keys().next().value
  if (oldestKey) buckets.delete(oldestKey)
}

export const consumeCommentRateLimit = (
  client: string,
  secret: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } => {
  const key = hashClient(client, secret)
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    makeRoom(now)
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
