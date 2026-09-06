import { describe, expect, it } from 'vitest'

import { resolveTarget } from '@/lib/redirects/resolve-target'

type RedirectDoc = Parameters<typeof resolveTarget>[0]

const doc = (
  relationTo: string,
  slug: string,
  type: string = '301',
): RedirectDoc => ({
  from: '/old',
  type,
  to: {
    type: 'reference',
    reference: { relationTo, value: { id: '1', slug } },
  },
})

describe('resolveTarget redirect targets match real frontend routes', () => {
  it.each([
    ['posts', 'my-post', '/articles/my-post'],
    ['pages', 'kontakt', '/kontakt'],
    ['categories', 'devops', '/category/devops'],
    ['tags', 'payload', '/tags/payload'],
  ] as Array<[string, string, string]>)(
    '%s target -> %s',
    (relationTo, slug, expected) => {
      expect(resolveTarget(doc(relationTo, slug))).toEqual({
        target: expected,
        status: 301,
      })
    },
  )

  it('maps redirect type 302', () => {
    expect(resolveTarget(doc('posts', 'x', '302'))).toEqual({
      target: '/articles/x',
      status: 302,
    })
  })

  it('rejects unknown redirect types', () => {
    expect(resolveTarget(doc('posts', 'x', '307'))).toBeNull()
  })

  it('rejects unsupported collections', () => {
    expect(resolveTarget(doc('media', 'x'))).toBeNull()
  })

  it('rejects non-reference targets', () => {
    expect(
      resolveTarget({ from: '/old', type: '301', to: { type: 'custom' } }),
    ).toBeNull()
    expect(resolveTarget({ from: '/old', type: '301', to: null })).toBeNull()
  })

  it('rejects empty or missing slugs', () => {
    expect(resolveTarget(doc('posts', ''))).toBeNull()
    expect(
      resolveTarget({
        from: '/old',
        type: '301',
        to: { type: 'reference', reference: { relationTo: 'posts' } },
      }),
    ).toBeNull()
  })
})
