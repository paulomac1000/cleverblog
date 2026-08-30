import { describe, expect, it } from 'vitest'

import { normalizePages } from '../../scripts/wordpress/normalize-pages'
import type { RawWordPressPost } from '../../scripts/wordpress/types'

const rawPage = (
  overrides: Partial<RawWordPressPost> = {},
): RawWordPressPost => ({
  ID: 42,
  post_title: 'Example page',
  post_name: 'example-page',
  post_status: 'publish',
  post_date: '2024-03-20 12:30:00',
  post_date_gmt: '2024-03-20 11:30:00',
  post_excerpt: '',
  post_content: '<p>Page</p>',
  guid: 'https://cleverblog.pl/?page_id=42',
  comment_status: 'closed',
  post_parent: 0,
  ...overrides,
})

describe('WordPress page normalization', () => {
  it('rejects a pages capture that is missing post_parent', () => {
    expect(() =>
      normalizePages([rawPage({ post_parent: undefined })]),
    ).toThrow(
      'pages capture is missing post_parent; re-run capture with post_parent in the field list',
    )
  })

  it('rejects hierarchical pages', () => {
    expect(() => normalizePages([rawPage({ post_parent: 5 })])).toThrow(
      'Hierarchical pages are not supported in migration: wp:42 has post_parent=5',
    )
  })
})
