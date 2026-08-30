import { describe, expect, it } from 'vitest'

import {
  applyMediaDecisions,
  type MediaDecisionEntry,
  type UnresolvedMedia,
} from '../../scripts/wordpress/extract-media'

const unresolved = (
  wordpressId: number,
  uploadsPath: string | null,
): UnresolvedMedia => ({
  wordpressId,
  slug: `media-${wordpressId}`,
  title: `Media ${wordpressId}`,
  mimeType: 'image/png',
  originalUrl:
    uploadsPath === null
      ? `https://cleverblog.pl/?attachment_id=${wordpressId}`
      : `https://cleverblog.pl/wp-content/uploads/${uploadsPath}`,
  uploadsPath,
  pathSource: uploadsPath === null ? null : 'attached-file',
  reason: uploadsPath === null ? 'no-path' : 'missing-file',
})

describe('applyMediaDecisions', () => {
  it('carries a decision and replacementNote when wordpressId and uploadsPath both match', () => {
    const current = [
      unresolved(262, '2021/02/image.png'),
      unresolved(263, '2021/02/image-1.png'),
    ]

    const decisions: MediaDecisionEntry[] = [
      {
        wordpressId: 262,
        uploadsPath: '2021/02/image.png',
        decision: 'replace',
        replacementNote: 'Use the approved replacement asset.',
      },
      {
        wordpressId: 263,
        uploadsPath: '2021/02/image-1.png',
        decision: 'retire',
      },
    ]

    expect(applyMediaDecisions(current, decisions)).toEqual([
      {
        wordpressId: 262,
        slug: 'media-262',
        originalUrl:
          'https://cleverblog.pl/wp-content/uploads/2021/02/image.png',
        uploadsPath: '2021/02/image.png',
        pathSource: 'attached-file',
        reason: 'missing-file',
        status: 'unresolved',
        decision: 'replace',
        replacementNote: 'Use the approved replacement asset.',
      },
      {
        wordpressId: 263,
        slug: 'media-263',
        originalUrl:
          'https://cleverblog.pl/wp-content/uploads/2021/02/image-1.png',
        uploadsPath: '2021/02/image-1.png',
        pathSource: 'attached-file',
        reason: 'missing-file',
        status: 'unresolved',
        decision: 'retire',
      },
    ])
  })

  it('throws when the wordpressId exists but the decision uploadsPath no longer matches', () => {
    const current = [unresolved(262, '2021/02/image.png')]

    const decisions: MediaDecisionEntry[] = [
      {
        wordpressId: 262,
        uploadsPath: '2021/04/image.png',
        decision: 'recover',
      },
    ]

    expect(() => applyMediaDecisions(current, decisions)).toThrow(
      /stale uploadsPath/,
    )
  })

  it('leaves every issue undecided when decisions is empty', () => {
    const result = applyMediaDecisions(
      [
        unresolved(262, '2021/02/image.png'),
        unresolved(263, '2021/02/image-1.png'),
      ],
      [],
    )

    expect(result.map((issue) => issue.decision)).toEqual([null, null])
    expect(result[0]).not.toHaveProperty('replacementNote')
    expect(result[1]).not.toHaveProperty('replacementNote')
  })

  it('carries replace without replacementNote and leaves that validation to the gate', () => {
    const result = applyMediaDecisions(
      [unresolved(262, '2021/02/image.png')],
      [
        {
          wordpressId: 262,
          uploadsPath: '2021/02/image.png',
          decision: 'replace',
        },
      ],
    )

    expect(result[0].decision).toBe('replace')
    expect(result[0]).not.toHaveProperty('replacementNote')
  })
})
