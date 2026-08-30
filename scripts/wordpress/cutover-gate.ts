import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  publicUrlExpectedKey,
} from './build-public-url-source'
import {
  buildUrlInventory,
  deriveMissingFromPayload,
  writeUrlInventory,
} from './build-url-inventory'
import {
  buildPathStyleReport,
  extractInternalReferences,
  loadCrawlerInputs,
  pathStyleReportsEquivalent,
  readPathStyleReport,
} from './crawl-links'
import {
  selectApprovedComments,
} from './map-comments'

import type {
  PublicUrlExpected,
} from './build-public-url-source'
import type {
  UrlInventoryReport,
  UrlInventorySource,
} from './build-url-inventory'
import type {
  PathStyleUrlsReport,
} from './crawl-links'
import type {
  WpCommentItem,
} from './map-comments'
import type {
  NormalizedPost,
} from './types'
import type {
  getPayload,
} from 'payload'

const REPORTS_DIR = path.join(
  process.cwd(),
  'migration-data/reports',
)

const GATE_PATH = path.join(
  REPORTS_DIR,
  'cutover-gate.json',
)

const BROKEN_LINKS_PATH = path.join(
  REPORTS_DIR,
  'broken-links.json',
)

const RAW_COMMENTS_PATH = path.join(
  process.cwd(),
  'migration-data/raw/comments.json',
)

const NORMALIZED_POSTS_PATH = path.join(
  process.cwd(),
  'migration-data/normalized/posts.json',
)

const NORMALIZED_PAGES_PATH = path.join(
  process.cwd(),
  'migration-data/normalized/pages.json',
)

const FETCH_TIMEOUT_MS = 5_000
const FETCH_CONCURRENCY = 8

type PayloadClient =
  Awaited<ReturnType<typeof getPayload>>

type RecordValue =
  Record<string, unknown>

export const IMPLEMENTED_CUTOVER_CHECKS = [
  'source-derived public URL universe',
  'expected Payload presence and public visibility',
  'legacy query redirect existence and target',
  'published unrewritten WordPress media URLs',
  'relevant unresolved media decisions and replacement notes',
  'comments coverage check',
  '100% source content reconciliation',
  'canonical/sitemap/robots/RSS checks',
  'full crawler/archive inventory',
  'broken internal links scan',
] as const

export const PENDING_CUTOVER_CHECKS:
  readonly string[] = []

export type CutoverCoverage = {
  implemented: string[]
  pending: string[]
}

export const DEFAULT_CUTOVER_COVERAGE:
  CutoverCoverage = {
    implemented: [
      ...IMPLEMENTED_CUTOVER_CHECKS,
    ],
    pending: [
      ...PENDING_CUTOVER_CHECKS,
    ],
  }

export type CommentsCoverageResult = {
  sourceApproved: number
  payloadApproved: number
  missingWordPressIds: number[]
  extraWordPressIds: number[]
  invalidPayloadCommentIds:
    Array<string | number>
  nonPublishedPostCommentWordPressIds:
    number[]
}

export type ContentReconciliationFinding = {
  collection: 'posts' | 'pages'
  wordpressId: number
  reasons: string[]
}

export type ContentReconciliationResult = {
  expected: number
  reconciled: number
  findings:
    ContentReconciliationFinding[]
}

export type DiscoveryFinding = {
  code:
    | 'discovery-unreachable'
    | 'discovery-invalid'
    | 'rendered-route-unavailable'
    | 'canonical-mismatch'
  url: string
  message: string
}

export type DiscoveryCoverageResult = {
  serverOrigin: string | null
  endpointsChecked: number
  renderedRoutesChecked: number
  findings: DiscoveryFinding[]
}

export type CrawlerCoverageResult = {
  stale: boolean
  staleReason: string | null
  report: PathStyleUrlsReport
}

export type BrokenLinkFinding = {
  sourceCollection: 'posts' | 'pages'
  sourceWordPressId: number
  attribute: 'href' | 'src'
  url: string
  reason:
    | 'wp-upload-leak'
    | 'legacy-redirect-missing'
    | 'http-status'
    | 'unreachable'
  detail: string
}

export type BrokenLinksReport = {
  generatedAt: string
  serverOrigin: string | null
  checkedReferences: number
  uniqueFetchedUrls: number
  scanError: string | null
  findings: BrokenLinkFinding[]
}

export type CutoverCoverageAudit = {
  comments: CommentsCoverageResult
  content: ContentReconciliationResult
  discovery: DiscoveryCoverageResult
  crawler: CrawlerCoverageResult
  brokenLinks: BrokenLinksReport
}

export type BlockerCode =
  | 'unresolved-media-decision'
  | 'unresolved-media-replacement-note'
  | 'unrewritten-media-url'
  | 'missing-from-payload'
  | 'payload-not-public'
  | 'missing-redirect'
  | 'mismatched-redirect'
  | 'comments-coverage-mismatch'
  | 'comment-post-not-public'
  | 'content-reconciliation'
  | 'discovery-unreachable'
  | 'discovery-invalid'
  | 'rendered-route-unavailable'
  | 'canonical-mismatch'
  | 'crawler-inventory-stale'
  | 'uncovered-legacy-path'
  | 'broken-links-unreachable'
  | 'broken-internal-link'
  | 'gate-coverage-incomplete'
  | 'gate-error'

export type GateBlocker = {
  code: BlockerCode
  message: string
  collection?: string
  wordpressId?: number
  slug?: string
  fromURL?: string
  payloadId?: string | number
  urls?: string[]
  pendingChecks?: string[]
  details?: string[]
}

export type CoverageCheckCounts = {
  approvedCommentsExpected: number
  approvedCommentsPayload: number
  commentCoverageIssues: number
  commentsWithNonPublicPost: number
  sourceContentExpected: number
  sourceContentReconciled: number
  sourceContentIssues: number
  discoveryEndpointsChecked: number
  renderedContentRoutesChecked: number
  discoveryIssues: number
  crawlerInternalHrefOccurrences: number
  crawlerUniqueInternalPaths: number
  crawlerUncoveredPaths: number
  brokenInternalReferencesChecked: number
  brokenInternalLinks: number
}

