import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'

import { homeUrl, pageUrl } from '@/i18n/urls'
import { t } from '@/i18n/messages'
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
  // Locale arrives via the x-cb-locale request header set in proxy.ts.
  const requestHeaders = await headers()
  const locale: Locale = requestHeaders.get('x-cb-locale') === 'en' ? 'en' : 'pl'

  return (
    <html lang={locale}>
      <body>
        <header className="site-header">
          <Link href={homeUrl(locale)} className="brand">
            CleverBlog
          </Link>
          <span className="tagline">{t(locale, 'site.tagline')}</span>
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
