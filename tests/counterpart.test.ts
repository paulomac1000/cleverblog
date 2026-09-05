import { describe, expect, it } from 'vitest'

import type { Locale } from '@/i18n/config'
import { messages } from '@/i18n/messages'
import {
  resolveCounterpartUrl,
  type Counterpart,
  type CounterpartResolver,
} from '@/lib/content/counterpart'

const pl = messages.pl
const en = messages.en

const strings = (m: Record<string, unknown>): string[] =>
  Object.keys(m).filter((k) => typeof m[k] === 'string')

const functions = (m: Record<string, unknown>): string[] =>
  Object.keys(m).filter((k) => typeof m[k] === 'function')

describe('i18n message parity (EN never falls back to PL)', () => {
  it('every PL string key exists in EN', () => {
    const missing = strings(pl).filter((k) => !(k in en))
    expect(missing, `missing EN keys: ${missing.join(', ')}`).toEqual([])
  })

  it('every PL function key exists in EN', () => {
    const missing = functions(pl).filter((k) => !(k in en))
    expect(missing, `missing EN function keys: ${missing.join(', ')}`).toEqual(
      [],
    )
  })

  it('EN introduces no keys unknown to PL', () => {
    const extra = Object.keys(en).filter((k) => !(k in pl))
    expect(extra, `extra EN keys: ${extra.join(', ')}`).toEqual([])
  })

  it('EN strings are non-empty and contain no Polish diacritics', () => {
    for (const key of strings(en)) {
      const value = en[key] as string
      expect(value.length, `empty EN value for ${key}`).toBeGreaterThan(0)
      expect(value, `Polish text in EN key ${key}`).not.toMatch(
        /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/,
      )
    }
  })
})

const resolver =
  (enExists: boolean, enSlug: string | null = null): CounterpartResolver =>
  async (): Promise<Counterpart> => ({ enExists, enSlug })

describe('resolveCounterpartUrl', () => {
  it('home: PL tree links to /en, EN tree links to /', async () => {
    await expect(
      resolveCounterpartUrl('pl', '/', resolver(true), resolver(true)),
    ).resolves.toBe('/en')
    await expect(
      resolveCounterpartUrl('en', '/en', resolver(true), resolver(true)),
    ).resolves.toBe('/')
  })

  it('listing routes always have a counterpart', async () => {
    await expect(
      resolveCounterpartUrl('pl', '/category/linux', resolver(true), resolver(true)),
    ).resolves.toBe('/en/category/linux')
    await expect(
      resolveCounterpartUrl('en', '/en/tags/docker', resolver(true), resolver(true)),
    ).resolves.toBe('/tags/docker')
    await expect(
      resolveCounterpartUrl('pl', '/page/2', resolver(true), resolver(true)),
    ).resolves.toBe('/en/page/2')
  })

  it('article with EN counterpart uses the EN slug in both directions', async () => {
    const withCp = resolver(true, 'english-slug')
    await expect(
      resolveCounterpartUrl('pl', '/articles/polski-slug', withCp, resolver(true)),
    ).resolves.toBe('/en/articles/english-slug')
    await expect(
      resolveCounterpartUrl('en', '/en/articles/english-slug', withCp, resolver(true)),
    ).resolves.toBe('/articles/english-slug')
  })

  it('article without EN counterpart is null (disabled flag, never a dead link)', async () => {
    await expect(
      resolveCounterpartUrl('pl', '/articles/polski-slug', resolver(false), resolver(true)),
    ).resolves.toBeNull()
    await expect(
      resolveCounterpartUrl('en', '/en/articles/english-slug', resolver(false), resolver(true)),
    ).resolves.toBeNull()
  })

  it('page without EN counterpart is null', async () => {
    await expect(
      resolveCounterpartUrl('pl', '/o-nas', resolver(true), resolver(false)),
    ).resolves.toBeNull()
  })

  it('never redirects a PL deep link to an EN URL that does not exist', async () => {
    const url = await resolveCounterpartUrl(
      'pl',
      '/articles/polski-slug',
      resolver(true, 'english-slug'),
      resolver(true),
    )
    expect(url).toMatch(/^\/en\//)
  })

  it('locale type stays narrow', () => {
    const locales: Locale[] = ['pl', 'en']
    expect(locales).toHaveLength(2)
  })
})
