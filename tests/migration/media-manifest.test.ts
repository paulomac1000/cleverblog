import { describe, expect, it } from 'vitest'

import {
  normalizeMedia,
  sha256Bytes,
  uploadsPathFromGuid,
  type WpMediaItem,
} from '../../scripts/wordpress/extract-media'

const item = (overrides: Partial<WpMediaItem>): WpMediaItem => ({
  ID: 1,
  post_title: 'A photo',
  post_name: 'a-photo',
  post_status: 'inherit',
  post_date: '2020-05-01 10:00:00',
  post_date_gmt: '2020-05-01 08:00:00',
  guid: 'https://cleverblog.pl/wp-content/uploads/2020/05/a-photo.jpg',
  post_mime_type: 'image/jpeg',
  ...overrides,
})

describe('uploadsPathFromGuid', () => {
  it('maps standard attachment GUIDs to relative uploads paths', () => {
    expect(uploadsPathFromGuid('https://cleverblog.pl/wp-content/uploads/2020/05/a-photo.jpg')).toBe(
      '2020/05/a-photo.jpg',
    )
  })

  it('returns null for external or unmappable GUIDs', () => {
    expect(uploadsPathFromGuid('https://example.org/somewhere.jpg')).toBeNull()
  })

  it('strips query strings', () => {
    expect(uploadsPathFromGuid('https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg?x=1')).toBe(
      '2020/05/a.jpg',
    )
  })
})

describe('normalizeMedia', () => {
  it('computes sha256 and marks present files as available', () => {
    const bytes = Buffer.from('jpeg-bytes')
    const { normalized, missing, unmapped } = normalizeMedia([item({})], (rel) =>
      rel === '2020/05/a-photo.jpg' ? bytes : null,
    )
    expect(normalized).toHaveLength(1)
    expect(normalized[0].sha256).toBe(sha256Bytes(bytes))
    expect(normalized[0].missing).toBe(false)
    expect(missing).toHaveLength(0)
    expect(unmapped).toHaveLength(0)
  })

  it('reports files missing on disk without guessing', () => {
    const { normalized, missing } = normalizeMedia([item({})], () => null)
    expect(normalized).toHaveLength(0)
    expect(missing).toHaveLength(1)
    expect(missing[0].uploadsPath).toBe('2020/05/a-photo.jpg')
    expect(missing[0].sha256).toBeNull()
  })

  it('reports unmappable GUIDs separately from missing files', () => {
    const { normalized, missing, unmapped } = normalizeMedia(
      [item({ guid: 'https://example.org/x.png' })],
      () => Buffer.from('x'),
    )
    expect(normalized).toHaveLength(0)
    expect(missing).toHaveLength(0)
    expect(unmapped).toHaveLength(1)
  })

  it('is deterministic: same bytes produce the same hash', () => {
    const bytes = Buffer.from('same-bytes')
    const a = normalizeMedia([item({})], () => bytes).normalized[0].sha256
    const b = normalizeMedia([item({})], () => bytes).normalized[0].sha256
    expect(a).toBe(b)
  })
})
