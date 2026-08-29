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

const NO_META = {}

describe('uploadsPathFromGuid', () => {
  it('maps standard attachment GUIDs to relative uploads paths', () => {
    expect(uploadsPathFromGuid('https://cleverblog.pl/wp-content/uploads/2020/05/a-photo.jpg')).toBe(
      '2020/05/a-photo.jpg',
    )
  })

  it('returns null for external or unmappable GUIDs', () => {
    expect(uploadsPathFromGuid('https://example.org/somewhere.jpg')).toBeNull()
  })

  it('classifies malformed percent-encoding as null instead of crashing', () => {
    expect(uploadsPathFromGuid('https://cleverblog.pl/wp-content/uploads/2020/05/a%ZZ.jpg')).toBeNull()
  })
})

describe('normalizeMedia', () => {
  it('computes sha256 and marks present files as available', () => {
    const bytes = Buffer.from('jpeg-bytes')
    const { normalized, unresolved } = normalizeMedia([item({})], NO_META, (rel) =>
      rel === '2020/05/a-photo.jpg' ? bytes : null,
    )
    expect(normalized).toHaveLength(1)
    expect(normalized[0].sha256).toBe(sha256Bytes(bytes))
    expect(normalized[0].missing).toBe(false)
    expect(normalized[0].pathSource).toBe('guid')
    expect(unresolved).toHaveLength(0)
  })

  it('prefers _wp_attached_file over the GUID and carries real alt text', () => {
    const bytes = Buffer.from('jpeg-bytes')
    const { normalized } = normalizeMedia(
      [item({ guid: 'https://old-host.example/whatever.jpg' })],
      { '1': { attachedFile: '2021/02/real-file.jpg', alt: 'real alt text' } },
      (rel) => (rel === '2021/02/real-file.jpg' ? bytes : null),
    )
    expect(normalized[0].uploadsPath).toBe('2021/02/real-file.jpg')
    expect(normalized[0].pathSource).toBe('attached-file')
    expect(normalized[0].alt).toBe('real alt text')
  })

  it('treats unsafe attached_file metadata as an issue, not a silent GUID fallback', () => {
    const { normalized, unresolved } = normalizeMedia(
      [item({})],
      { '1': { attachedFile: '../../../etc/passwd' } },
      () => Buffer.from('secret'),
    )
    expect(normalized).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].reason).toBe('unsafe-path')
    expect(unresolved[0].pathSource).toBe('attached-file')
  })

  it('treats malformed attached_file encoding as an issue instead of crashing', () => {
    const { normalized, unresolved } = normalizeMedia(
      [item({})],
      { '1': { attachedFile: '2021/02/a%ZZ.png' } },
      () => Buffer.from('x'),
    )
    expect(normalized).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].reason).toBe('unsafe-path')
  })

  it('reports files missing on disk as missing-file issues', () => {
    const { normalized, unresolved } = normalizeMedia([item({})], NO_META, () => null)
    expect(normalized).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].reason).toBe('missing-file')
    expect(unresolved[0].uploadsPath).toBe('2020/05/a-photo.jpg')
  })

  it('reports unmappable GUIDs separately with no-path reason', () => {
    const { normalized, unresolved } = normalizeMedia(
      [item({ guid: 'https://example.org/x.png' })],
      NO_META,
      () => Buffer.from('x'),
    )
    expect(normalized).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].reason).toBe('no-path')
  })

  it('rejects path traversal payloads', () => {
    const { normalized, unresolved } = normalizeMedia(
      [item({ guid: 'https://cleverblog.pl/wp-content/uploads/../../etc/passwd' })],
      NO_META,
      () => Buffer.from('secret'),
    )
    expect(normalized).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
  })

  it('is deterministic: same bytes produce the same hash', () => {
    const bytes = Buffer.from('same-bytes')
    const a = normalizeMedia([item({})], NO_META, () => bytes).normalized[0].sha256
    const b = normalizeMedia([item({})], NO_META, () => bytes).normalized[0].sha256
    expect(a).toBe(b)
  })
})
