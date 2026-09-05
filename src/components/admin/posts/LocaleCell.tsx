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
  const isEn = code.toLowerCase() === 'en'

  return (
    <span className={isEn ? 'cb-chip cb-chip--locale cb-chip--locale-en' : 'cb-chip cb-chip--locale'}>
      {isEn ? 'EN' : 'PL'}
    </span>
  )
}

export default LocaleCell
