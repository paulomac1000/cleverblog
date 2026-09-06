// Pure redirect-target resolution for the Payload "redirects" collection.
// Kept outside src/proxy.ts (a special Next.js file) so it stays unit-testable
// and the special file's export surface stays limited to proxy + config.

export type ResolvedRedirect = {
  target: string
  status: 301 | 302
}

export type RedirectReference = {
  relationTo?: unknown
  value?: unknown
}

export type RedirectDocument = {
  from?: unknown
  type?: unknown
  to?: {
    type?: unknown
    reference?: RedirectReference | null
  } | null
}

export const resolveTarget = (
  doc: RedirectDocument,
): ResolvedRedirect | null => {
  if (doc.to?.type !== 'reference') return null

  const reference = doc.to.reference
  if (!reference) return null

  const relationTo = reference.relationTo
  if (
    relationTo !== 'posts' &&
    relationTo !== 'pages' &&
    relationTo !== 'categories' &&
    relationTo !== 'tags'
  ) {
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

  const target =
    relationTo === 'posts'
      ? `/articles/${slug}`
      : relationTo === 'pages'
        ? `/${slug}`
        : relationTo === 'categories'
          ? `/category/${slug}`
          : `/tags/${slug}`

  return { target, status }
}
