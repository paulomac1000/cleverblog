import { describe, expect, it } from 'vitest'

import { matchesSearchQuery } from '@/lib/search/match'

describe('matchesSearchQuery', () => {
  const article = {
    title: 'Linux na Raspberry Pi',
    excerpt: 'System services with systemctl',
    categoryNames: ['Administracja'],
    tagNames: ['systemd'],
  }

  it('requires every query token to match', () => {
    expect(matchesSearchQuery(article, 'linux systemctl')).toBe(true)
    expect(matchesSearchQuery(article, 'linux mysql')).toBe(false)
  })

  it('matches case and Polish diacritics insensitively', () => {
    expect(
      matchesSearchQuery(
        { title: 'Zażółć gęślą jaźń — Łąka' },
        'ZAZOLC GESLA LAKA',
      ),
    ).toBe(true)
  })

  it('matches category and tag metadata', () => {
    expect(
      matchesSearchQuery(
        {
          title: 'Notatka',
          categoryNames: ['Raspberry Pi'],
          tagNames: ['systemctl'],
        },
        'raspberry systemctl',
      ),
    ).toBe(true)
  })

  it('matches every article for an empty query', () => {
    expect(matchesSearchQuery(article, '   ')).toBe(true)
  })
})
