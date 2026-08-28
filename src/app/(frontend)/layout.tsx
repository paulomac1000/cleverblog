import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'),
  title: { default: 'CleverBlog', template: '%s | CleverBlog' },
  description: 'Practical engineering notes, verified on real systems.',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <header className="site-header">
          <a href="/" className="brand">CleverBlog</a>
          <span className="tagline">engineering notes, not content filler</span>
        </header>
        <main>{children}</main>
        <footer>cleverblog.pl</footer>
      </body>
    </html>
  )
}
