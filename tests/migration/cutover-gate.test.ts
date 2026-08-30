import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  evaluateGate,
  validateRssDocument,
} from '../../scripts/wordpress/cutover-gate'

import type {
  BrokenLinksReport,
  CutoverCoverage,
  CutoverCoverageAudit,
} from '../../scripts/wordpress/cutover-gate'
import type {
  UrlInventoryReport,
} from '../../scripts/wordpress/build-url-inventory'
import type {
  PathStyleUrlsReport,
} from '../../scripts/wordpress/crawl-links'

const completeCoverage:
  CutoverCoverage = {
    implemented: [
      'test fixture',
    ],
    pending: [],
  }

const emptyPathReport =
  (): PathStyleUrlsReport => ({
    version: 'p3-links-v1',
    generatedAt:
      '2026-08-30T10:00:00.000Z',
    sourceFingerprint:
      'fixture',
    checks: {
      scannedDocuments: 0,
      internalHrefOccurrences: 0,
      uniqueInternalPaths: 0,
      coveredByRedirect: 0,
      coveredByRoute: 0,
      uncovered: 0,
    },
    legacyPaths: [],
    uncovered: [],
  })

const emptyBrokenLinks =
  (): BrokenLinksReport => ({
    generatedAt:
      '2026-08-30T10:00:00.000Z',
    serverOrigin:
      'https://cleverblog.pl',
    checkedReferences: 0,
    uniqueFetchedUrls: 0,
    scanError: null,
    findings: [],
  })

const cleanAudit =
  (): CutoverCoverageAudit => ({
    comments: {
      sourceApproved: 0,
      payloadApproved: 0,
      missingWordPressIds: [],
      extraWordPressIds: [],
      invalidPayloadCommentIds: [],
      nonPublishedPostCommentWordPressIds:
        [],
    },
    content: {
      expected: 0,
      reconciled: 0,
      findings: [],
    },
    discovery: {
      serverOrigin:
        'https://cleverblog.pl',
      endpointsChecked: 3,
      renderedRoutesChecked: 0,
      findings: [],
    },
    crawler: {
      stale: false,
      staleReason: null,
      report: emptyPathReport(),
    },
    brokenLinks:
      emptyBrokenLinks(),
  })

