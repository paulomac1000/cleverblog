import { describe, expect, it } from 'vitest'

import { scoreCommentSpam } from '@/lib/comments/spamScore'

describe('comment spam scoring', () => {
  it('scores a normal Polish comment as clean', () => {
    const result = scoreCommentSpam({
      authorName: 'Filip',
      content:
        'W sumie wydaje się to ciekawą opcją dla tych, którzy nie mają publicznego IP. Serwer z chałupy do mikrusa przez OpenVPN.',
    })
    expect(result.score).toBe(0)
    expect(result.reason).toBeNull()
  })

  it('flags many links as high score', () => {
    const content = Array.from({ length: 7 }, (_, i) => `https://spam-${i}.example`).join(' ')
    const result = scoreCommentSpam({ authorName: 'x', content })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reason).toContain('many-links')
  })

  it('counts bare domains as links', () => {
    const content = Array.from({ length: 7 }, (_, i) => `spam-${i}.example`).join(' ')
    const result = scoreCommentSpam({ authorName: 'x', content })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reason).toContain('many-links')
  })

  it('scores a link plus very short content below the spam threshold', () => {
    const result = scoreCommentSpam({
      authorName: 'x',
      content: 'ok https://a.example',
    })
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThan(80)
  })

  it('flags known spam phrases', () => {
    const result = scoreCommentSpam({
      authorName: 'x',
      content: 'We offer guaranteed profit if you buy followers today',
    })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reason).toContain('spam-phrases')
  })

  it('flags a URL in the author name', () => {
    const result = scoreCommentSpam({
      authorName: 'https://spam.example',
      content: 'Nice post, really enjoyed reading it.',
    })
    expect(result.reason).toContain('link-in-name')
  })

  it('caps the score at 100', () => {
    const content = `${Array.from({ length: 20 }, (_, i) => `https://s${i}.example`).join(' ')} viagra casino payday loan`
    const result = scoreCommentSpam({ authorName: 'https://x.example', content })
    expect(result.score).toBe(100)
  })
})
