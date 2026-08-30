import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  buildRenderHTML,
  buildRetiredUploadsPaths,
  collectUnrewrittenUrls,
} from '../../scripts/wordpress/render-html'

const mediaMap =
  new Map<string, string>([
    [
      '2020/05/a.jpg',
      '/api/media/file/7-a.jpg',
    ],
  ])

describe('buildRenderHTML', () => {
  it('rewrites a full WordPress uploads URL', () => {
    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg">'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
    expect(result).not.toContain(
      'wp-content',
    )
  })

  it('rewrites a WordPress uploads URL with the /blog prefix', () => {
    const html =
      '<img src="https://cleverblog.pl/blog/wp-content/uploads/2020/05/a.jpg">'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
    expect(result).not.toContain(
      'wp-content',
    )
  })

  it('rewrites a relative WordPress uploads URL', () => {
    const html =
      '<img src="/wp-content/uploads/2020/05/a.jpg">'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
    expect(result).not.toContain(
      'wp-content',
    )
  })

  it('rewrites a protocol-relative WordPress uploads URL without retaining the host', () => {
    const html =
      '<img src="//cleverblog.pl/wp-content/uploads/2020/05/a.jpg">'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
    expect(result).not.toContain(
      '//cleverblog.pl/api/media',
    )
    expect(result).not.toContain(
      'wp-content',
    )
  })

  it('leaves an unknown media variant untouched for reporting', () => {
    const url =
      'https://cleverblog.pl/wp-content/uploads/2020/05/missing-300x200.jpg'

    const result =
      buildRenderHTML(
        `<img src="${url}">`,
        mediaMap,
      )

    expect(result).toContain(
      `src="${url}"`,
    )
    expect(result).toContain(
      'missing-300x200.jpg',
    )
    expect(
      collectUnrewrittenUrls(result),
    ).toEqual([url])
  })

  it('rewrites resized and scaled variants to the original media asset', () => {
    const resized =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a-1024x768.jpg">'
    const scaled =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a-scaled.jpg">'

    expect(
      buildRenderHTML(
        resized,
        mediaMap,
      ),
    ).toContain(
      'src="/api/media/file/7-a.jpg"',
    )

    expect(
      buildRenderHTML(
        scaled,
        mediaMap,
      ),
    ).toContain(
      'src="/api/media/file/7-a.jpg"',
    )
  })

  it('does not normalize resized suffixes in external media URLs', () => {
    const html =
      '<img src="https://cdn.example.com/photo-300x200.jpg">'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).toContain(
      'src="https://cdn.example.com/photo-300x200.jpg"',
    )
    expect(result).not.toContain(
      '/api/media/',
    )
  })

  it('does not normalize scaled suffixes in unrelated code text', () => {
    const html =
      '<code>foo-scaled.jpg</code>'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).toContain(
      '<code>foo-scaled.jpg</code>',
    )
  })

  it('rewrites both GUID-derived and uploadsPath aliases to the same media asset', () => {
    const aliasMediaMap =
      new Map<string, string>([
        [
          '2020/05/a.jpg',
          '/api/media/file/7-a.jpg',
        ],
        [
          '2020/05/real-name.jpg',
          '/api/media/file/7-a.jpg',
        ],
      ])

    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg">' +
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/real-name.jpg">'

    const result =
      buildRenderHTML(
        html,
        aliasMediaMap,
      )

    expect(
      result.match(
        /src="\/api\/media\/file\/7-a\.jpg"/g,
      ),
    ).toHaveLength(2)

    expect(result).not.toContain(
      'wp-content',
    )
  })

  it('never produces hybrid WordPress/Payload media URLs', () => {
    const inputs = [
      'https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg',
      'https://cleverblog.pl/blog/wp-content/uploads/2020/05/a.jpg',
      '//cleverblog.pl/wp-content/uploads/2020/05/a.jpg',
      '/wp-content/uploads/2020/05/a.jpg',
      'https://cleverblog.pl/wp-content/uploads/2020/05/a-1024x768.jpg',
      'https://cleverblog.pl/wp-content/uploads/2020/05/a-scaled.jpg',
    ]

    for (const src of inputs) {
      const result =
        buildRenderHTML(
          `<img src="${src}">`,
          mediaMap,
        )

      expect(result).not.toContain(
        'uploads//api',
      )
      expect(result).not.toContain(
        '//cleverblog.pl/api/media',
      )
      expect(result).not.toContain(
        'wp-content',
      )
    }
  })

  it('leaves unresolved media URLs in the render copy for reporting', () => {
    const url =
      'https://cleverblog.pl/wp-content/uploads/2020/05/missing.jpg'

    const result =
      buildRenderHTML(
        `<img src="${url}">`,
        mediaMap,
      )

    expect(
      collectUnrewrittenUrls(result),
    ).toEqual([url])
  })

  it('sanitizes scripts while preserving figure media markup', () => {
    const html =
      '<figure><img src="/safe.jpg" alt="A"><figcaption>Caption</figcaption></figure><script>alert("x")</script>'

    const result =
      buildRenderHTML(
        html,
        new Map<string, string>(),
      )

    expect(result).not.toContain(
      '<script',
    )
    expect(result).not.toContain(
      '</script>',
    )
    expect(result).toContain(
      '<figure>',
    )
    expect(result).toContain(
      '</figure>',
    )
    expect(result).toContain(
      '<figcaption>Caption</figcaption>',
    )
    expect(result).toContain(
      '<img src="/safe.jpg" alt="A" />',
    )
  })

  it('creates a separate render copy without modifying the original input', () => {
    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg">'
    const original = html

    const result =
      buildRenderHTML(
        html,
        mediaMap,
      )

    expect(result).not.toBe(html)
    expect(html).toBe(original)
    expect(html).toContain(
      'https://cleverblog.pl/wp-content/uploads/2020/05/a.jpg',
    )
  })

  it('preserves the old behavior when retiredUploadsPaths is omitted', () => {
    const url =
      'https://cleverblog.pl/wp-content/uploads/2021/02/image.png'
    const html =
      `<p>before</p><img src="${url}"><p>after</p>`

    const withoutOption =
      buildRenderHTML(
        html,
        mediaMap,
      )

    const emptySet =
      buildRenderHTML(
        html,
        mediaMap,
        {
          retiredUploadsPaths:
            new Set<string>(),
        },
      )

    expect(emptySet).toBe(
      withoutOption,
    )
    expect(withoutOption).toContain(
      url,
    )
  })

  it('removes a standalone retired img only from the render working copy', () => {
    const url =
      'https://cleverblog.pl/wp-content/uploads/2021/02/image.png'

    const originalHTML =
      `<p>before</p><img src="${url}" alt="dead"><p>after</p>`

    const snapshot =
      originalHTML

    const result =
      buildRenderHTML(
        originalHTML,
        mediaMap,
        {
          retiredUploadsPaths:
            new Set([
              '2021/02/image.png',
            ]),
        },
      )

    expect(result).toContain(
      '<p>before</p>',
    )
    expect(result).toContain(
      '<p>after</p>',
    )
    expect(result).not.toContain(
      '<img',
    )
    expect(result).not.toContain(
      '2021/02/image.png',
    )
    expect(
      collectUnrewrittenUrls(result),
    ).toEqual([])

    expect(originalHTML).toBe(
      snapshot,
    )
    expect(originalHTML).toContain(
      url,
    )
  })

  it('removes the complete figure when it contains a retired image', () => {
    const retired =
      'https://cleverblog.pl/wp-content/uploads/2021/02/image-1.png'

    const html =
      '<p>one</p>' +
      `<figure class="wp-block-image"><a href="${retired}"><img src="${retired}"><figcaption>dead caption</figcaption></a></figure>` +
      '<p>two</p>'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
        {
          retiredUploadsPaths:
            new Set([
              '2021/02/image-1.png',
            ]),
        },
      )

    expect(result).toContain(
      '<p>one</p>',
    )
    expect(result).toContain(
      '<p>two</p>',
    )
    expect(result).not.toContain(
      '<figure',
    )
    expect(result).not.toContain(
      'dead caption',
    )
    expect(result).not.toContain(
      'image-1.png',
    )
  })

  it('retires generated variants of an explicitly retired attachment', () => {
    const html =
      '<img src="https://cleverblog.pl/wp-content/uploads/2021/02/image-300x200.png">'

    const result =
      buildRenderHTML(
        html,
        mediaMap,
        {
          retiredUploadsPaths:
            new Set([
              '2021/02/image.png',
            ]),
        },
      )

    expect(result).not.toContain(
      '<img',
    )
    expect(result).not.toContain(
      'image-300x200.png',
    )
  })
})

