import { createHmac } from 'node:crypto'

const WINDOW_MS = 10 * 60 * 1_000
const MAX_ATTEMPTS = 5
const MAX_BUCKETS = 2_048
const GLOBAL_ADMISSION_WINDOW_MS = 60 * 1_000
const GLOBAL_ADMISSION_MAX_ATTEMPTS = 10
const GLOBAL_ADMISSION_CLIENT = 'global-comment-admission'

type RateLimitBucket = {
  count: number
  resetAt: number
}

type GlobalAdmissionBucket = {
  key: string
  bucket: RateLimitBucket
}

const buckets = new Map<string, RateLimitBucket>()
let globalAdmission: GlobalAdmissionBucket | null = null

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
  if (oldestKey !== undefined) {
    buckets.delete(oldestKey)
  }
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

export const consumeGlobalCommentAdmission = (
  secret: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } => {
  const key = hashClient(GLOBAL_ADMISSION_CLIENT, secret)
  const current = globalAdmission?.key === key ? globalAdmission.bucket : null

  if (!current || current.resetAt <= now) {
    globalAdmission = {
      key,
      bucket: {
        count: 1,
        resetAt: now + GLOBAL_ADMISSION_WINDOW_MS,
      },
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (current.count >= GLOBAL_ADMISSION_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    }
  }

  current.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}
