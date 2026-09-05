import { describe, expect, it } from 'vitest'

import { parsePreferredLocale } from '../../src/i18n/config'

describe('parsePreferredLocale', () => {
  it('prefers en when it is the first qualifying tag', () => {
    expect(parsePreferredLocale('en-US,en;q=0.9,pl;q=0.8')).toBe('en')
  })

  it('returns null for Polish-first browsers (never auto-redirect to /en)', () => {
    expect(parsePreferredLocale('pl-PL,pl;q=0.9,en;q=0.8')).toBeNull()
  })

  it('honours quality weights: en;q=0.5 loses to pl;q=0.9', () => {
    expect(parsePreferredLocale('pl;q=0.9,en;q=0.5')).toBeNull()
  })

  it('honours quality weights: en;q=1 wins over pl;q=0.2', () => {
    expect(parsePreferredLocale('pl;q=0.2,en;q=1')).toBe('en')
  })

  it('rejects en;q=0 (explicitly not acceptable)', () => {
    expect(parsePreferredLocale('en;q=0,pl;q=0.5')).toBeNull()
  })

  it('ignores the wildcard range', () => {
    expect(parsePreferredLocale('*')).toBeNull()
  })

  it('returns null for empty or missing headers', () => {
    expect(parsePreferredLocale(null)).toBeNull()
    expect(parsePreferredLocale('')).toBeNull()
    expect(parsePreferredLocale('de-DE,de;q=0.9')).toBeNull()
  })

  it('tolerates malformed q values by treating them as zero weight', () => {
    expect(parsePreferredLocale('en;q=abc')).toBeNull()
  })
})