describe('buildRetiredUploadsPaths', () => {
  it('extracts only explicit retire decisions', () => {
    const result =
      buildRetiredUploadsPaths({
        generatedAt:
          '2026-08-30T18:28:00.000Z',
        unresolved: [
          {
            wordpressId: 262,
            uploadsPath:
              '2021/02/image.png',
            decision: 'retire',
          },
          {
            wordpressId: 263,
            uploadsPath:
              '2021/02/image-1.png',
            decision: 'replace',
            replacementNote:
              'replacement',
          },
          {
            wordpressId: 264,
            uploadsPath:
              '2021/02/other.png',
            decision: null,
          },
        ],
      })

    expect([...result]).toEqual([
      '2021/02/image.png',
    ])
  })

  it('fails closed on malformed media issue decisions', () => {
    expect(() =>
      buildRetiredUploadsPaths({
        unresolved: [
          {
            uploadsPath:
              '2021/02/image.png',
            decision: 'delete',
          },
        ],
      }),
    ).toThrow(/decision/)
  })
})

describe('collectUnrewrittenUrls', () => {
  it('deduplicates and sorts unresolved WordPress media URLs', () => {
    const a =
      'https://cleverblog.pl/wp-content/uploads/2020/05/a-missing.jpg'
    const z =
      'https://cleverblog.pl/blog/wp-content/uploads/2021/06/z-missing.png'

    const html =
      `<img src="${z}">` +
      `<a href="${a}">A</a>` +
      `<img src="${z}">`

    expect(
      collectUnrewrittenUrls(html),
    ).toEqual([z, a])
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

    expect(
      collectUnrewrittenUrls(html),
    ).toEqual(
      [
        absolute,
        protocolRelative,
        relative,
      ].sort(),
    )
  })
})
