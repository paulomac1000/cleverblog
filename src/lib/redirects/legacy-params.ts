// Legacy WordPress query-parameter cleanup. WordPress paginated archives with
// `?paged=N`; this app never reads that parameter, so such URLs render page 1
// with a bare canonical and Google keeps them in the "Duplicate, user did not
// declare a canonical page" bucket (observed on /?paged=2 and /?paged=3,
// crawl dates 2026-09-01/03). The middleware 301-redirects them to the same
// path without the parameter.

export const stripLegacyPagedParams = (
  searchParams: URLSearchParams,
): string | null => {
  if (!searchParams.has('paged')) return null

  const cleaned = new URLSearchParams(searchParams)
  cleaned.delete('paged')
  const query = cleaned.toString()
  return query ? `?${query}` : ''
}
