import { describe, expect, it } from 'vitest'

import {
  buildRenderHTML,
  collectUnrewrittenUrls,
} from '../../scripts/wordpress/render-html'

const mediaMap = new Map<string, string>([
  ['2020/05/a.jpg', '/api/media/file/7-a.jpg'],
])

describe('buildRenderHTML', () => {
  it('rewrites a full WordPress uploads URL', () => {
    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg">'

    const result = buildRenderHTML(html, mediaMap)

    expect(result).toContain('src="/api/media/file/7-a.jpg"')
    expect(result).not.toContain('wp-content')
  })

  it('rewrites a WordPress uploads URL with the /blog prefix', () => {
    const html =
      '<img src="https://cleverblog.pl/blog/wp-content/uploads/2020/05/a.jpg">'

    const result = buildRenderHTML(html, mediaMap)

    expect(result).toContain('src="/api/media/file/7-a.jpg"')
    expect(result).not.toContain('wp-content')
  })

  it('rewrites a relative WordPress uploads URL', () => {
    const html = '<img src="/wp-content/uploads/2020/05/a.jpg">'

    const result = buildRenderHTML(html, mediaMap)

    expect(result).toContain('src="/api/media/file/7-a.jpg"')
    expect(result).not.toContain('wp-content')
  })

  it('rewrites resized and scaled variants to the original media asset', () => {
    const resized =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a-1024x768.jpg">'
    const scaled =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a-scaled.jpg">'

    expect(buildRenderHTML(resized, mediaMap)).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
    expect(buildRenderHTML(scaled, mediaMap)).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
  })

  it('does not normalize resized suffixes in external media URLs', () => {
    const html = '<img src="https://cdn.example.com/photo-300x200.jpg">'

    const result = buildRenderHTML(html, mediaMap)

    expect(result).toContain('src="https://cdn.example.com/photo-300x200.jpg"')
    expect(result).not.toContain('/api/media/')
  })

  it('does not normalize scaled suffixes in unrelated code text', () => {
    const html = '<code>foo-scaled.jpg</code>'

    const result = buildRenderHTML(html, mediaMap)

    expect(result).toContain('<code>foo-scaled.jpg</code>')
  })

  it('rewrites both GUID-derived and uploadsPath aliases to the same media asset', () => {
    const aliasMediaMap = new Map<string, string>([
      ['2020/05/a.jpg', '/api/media/file/7-a.jpg'],
      ['2020/05/real-name.jpg', '/api/media/file/7-a.jpg'],
    ])
    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg">' +
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/real-name.jpg">'

    const result = buildRenderHTML(html, aliasMediaMap)

    expect(result.match(/src="\/api\/media\/file\/7-a\.jpg"/g)).toHaveLength(2)
    expect(result).not.toContain('wp-content')
  })

  it('never produces hybrid WordPress/Payload media URLs', () => {
    const inputs = [
      'https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg',
      'https://cleverblog.pl/blog/wp-content/uploads/2020/05/a.jpg',
      '/wp-content/uploads/2020/05/a.jpg',
      'https://cleverblog.pl/wp-content/uploads/2020/05/a-1024x768.jpg',
      'https://cleverblog.pl/wp-content/uploads/2020/05/a-scaled.jpg',
    ]

    for (const src of inputs) {
      const result = buildRenderHTML(`<img src="${src}">`, mediaMap)

      expect(result).not.toContain('uploads//api')
      expect(result).not.toContain('wp-content')
    }
  })

  it('leaves unresolved media URLs in the render copy for reporting', () => {
    const url =
      'https://cleverblog.pl/wp-content/uploads/2020/05/missing.jpg'
    const result = buildRenderHTML(`<img src="${url}">`, mediaMap)

    expect(collectUnrewrittenUrls(result)).toEqual([url])
  })

  it('sanitizes scripts while preserving figure media markup', () => {
    const html =
      '<figure><img src="/safe.jpg" alt="A"><figcaption>Caption</figcaption></figure><script>alert("x")</script>'

    const result = buildRenderHTML(html, new Map<string, string>())

    expect(result).not.toContain('<script')
    expect(result).not.toContain('</script>')
    expect(result).toContain('<figure>')
    expect(result).toContain('</figure>')
    expect(result).toContain('<figcaption>Caption</figcaption>')
    expect(result).toContain('<img src="/safe.jpg" alt="A" />')
  })

  it('creates a separate render copy without modifying the original input', () => {
    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg">'
    const original = html

    const result = buildRenderHTML(html, mediaMap)

    expect(result).not.toBe(html)
    expect(html).toBe(original)
    expect(html).toContain(
      'https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg',
    )
  })
})

describe('collectUnrewrittenUrls', () => {
  it('deduplicates and sorts unresolved WordPress media URLs', () => {
    const a =
      'https://cleverblog.pl/wp-content/uploads/2020/05/a-missing.jpg'
    const z =
      'https://cleverblog.pl/blog/wp-content/uploads/2021/06/z-missing.png'
    const html = `<img src="${z}"><a href="${a}">A</a><img src="${z}">`

    expect(collectUnrewrittenUrls(html)).toEqual([z, a])
  })

  it('collects absolute, protocol-relative and relative WordPress media URLs', () => {
    const absolute =
      'https://cleverblog.pl/wp-content/uploads/2020/05/abs-missing.jpg'
    const protocolRelative =
      '//cleverblog.pl/wp-content/uploads/2020/05/proto-missing.jpg'
    const relative =
      '/wp-content/uploads/2020/05/rel-missing.jpg'
    const html =
      `<img src="${absolute}">` +
      `<img src="${relative}">` +
      `<img src="${protocolRelative}">`

    expect(collectUnrewrittenUrls(html)).toEqual(
      [absolute, protocolRelative, relative].sort(),
    )
  })
})
