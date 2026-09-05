const STATUS_CLASS: Record<string, string> = {
  pending: 'cb-chip cb-chip--pending',
  approved: 'cb-chip cb-chip--approved',
  spam: 'cb-chip cb-chip--spam',
  hidden: 'cb-chip cb-chip--hidden',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Oczekujący',
  approved: 'Zatwierdzony',
  spam: 'Spam',
  hidden: 'Ukryty',
}

export const StatusChip = ({ status }: { status: string | null | undefined }) => {
  const key = status ?? 'pending'
  return <span className={STATUS_CLASS[key] ?? 'cb-chip'}>{STATUS_LABEL[key] ?? key}</span>
}