export type CutoverGateReport = {
  generatedAt: string
  status: 'ready' | 'blocked'
  coverage: CutoverCoverage & {
    checks: CoverageCheckCounts
  }
  checks: {
    expectedPublicUrls: number
    missingFromPayload: number
    payloadNotPublic: number
    redirectSources: number
    missingRedirects: number
    mismatchedRedirects: number
    publishedUnrewrittenMediaEntries: number
    pendingRelevantMediaDecisions: number
    missingReplacementNotes: number
  }
  blockers: GateBlocker[]
}

const isRecord = (
  value: unknown,
): value is RecordValue =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)

const message = (
  error: unknown,
): string =>
  error instanceof Error
    ? error.message
    : String(error)

const relationshipId = (
  value: unknown,
): string | number | null => {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return value
  }

  if (isRecord(value)) {
    const id = value.id

    if (
      typeof id === 'string' ||
      typeof id === 'number'
    ) {
      return id
    }
  }

  return null
}

const positiveInteger = (
  value: unknown,
  label: string,
): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
          /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer`,
    )
  }

  return parsed
}

const readJson = async (
  filePath: string,
): Promise<unknown> =>
  JSON.parse(
    await readFile(filePath, 'utf8'),
  ) as unknown

const identity = (
  item: PublicUrlExpected,
): Pick<
  GateBlocker,
  | 'collection'
  | 'wordpressId'
  | 'slug'
  | 'fromURL'
> =>
  item.collection === 'tags'
    ? {
        collection:
          item.collection,
        slug: item.slug,
        fromURL: item.fromURL,
      }
    : {
        collection:
          item.collection,
        wordpressId:
          item.wordpressId,
        fromURL: item.fromURL,
      }

const count = (
  blockers: GateBlocker[],
  code: BlockerCode,
): number =>
  blockers.filter(
    (item) => item.code === code,
  ).length

const contentKey = (
  collection: 'posts' | 'pages',
  wordpressId: number,
): string =>
  `${collection}:wp:${wordpressId}`

const uploadPath = (
  url: string,
): string | null => {
  const marker =
    '/wp-content/uploads/'
  const index =
    url.toLowerCase().indexOf(marker)

  if (index < 0) return null

  return (
    url
      .slice(index + marker.length)
      .split(/[?#]/, 1)[0] || null
  )
}

const assertInventory = (
  inventory: UrlInventoryReport,
): void => {
  const expected = new Set<string>()

  for (const item of inventory.expected) {
    const key =
      publicUrlExpectedKey(item)

    if (expected.has(key)) {
      throw new Error(
        `Inventory has duplicate expected source: ${key}`,
      )
    }

    expected.add(key)
  }

  const sources =
    new Map<
      string,
      UrlInventoryReport['sources'][number]
    >()

  for (const source of inventory.sources) {
    const key =
      publicUrlExpectedKey(
        source.expected,
      )

    if (!expected.has(key)) {
      throw new Error(
        `Inventory source ${key} is outside expected[]`,
      )
    }

    if (sources.has(key)) {
      throw new Error(
        `Inventory has duplicate resolved source: ${key}`,
      )
    }

    sources.set(key, source)
  }

  const checks = new Set<string>()

  for (
    const check of
    inventory.redirectChecks
  ) {
    const key =
      publicUrlExpectedKey(
        check.expected,
      )
    const source = sources.get(key)

    if (!source) {
      throw new Error(
        `Redirect check ${key} has no resolved Payload source`,
      )
    }

    if (checks.has(key)) {
      throw new Error(
        `Inventory has duplicate redirect check: ${key}`,
      )
    }

    if (
      String(check.payloadId) !==
      String(source.payloadId)
    ) {
      throw new Error(
        `Redirect check ${key} targets a different Payload ID`,
      )
    }

    checks.add(key)
  }

  for (const key of sources.keys()) {
    if (!checks.has(key)) {
      throw new Error(
        `Inventory is missing redirect check for ${key}`,
      )
    }
  }
}

const findPublishedPostByPayloadId =
  async (
    payload: PayloadClient,
    payloadId: string | number,
  ): Promise<boolean> => {
    const result = await payload.find({
      collection: 'posts',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          {
            id: {
              equals:
                payloadId as never,
            },
          },
          {
            _status: {
              equals: 'published',
            },
          },
        ],
      } as never,
    })

    return result.docs.length === 1
  }

const runCommentsCoverage =
  async (
    payload: PayloadClient,
  ): Promise<CommentsCoverageResult> => {
    const raw = await readJson(
      RAW_COMMENTS_PATH,
    )

    if (!Array.isArray(raw)) {
      throw new Error(
        'comments.json must be an array',
      )
    }

    const approved =
      selectApprovedComments(
        raw as WpCommentItem[],
      )

    const sourceIds = new Set<number>()

    for (const comment of approved) {
      const wordpressId =
        positiveInteger(
          comment.comment_ID,
          'approved comment_ID',
        )

      if (sourceIds.has(wordpressId)) {
        throw new Error(
          `Duplicate approved WordPress comment wp:${wordpressId}`,
        )
      }

      sourceIds.add(wordpressId)
    }

    const result = await payload.find({
      collection: 'comments',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      where: {
        status: {
          equals: 'approved',
        },
      },
    })

    const payloadIds =
      new Set<number>()
    const invalidPayloadCommentIds:
      Array<string | number> = []
    const postChecks =
      new Map<
        string,
        Promise<boolean>
      >()
    const nonPublished =
      new Set<number>()

    for (const rawDoc of result.docs) {
      const doc =
        rawDoc as unknown as RecordValue
      const documentId =
        relationshipId(doc.id) ??
        String(doc.id)

      let wordpressId: number

      try {
        wordpressId =
          positiveInteger(
            doc.legacyWordPressId,
            `Payload comment ${String(
              documentId,
            )}.legacyWordPressId`,
          )
      } catch {
        invalidPayloadCommentIds.push(
          typeof documentId ===
            'string' ||
            typeof documentId ===
              'number'
            ? documentId
            : String(documentId),
        )
        continue
      }

      payloadIds.add(wordpressId)

      const postId =
        relationshipId(doc.post)

      if (postId === null) {
        nonPublished.add(wordpressId)
        continue
      }

      const cacheKey =
        String(postId)

      let promise =
        postChecks.get(cacheKey)

      if (!promise) {
        promise =
          findPublishedPostByPayloadId(
            payload,
            postId,
          )
        postChecks.set(
          cacheKey,
          promise,
        )
      }

      if (!(await promise)) {
        nonPublished.add(wordpressId)
      }
    }

    return {
      sourceApproved:
        sourceIds.size,
      payloadApproved:
        result.docs.length,
      missingWordPressIds:
        [...sourceIds]
          .filter(
            (id) =>
              !payloadIds.has(id),
          )
          .sort((a, b) => a - b),
      extraWordPressIds:
        [...payloadIds]
          .filter(
            (id) =>
              !sourceIds.has(id),
          )
          .sort((a, b) => a - b),
      invalidPayloadCommentIds,
      nonPublishedPostCommentWordPressIds:
        [...nonPublished].sort(
          (a, b) => a - b,
        ),
    }
  }

const normalizedMap = (
  value: unknown,
  label: string,
): Map<number, NormalizedPost> => {
  if (!Array.isArray(value)) {
    throw new Error(
      `${label} must be an array`,
    )
  }

  const result =
    new Map<number, NormalizedPost>()

  for (
    const [index, raw] of
    value.entries()
  ) {
    if (!isRecord(raw)) {
      throw new Error(
        `${label}[${index}] must be an object`,
      )
    }

    const wordpressId =
      positiveInteger(
        raw.wordpressId,
        `${label}[${index}].wordpressId`,
      )

    if (result.has(wordpressId)) {
      throw new Error(
        `${label} contains duplicate wp:${wordpressId}`,
      )
    }

    result.set(
      wordpressId,
      raw as unknown as NormalizedPost,
    )
  }

  return result
}

const findPublishedContentDoc =
  async (
    payload: PayloadClient,
    collection: 'posts' | 'pages',
    wordpressId: number,
  ): Promise<RecordValue | null> => {
    const result = await payload.find({
      collection,
      depth: 0,
      limit: 2,
      overrideAccess: true,
      where: {
        and: [
          {
            'legacy.wordpressId': {
              equals:
                wordpressId,
            },
          },
          {
            _status: {
              equals:
                'published',
            },
          },
        ],
      } as never,
    })

    if (result.docs.length > 1) {
      throw new Error(
        `Multiple published Payload ${collection} resolve wp:${wordpressId}`,
      )
    }

    return result.docs[0]
      ? (result.docs[0] as unknown as RecordValue)
      : null
  }

const runContentReconciliation =
  async (
    payload: PayloadClient,
    inventory: UrlInventoryReport,
  ): Promise<ContentReconciliationResult> => {
    const postMap =
      normalizedMap(
        await readJson(
          NORMALIZED_POSTS_PATH,
        ),
        'normalized/posts.json',
      )

    const pageMap =
      normalizedMap(
        await readJson(
          NORMALIZED_PAGES_PATH,
        ),
        'normalized/pages.json',
      )

    const findings:
      ContentReconciliationFinding[] = []

    const expected = inventory.expected.filter(
      (
        item,
      ): item is {
        collection: 'posts' | 'pages'
        wordpressId: number
        fromURL: string
      } =>
        item.collection === 'posts' ||
        item.collection === 'pages',
    )

    for (const item of expected) {
      const source =
        item.collection === 'posts'
          ? postMap.get(
              item.wordpressId,
            )
          : pageMap.get(
              item.wordpressId,
            )

      const reasons: string[] = []

      if (!source) {
        findings.push({
          collection:
            item.collection,
          wordpressId:
            item.wordpressId,
          reasons: [
            'normalized source record is missing',
          ],
        })
        continue
      }

      if (source.status !== 'publish') {
        reasons.push(
          `normalized source status is ${JSON.stringify(
            source.status,
          )}, expected publish`,
        )
      }

      const target =
        await findPublishedContentDoc(
          payload,
          item.collection,
          item.wordpressId,
        )

      if (!target) {
        reasons.push(
          'published Payload document is missing',
        )
      } else {
        const legacy =
          isRecord(target.legacy)
            ? target.legacy
            : {}

        if (
          legacy.originalHTML !==
          source.originalHTML
        ) {
          reasons.push(
            'legacy.originalHTML differs byte-for-byte from normalized source',
          )
        }

        if (
          legacy.sourceHash !==
          source.sourceHash
        ) {
          reasons.push(
            'legacy.sourceHash differs from normalized sourceHash',
          )
        }

        if (
          source.originalHTML.length >
            0 &&
          (
            typeof legacy.renderHTML !==
              'string' ||
            legacy.renderHTML.length ===
              0
          )
        ) {
          reasons.push(
            'legacy.renderHTML is empty while originalHTML is non-empty',
          )
        }
      }

      if (reasons.length > 0) {
        findings.push({
          collection:
            item.collection,
          wordpressId:
            item.wordpressId,
          reasons,
        })
      }
    }

    return {
      expected: expected.length,
      reconciled:
        expected.length -
        findings.length,
      findings,
    }
  }

const parseServerOrigin = ():
  | {
      origin: string
      error: null
    }
  | {
      origin: null
      error: string
    } => {
  const raw =
    process.env.NEXT_PUBLIC_SERVER_URL

  if (!raw?.trim()) {
    return {
      origin: null,
      error:
        'NEXT_PUBLIC_SERVER_URL is missing',
    }
  }

  try {
    const parsed =
      new URL(raw.trim())

    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:'
    ) {
      return {
        origin: null,
        error:
          'NEXT_PUBLIC_SERVER_URL must use http or https',
      }
    }

    if (
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return {
        origin: null,
        error:
          'NEXT_PUBLIC_SERVER_URL must be an origin without path, query, or hash',
      }
    }

    return {
      origin: parsed.origin,
      error: null,
    }
  } catch {
    return {
      origin: null,
      error:
        'NEXT_PUBLIC_SERVER_URL is not a valid URL',
    }
  }
}

type FetchResult = {
  url: string
  status: number | null
  body: string
  error: string | null
}

const fetchText = async (
  url: string,
): Promise<FetchResult> => {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal:
        AbortSignal.timeout(
          FETCH_TIMEOUT_MS,
        ),
    })

    return {
      url,
      status: response.status,
      body: await response.text(),
      error: null,
    }
  } catch (error) {
    return {
      url,
      status: null,
      body: '',
      error: message(error),
    }
  }
}

const mapWithConcurrency =
  async <T, R>(
    values: T[],
    limit: number,
    worker: (
      value: T,
      index: number,
    ) => Promise<R>,
  ): Promise<R[]> => {
    const output =
      new Array<R>(values.length)

    if (values.length === 0) {
      return output
    }

    let nextIndex = 0

    const runner = async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1

        if (index >= values.length) {
          return
        }

        output[index] =
          await worker(
            values[index]!,
            index,
          )
      }
    }

    await Promise.all(
      Array.from(
        {
          length: Math.min(
            limit,
            values.length,
          ),
        },
        () => runner(),
      ),
    )

    return output
  }

const decodeXmlEntities = (
  value: string,
): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const extractSitemapLocations = (
  xml: string,
): Set<string> =>
  new Set(
    [
      ...xml.matchAll(
        /<loc>([\s\S]*?)<\/loc>/gi,
      ),
    ].map((match) =>
      decodeXmlEntities(
        match[1]?.trim() ?? '',
      ),
    ),
  )

const tagAttribute = (
  tag: string,
  attribute: string,
): string | null => {
  const escaped =
    attribute.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )

  const match = tag.match(
    new RegExp(
      `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      'i',
    ),
  )

  return (
    match?.[1] ??
    match?.[2] ??
    match?.[3] ??
    null
  )
}

