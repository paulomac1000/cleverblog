import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
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

const locale: Locale = 'pl'

export default function FrontendLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="pl">
      <body>
        <header className="site-header">
          <Link href={homeUrl(locale)} className="brand">
            CleverBlog
          </Link>
          <span className="tagline">{t(locale, 'site.tagline')}</span>
          <LanguageSwitcher
            counterpartUrl={homeUrl('en')}
            currentPath={homeUrl(locale)}
            locale={locale}
          />
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
