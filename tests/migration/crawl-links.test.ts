import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildPathStyleReport,
  extractInternalReferences,
  normalizeInternalUrl,
  pathStyleReportsEquivalent,
} from '../../scripts/wordpress/crawl-links'

import type {
  PublicUrlSource,
} from '../../scripts/wordpress/build-public-url-source'

const publicSource:
  PublicUrlSource = {
    generatedAt:
      '2026-08-30T10:00:00.000Z',
    wordpressSource: {
      posts: 1,
      pages: 1,
      categories: 1,
      tags: 1,
    },
    expected: [
      {
        collection: 'posts',
        wordpressId: 202,
        fromURL: '/?p=202',
      },
      {
        collection: 'pages',
        wordpressId: 12,
        fromURL: '/?page_id=12',
      },
      {
        collection: 'categories',
        wordpressId: 6,
        fromURL: '/?cat=6',
      },
      {
        collection: 'tags',
        slug: 'linux',
        fromURL: '/?tag=linux',
      },
    ],
  }

const captures = {
  posts: [
    {
      ID: '202',
      post_status: 'publish',
      post_name:
        'wlasny-serwer-openvpn-na-linux',
      post_content:
        '<a href="https://cleverblog.pl/?p=202">query</a>' +
        '<a href="/kontakt/">page</a>' +
        '<a href="/legacy-old-path/">old</a>' +
        '<a href="https://example.com/outside">outside</a>',
    },
  ],
  pages: [
    {
      ID: 12,
      post_status: 'publish',
      post_name: 'kontakt',
      post_content:
        '<a href="/categories/mikr-us">category route</a>' +
        '<a href="/tags/linux/">tag route</a>',
    },
  ],
  categories: [
    {
      term_id: '6',
      slug: 'mikr-us',
    },
  ],
  tags: [
    {
      term_id: '9',
      slug: 'linux',
    },
  ],
}

describe('crawler/archive link inventory', () => {
  it('normalizes internal absolute, query and trailing-slash URLs', () => {
    expect(
      normalizeInternalUrl(
        'https://cleverblog.pl/foo/',
      ),
    ).toBe('/foo')

    expect(
      normalizeInternalUrl(
        '?p=202&amp;x=1',
      ),
    ).toBe('/?p=202&x=1')

    expect(
      normalizeInternalUrl(
        '//www.cleverblog.pl/kontakt/',
      ),
    ).toBe('/kontakt')

    expect(
      normalizeInternalUrl(
        'https://example.com/foo',
      ),
    ).toBeNull()
  })

  it('resolves relative hrefs against the document path, not the site root', () => {
    expect(
      normalizeInternalUrl(
        'image.png',
        '/articles/linux-chmod/',
      ),
    ).toBe(
      '/articles/linux-chmod/image.png',
    )

    expect(
      normalizeInternalUrl(
        'image.png',
        '/kontakt',
      ),
    ).toBe('/image.png')

    expect(
      normalizeInternalUrl(
        '../image.png',
        '/articles/linux-chmod/',
      ),
    ).toBe('/articles/image.png')

    expect(
      normalizeInternalUrl(
        'image.png',
      ),
    ).toBe('/image.png')
  })

  it('extracts internal href/src references and ignores external references', () => {
    const result =
      extractInternalReferences(
        '<a href="/kontakt">K</a>' +
          '<img src="/api/media/file/1-a.jpg">' +
          '<a href="https://example.com/x">X</a>',
      )

    expect(result).toEqual([
      {
        attribute: 'href',
        rawUrl: '/kontakt',
        normalizedUrl:
          '/kontakt',
      },
      {
        attribute: 'src',
        rawUrl:
          '/api/media/file/1-a.jpg',
        normalizedUrl:
          '/api/media/file/1-a.jpg',
      },
    ])
  })

  it('classifies redirect-covered, route-covered and uncovered legacy paths', () => {
    const report =
      buildPathStyleReport(
        captures,
        publicSource,
        '2026-08-30T11:00:00.000Z',
      )

    expect(
      report.legacyPaths.map(
        (entry) => ({
          url: entry.url,
          classification:
            entry.classification,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          url: '/?p=202',
          classification:
            'redirect',
        },
        {
          url: '/kontakt',
          classification:
            'route',
        },
        {
          url:
            '/categories/mikr-us',
          classification:
            'route',
        },
        {
          url: '/tags/linux',
          classification:
            'route',
        },
        {
          url:
            '/legacy-old-path',
          classification:
            'uncovered',
        },
      ]),
    )

    expect(report.uncovered).toEqual([
      '/legacy-old-path',
    ])
    expect(
      report.checks
        .internalHrefOccurrences,
    ).toBe(5)
  })

  it('treats the committed report as stale when source/classification changes', () => {
    const left =
      buildPathStyleReport(
        captures,
        publicSource,
        '2026-08-30T11:00:00.000Z',
      )

    const right =
      buildPathStyleReport(
        captures,
        publicSource,
        '2026-08-30T12:00:00.000Z',
      )

    expect(
      pathStyleReportsEquivalent(
        left,
        right,
      ),
    ).toBe(true)

    right.uncovered.push(
      '/manually-edited',
    )

    expect(
      pathStyleReportsEquivalent(
        left,
        right,
      ),
    ).toBe(false)
  })
})
