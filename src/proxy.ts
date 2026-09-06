import { NextResponse, type NextRequest } from 'next/server'

import { parsePreferredLocale } from '@/i18n/config'
import {
  type RedirectDocument,
  type ResolvedRedirect,
  resolveTarget,
} from '@/lib/redirects/resolve-target'

const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 500
const LOOKUP_TIMEOUT_MS = 2_000

type CacheEntry = {
  expiresAt: number
  redirect: ResolvedRedirect | null
}

type RedirectResponse = {
  docs?: RedirectDocument[]
}

const redirectCache = new Map<string, CacheEntry>()

const apiBaseForRequest = (request: NextRequest): URL => {
  const configuredOrigin = process.env.REDIRECTS_API_ORIGIN?.trim()

  if (!configuredOrigin) {
    return new URL('/api/', request.url)
  }

  const origin = new URL(configuredOrigin)

  if (origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('REDIRECTS_API_ORIGIN must be an origin without a path, query, or fragment')
  }

  return new URL('/api/', origin)
}

const cacheResult = (sourceURL: string, redirect: ResolvedRedirect | null): void => {
  if (redirectCache.has(sourceURL)) {
    redirectCache.delete(sourceURL)
  }

  while (redirectCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = redirectCache.keys().next().value

    if (oldestKey === undefined) {
      break
    }

    redirectCache.delete(oldestKey)
  }

  redirectCache.set(sourceURL, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    redirect,
  })
}

const lookupRedirect = async (
  request: NextRequest,
  sourceURL: string,
): Promise<ResolvedRedirect | null> => {
  const cached = redirectCache.get(sourceURL)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.redirect
  }

  if (cached) {
    redirectCache.delete(sourceURL)
  }

  try {
    const endpoint = new URL('redirects', apiBaseForRequest(request))
    endpoint.searchParams.set('where[from][equals]', sourceURL)
    endpoint.searchParams.set('depth', '1')
    endpoint.searchParams.set('limit', '1')

    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })

    if (!response.ok) {
      return null
    }

    const body = (await response.json()) as RedirectResponse
    const redirect = body.docs?.[0] ? resolveTarget(body.docs[0]) : null

    cacheResult(sourceURL, redirect)

    return redirect
  } catch {
    return null
  }
}

export default async function proxy(request: NextRequest) {
  const sourceURL = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const redirect = await lookupRedirect(request, sourceURL)

  if (redirect) {
    return NextResponse.redirect(new URL(redirect.target, request.url), redirect.status)
  }

  // Legacy WordPress permalinks (?p=ID) resolve through the redirects table
  // above; language detection must never intercept them.
  if (request.nextUrl.searchParams.has('p')) {
    return NextResponse.next()
  }

  // Explicit English routes are never redirected anywhere.
  const { pathname } = request.nextUrl
  const isEn = pathname === '/en' || pathname.startsWith('/en/')

  // Server-side locale signal consumed by the root layout for <html lang>:
  // layouts cannot see the pathname, so the proxy annotates the request.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-cb-locale', isEn ? 'en' : 'pl')
  requestHeaders.set('x-cb-path', pathname)

  if (isEn) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Language detection is intentionally limited to the homepage: unprefixed
  // URLs are permanently Polish, so deep links are never auto-redirected.
  // Google advises against automatic redirection based on language, and
  // Googlebot sends no Accept-Language header at all, so crawlers always
  // receive the Polish canonical pages directly.
  if (pathname !== '/') {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // An explicit visitor choice wins over Accept-Language in BOTH directions:
  // PL_LOCALE=pl keeps the visitor on Polish, PL_LOCALE=en routes to /en.
  const cookieLocale = request.cookies.get('PL_LOCALE')?.value

  if (cookieLocale === 'en') {
    const response = NextResponse.redirect(new URL('/en', request.url), 302)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }

  if (cookieLocale === 'pl') {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  if (parsePreferredLocale(request.headers.get('accept-language')) === 'en') {
    const response = NextResponse.redirect(new URL('/en', request.url), 302)
    response.cookies.set('PL_LOCALE', 'en', {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/((?!api(?:/|$)|_next(?:/|$)|admin(?:/|$)|media(?:/|$)|favicon\\.ico$|.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|txt|xml|json|woff|woff2)$).*)',
  ],
}