const canonicalHref = (
  html: string,
): string | null => {
  const tags =
    html.match(
      /<link\b[^>]*>/gi,
    ) ?? []

  for (const tag of tags) {
    const rel =
      tagAttribute(tag, 'rel')

    if (
      !rel
        ?.toLowerCase()
        .split(/\s+/)
        .includes('canonical')
    ) {
      continue
    }

    return tagAttribute(tag, 'href')
  }

  return null
}

export const validateRssDocument = (
  xml: string,
): {
  valid: boolean
  itemCount: number
} => {
  if (
    !/<rss\b[^>]*\bversion=["']2\.0["'][^>]*>/i.test(
      xml,
    ) ||
    !/<channel\b[^>]*>/i.test(xml)
  ) {
    return {
      valid: false,
      itemCount: 0,
    }
  }

  const withoutCdata = xml
    .replace(
      /<!\[CDATA\[[\s\S]*?\]\]>/g,
      'CDATA',
    )
    .replace(
      /<!--[\s\S]*?-->/g,
      '',
    )

  const stack: string[] = []
  const tags =
    withoutCdata.match(
      /<[^>]+>/g,
    ) ?? []

  let valid = true

  for (const rawTag of tags) {
    if (
      /^<\?/.test(rawTag) ||
      /^<!/.test(rawTag)
    ) {
      continue
    }

    const closing =
      /^<\//.test(rawTag)
    const selfClosing =
      /\/>$/.test(rawTag)
    const nameMatch =
      rawTag.match(
        /^<\/?\s*([A-Za-z_][\w:.-]*)/,
      )

    if (!nameMatch) {
      valid = false
      break
    }

    const name =
      nameMatch[1]!.toLowerCase()

    if (closing) {
      if (
        stack.pop() !== name
      ) {
        valid = false
        break
      }
    } else if (!selfClosing) {
      stack.push(name)
    }
  }

  if (stack.length !== 0) {
    valid = false
  }

  const itemCount =
    (
      xml.match(
        /<item\b[^>]*>/gi,
      ) ?? []
    ).length

  return {
    valid:
      valid &&
      /<\/channel>/i.test(xml) &&
      /<\/rss>/i.test(xml),
    itemCount,
  }
}

