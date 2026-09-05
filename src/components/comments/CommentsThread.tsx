'use client'

import { useEffect, useRef, useState } from 'react'

import type { Locale } from '@/i18n/config'

export type ThreadComment = {
  id: number
  authorName: string
  authorUrl: string | null
  createdAt: string
  createdAtText: string
  replyToText: string | null
  content: string
  translated: string | null
}

export type ThreadRoot = {
  root: ThreadComment
  replies: ThreadComment[]
}

type Props = {
  locale: Locale
  postId: number
  tree: ThreadRoot[]
  strings: {
    empty: string
    machineTranslated: string
    showOriginal: string
    showTranslation: string
  }
}

type TranslationResponse = {
  translations?: Record<string, string>
}

export function CommentsThread({
  locale,
  postId,
  tree,
  strings,
}: Props) {
  const allComments = tree.flatMap((entry) => [entry.root, ...entry.replies])
  const [translations, setTranslations] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      allComments
        .filter((c) => c.translated)
        .map((c) => [c.id, c.translated as string]),
    ),
  )
  const [showOriginal, setShowOriginal] = useState<Record<number, boolean>>({})
  const requestedRef = useRef(false)

  const targetLocale = locale === 'en' ? 'en' : null
  const missing = targetLocale
    ? allComments.filter((c) => !(c.id in translations)).map((c) => c.id)
    : []

  useEffect(() => {
    if (requestedRef.current || missing.length === 0 || !targetLocale) return
    requestedRef.current = true
    let cancelled = false
    const run = async () => {
      try {
        const resp = await fetch('/comments-translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            postId,
            commentIds: missing,
            locale: targetLocale,
          }),
        })
        if (!resp.ok) return
        const body = (await resp.json()) as TranslationResponse
        if (!cancelled && body.translations) {
          setTranslations((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(body.translations ?? {}).map(([k, v]) => [
                Number(k),
                v,
              ]),
            ),
          }))
        }
      } catch {
        // Translation is decorative; originals remain visible.
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (tree.length === 0) {
    return <p className="muted">{strings.empty}</p>
  }

  const renderBody = (comment: ThreadComment) => {
    const translated = translations[comment.id]
    const showEnglish = Boolean(translated) && !showOriginal[comment.id]
    const text = showEnglish ? (translated as string) : comment.content
    return (
      <>
        <p
          style={{
            margin: '12px 0 0',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {text}
        </p>
        {translated ? (
          <button
            className="muted"
            onClick={() =>
              setShowOriginal((prev) => ({
                ...prev,
                [comment.id]: !prev[comment.id],
              }))
            }
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              marginTop: 8,
              padding: 0,
            }}
            type="button"
          >
            {strings.machineTranslated} ·{' '}
            {showEnglish ? strings.showOriginal : strings.showTranslation}
          </button>
        ) : null}
      </>
    )
  }

  const renderCard = (comment: ThreadComment, nested: boolean) => (
    <div
      key={comment.id}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: nested ? '3px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: nested ? '14px 16px' : 18,
      }}
    >
      <div
        style={{
          alignItems: 'baseline',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 12px',
        }}
      >
        <strong>
          {comment.authorUrl ? (
            <a href={comment.authorUrl} rel="ugc nofollow external">
              {comment.authorName}
            </a>
          ) : (
            comment.authorName
          )}
        </strong>
        <time className="muted" dateTime={comment.createdAt} style={{ fontSize: '0.85rem' }}>
          {comment.createdAtText}
        </time>
      </div>
      {comment.replyToText ? (
        <div className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
          {comment.replyToText}
        </div>
      ) : null}
      {renderBody(comment)}
    </div>
  )

  return (
    <ol style={{ display: 'grid', gap: 16, listStyle: 'none', margin: 0, padding: 0 }}>
      {tree.map(({ root, replies }) => (
        <li key={root.id}>
          {renderCard(root, false)}
          {replies.length > 0 ? (
            <ol style={{ display: 'grid', gap: 10, listStyle: 'none', margin: '12px 0 0 24px', padding: 0 }}>
              {replies.map((reply) => (
                <li key={reply.id}>{renderCard(reply, true)}</li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
