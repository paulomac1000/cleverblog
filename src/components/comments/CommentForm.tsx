'use client'

import type { TurnstileInstance } from '@marsidev/react-turnstile'
import { Turnstile } from '@marsidev/react-turnstile'
import type { CSSProperties } from 'react'
import { useActionState, useEffect, useRef } from 'react'

import { submitComment } from '@/actions/submitComment'
import type { CommentFormState } from '@/actions/submitComment'

type Props = {
  formToken: string
  postId: number
  siteKey: string
}

const initialState: CommentFormState = {
  message: '',
  status: 'idle',
}

const inputStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  font: 'inherit',
  padding: '10px 12px',
  width: '100%',
}

export function CommentForm({ formToken, postId, siteKey }: Props) {
  const [state, formAction, isPending] = useActionState(submitComment, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const turnstileRef = useRef<TurnstileInstance | null>(null)

  useEffect(() => {
    if (state.status === 'idle') return

    turnstileRef.current?.reset()

    if (state.status === 'success') {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <section
      aria-labelledby="comment-form-heading"
      style={{
        borderTop: '1px solid var(--border)',
        marginTop: 40,
        paddingTop: 32,
      }}
    >
      <h2 id="comment-form-heading">Dodaj komentarz</h2>
      <p className="muted">
        Komentarze są publikowane po moderacji. Adres e-mail nie będzie widoczny publicznie.
      </p>

      <form
        action={formAction}
        ref={formRef}
        style={{ display: 'grid', gap: 16, marginTop: 20 }}
      >
        <input defaultValue={postId} name="postId" type="hidden" />
        <input defaultValue={formToken} name="formToken" type="hidden" />

        <div
          aria-hidden="true"
          style={{
            height: 0,
            left: -10_000,
            overflow: 'hidden',
            position: 'absolute',
            width: 0,
          }}
        >
          <label>
            Faks
            <input autoComplete="off" name="fax_number" tabIndex={-1} type="text" />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Imię lub pseudonim</span>
          <input
            autoComplete="name"
            disabled={isPending}
            maxLength={80}
            minLength={2}
            name="authorName"
            required
            style={inputStyle}
            type="text"
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>E-mail (opcjonalnie)</span>
          <input
            autoComplete="email"
            disabled={isPending}
            maxLength={254}
            name="authorEmail"
            style={inputStyle}
            type="email"
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Komentarz</span>
          <textarea
            disabled={isPending}
            maxLength={5_000}
            minLength={2}
            name="content"
            required
            rows={7}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <Turnstile
          options={{
            action: 'comment-submit',
            appearance: 'interaction-only',
            language: 'pl',
            responseField: true,
            responseFieldName: 'cf-turnstile-response',
            size: 'flexible',
            theme: 'dark',
          }}
          ref={turnstileRef}
          siteKey={siteKey}
        />

        <button
          disabled={isPending}
          style={{
            background: 'var(--accent)',
            border: 0,
            borderRadius: 'var(--radius-sm)',
            color: '#0d1117',
            cursor: isPending ? 'wait' : 'pointer',
            font: 'inherit',
            fontWeight: 700,
            justifySelf: 'start',
            opacity: isPending ? 0.65 : 1,
            padding: '10px 18px',
          }}
          type="submit"
        >
          {isPending ? 'Wysyłanie…' : 'Wyślij komentarz'}
        </button>

        {state.message ? (
          <p
            aria-live="polite"
            role={state.status === 'error' ? 'alert' : 'status'}
            style={{
              margin: 0,
              color: state.status === 'error' ? '#ffb4ab' : 'var(--text-muted)',
            }}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  )
}