const publicContentRoutes = (
  inventory: UrlInventoryReport,
): Array<{
  collection: 'posts' | 'pages'
  wordpressId: number
  path: string
}> =>
  inventory.sources
    .filter(
      (
        source,
      ): source is UrlInventorySource & {
        expected: {
          collection: 'posts' | 'pages'
          wordpressId: number
          fromURL: string
        }
      } =>
        source.isPublic &&
        (
          source.expected.collection ===
            'posts' ||
          source.expected.collection ===
            'pages'
        ),
    )
    .map((source) => ({
      collection:
        source.expected.collection,
      wordpressId:
        source.expected.wordpressId,
      path:
        source.expected.collection ===
        'posts'
          ? `/articles/${source.payloadSlug}`
          : `/${source.payloadSlug}`,
    }))
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path),
    )

const runDiscoveryCoverage =
  async (
    inventory: UrlInventoryReport,
  ): Promise<DiscoveryCoverageResult> => {
    const server =
      parseServerOrigin()

    if (!server.origin) {
      return {
        serverOrigin: null,
        endpointsChecked: 0,
        renderedRoutesChecked: 0,
        findings: [
          {
            code:
              'discovery-unreachable',
            url:
              'NEXT_PUBLIC_SERVER_URL',
            message:
              server.error ??
              'discovery origin is unavailable',
          },
        ],
      }
    }

    const origin = server.origin
    const findings:
      DiscoveryFinding[] = []

    const [
      sitemap,
      robots,
      feed,
    ] = await Promise.all([
      fetchText(
        new URL(
          '/sitemap.xml',
          origin,
        ).href,
      ),
      fetchText(
        new URL(
          '/robots.txt',
          origin,
        ).href,
      ),
      fetchText(
        new URL(
          '/feed.xml',
          origin,
        ).href,
      ),
    ])

    for (const result of [
      sitemap,
      robots,
      feed,
    ]) {
      if (result.error) {
        findings.push({
          code:
            'discovery-unreachable',
          url: result.url,
          message:
            `Discovery endpoint is unreachable: ${result.error}`,
        })
      } else if (
        result.status !== 200
      ) {
        findings.push({
          code:
            'discovery-invalid',
          url: result.url,
          message:
            `Discovery endpoint returned HTTP ${String(
              result.status,
            )}, expected 200`,
        })
      }
    }

    const routes =
      publicContentRoutes(inventory)

    if (
      sitemap.status === 200 &&
      !sitemap.error
    ) {
      const locations =
        extractSitemapLocations(
          sitemap.body,
        )

      for (const route of routes) {
        const expectedUrl =
          new URL(
            route.path,
            origin,
          ).href

        if (
          !locations.has(expectedUrl)
        ) {
          findings.push({
            code:
              'discovery-invalid',
            url:
              new URL(
                '/sitemap.xml',
                origin,
              ).href,
            message:
              `Sitemap is missing ${expectedUrl}`,
          })
        }
      }
    }

    if (
      robots.status === 200 &&
      !robots.error &&
      !/^sitemap:\s*\S+/im.test(
        robots.body,
      )
    ) {
      findings.push({
        code:
          'discovery-invalid',
        url:
          new URL(
            '/robots.txt',
            origin,
          ).href,
        message:
          'robots.txt does not contain a Sitemap: directive',
      })
    }

    if (
      feed.status === 200 &&
      !feed.error
    ) {
      const rss =
        validateRssDocument(
          feed.body,
        )

      if (
        !rss.valid ||
        rss.itemCount < 1
      ) {
        findings.push({
          code:
            'discovery-invalid',
          url:
            new URL(
              '/feed.xml',
              origin,
            ).href,
          message:
            `feed.xml is not a valid RSS 2.0 document with at least one item (valid=${rss.valid}, items=${rss.itemCount})`,
        })
      }
    }

    const routeResults =
      await mapWithConcurrency(
        routes,
        FETCH_CONCURRENCY,
        async (route) => ({
          route,
          result:
            await fetchText(
              new URL(
                route.path,
                origin,
              ).href,
            ),
        }),
      )

    for (
      const {
        route,
        result,
      } of routeResults
    ) {
      if (result.error) {
        findings.push({
          code:
            'rendered-route-unavailable',
          url: result.url,
          message:
            `${route.collection} wp:${route.wordpressId} is unreachable: ${result.error}`,
        })
        continue
      }

      if (result.status !== 200) {
        findings.push({
          code:
            'rendered-route-unavailable',
          url: result.url,
          message:
            `${route.collection} wp:${route.wordpressId} returned HTTP ${String(
              result.status,
            )}, expected 200`,
        })
        continue
      }

      const canonical =
        canonicalHref(result.body)
      const expectedCanonical =
        new URL(
          route.path,
          origin,
        ).href

      let actualCanonical:
        string | null = null

      if (canonical) {
        try {
          actualCanonical =
            new URL(
              canonical,
              origin,
            ).href
        } catch {
          actualCanonical = null
        }
      }

      if (
        actualCanonical !==
        expectedCanonical
      ) {
        findings.push({
          code:
            'canonical-mismatch',
          url: result.url,
          message:
            `${route.collection} wp:${route.wordpressId} canonical is ${JSON.stringify(
              canonical,
            )}; expected ${expectedCanonical}`,
        })
      }
    }

    return {
      serverOrigin: origin,
      endpointsChecked: 3,
      renderedRoutesChecked:
        routes.length,
      findings,
    }
  }

