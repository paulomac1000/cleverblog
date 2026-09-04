import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'

import { articleUrl, homeUrl, pageUrl } from '@/i18n/urls'
import { t } from '@/i18n/messages'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { getArticleCounterpart, getPageCounterpart } from '@/lib/content'
import type { Locale } from '@/i18n/config'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000',
  ),
  title: { default: 'CleverBlog', template: '%s | CleverBlog' },
  description: 'Practical engineering notes, verified on real systems.',
}

export default async function FrontendLayout({
  children,
}: {
  children: ReactNode
}) {
  // Locale and path arrive via x-cb-locale / x-cb-path headers set in
  // proxy.ts (the root layout cannot read the pathname itself).
  const requestHeaders = await headers()
  const locale: Locale = requestHeaders.get('x-cb-locale') === 'en' ? 'en' : 'pl'
  const path = requestHeaders.get('x-cb-path') ?? '/'
  const stripped = locale === 'en' && path.startsWith('/en') ? path.slice(3) || '/' : path

  // Counterpart URL for the header pill. Listing routes always have a
  // counterpart; document routes resolve it per document (null => disabled).
  let counterpartUrl: string | null
  try {
    if (stripped.startsWith('/articles/')) {
      const slug = decodeURIComponent(stripped.slice('/articles/'.length))
      const counterpart = await getArticleCounterpart(locale, slug)
      counterpartUrl = counterpart.enExists
        ? articleUrl('en', counterpart.enSlug ?? slug)
        : null
    } else if (stripped !== '/' && !stripped.startsWith('/category/') && !stripped.startsWith('/tags/')) {
      const slug = decodeURIComponent(stripped.slice(1))
      const counterpart = await getPageCounterpart(locale, slug)
      counterpartUrl = counterpart.enExists
        ? pageUrl('en', counterpart.enSlug ?? slug)
        : null
    } else if (stripped === '/') {
      counterpartUrl = '/en'
    } else {
      counterpartUrl = `/en${stripped}`
    }
  } catch {
    counterpartUrl = null
  }

  return (
    <html lang={locale}>
      <body>
        <header className="site-header">
          <Link href={homeUrl(locale)} className="brand">
            CleverBlog
          </Link>
          <span className="tagline">{t(locale, 'site.tagline')}</span>
          <LanguageSwitcher counterpartUrl={counterpartUrl} locale={locale} />
        </header>
        <main>{children}</main>
        <footer>
          <div className="footer-nav">
            <Link href={homeUrl(locale)}>
              {t(locale, 'site.footer.articles')}
            </Link>
            <Link href={pageUrl(locale, 'o-nas')}>
              {t(locale, 'site.footer.about')}
            </Link>
            <Link href={pageUrl(locale, 'kontakt')}>
              {t(locale, 'site.footer.contact')}
            </Link>
          </div>
          <p className="footer-note">{t(locale, 'site.footer.note')}</p>
        </footer>
      </body>
    </html>
  )
}
