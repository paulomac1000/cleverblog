import { describe, expect, it } from 'vitest'

import {
  buildCommentTree,
  selectApprovedComments,
} from '../../scripts/wordpress/map-comments'

import type { WpCommentItem } from '../../scripts/wordpress/map-comments'

const raw = (overrides: Partial<WpCommentItem> = {}): WpCommentItem => ({
  comment_ID: '1',
  comment_post_ID: '41',
  comment_parent: '0',
  comment_author: 'Author',
  comment_author_email: 'author@example.com',
  comment_author_url: '',
  comment_content: 'Comment',
  comment_approved: '1',
  comment_date: '2024-01-01 12:00:00',
  comment_date_gmt: '2024-01-01 11:00:00',
  ...overrides,
})

describe('WordPress comment mapping', () => {
  it('selects only approved WordPress comments', () => {
    const result = selectApprovedComments([
      raw({ comment_ID: '1', comment_approved: '1' }),
      raw({ comment_ID: '2', comment_approved: '0' }),
      raw({ comment_ID: '3', comment_approved: 'spam' }),
    ])

    expect(result.map((comment) => comment.comment_ID)).toEqual(['1'])
  })

  it('builds deterministic roots and parent-child relationships', () => {
    const tree = buildCommentTree([
      raw({ comment_ID: '4', comment_parent: '1' }),
      raw({ comment_ID: '2', comment_parent: '0' }),
      raw({ comment_ID: '1', comment_parent: '0' }),
      raw({ comment_ID: '3', comment_parent: '1' }),
    ])

    expect(tree.roots.map((comment) => comment.comment_ID)).toEqual(['1', '2'])
    expect(tree.children.get('1')?.map((comment) => comment.comment_ID)).toEqual([
      '3',
      '4',
    ])
    expect(tree.flattened).toEqual([])
  })

  it('promotes an orphan to a root and reports it as flattened', () => {
    const orphan = raw({
      comment_ID: '11',
      comment_parent: '999',
    })

    const tree = buildCommentTree([orphan])

    expect(tree.roots.map((comment) => comment.comment_ID)).toEqual(['11'])
    expect(tree.flattened.map((comment) => comment.comment_ID)).toEqual(['11'])
  })

  it('sorts roots and children numerically by comment_ID', () => {
    const tree = buildCommentTree([
      raw({ comment_ID: '10', comment_parent: '0' }),
      raw({ comment_ID: '3', comment_parent: '1' }),
      raw({ comment_ID: '2', comment_parent: '1' }),
      raw({ comment_ID: '1', comment_parent: '0' }),
    ])

    expect(tree.roots.map((comment) => comment.comment_ID)).toEqual(['1', '10'])
    expect(tree.children.get('1')?.map((comment) => comment.comment_ID)).toEqual([
      '2',
      '3',
    ])
  })

  it('retains a two-level child chain for topological import', () => {
    const tree = buildCommentTree([
      raw({ comment_ID: '3', comment_parent: '2' }),
      raw({ comment_ID: '1', comment_parent: '0' }),
      raw({ comment_ID: '2', comment_parent: '1' }),
    ])

    expect(tree.roots.map((comment) => comment.comment_ID)).toEqual(['1'])
    expect(tree.children.get('1')?.map((comment) => comment.comment_ID)).toEqual(['2'])
    expect(tree.children.get('2')?.map((comment) => comment.comment_ID)).toEqual(['3'])
    expect(tree.flattened).toEqual([])
  })
})
