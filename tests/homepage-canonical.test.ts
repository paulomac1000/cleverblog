import { describe, expect, it } from 'vitest'

import { parsePageParam } from '@/lib/pagination'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'
import { homeUrl } from '@/i18n/urls'

describe('homePagination (?page= search param coercion)', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['1', 1],
    ['2', 2],
    ['10', 10],
    ['abc', 1],
    ['0', 1],
    ['-3', 1],
    ['2.5', 1],
    ['NaN', 1],
    ['999999999999999999999', 1],
    [['7', '8'], 7],
    [['abc'], 1],
  ] as Array<[string | string[] | undefined, number]>)(
    'parses %j as %i',
    (input, expected) => {
      expect(parsePageParam(input)).toBe(expected)
    },
  )
})

describe('homeUrl pagination variants', () => {
  it.each([
    ['pl', undefined, '/'],
    ['pl', 1, '/'],
    ['pl', 2, '/?page=2'],
    ['en', undefined, '/en'],
    ['en', 1, '/en'],
    ['en', 3, '/en?page=3'],
  ] as Array<['pl' | 'en', number | undefined, string]>)(
    'homeUrl(%s, %j) -> %s',
    (locale, page, expected) => {
      expect(homeUrl(locale, page)).toBe(expected)
    },
  )
})

describe('homepage pagination canonical metadata', () => {
  const serverURL = 'http://localhost:3000'

  it('page 2 emits self-canonical and matching EN hreflang', () => {
    const page = parsePageParam('2')
    const meta = buildLocalizedMetadata({
      locale: 'pl',
      canonicalPath: homeUrl('pl', page),
      title: 'CleverBlog',
      counterpartUrl: `${serverURL}${homeUrl('en', page)}`,
    })

    expect(meta.alternates?.canonical).toBe('http://localhost:3000/?page=2')
    expect(meta.alternates?.languages).toEqual({
      pl: 'http://localhost:3000/?page=2',
      en: 'http://localhost:3000/en?page=2',
      'x-default': 'http://localhost:3000/?page=2',
    })
  })

  it('EN page 2 emits self-canonical and PL hreflang with x-default to PL', () => {
    const page = parsePageParam('2')
    const meta = buildLocalizedMetadata({
      locale: 'en',
      canonicalPath: homeUrl('en', page),
      title: 'CleverBlog',
      counterpartUrl: `${serverURL}${homeUrl('pl', page)}`,
    })

    expect(meta.alternates?.canonical).toBe('http://localhost:3000/en?page=2')
    expect(meta.alternates?.languages).toEqual({
      en: 'http://localhost:3000/en?page=2',
      pl: 'http://localhost:3000/?page=2',
      'x-default': 'http://localhost:3000/?page=2',
    })
  })

  it('page 1 emits the bare canonical with no ?page=1 leak', () => {
    const page = parsePageParam('1')
    const meta = buildLocalizedMetadata({
      locale: 'pl',
      canonicalPath: homeUrl('pl', page),
      title: 'CleverBlog',
      counterpartUrl: `${serverURL}${homeUrl('en', page)}`,
    })

    expect(meta.alternates?.canonical).toBe('http://localhost:3000/')
    expect(meta.alternates?.languages).toEqual({
      pl: 'http://localhost:3000/',
      en: 'http://localhost:3000/en',
      'x-default': 'http://localhost:3000/',
    })
  })

  it('invalid page params coerce to the bare homepage canonical', () => {
    const page = parsePageParam('0')
    const meta = buildLocalizedMetadata({
      locale: 'pl',
      canonicalPath: homeUrl('pl', page),
      title: 'CleverBlog',
      counterpartUrl: `${serverURL}${homeUrl('en', page)}`,
    })

    expect(meta.alternates?.canonical).toBe('http://localhost:3000/')
  })
})
