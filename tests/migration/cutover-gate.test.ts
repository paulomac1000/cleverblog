import { describe, expect, it } from 'vitest'

import { evaluateGate } from '../../scripts/wordpress/cutover-gate'

import type { CutoverCoverage } from '../../scripts/wordpress/cutover-gate'
import type { UrlInventoryReport } from '../../scripts/wordpress/build-url-inventory'

const completeCoverage: CutoverCoverage = {
  implemented: ['test fixture'],
  pending: [],
}

const emptyInventory = (): UrlInventoryReport => ({
  generatedAt: '2026-08-30T10:00:00.000Z',
  sourceGeneratedAt: '2026-08-30T09:00:00.000Z',
  wordpressSource: {
    posts: 0,
    pages: 0,
    categories: 0,
    tags: 0,
  },
  expected: [],
  sources: [],
  missingFromPayload: [],
  notPublicInPayload: [],
  redirectChecks: [],
  unresolvedPublicIssues: {
    unrewrittenMediaUrls: [],
    mediaIssues: [],
  },
})

describe('P3 cutover gate', () => {
  it('stays blocked when source-published wp:202 disappears from Payload', () => {
    const inventory = emptyInventory()
    inventory.wordpressSource.posts = 1
    inventory.expected = [
      {
        collection: 'posts',
        wordpressId: 202,
        fromURL: '/?p=202',
      },
    ]

    // Regression defense: the gate must derive missing/public relevance from
    // expected[], not trust a target-derived missing list or stale annotation.
    inventory.missingFromPayload = []
    inventory.unresolvedPublicIssues.unrewrittenMediaUrls = [
      {
        collection: 'posts',
        wordpressId: 202,
        urls: [
          '2021/02/image-1.png',
          '2021/02/image.png',
        ],
        currentlyPublished: false,
      },
    ]

    const report = evaluateGate(inventory, completeCoverage)
    const codes = report.blockers.map((blocker) => blocker.code)

    expect(report.status).toBe('blocked')
    expect(codes).toContain('missing-from-payload')
    expect(codes).toContain('unrewritten-media-url')
    expect(report.checks.missingFromPayload).toBe(1)
    expect(report.checks.publishedUnrewrittenMediaEntries).toBe(1)
  })

  it('requires replacementNote for replace decisions and accepts a non-empty note', () => {
    const withoutNote = emptyInventory()
    withoutNote.unresolvedPublicIssues.mediaIssues = [
      {
        wordpressId: 262,
        slug: 'image',
        originalUrl: 'https://cleverblog.pl/wp-content/uploads/2021/02/image.png',
        uploadsPath: '2021/02/image.png',
        pathSource: 'guid',
        status: 'unresolved',
        decision: 'replace',
        relevantToPublishedContent: true,
      },
    ]

    const blocked = evaluateGate(withoutNote, completeCoverage)

    expect(blocked.status).toBe('blocked')
    expect(blocked.blockers.map((blocker) => blocker.code)).toContain(
      'unresolved-media-replacement-note',
    )
    expect(blocked.blockers.map((blocker) => blocker.code)).not.toContain(
      'unresolved-media-decision',
    )

    const withNote = emptyInventory()
    withNote.unresolvedPublicIssues.mediaIssues = [
      {
        ...withoutNote.unresolvedPublicIssues.mediaIssues[0]!,
        replacementNote:
          'Replace with a newly selected editorial image; do not reuse 2021/04 files.',
      },
    ]

    const ready = evaluateGate(withNote, completeCoverage)

    expect(ready.status).toBe('ready')
    expect(ready.blockers).toEqual([])
  })

  it('always blocks while coverage.pending is non-empty', () => {
    const report = evaluateGate(emptyInventory(), {
      implemented: ['source-derived public URL universe'],
      pending: ['broken internal links scan'],
    })

    expect(report.status).toBe('blocked')
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'gate-coverage-incomplete',
          pendingChecks: ['broken internal links scan'],
        }),
      ]),
    )
  })
})
