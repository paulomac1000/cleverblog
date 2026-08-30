import { NextResponse, type NextRequest } from 'next/server'

const CACHE_TTL_MS = 60_000

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
  const explicit = process.env.REDIRECTS_API_URL
  if (explicit) {
    return new URL(`${explicit.replace(/\/+$/, '')}/`, request.url)
  }

  const payloadBase = process.env.PAYLOAD_API_URL
  if (payloadBase) {
    const trimmed = payloadBase.replace(/\/+$/, '')
    const withApi = /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`
    return new URL(`${withApi}/`, request.url)
  }

  return new URL('http://127.0.0.1:3000/api/')
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

  const endpoint = new URL('redirects', apiBaseForRequest(request))
  endpoint.searchParams.set('where[from][equals]', sourceURL)
  endpoint.searchParams.set('depth', '1')
  endpoint.searchParams.set('limit', '1')

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const body = (await response.json()) as RedirectResponse
    const redirect = body.docs?.[0] ? resolveTarget(body.docs[0]) : null

    redirectCache.set(sourceURL, {
      expiresAt: now + CACHE_TTL_MS,
      redirect,
    })

    return redirect
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const sourceURL = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const redirect = await lookupRedirect(request, sourceURL)

  if (!redirect) {
    return NextResponse.next()
  }

  return Response.redirect(new URL(redirect.target, request.url), redirect.status)
}

export const config = {
  matcher: ['/((?!api(?:/|$)|_next(?:/|$)|media(?:/|$)|admin(?:/|$)|.*\\..*).*)'],
}
