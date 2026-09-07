import { describe, expect, it } from 'vitest'

import { stripLegacyPagedParams } from '@/lib/redirects/legacy-params'

const qs = (raw: string): URLSearchParams => new URLSearchParams(raw)

describe('stripLegacyPagedParams (legacy WordPress ?paged=N cleanup)', () => {
  it('returns empty query for a bare paged param', () => {
    expect(stripLegacyPagedParams(qs('paged=2'))).toBe('')
  })

  it('keeps other params when stripping paged', () => {
    expect(stripLegacyPagedParams(qs('paged=3&category=linux'))).toBe(
      '?category=linux',
    )
    expect(
      stripLegacyPagedParams(qs('utm_source=rss&paged=2&q=home+assistant')),
    ).toBe('?utm_source=rss&q=home+assistant')
  })

  it('removes every duplicate paged key', () => {
    expect(stripLegacyPagedParams(qs('paged=2&paged=3'))).toBe('')
    expect(stripLegacyPagedParams(qs('paged=2&paged=3&x=1'))).toBe('?x=1')
  })

  it('returns null when paged is absent (no redirect)', () => {
    expect(stripLegacyPagedParams(qs('page=2'))).toBeNull()
    expect(stripLegacyPagedParams(qs('p=123'))).toBeNull()
    expect(stripLegacyPagedParams(qs(''))).toBeNull()
  })
})
