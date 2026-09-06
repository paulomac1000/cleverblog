'use server'

import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { getCommentConfig } from '@/lib/comments/config'
import { verifyFormToken } from '@/lib/comments/formToken'
import {
  consumeCommentRateLimit,
  consumeGlobalCommentAdmission,
} from '@/lib/comments/rateLimit'
import { scoreCommentSpam } from '@/lib/comments/spamScore'
import { verifyTurnstile } from '@/lib/comments/verifyTurnstile'

export type CommentFormState = {
  message: string
  status: 'idle' | 'error' | 'success'
}

const MESSAGE_KEYS = {
  success: { pl: 'Dziękujemy. Komentarz został przyjęty do moderacji.', en: 'Thanks! Your comment has been received and queued for moderation.' },
} as const

const successState = (locale: 'pl' | 'en'): CommentFormState => ({
  message: MESSAGE_KEYS.success[locale],
  status: 'success',
})

const errorState = (message: string): CommentFormState => ({
  message,
  status: 'error',
})

const getString = (formData: FormData, key: string): string => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

const normalizeForHash = (value: string): string =>
  value.trim().replace(/\s+/g, ' ')

const createSubmissionHash = (
  authorName: string,
  authorEmail: string,
  content: string,
  secret: string,
): string =>
  createHmac('sha256', secret)
    .update(
      `submission:${[
        authorName.trim().toLowerCase(),
        authorEmail.trim().toLowerCase(),
        normalizeForHash(content),
      ].join('\u0000')}`,
    )
    .digest('base64url')

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const isValidClientIP = (value: string): boolean => isIP(value) !== 0

const serverURL = (
  process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '')

export async function submitComment(
  _previousState: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const submittedLocaleRaw = getString(formData, 'submittedLocale')
  const locale: 'pl' | 'en' = submittedLocaleRaw === 'en' ? 'en' : 'pl'
  const commentConfig = getCommentConfig()
  if (!commentConfig) {
    return errorState(
      locale === 'en'
        ? 'Comment submission is currently disabled.'
        : 'Dodawanie komentarzy jest obecnie wyłączone.',
    )
  }

  if (getString(formData, 'fax_number').trim()) {
    return successState(locale)
  }

  const postId = Number(getString(formData, 'postId'))
  const formToken = getString(formData, 'formToken')

  if (
    !Number.isSafeInteger(postId) ||
    postId <= 0 ||
    !verifyFormToken(formToken, postId, commentConfig.securitySecret)
  ) {
    return errorState(
      locale === 'en'
        ? 'The form is invalid or was submitted too quickly. Refresh the page and try again.'
        : 'Formularz jest nieprawidłowy lub został wysłany zbyt szybko. Odśwież stronę i spróbuj ponownie.',
    )
  }

  // Trusted-proxy model: only the ingress (deploy/nginx-ingress.conf) sets this
  // header, computed from the real TCP peer + CF-Connecting-IP. Direct origin
  // hits get their actual peer IP, so a spoofed CF-Connecting-IP can no longer
  // poison the rate-limit key.
  const requestHeaders = await headers()
  const headerIP = requestHeaders.get('x-verified-client-ip')?.trim() ?? ''
  const rawClientIP = isValidClientIP(headerIP) ? headerIP : 'unknown'

  const rateLimit = consumeCommentRateLimit(rawClientIP, commentConfig.securitySecret)

  if (!rateLimit.allowed) {
    return errorState(locale === 'en' ? 'Too many attempts. Try again in a few minutes.' : 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.')
  }

  const turnstileToken = getString(formData, 'cf-turnstile-response')
  const turnstileValid = await verifyTurnstile({
    expectedAction: 'comment-submit',
    expectedHostname: new URL(serverURL).hostname,
    remoteIP: rawClientIP === 'unknown' ? undefined : rawClientIP,
    secret: commentConfig.turnstileSecretKey,
    token: turnstileToken,
  })

  if (!turnstileValid) {
    return errorState(locale === 'en' ? 'Anti-spam verification failed. Please try again.' : 'Weryfikacja antyspamowa nie powiodła się. Spróbuj ponownie.')
  }

  // IP-independent guard must stay after successful Turnstile verification.
  // Invalid Turnstile attempts must not consume the shared global quota: an
  // unauthenticated flood of 10 junk requests could otherwise deny legitimate
  // commenters (documented DoS in the PR #18 review).
  const globalAdmission = consumeGlobalCommentAdmission(commentConfig.securitySecret)
  if (!globalAdmission.allowed) {
    return errorState(locale === 'en' ? 'Too many attempts. Try again in a few minutes.' : 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.')
  }

  const payload = await getPayload({ config })
  const postResult = await payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        { id: { equals: postId } },
        { _status: { equals: 'published' } },
        { commentsEnabled: { equals: true } },
      ],
    },
  })

  const post = postResult.docs[0]
  if (!post) {
    return errorState(locale === 'en' ? 'Comments are disabled for this article.' : 'Komentarze są wyłączone dla tego artykułu.')
  }

  const authorName = getString(formData, 'authorName').trim()
  const authorEmail = getString(formData, 'authorEmail').trim().toLowerCase()
  const content = getString(formData, 'content').replace(/\r\n/g, '\n').trim()

  if (authorName.length < 2 || authorName.length > 80) {
    return errorState(locale === 'en' ? 'Name must be between 2 and 80 characters.' : 'Imię lub pseudonim musi mieć od 2 do 80 znaków.')
  }

  if (authorEmail.length > 254 || (authorEmail && !isValidEmail(authorEmail))) {
    return errorState(locale === 'en' ? 'Enter a valid e-mail address or leave the field empty.' : 'Podaj poprawny adres e-mail albo pozostaw to pole puste.')
  }

  if (content.length < 2 || content.length > 5_000) {
    return errorState(locale === 'en' ? 'The comment must be between 2 and 5000 characters.' : 'Komentarz musi mieć od 2 do 5000 znaków.')
  }

  const submissionHash = createSubmissionHash(
    authorName,
    authorEmail,
    content,
    commentConfig.securitySecret,
  )

  const duplicate = await payload.find({
    collection: 'comments',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        { post: { equals: post.id } },
        { submissionHash: { equals: submissionHash } },
      ],
    },
  })

  if (duplicate.docs.length > 0) {
    return successState(locale)
  }

  const spam = scoreCommentSpam({ authorName, content })

  try {
    await payload.create({
      collection: 'comments',
      data: {
        authorName,
        ...(authorEmail ? { authorEmail } : {}),
        content,
        moderation: {
          reason: spam.reason ?? undefined,
          spamScore: spam.score,
        },
        post: post.id,
        status: spam.score >= 80 ? 'spam' : 'pending',
        submittedLocale: locale,
        submissionHash,
      },
      overrideAccess: true,
    })
  } catch (error) {
    console.error('comment submission failed', error)
    const concurrentDuplicate = await payload.find({
      collection: 'comments',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { post: { equals: post.id } },
          { submissionHash: { equals: submissionHash } },
        ],
      },
    })

    if (concurrentDuplicate.docs.length > 0) {
      return successState(locale)
    }

    return errorState(locale === 'en' ? 'Failed to save the comment. Please try again.' : 'Nie udało się zapisać komentarza. Spróbuj ponownie.')
  }

  return successState(locale)
}
