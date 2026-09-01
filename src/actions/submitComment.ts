'use server'

import { createHmac } from 'node:crypto'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { getCommentConfig } from '@/lib/comments/config'
import { verifyFormToken } from '@/lib/comments/formToken'
import { consumeCommentRateLimit } from '@/lib/comments/rateLimit'
import { scoreCommentSpam } from '@/lib/comments/spamScore'
import { verifyTurnstile } from '@/lib/comments/verifyTurnstile'

export type CommentFormState = {
  message: string
  status: 'idle' | 'error' | 'success'
}

const successState = (): CommentFormState => ({
  message: 'Dziękujemy. Komentarz został przyjęty do moderacji.',
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

const isValidClientIP = (value: string): boolean =>
  /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(':')

export async function submitComment(
  _previousState: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const commentConfig = getCommentConfig()
  if (!commentConfig) {
    return errorState('Dodawanie komentarzy jest obecnie wyłączone.')
  }

  if (getString(formData, 'fax_number').trim()) {
    return successState()
  }

  const postId = Number(getString(formData, 'postId'))
  const formToken = getString(formData, 'formToken')

  if (
    !Number.isSafeInteger(postId) ||
    postId <= 0 ||
    !verifyFormToken(formToken, postId, commentConfig.securitySecret)
  ) {
    return errorState(
      'Formularz jest nieprawidłowy lub został wysłany zbyt szybko. Odśwież stronę i spróbuj ponownie.',
    )
  }

  const requestHeaders = await headers()
  const headerIP = requestHeaders.get('cf-connecting-ip')?.trim() ?? ''
  const rawClientIP = isValidClientIP(headerIP) ? headerIP : 'unknown'
  const rateLimit = consumeCommentRateLimit(rawClientIP, commentConfig.securitySecret)

  if (!rateLimit.allowed) {
    return errorState('Zbyt wiele prób. Spróbuj ponownie za kilka minut.')
  }

  const turnstileToken = getString(formData, 'cf-turnstile-response')
  const turnstileValid = await verifyTurnstile({
    expectedAction: 'comment-submit',
    expectedHostname: requestHeaders.get('host') ?? 'cleverblog.pl',
    remoteIP: rawClientIP === 'unknown' ? undefined : rawClientIP,
    secret: commentConfig.turnstileSecretKey,
    token: turnstileToken,
  })

  if (!turnstileValid) {
    return errorState('Weryfikacja antyspamowa nie powiodła się. Spróbuj ponownie.')
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
    return errorState('Komentarze są wyłączone dla tego artykułu.')
  }

  const authorName = getString(formData, 'authorName').trim()
  const authorEmail = getString(formData, 'authorEmail').trim().toLowerCase()
  const content = getString(formData, 'content').replace(/\r\n/g, '\n').trim()

  if (authorName.length < 2 || authorName.length > 80) {
    return errorState('Imię lub pseudonim musi mieć od 2 do 80 znaków.')
  }

  if (authorEmail.length > 254 || (authorEmail && !isValidEmail(authorEmail))) {
    return errorState('Podaj poprawny adres e-mail albo pozostaw to pole puste.')
  }

  if (content.length < 2 || content.length > 5_000) {
    return errorState('Komentarz musi mieć od 2 do 5000 znaków.')
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
    return successState()
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
      return successState()
    }

    return errorState('Nie udało się zapisać komentarza. Spróbuj ponownie.')
  }

  return successState()
}
