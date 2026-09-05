import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { headers } from 'next/headers'

import { resolveCounterpartUrl } from '@/lib/content/counterpart'
import { getArticleCounterpart, getPageCounterpart } from '@/lib/content'
import type { Locale } from '@/i18n/config'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')
  if (!path || !path.startsWith('/') || path.includes('..') || path.length > 512) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }

  // Trust the middleware-derived locale over client input: the header comes
  // from the proxy's own parsing of the same pathname.
  const requestHeaders = await headers()
  const locale: Locale = requestHeaders.get('x-cb-locale') === 'en' ? 'en' : 'pl'
  const headerPath = requestHeaders.get('x-cb-path') ?? '/'
  // Only resolve the path the middleware actually saw — this endpoint is a
  // helper for the current page, not an open redirect oracle.
  if (headerPath !== path) {
    return NextResponse.json({ error: 'path mismatch' }, { status: 400 })
  }

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