const runCrawlerCoverage =
  async (): Promise<CrawlerCoverageResult> => {
    const inputs =
      await loadCrawlerInputs()

    const current =
      buildPathStyleReport(
        inputs.captures,
        inputs.publicUrlSource,
        'validation',
      )

    try {
      const committed =
        await readPathStyleReport()

      if (
        !pathStyleReportsEquivalent(
          committed,
          current,
        )
      ) {
        return {
          stale: true,
          staleReason:
            'committed path-style-urls.json does not match the current raw capture/classifier; run pnpm wordpress:crawl:links and commit the report',
          report: current,
        }
      }

      return {
        stale: false,
        staleReason: null,
        report: committed,
      }
    } catch (error) {
      return {
        stale: true,
        staleReason:
          `cannot consume committed path-style-urls.json: ${message(
            error,
          )}`,
        report: current,
      }
    }
  }

const isWordPressUploadPath = (
  url: string,
): boolean =>
  url
    .toLowerCase()
    .includes(
      '/wp-content/uploads/',
    )

const writeBrokenLinksReport =
  async (
    report: BrokenLinksReport,
  ): Promise<void> => {
    await mkdir(REPORTS_DIR, {
      recursive: true,
    })

    await writeFile(
      BROKEN_LINKS_PATH,
      `${JSON.stringify(
        report,
        null,
        2,
      )}\n`,
      'utf8',
    )
  }

