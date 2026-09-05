import { NextResponse, type NextRequest } from 'next/server'

import { resolveCounterpartUrl } from '@/lib/content/counterpart'
import { getArticleCounterpart, getPageCounterpart } from '@/lib/content'
import type { Locale } from '@/i18n/config'

const resolveLocale = (path: string): Locale =>
  path === '/en' || path.startsWith('/en/') ? 'en' : 'pl'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')
  if (!path || !path.startsWith('/') || path.includes('..') || path.length > 512) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }

  // The URL can only ever resolve to this site's own routes: the resolver
  // maps between /, /en, /articles/..., /<slug>, /category/... and /tags...
  // or returns null for documents without a counterpart.
  const locale = resolveLocale(path)

  let counterpartUrl: string | null = null
  try {
    counterpartUrl = await resolveCounterpartUrl(
      locale,
      path,
      getArticleCounterpart,
      getPageCounterpart,
    )
  } catch {
    counterpartUrl = null
  }

  return NextResponse.json(
    { url: counterpartUrl },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}
