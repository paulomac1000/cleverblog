'use client'

import { StatusChip } from './StatusChip'
import { APPROVAL_TOOLTIP } from '@/lib/auth/commentModeration'
import type { CommentRowModel } from './types'

type Props = {
  comment: CommentRowModel
  postTitle: string | null
  canApprove: boolean
  busy: boolean
  selected: boolean
  onToggle: (id: number, checked: boolean) => void
  onStatus: (id: number, status: 'approved' | 'spam') => void
}

const stripToPlainText = (value: unknown, max = 260): string => {
  if (typeof value !== 'string') return ''
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export const CommentRow = ({
  comment,
  postTitle,
  canApprove,
  busy,
  selected,
  onToggle,
  onStatus,
}: Props) => {
  const preview = stripToPlainText(comment.content)
  const isReply = comment.parent != null
  const spamScore =
    typeof comment.moderation?.spamScore === 'number' ? comment.moderation.spamScore : null
  const created = comment.createdAt ? new Date(comment.createdAt).toLocaleString('pl-PL') : ''

  return (
    <div className="cb-row">
      <input
        type="checkbox"
        aria-label={`Zaznacz komentarz autora ${comment.authorName}`}
        checked={selected}
        disabled={busy}
        onChange={(event) => onToggle(comment.id, event.target.checked)}
      />

      <div>
        <strong>{comment.authorName}</strong>
        <div className="cb-row__meta">
          {postTitle ? `→ ${postTitle}` : null}
          {postTitle ? ' · ' : null}
          {isReply ? '↩ Odpowiedź · ' : null}
          {created}
          {spamScore !== null ? ` · spam: ${spamScore}` : ''}
        </div>
        <StatusChip status={comment.status} />
      </div>

      <p className="cb-row__preview">{preview}</p>

      <div className="cb-row__actions">
        <button
          type="button"
          className="cb-btn cb-btn--primary"
          disabled={!canApprove || busy || comment.status === 'approved'}
          title={canApprove ? undefined : APPROVAL_TOOLTIP}
          onClick={() => onStatus(comment.id, 'approved')}
        >
          ✓ Zatwierdź
        </button>
        <button
          type="button"
          className="cb-btn cb-btn--danger"
          disabled={busy || comment.status === 'spam'}
          onClick={() => onStatus(comment.id, 'spam')}
        >
          ✕ Spam
        </button>
      </div>
    </div>
  )
}

export default CommentRow
