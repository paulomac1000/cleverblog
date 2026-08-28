import { describe, expect, it } from 'vitest'

import { normalizePost, normalizePosts, sourceHash } from '../../scripts/wordpress/normalize-posts'
import type { RawWordPressPost } from '../../scripts/wordpress/types'

const raw = (overrides: Partial<RawWordPressPost> = {}): RawWordPressPost => ({
  ID: 509,
  post_title: '  Example article  ',
  post_name: 'example-article',
  post_status: 'publish',
  post_date: '2024-03-20 12:30:00',
  post_excerpt: ' excerpt ',
  post_content: '<p>Hello</p>',
  guid: 'https://cleverblog.pl/?p=509',
  comment_status: 'open',
  ...overrides,
})

describe('WordPress post normalization', () => {
  it('preserves legacy identity and generates the query permalink redirect', () => {
    const result = normalizePost(raw())
    expect(result.wordpressId).toBe(509)
    expect(result.originalUrl).toBe('/?p=509')
    expect(result.redirects).toEqual(['/?p=509'])
    expect(result.title).toBe('Example article')
    expect(result.excerpt).toBe('excerpt')
    expect(result.commentsEnabled).toBe(true)
  })

  it('uses a deterministic content source hash', () => {
    expect(sourceHash(raw())).toBe(sourceHash(raw()))
    expect(sourceHash(raw({ post_content: '<p>Changed</p>' }))).not.toBe(sourceHash(raw()))
  })

  it('does not silently accept duplicate WordPress IDs', () => {
    expect(() => normalizePosts([raw(), raw()])).toThrow(/Duplicate WordPress post ID/)
  })

  it('falls back to a stable slug when WordPress has none', () => {
    expect(normalizePost(raw({ post_name: '' })).slug).toBe('wordpress-509')
  })
})
