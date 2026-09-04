'use client'

import { useLocale } from '@payloadcms/ui'

/**
 * Shows which locale the admin list is currently browsing. Every row renders
 * the same value (the active admin locale) — this is a visibility cue for the
 * multilingual cutover, not a per-document completeness indicator.
 */
export const LocaleCell = () => {
  const locale = useLocale()
  const code = typeof locale === 'string' ? locale : (locale?.code ?? 'pl')
  const label = code.toLowerCase() === 'en' ? 'EN' : 'PL'

  return <span className="cb-chip cb-chip--locale">{label}</span>
}

export default LocaleCell
