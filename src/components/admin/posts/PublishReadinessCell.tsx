'use client'

import type { DefaultCellComponentProps } from 'payload'

import { derivePublishReadiness, READINESS_LABEL } from '@/lib/admin/publishReadiness'

type PostRowData = {
  verification?: { status?: string | null } | null
  review?: { status?: string | null } | null
  provenance?: { sourceVisibility?: string | null } | null
}

const CLASS_BY_STATE: Record<string, string> = {
  ready: 'cb-chip cb-chip--ready',
  'action-needed': 'cb-chip cb-chip--action-needed',
  blocked: 'cb-chip cb-chip--blocked',
}

export const PublishReadinessCell = (props: DefaultCellComponentProps) => {
  const rowData = (props.rowData ?? {}) as PostRowData

  const state = derivePublishReadiness({
    verificationStatus: rowData.verification?.status ?? null,
    reviewStatus: rowData.review?.status ?? null,
    sourceVisibility: rowData.provenance?.sourceVisibility ?? null,
  })

  const checkmark = (ok: boolean) => (ok ? '✓' : '✕')
  const vOk = rowData.verification?.status === 'verified'
  const rOk = rowData.review?.status === 'approved'
  const sOk = rowData.provenance?.sourceVisibility === 'public'

  return (
    <span
      className={CLASS_BY_STATE[state]}
      title={`Weryfikacja ${checkmark(vOk)} · Recenzja ${checkmark(rOk)} · Źródła ${checkmark(sOk)}`}
    >
      {READINESS_LABEL[state]}
    </span>
  )
}

export default PublishReadinessCell
