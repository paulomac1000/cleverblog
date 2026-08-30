import { describe, expect, it } from 'vitest'

import { buildRedirectSpecs } from '../../scripts/wordpress/map-redirects'

describe('WordPress redirect mapping', () => {
  it('maps post, page, category and tag query URLs to Payload relationships', () => {
    const result = buildRedirectSpecs([
      {
        wordpressId: 41,
        slug: 'example-post',
        collection: 'posts',
        payloadId: 101,
      },
      {
        wordpressId: 7,
        slug: 'kontakt',
        collection: 'pages',
        payloadId: 202,
      },
      {
        wordpressId: 3,
        slug: 'news',
        collection: 'categories',
        payloadId: 303,
      },
      {
        wordpressId: 9,
        slug: 'payload',
        collection: 'tags',
        payloadId: 404,
      },
    ])

    expect(result).toEqual([
      {
        fromURL: '/?cat=3',
        toURL: {
          relationTo: 'categories',
          value: 303,
        },
        type: '301',
      },
      {
        fromURL: '/?p=41',
        toURL: {
          relationTo: 'posts',
          value: 101,
        },
        type: '301',
      },
      {
        fromURL: '/?page_id=7',
        toURL: {
          relationTo: 'pages',
          value: 202,
        },
        type: '301',
      },
      {
        fromURL: '/?tag=payload',
        toURL: {
          relationTo: 'tags',
          value: 404,
        },
        type: '301',
      },
    ])
  })

  it('deduplicates identical category and tag redirect sources', () => {
    const result = buildRedirectSpecs([
      {
        wordpressId: 3,
        slug: 'news',
        collection: 'categories',
        payloadId: 303,
      },
      {
        wordpressId: 3,
        slug: 'news-copy-is-irrelevant-to-cat-query',
        collection: 'categories',
        payloadId: 303,
      },
      {
        wordpressId: 9,
        slug: 'payload',
        collection: 'tags',
        payloadId: 404,
      },
      {
        wordpressId: 10,
        slug: 'payload',
        collection: 'tags',
        payloadId: 404,
      },
    ])

    expect(result).toEqual([
      {
        fromURL: '/?cat=3',
        toURL: {
          relationTo: 'categories',
          value: 303,
        },
        type: '301',
      },
      {
        fromURL: '/?tag=payload',
        toURL: {
          relationTo: 'tags',
          value: 404,
        },
        type: '301',
      },
    ])
  })

  it('fails closed when category or tag legacy URLs resolve to conflicting targets', () => {
    expect(() =>
      buildRedirectSpecs([
        {
          wordpressId: 3,
          slug: 'news',
          collection: 'categories',
          payloadId: 303,
        },
        {
          wordpressId: 3,
          slug: 'other-news',
          collection: 'categories',
          payloadId: 304,
        },
      ]),
    ).toThrow(/Conflicting redirect targets for \/\?cat=3/)

    expect(() =>
      buildRedirectSpecs([
        {
          wordpressId: 9,
          slug: 'payload',
          collection: 'tags',
          payloadId: 404,
        },
        {
          wordpressId: 10,
          slug: 'payload',
          collection: 'tags',
          payloadId: 405,
        },
      ]),
    ).toThrow(/Conflicting redirect targets for \/\?tag=payload/)
  })
})