const emptyInventory =
  (): UrlInventoryReport => ({
    generatedAt:
      '2026-08-30T10:00:00.000Z',
    sourceGeneratedAt:
      '2026-08-30T09:00:00.000Z',
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
    const inventory =
      emptyInventory()

    inventory.wordpressSource.posts = 1
    inventory.expected = [
      {
        collection: 'posts',
        wordpressId: 202,
        fromURL: '/?p=202',
      },
    ]

    // Regression defense: expected[] is source-derived.
    inventory.missingFromPayload = []

    inventory.unresolvedPublicIssues.unrewrittenMediaUrls =
      [
        {
          collection: 'posts',
          wordpressId: 202,
          urls: [
            'https://cleverblog.pl/wp-content/uploads/2021/02/image-1.png',
            'https://cleverblog.pl/wp-content/uploads/2021/02/image.png',
          ],
          currentlyPublished:
            false,
        },
      ]

    const report = evaluateGate(
      inventory,
      cleanAudit(),
      completeCoverage,
    )

    const codes =
      report.blockers.map(
        (blocker) =>
          blocker.code,
      )

    expect(report.status).toBe(
      'blocked',
    )
    expect(codes).toContain(
      'missing-from-payload',
    )
    expect(codes).toContain(
      'unrewritten-media-url',
    )
    expect(
      report.checks
        .missingFromPayload,
    ).toBe(1)
    expect(
      report.checks
        .publishedUnrewrittenMediaEntries,
    ).toBe(1)
  })

  it('requires replacementNote for replace decisions and accepts a non-empty note', () => {
    const withoutNote =
      emptyInventory()

    withoutNote.unresolvedPublicIssues.mediaIssues =
      [
        {
          wordpressId: 262,
          slug: 'image',
          originalUrl:
            'https://cleverblog.pl/wp-content/uploads/2021/02/image.png',
          uploadsPath:
            '2021/02/image.png',
          pathSource: 'guid',
          status: 'unresolved',
          decision: 'replace',
          relevantToPublishedContent:
            true,
        },
      ]

    const blocked = evaluateGate(
      withoutNote,
      cleanAudit(),
      completeCoverage,
    )

    expect(blocked.status).toBe(
      'blocked',
    )

    expect(
      blocked.blockers.map(
        (blocker) =>
          blocker.code,
      ),
    ).toContain(
      'unresolved-media-replacement-note',
    )

    const withNote =
      emptyInventory()

    withNote.unresolvedPublicIssues.mediaIssues =
      [
        {
          ...withoutNote
            .unresolvedPublicIssues
            .mediaIssues[0]!,
          replacementNote:
            'Use the approved replacement asset.',
        },
      ]

    const ready = evaluateGate(
      withNote,
      cleanAudit(),
      completeCoverage,
    )

    expect(ready.status).toBe(
      'ready',
    )
    expect(ready.blockers).toEqual(
      [],
    )
  })

  it('accepts explicit retire decisions once the published unrewritten reference is gone', () => {
    const inventory =
      emptyInventory()

    inventory.unresolvedPublicIssues.mediaIssues =
      [
        {
          wordpressId: 262,
          slug: 'image-18',
          originalUrl:
            'https://cleverblog.pl/wp-content/uploads/2021/02/image.png',
          uploadsPath:
            '2021/02/image.png',
          pathSource: 'guid',
          status: 'unresolved',
          decision: 'retire',
          relevantToPublishedContent:
            false,
        },
        {
          wordpressId: 263,
          slug: 'image-1-5',
          originalUrl:
            'https://cleverblog.pl/wp-content/uploads/2021/02/image-1.png',
          uploadsPath:
            '2021/02/image-1.png',
          pathSource: 'guid',
          status: 'unresolved',
          decision: 'retire',
          relevantToPublishedContent:
            false,
        },
      ]

    const report = evaluateGate(
      inventory,
      cleanAudit(),
      completeCoverage,
    )

    expect(report.status).toBe(
      'ready',
    )
    expect(
      report.blockers,
    ).toEqual([])
  })

  it('blocks on comments, content, crawler, discovery and broken-link coverage failures', () => {
    const audit =
      cleanAudit()

    audit.comments = {
      sourceApproved: 12,
      payloadApproved: 11,
      missingWordPressIds: [241],
      extraWordPressIds: [],
      invalidPayloadCommentIds: [],
      nonPublishedPostCommentWordPressIds:
        [194],
    }

    audit.content = {
      expected: 1,
      reconciled: 0,
      findings: [
        {
          collection: 'posts',
          wordpressId: 202,
          reasons: [
            'legacy.sourceHash differs from normalized sourceHash',
          ],
        },
      ],
    }

    audit.discovery.findings = [
      {
        code:
          'canonical-mismatch',
        url:
          'https://cleverblog.pl/articles/example',
        message:
          'canonical mismatch',
      },
    ]

    audit.crawler.report.uncovered =
      ['/legacy-path']

    audit.crawler.report.checks.uncovered =
      1

    audit.brokenLinks.findings = [
      {
        sourceCollection:
          'posts',
        sourceWordPressId: 202,
        attribute: 'href',
        url: '/missing',
        reason: 'http-status',
        detail:
          'returned HTTP 404',
      },
    ]

    const report = evaluateGate(
      emptyInventory(),
      audit,
      completeCoverage,
    )

    const codes =
      new Set(
        report.blockers.map(
          (blocker) =>
            blocker.code,
        ),
      )

    expect(report.status).toBe(
      'blocked',
    )
    expect(codes).toContain(
      'comments-coverage-mismatch',
    )
    expect(codes).toContain(
      'comment-post-not-public',
    )
    expect(codes).toContain(
      'content-reconciliation',
    )
    expect(codes).toContain(
      'canonical-mismatch',
    )
    expect(codes).toContain(
      'uncovered-legacy-path',
    )
    expect(codes).toContain(
      'broken-internal-link',
    )

    expect(
      report.coverage.checks
        .approvedCommentsExpected,
    ).toBe(12)

    expect(
      report.coverage.checks
        .crawlerUncoveredPaths,
    ).toBe(1)

    expect(
      report.coverage.checks
        .brokenInternalLinks,
    ).toBe(1)
  })

  it('blocks when the committed crawler report is stale', () => {
    const audit =
      cleanAudit()

    audit.crawler.stale = true
    audit.crawler.staleReason =
      'run wordpress:crawl:links'

    const report = evaluateGate(
      emptyInventory(),
      audit,
      completeCoverage,
    )

    expect(
      report.blockers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            'crawler-inventory-stale',
        }),
      ]),
    )
  })

  it('still honors an explicit non-empty pending coverage contract', () => {
    const report = evaluateGate(
      emptyInventory(),
      cleanAudit(),
      {
        implemented: [
          'source-derived public URL universe',
        ],
        pending: [
          'future manual check',
        ],
      },
    )

    expect(report.status).toBe(
      'blocked',
    )

    expect(
      report.blockers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code:
            'gate-coverage-incomplete',
          pendingChecks: [
            'future manual check',
          ],
        }),
      ]),
    )
  })
})

describe('RSS validation', () => {
  it('accepts a structurally valid RSS 2.0 feed with an item', () => {
    expect(
      validateRssDocument(
        '<?xml version="1.0"?><rss version="2.0"><channel><title>X</title><item><title>A</title></item></channel></rss>',
      ),
    ).toEqual({
      valid: true,
      itemCount: 1,
    })
  })

  it('rejects malformed or empty RSS', () => {
    expect(
      validateRssDocument(
        '<rss version="2.0"><channel></rss>',
      ).valid,
    ).toBe(false)

    expect(
      validateRssDocument(
        '<rss version="2.0"><channel></channel></rss>',
      ).itemCount,
    ).toBe(0)
  })
})