const runBrokenLinksScan =
  async (
    payload: PayloadClient,
    inventory: UrlInventoryReport,
  ): Promise<BrokenLinksReport> => {
    const server =
      parseServerOrigin()

    if (!server.origin) {
      return {
        generatedAt:
          new Date().toISOString(),
        serverOrigin: null,
        checkedReferences: 0,
        uniqueFetchedUrls: 0,
        scanError:
          server.error ??
          'NEXT_PUBLIC_SERVER_URL is unavailable',
        findings: [],
      }
    }

    const origin = server.origin

    type ReferenceOccurrence = {
      sourceCollection:
        | 'posts'
        | 'pages'
      sourceWordPressId: number
      attribute: 'href' | 'src'
      url: string
    }

    const immediateFindings:
      BrokenLinkFinding[] = []

    const toFetch =
      new Map<
        string,
        ReferenceOccurrence[]
      >()

    const redirects =
      new Map(
        inventory.redirectChecks.map(
          (check) => [
            check.expected.fromURL,
            check,
          ],
        ),
      )

    let checkedReferences = 0

    const expectedContent = inventory.expected.filter(
      (
        item,
      ): item is {
        collection: 'posts' | 'pages'
        wordpressId: number
        fromURL: string
      } =>
        item.collection === 'posts' ||
        item.collection === 'pages',
    )

    for (
      const expected of
      expectedContent
    ) {
      const document =
        await findPublishedContentDoc(
          payload,
          expected.collection,
          expected.wordpressId,
        )

      if (!document) continue

      const legacy =
        isRecord(document.legacy)
          ? document.legacy
          : {}

      if (
        typeof legacy.renderHTML !==
        'string'
      ) {
        continue
      }

      const references =
        extractInternalReferences(
          legacy.renderHTML,
          ['href', 'src'],
        )

      checkedReferences +=
        references.length

      for (const reference of references) {
        const occurrence:
          ReferenceOccurrence = {
            sourceCollection:
              expected.collection,
            sourceWordPressId:
              expected.wordpressId,
            attribute:
              reference.attribute,
            url:
              reference.normalizedUrl,
          }

        if (
          isWordPressUploadPath(
            reference.normalizedUrl,
          )
        ) {
          immediateFindings.push({
            ...occurrence,
            reason:
              'wp-upload-leak',
            detail:
              'renderHTML still points to /wp-content/uploads/',
          })
          continue
        }

        const redirect =
          redirects.get(
            reference.normalizedUrl,
          )

        if (redirect) {
          if (
            redirect.status !== 'ok'
          ) {
            immediateFindings.push({
              ...occurrence,
              reason:
                'legacy-redirect-missing',
              detail:
                `legacy self-link has redirect status ${redirect.status}`,
            })
          }

          continue
        }

        const current =
          toFetch.get(
            reference.normalizedUrl,
          )

        if (current) {
          current.push(occurrence)
        } else {
          toFetch.set(
            reference.normalizedUrl,
            [occurrence],
          )
        }
      }
    }

    const uniqueUrls =
      [...toFetch.keys()].sort()

    const fetched =
      await mapWithConcurrency(
        uniqueUrls,
        FETCH_CONCURRENCY,
        async (url) => {
          const absolute =
            new URL(url, origin).href

          try {
            const response =
              await fetch(absolute, {
                redirect: 'follow',
                signal:
                  AbortSignal.timeout(
                    FETCH_TIMEOUT_MS,
                  ),
              })

            return {
              url,
              absolute,
              status:
                response.status,
              error: null as
                | string
                | null,
            }
          } catch (error) {
            return {
              url,
              absolute,
              status: null,
              error:
                message(error),
            }
          }
        },
      )

    const findings = [
      ...immediateFindings,
    ]

    for (const result of fetched) {
      const occurrences =
        toFetch.get(result.url) ?? []

      if (result.error) {
        for (const occurrence of
          occurrences) {
          findings.push({
            ...occurrence,
            reason: 'unreachable',
            detail:
              `${result.absolute} is unreachable: ${result.error}`,
          })
        }

        continue
      }

      if (
        result.status === null ||
        result.status < 200 ||
        result.status >= 300
      ) {
        for (const occurrence of
          occurrences) {
          findings.push({
            ...occurrence,
            reason: 'http-status',
            detail:
              `${result.absolute} returned HTTP ${String(
                result.status,
              )}`,
          })
        }
      }
    }

    findings.sort(
      (a, b) =>
        a.url.localeCompare(b.url) ||
        a.sourceCollection.localeCompare(
          b.sourceCollection,
        ) ||
        a.sourceWordPressId -
          b.sourceWordPressId ||
        a.attribute.localeCompare(
          b.attribute,
        ),
    )

    return {
      generatedAt:
        new Date().toISOString(),
      serverOrigin: origin,
      checkedReferences,
      uniqueFetchedUrls:
        uniqueUrls.length,
      scanError: null,
      findings,
    }
  }

const coverageCounts = (
  audit: CutoverCoverageAudit,
): CoverageCheckCounts => ({
  approvedCommentsExpected:
    audit.comments.sourceApproved,
  approvedCommentsPayload:
    audit.comments.payloadApproved,
  commentCoverageIssues:
    audit.comments
      .missingWordPressIds.length +
    audit.comments
      .extraWordPressIds.length +
    audit.comments
      .invalidPayloadCommentIds.length,
  commentsWithNonPublicPost:
    audit.comments
      .nonPublishedPostCommentWordPressIds
      .length,
  sourceContentExpected:
    audit.content.expected,
  sourceContentReconciled:
    audit.content.reconciled,
  sourceContentIssues:
    audit.content.findings.length,
  discoveryEndpointsChecked:
    audit.discovery.endpointsChecked,
  renderedContentRoutesChecked:
    audit.discovery
      .renderedRoutesChecked,
  discoveryIssues:
    audit.discovery.findings.length,
  crawlerInternalHrefOccurrences:
    audit.crawler.report.checks
      .internalHrefOccurrences,
  crawlerUniqueInternalPaths:
    audit.crawler.report.checks
      .uniqueInternalPaths,
  crawlerUncoveredPaths:
    audit.crawler.report.checks
      .uncovered,
  brokenInternalReferencesChecked:
    audit.brokenLinks
      .checkedReferences,
  brokenInternalLinks:
    audit.brokenLinks.findings.length,
})

