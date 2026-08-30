import { NextResponse, type NextRequest } from 'next/server'

const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 500
const LOOKUP_TIMEOUT_MS = 2_000

type ResolvedRedirect = {
  target: string
  status: 301 | 302
}

type CacheEntry = {
  expiresAt: number
  redirect: ResolvedRedirect | null
}

type RedirectReference = {
  relationTo?: unknown
  value?: unknown
}

type RedirectDocument = {
  from?: unknown
  type?: unknown
  to?: {
    type?: unknown
    reference?: RedirectReference | null
  } | null
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

const resolveTarget = (doc: RedirectDocument): ResolvedRedirect | null => {
  if (doc.to?.type !== 'reference') return null

  const reference = doc.to.reference
  if (!reference) return null

  if (reference.relationTo !== 'posts' && reference.relationTo !== 'pages') {
    return null
  }

  if (
    typeof reference.value !== 'object' ||
    reference.value === null ||
    !('slug' in reference.value)
  ) {
    return null
  }

  const slug = (reference.value as { slug?: unknown }).slug
  if (typeof slug !== 'string' || !slug) return null

  const status = doc.type === '302' ? 302 : doc.type === '301' ? 301 : null
  if (status === null) return null

  return {
    target: reference.relationTo === 'posts' ? `/articles/${slug}` : `/${slug}`,
    status,
  }
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

  if (!redirect) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL(redirect.target, request.url), redirect.status)
}

export const config = {
  matcher: [
    '/((?!api(?:/|$)|_next(?:/|$)|admin(?:/|$)|media(?:/|$)|favicon\\.ico$|.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|txt|xml|json|woff|woff2)$).*)',
  ],
}
