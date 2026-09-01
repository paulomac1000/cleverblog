import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000',
  ),
  title: { default: 'CleverBlog', template: '%s | CleverBlog' },
  description: 'Practical engineering notes, verified on real systems.',
}

export default function FrontendLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="pl">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">CleverBlog</Link>
          <span className="tagline">
            engineering notes, not content filler
          </span>
        </header>
        <main>{children}</main>
        <footer>
          <div className="footer-nav">
            <Link href="/">Artykuły</Link>
            <Link href="/o-nas">O nas</Link>
            <Link href="/kontakt">Kontakt</Link>
          </div>
          <p className="footer-note">
            cleverblog.pl — praktyczne notatki z prawdziwej pracy
            inżynierskiej.
          </p>
        </footer>
      </body>
    </html>
  )
}