export const evaluateGate = (
  inventory: UrlInventoryReport,
  audit: CutoverCoverageAudit,
  coverage: CutoverCoverage =
    DEFAULT_CUTOVER_COVERAGE,
): CutoverGateReport => {
  assertInventory(inventory)

  const blockers: GateBlocker[] = []

  for (
    const expected of
    deriveMissingFromPayload(
      inventory.expected,
      inventory.sources,
    )
  ) {
    blockers.push({
      code:
        'missing-from-payload',
      message:
        `${publicUrlExpectedKey(
          expected,
        )} is expected public content but is missing from Payload`,
      ...identity(expected),
    })
  }

  for (const source of inventory.sources) {
    if (source.isPublic) continue

    blockers.push({
      code:
        'payload-not-public',
      message:
        `${publicUrlExpectedKey(
          source.expected,
        )} exists as payload:${String(
          source.payloadId,
        )} but is not public (status=${source.payloadStatus ?? 'unknown'})`,
      ...identity(source.expected),
      payloadId: source.payloadId,
    })
  }

  const published =
    new Set<string>()

  for (
    const expected of
    inventory.expected
  ) {
    if (
      expected.collection ===
        'posts' ||
      expected.collection ===
        'pages'
    ) {
      published.add(
        contentKey(
          expected.collection,
          expected.wordpressId,
        ),
      )
    }
  }

  const publishedPaths =
    new Set<string>()

  for (
    const entry of
    inventory
      .unresolvedPublicIssues
      .unrewrittenMediaUrls
  ) {
    if (
      !published.has(
        contentKey(
          entry.collection,
          entry.wordpressId,
        ),
      )
    ) {
      continue
    }

    blockers.push({
      code:
        'unrewritten-media-url',
      message:
        `${entry.collection} wp:${entry.wordpressId} is source-published with ${entry.urls.length} unreconciled WordPress media URL(s)`,
      collection: entry.collection,
      wordpressId:
        entry.wordpressId,
      urls: entry.urls,
    })

    for (const url of entry.urls) {
      const rel = uploadPath(url)
      if (rel) {
        publishedPaths.add(rel)
      }
    }
  }

  for (
    const issue of
    inventory
      .unresolvedPublicIssues
      .mediaIssues
  ) {
    if (
      issue.decision === 'replace' &&
      !issue.replacementNote?.trim()
    ) {
      blockers.push({
        code:
          'unresolved-media-replacement-note',
        message:
          `Media wp:${issue.wordpressId} is marked replace but replacementNote is missing or empty`,
        wordpressId:
          issue.wordpressId,
      })
    }

    const original =
      uploadPath(issue.originalUrl)

    const relevant =
      (
        issue.uploadsPath !== null &&
        publishedPaths.has(
          issue.uploadsPath,
        )
      ) ||
      (
        original !== null &&
        publishedPaths.has(original)
      )

    if (
      relevant &&
      issue.decision === null
    ) {
      blockers.push({
        code:
          'unresolved-media-decision',
        message:
          `Media wp:${issue.wordpressId} (${issue.uploadsPath ?? issue.originalUrl}) has no recover/retire/replace decision`,
        wordpressId:
          issue.wordpressId,
      })
    }
  }

  for (
    const check of
    inventory.redirectChecks
  ) {
    if (check.status === 'missing') {
      blockers.push({
        code: 'missing-redirect',
        message:
          `No live redirect exists for ${check.expected.fromURL}`,
        ...identity(check.expected),
        payloadId: check.payloadId,
      })
    }

    if (
      check.status ===
      'mismatched'
    ) {
      blockers.push({
        code:
          'mismatched-redirect',
        message:
          `Redirect ${check.expected.fromURL} does not point to ${check.expected.collection} payload:${String(
            check.payloadId,
          )}`,
        ...identity(check.expected),
        payloadId: check.payloadId,
      })
    }
  }

  const comments =
    audit.comments

  if (
    comments.sourceApproved !==
      comments.payloadApproved ||
    comments.missingWordPressIds
      .length > 0 ||
    comments.extraWordPressIds
      .length > 0 ||
    comments.invalidPayloadCommentIds
      .length > 0
  ) {
    blockers.push({
      code:
        'comments-coverage-mismatch',
      message:
        `Approved comments do not reconcile: source=${comments.sourceApproved}, payload=${comments.payloadApproved}, missing=${comments.missingWordPressIds.length}, extra=${comments.extraWordPressIds.length}, invalid=${comments.invalidPayloadCommentIds.length}`,
      details: [
        `missing wp IDs: ${comments.missingWordPressIds.join(', ') || 'none'}`,
        `extra wp IDs: ${comments.extraWordPressIds.join(', ') || 'none'}`,
        `invalid Payload comments: ${comments.invalidPayloadCommentIds.join(', ') || 'none'}`,
      ],
    })
  }

  if (
    comments
      .nonPublishedPostCommentWordPressIds
      .length > 0
  ) {
    blockers.push({
      code:
        'comment-post-not-public',
      message:
        `${comments.nonPublishedPostCommentWordPressIds.length} approved comment(s) point to a post that is not published`,
      details: [
        `comment wp IDs: ${comments.nonPublishedPostCommentWordPressIds.join(
          ', ',
        )}`,
      ],
    })
  }

  for (
    const finding of
    audit.content.findings
  ) {
    blockers.push({
      code:
        'content-reconciliation',
      message:
        `${finding.collection} wp:${finding.wordpressId} failed source-content reconciliation: ${finding.reasons.join('; ')}`,
      collection:
        finding.collection,
      wordpressId:
        finding.wordpressId,
      details: [
        ...finding.reasons,
      ],
    })
  }

  for (
    const finding of
    audit.discovery.findings
  ) {
    blockers.push({
      code: finding.code,
      message: finding.message,
      fromURL: finding.url,
    })
  }

  if (audit.crawler.stale) {
    blockers.push({
      code:
        'crawler-inventory-stale',
      message:
        audit.crawler.staleReason ??
        'path-style-urls.json is stale',
    })
  }

  if (
    audit.crawler.report.uncovered
      .length > 0
  ) {
    blockers.push({
      code:
        'uncovered-legacy-path',
      message:
        `${audit.crawler.report.uncovered.length} internal legacy path(s) are not covered by a redirect or an existing route; see migration-data/reports/path-style-urls.json`,
      urls: [
        ...audit.crawler.report
          .uncovered,
      ],
    })
  }

  if (audit.brokenLinks.scanError) {
    blockers.push({
      code:
        'broken-links-unreachable',
      message:
        `Broken-link scan could not run: ${audit.brokenLinks.scanError}`,
    })
  }

  if (
    audit.brokenLinks.findings
      .length > 0
  ) {
    blockers.push({
      code:
        'broken-internal-link',
      message:
        `${audit.brokenLinks.findings.length} broken internal reference occurrence(s) detected; see migration-data/reports/broken-links.json`,
      urls: [
        ...new Set(
          audit.brokenLinks.findings.map(
            (finding) =>
              finding.url,
          ),
        ),
      ].sort(),
    })
  }

  if (coverage.pending.length > 0) {
    blockers.push({
      code:
        'gate-coverage-incomplete',
      message:
        `Cutover coverage is incomplete: ${coverage.pending.join(
          '; ',
        )}`,
      pendingChecks: [
        ...coverage.pending,
      ],
    })
  }

  return {
    generatedAt:
      new Date().toISOString(),
    status:
      blockers.length > 0
        ? 'blocked'
        : 'ready',
    coverage: {
      implemented: [
        ...coverage.implemented,
      ],
      pending: [
        ...coverage.pending,
      ],
      checks:
        coverageCounts(audit),
    },
    checks: {
      expectedPublicUrls:
        inventory.expected.length,
      missingFromPayload: count(
        blockers,
        'missing-from-payload',
      ),
      payloadNotPublic: count(
        blockers,
        'payload-not-public',
      ),
      redirectSources:
        inventory.redirectChecks.length,
      missingRedirects: count(
        blockers,
        'missing-redirect',
      ),
      mismatchedRedirects: count(
        blockers,
        'mismatched-redirect',
      ),
      publishedUnrewrittenMediaEntries:
        count(
          blockers,
          'unrewritten-media-url',
        ),
      pendingRelevantMediaDecisions:
        count(
          blockers,
          'unresolved-media-decision',
        ),
      missingReplacementNotes:
        count(
          blockers,
          'unresolved-media-replacement-note',
        ),
    },
    blockers,
  }
}

