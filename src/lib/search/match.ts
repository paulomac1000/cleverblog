export type ArticleSearchMetadata = {
  title: string
  excerpt?: string | null
  categoryNames?: string[]
  tagNames?: string[]
}

export const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')

export const tokenizeSearchQuery = (query: string): string[] =>
  normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)

export const matchesSearchQuery = (
  article: ArticleSearchMetadata,
  query: string,
): boolean => {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true

  const haystack = normalizeSearchText(
    [
      article.title,
      article.excerpt ?? '',
      ...(article.categoryNames ?? []),
      ...(article.tagNames ?? []),
    ].join(' '),
  )

  return tokens.every((token) => haystack.includes(token))
}
