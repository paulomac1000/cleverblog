import type { ReactNode } from 'react'

import { HtmlLangSync } from '@/components/HtmlLangSync'
import type { Locale } from '@/i18n/config'

/**
 * /en tree layout.
 *
 * The root `(frontend)/layout.tsx` renders `<html lang="pl">` because that is
 * the only `<html>` element allowed in the Next App Router tree. The
 * `HtmlLangSync` client component below flips `document.documentElement.lang`
 * to "en" at hydration time so screen readers and client-side tooling see
 * the correct language on /en pages. See HtmlLangSync for the SEO rationale
 * (hreflang + content signal dominate; this attribute is a weak hint).
 */
const locale: Locale = 'en'

export default function EnLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HtmlLangSync locale={locale} />
      {children}
    </>
  )
}