const emptyCoverageCounts =
  (): CoverageCheckCounts => ({
    approvedCommentsExpected: 0,
    approvedCommentsPayload: 0,
    commentCoverageIssues: 0,
    commentsWithNonPublicPost: 0,
    sourceContentExpected: 0,
    sourceContentReconciled: 0,
    sourceContentIssues: 0,
    discoveryEndpointsChecked: 0,
    renderedContentRoutesChecked: 0,
    discoveryIssues: 0,
    crawlerInternalHrefOccurrences: 0,
    crawlerUniqueInternalPaths: 0,
    crawlerUncoveredPaths: 0,
    brokenInternalReferencesChecked: 0,
    brokenInternalLinks: 0,
  })

const writeGate = async (
  report: CutoverGateReport,
): Promise<void> => {
  await mkdir(
    path.dirname(GATE_PATH),
    { recursive: true },
  )

  await writeFile(
    GATE_PATH,
    `${JSON.stringify(
      report,
      null,
      2,
    )}\n`,
    'utf8',
  )
}

const main = async (): Promise<void> => {
  try {
    const payloadConfigModule =
      '@payload-config'

    const [
      { default: config },
      { getPayload },
    ] = await Promise.all([
      import(payloadConfigModule),
      import('payload'),
    ])

    const payload =
      await getPayload({ config })

    const inventory =
      await buildUrlInventory(payload)

    await writeUrlInventory(inventory)

    const comments =
      await runCommentsCoverage(payload)

    const content =
      await runContentReconciliation(
        payload,
        inventory,
      )

    const crawler =
      await runCrawlerCoverage()

    const discovery =
      await runDiscoveryCoverage(
        inventory,
      )

    const brokenLinks =
      await runBrokenLinksScan(
        payload,
        inventory,
      )

    await writeBrokenLinksReport(
      brokenLinks,
    )

    const report = evaluateGate(
      inventory,
      {
        comments,
        content,
        discovery,
        crawler,
        brokenLinks,
      },
    )

    await writeGate(report)

    console.log(
      `cutover gate: ${report.status} (${report.blockers.length} blocker(s))`,
    )

    if (
      report.status === 'blocked'
    ) {
      process.exitCode = 1
    }
  } catch (error) {
    const blockers: GateBlocker[] = [
      {
        code: 'gate-error',
        message: message(error),
      },
    ]

    if (
      DEFAULT_CUTOVER_COVERAGE
        .pending.length > 0
    ) {
      blockers.push({
        code:
          'gate-coverage-incomplete',
        message:
          `Cutover coverage is incomplete: ${DEFAULT_CUTOVER_COVERAGE.pending.join(
            '; ',
          )}`,
        pendingChecks: [
          ...DEFAULT_CUTOVER_COVERAGE
            .pending,
        ],
      })
    }

    await writeGate({
      generatedAt:
        new Date().toISOString(),
      status: 'blocked',
      coverage: {
        implemented: [
          ...DEFAULT_CUTOVER_COVERAGE
            .implemented,
        ],
        pending: [
          ...DEFAULT_CUTOVER_COVERAGE
            .pending,
        ],
        checks:
          emptyCoverageCounts(),
      },
      checks: {
        expectedPublicUrls: 0,
        missingFromPayload: 0,
        payloadNotPublic: 0,
        redirectSources: 0,
        missingRedirects: 0,
        mismatchedRedirects: 0,
        publishedUnrewrittenMediaEntries: 0,
        pendingRelevantMediaDecisions: 0,
        missingReplacementNotes: 0,
      },
      blockers,
    })

    console.error(
      `cutover gate: blocked: ${message(
        error,
      )}`,
    )

    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]

if (
  invokedPath &&
  import.meta.url ===
    pathToFileURL(
      path.resolve(invokedPath),
    ).href
) {
  await main()
}
