'use client'

import { APPROVAL_TOOLTIP } from '@/lib/auth/commentModeration'

type Props = {
  count: number
  canApprove: boolean
  busy: boolean
  onApprove: () => void
  onSpam: () => void
}

export const ModerationBulkBar = ({ count, canApprove, busy, onApprove, onSpam }: Props) => {
  return (
    <div className="cb-bulkbar">
      <span className="cb-row__meta">Zaznaczone: {count}</span>
      <button
        type="button"
        className="cb-btn cb-btn--primary"
        disabled={!canApprove || busy}
        title={canApprove ? undefined : APPROVAL_TOOLTIP}
        onClick={onApprove}
      >
        Zatwierdź zaznaczone
      </button>
      <button
        type="button"
        className="cb-btn cb-btn--danger"
        disabled={busy}
        onClick={onSpam}
      >
        ✕ Oznacz jako spam
      </button>
    </div>
  )
}

export default ModerationBulkBar
