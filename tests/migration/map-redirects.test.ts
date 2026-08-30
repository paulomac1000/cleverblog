import { describe, expect, it } from 'vitest'

import { buildRedirectSpecs } from '../../scripts/wordpress/map-redirects'

describe('WordPress redirect mapping', () => {
  it('maps WordPress post and page query URLs to Payload relationships', () => {
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
    ])

    expect(result).toEqual([
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
    ])
  })

  it('deduplicates identical redirect sources', () => {
    const result = buildRedirectSpecs([
      {
        wordpressId: 41,
        slug: 'example-post',
        collection: 'posts',
        payloadId: 101,
      },
      {
        wordpressId: 41,
        slug: 'example-post',
        collection: 'posts',
        payloadId: 101,
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.fromURL).toBe('/?p=41')
  })

  it('fails closed when one legacy URL resolves to conflicting targets', () => {
    expect(() =>
      buildRedirectSpecs([
        {
          wordpressId: 41,
          slug: 'example-post',
          collection: 'posts',
          payloadId: 101,
        },
        {
          wordpressId: 41,
          slug: 'other-copy',
          collection: 'posts',
          payloadId: 102,
        },
      ]),
    ).toThrow(/Conflicting redirect targets/)
  })
})
