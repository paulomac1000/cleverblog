import { describe, expect, it } from 'vitest'

import {
  buildPublicUrlSource,
  parsePublicUrlSource,
} from '../../scripts/wordpress/build-public-url-source'

describe('public URL source universe', () => {
  it('builds a sanitised source-derived universe from published content and all taxonomy', () => {
    const source = buildPublicUrlSource(
      {
        posts: [
          { ID: '202', post_status: 'publish', post_title: 'secret content is not emitted' },
          { ID: 203, post_status: 'draft' },
        ],
        pages: [
          { ID: 7, post_status: 'publish' },
          { ID: 8, post_status: 'private' },
        ],
        categories: [{ term_id: 3, slug: 'news' }],
        tags: [{ term_id: 9, slug: 'payload' }],
      },
      '2026-08-30T10:00:00.000Z',
    )

    expect(source.generatedAt).toBe('2026-08-30T10:00:00.000Z')
    expect(source.wordpressSource).toEqual({
      posts: 2,
      pages: 2,
      categories: 1,
      tags: 1,
    })
    expect(source.expected).toHaveLength(4)
    expect(source.expected).toEqual(
      expect.arrayContaining([
        { collection: 'categories', wordpressId: 3, fromURL: '/?cat=3' },
        { collection: 'posts', wordpressId: 202, fromURL: '/?p=202' },
        { collection: 'pages', wordpressId: 7, fromURL: '/?page_id=7' },
        { collection: 'tags', slug: 'payload', fromURL: '/?tag=payload' },
      ]),
    )
    expect(JSON.stringify(source)).not.toContain('secret content')
  })

  it('fails closed on missing required source fields and malformed committed entries', () => {
    expect(() =>
      buildPublicUrlSource({
        posts: [{ ID: 202 }],
        pages: [],
        categories: [],
        tags: [],
      }),
    ).toThrow(/post_status/)

    expect(() =>
      parsePublicUrlSource({
        generatedAt: '2026-08-30T10:00:00.000Z',
        wordpressSource: {
          posts: 1,
          pages: 0,
          categories: 0,
          tags: 0,
        },
        expected: [
          {
            collection: 'posts',
            wordpressId: 202,
            fromURL: '/?p=999',
          },
        ],
      }),
    ).toThrow(/posts:wp:202 has invalid fromURL/)
  })
})
