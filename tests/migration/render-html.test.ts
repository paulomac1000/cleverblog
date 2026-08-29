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
})
