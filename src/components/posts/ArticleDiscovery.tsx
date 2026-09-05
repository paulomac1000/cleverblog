'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Locale } from '@/i18n/config'
import {
  matchesSearchQuery,
  tokenizeSearchQuery,
} from '@/lib/search/match'

type PopularTag = {
  name: string
  slug: string
  count: number
}

type DiscoveryStrings = {
  searchLabel: string
  searchPlaceholder: string
  popularTagsLabel: string
  resultsTemplate: string
  emptyTemplate: string
}

type Props = {
  children: ReactNode
  initialQuery: string
  locale: Locale
  popularTags: PopularTag[]
  strings: DiscoveryStrings
  totalCount: number
}

const formatTemplate = (
  template: string,
  values: Record<string, string | number>,
): string =>
  Object.entries(values).reduce(
    (message, [key, value]) =>
      message.split(`{${key}}`).join(String(value)),
    template,
  )

const isTagActive = (query: string, tagName: string): boolean => {
  const queryTokens = tokenizeSearchQuery(query)
  const tagTokens = tokenizeSearchQuery(tagName)

  return (
    tagTokens.length > 0 &&
    tagTokens.every((token) => queryTokens.includes(token))
  )
}

export function ArticleDiscovery({
  children,
  initialQuery,
  locale,
  popularTags,
  strings,
  totalCount,
}: Props) {
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return initialQuery
    return new URLSearchParams(window.location.search).get('q') ?? ''
  })
  const resultsRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLParagraphElement>(null)
  const emptyRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const results = resultsRef.current
    if (!results) return

    const cards = results.querySelectorAll<HTMLElement>('.card')
    let visibleCount = 0

    for (const card of cards) {
      const matches = matchesSearchQuery(
        {
          title: card.dataset.title ?? '',
          excerpt: card.dataset.excerpt ?? '',
          categoryNames: [card.dataset.categoryNames ?? ''],
          tagNames: [card.dataset.tagNames ?? ''],
        },
        query,
      )

      card.hidden = !matches
      if (matches) visibleCount += 1
    }

    if (countRef.current) {
      countRef.current.textContent = formatTemplate(strings.resultsTemplate, {
        visible: visibleCount,
        total: totalCount,
      })
    }

    const trimmedQuery = query.trim()
    if (emptyRef.current) {
      const showEmpty = trimmedQuery.length > 0 && visibleCount === 0
      emptyRef.current.hidden = !showEmpty
      emptyRef.current.textContent = showEmpty
        ? formatTemplate(strings.emptyTemplate, { query: trimmedQuery })
        : ''
    }

    const url = new URL(window.location.href)
    if (trimmedQuery) {
      url.searchParams.set('q', trimmedQuery)
    } else {
      url.searchParams.delete('q')
    }
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }, [query, strings.emptyTemplate, strings.resultsTemplate, totalCount])

  const toggleTag = (tagName: string) => {
    setQuery((currentQuery) => {
      const rawTokens = currentQuery.trim().split(/\s+/).filter(Boolean)
      const tagTokens = new Set(tokenizeSearchQuery(tagName))

      if (isTagActive(currentQuery, tagName)) {
        return rawTokens
          .filter((token) => {
            const normalized = tokenizeSearchQuery(token)[0]
            return !normalized || !tagTokens.has(normalized)
          })
          .join(' ')
      }

      return [currentQuery.trim(), tagName].filter(Boolean).join(' ')
    })
  }

  const inputId = `article-discovery-${locale}`

  return (
    <div className="discovery">
      <div className="discovery-search-row">
        <label className="discovery-search-label" htmlFor={inputId}>
          {strings.searchLabel}
        </label>
        <input
          className="discovery-search-input"
          id={inputId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={strings.searchPlaceholder}
          type="search"
          value={query}
        />
      </div>

      {popularTags.length > 0 ? (
        <div className="discovery-tags">
          <span className="discovery-tags-label">
            {strings.popularTagsLabel}
          </span>
          {popularTags.map((tag) => (
            <button
              aria-pressed={isTagActive(query, tag.name)}
              className="discovery-tag"
              key={tag.slug}
              onClick={() => toggleTag(tag.name)}
              type="button"
            >
              {tag.name} <span aria-hidden="true">({tag.count})</span>
            </button>
          ))}
        </div>
      ) : null}

      <p
        aria-atomic="true"
        aria-live="polite"
        className="discovery-count"
        ref={countRef}
      >
        {formatTemplate(strings.resultsTemplate, {
          visible: totalCount,
          total: totalCount,
        })}
      </p>

      <div className="discovery-results" ref={resultsRef}>
        {children}
      </div>
      <p className="discovery-empty" hidden ref={emptyRef} />
    </div>
  )
}
