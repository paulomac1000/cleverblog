import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { publicUrlExpectedKey, readPublicUrlSource } from './build-public-url-source'
import type { PublicUrlExpected, PublicUrlSource } from './build-public-url-source'
import type { getPayload } from 'payload'

const REPORTS_DIR = path.join(process.cwd(), 'migration-data/reports')
const INVENTORY_PATH = path.join(REPORTS_DIR, 'url-inventory.json')

type PayloadClient = Awaited<ReturnType<typeof getPayload>>
type ContentCollection = 'posts' | 'pages'
type MediaDecision = 'recover' | 'retire' | 'replace' | null
type RecordValue = Record<string, unknown>

export type UrlInventorySource = {
  expected: PublicUrlExpected
  payloadId: string | number
  payloadSlug: string
  payloadStatus: string | null
  isPublic: boolean
}

export type UrlRedirectCheck = {
  expected: PublicUrlExpected
  payloadId: string | number
  status: 'ok' | 'missing' | 'mismatched'
  actualRelationTo?: string | null
  actualPayloadId?: string | number | null
}

export type UrlInventoryReport = {
  generatedAt: string
  sourceGeneratedAt: string
  wordpressSource: PublicUrlSource['wordpressSource']
  expected: PublicUrlExpected[]
  sources: UrlInventorySource[]
  missingFromPayload: PublicUrlExpected[]
  notPublicInPayload: Array<{
    expected: PublicUrlExpected
    payloadId: string | number
    payloadStatus: string | null
  }>
  redirectChecks: UrlRedirectCheck[]
  unresolvedPublicIssues: {
    unrewrittenMediaUrls: Array<{
      collection: ContentCollection
      wordpressId: number
      urls: string[]
      currentlyPublished: boolean
    }>
    mediaIssues: Array<{
      wordpressId: number
      slug: string
      originalUrl: string
      uploadsPath: string | null
      pathSource: string | null
      status: string
      decision: MediaDecision
      replacementNote?: string | null
      relevantToPublishedContent: boolean
    }>
  }
}

const record = (value: unknown, label: string): RecordValue => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as RecordValue
}

const positiveId = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

const string = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

const nonEmpty = (value: unknown, label: string): string => {
  const result = string(value, label).trim()
  if (!result) throw new Error(`${label} must not be empty`)
  return result
}

const readReport = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(REPORTS_DIR, name), 'utf8')) as unknown

const expectedWhere = (expected: PublicUrlExpected): RecordValue => {
  if (expected.collection === 'tags') return { slug: { equals: expected.slug } }
  if (expected.collection === 'categories') return { legacyWordPressId: { equals: expected.wordpressId } }
  return { 'legacy.wordpressId': { equals: expected.wordpressId } }
}

const findDocs = async (
  payload: PayloadClient,
  expected: PublicUrlExpected,
  options: { draft?: boolean; publishedOnly?: boolean } = {},
): Promise<RecordValue[]> => {
  const identity = expectedWhere(expected)
  const content = expected.collection === 'posts' || expected.collection === 'pages'
  const result = await payload.find({
    collection: expected.collection,
    depth: 0,
    limit: 2,
    overrideAccess: true,
    ...(options.draft ? { draft: true } : {}),
    where: (options.publishedOnly && content
      ? { and: [identity, { _status: { equals: 'published' } }] }
      : identity) as never,
  })
  if (result.docs.length > 1) throw new Error(`Multiple Payload targets resolve ${publicUrlExpectedKey(expected)}`)
  return result.docs.map((doc) => doc as unknown as RecordValue)
}

const sourceFrom = (expected: PublicUrlExpected, doc: RecordValue, isPublic: boolean): UrlInventorySource => {
  if (typeof doc.id !== 'string' && typeof doc.id !== 'number') throw new Error(`${publicUrlExpectedKey(expected)} has invalid Payload ID`)
  return {
    expected,
    payloadId: doc.id,
    payloadSlug: nonEmpty(doc.slug, `${publicUrlExpectedKey(expected)}.slug`),
    payloadStatus: typeof doc._status === 'string' ? doc._status : null,
    isPublic,
  }
}

const findSource = async (payload: PayloadClient, expected: PublicUrlExpected): Promise<UrlInventorySource | null> => {
  if (expected.collection === 'posts' || expected.collection === 'pages') {
    const published = await findDocs(payload, expected, { publishedOnly: true })
    if (published[0]) return sourceFrom(expected, published[0], true)
    const anyVersion = await findDocs(payload, expected, { draft: true })
    return anyVersion[0] ? sourceFrom(expected, anyVersion[0], false) : null
  }
  const visible = await findDocs(payload, expected)
  return visible[0] ? sourceFrom(expected, visible[0], true) : null
}

const redirectTarget = (doc: RecordValue): { relationTo: string | null; id: string | number | null } => {
  const to = typeof doc.to === 'object' && doc.to !== null && !Array.isArray(doc.to) ? doc.to as RecordValue : null
  const ref = to?.type === 'reference' && typeof to.reference === 'object' && to.reference !== null && !Array.isArray(to.reference)
    ? to.reference as RecordValue
    : null
  const raw = ref?.value
  const nested = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'id' in raw ? (raw as RecordValue).id : raw
  return {
    relationTo: typeof ref?.relationTo === 'string' ? ref.relationTo : null,
    id: typeof nested === 'string' || typeof nested === 'number' ? nested : null,
  }
}

const checkRedirect = async (payload: PayloadClient, source: UrlInventorySource): Promise<UrlRedirectCheck> => {
  const result = await payload.find({
    collection: 'redirects', depth: 0, limit: 2, overrideAccess: true,
    where: { from: { equals: source.expected.fromURL } },
  })
  if (result.docs.length > 1) throw new Error(`Multiple live redirects exist for ${source.expected.fromURL}`)
  if (!result.docs[0]) return { expected: source.expected, payloadId: source.payloadId, status: 'missing' }
  const actual = redirectTarget(result.docs[0] as unknown as RecordValue)
  const matches = actual.relationTo === source.expected.collection && actual.id !== null && String(actual.id) === String(source.payloadId)
  return {
    expected: source.expected,
    payloadId: source.payloadId,
    status: matches ? 'ok' : 'mismatched',
    actualRelationTo: actual.relationTo,
    actualPayloadId: actual.id,
  }
}

export const deriveMissingFromPayload = (expected: PublicUrlExpected[], sources: UrlInventorySource[]): PublicUrlExpected[] => {
  const found = new Set(sources.map((source) => publicUrlExpectedKey(source.expected)))
  return expected.filter((item) => !found.has(publicUrlExpectedKey(item)))
}

const parseUnrewritten = (value: unknown): Array<{ collection: ContentCollection; wordpressId: number; urls: string[] }> => {
  if (!Array.isArray(value)) throw new Error('unrewritten-media-urls.json must be an array')
  return value.map((raw, index) => {
    const item = record(raw, `unrewritten-media-urls.json[${index}]`)
    if (item.collection !== 'posts' && item.collection !== 'pages') throw new Error(`unrewritten-media-urls.json[${index}].collection is invalid`)
    if (!Array.isArray(item.urls) || !item.urls.every((url) => typeof url === 'string')) throw new Error(`unrewritten-media-urls.json[${index}].urls must be a string array`)
    return { collection: item.collection, wordpressId: positiveId(item.wordpressId, `unrewritten-media-urls.json[${index}].wordpressId`), urls: item.urls }
  })
}

const parseMediaIssues = (value: unknown): UrlInventoryReport['unresolvedPublicIssues']['mediaIssues'] => {
  const root = record(value, 'media-issues.json')
  if (!Array.isArray(root.unresolved)) throw new Error('media-issues.json must contain unresolved[]')
  return root.unresolved.map((raw, index) => {
    const item = record(raw, `media-issues.json.unresolved[${index}]`)
    if (item.decision !== null && item.decision !== 'recover' && item.decision !== 'retire' && item.decision !== 'replace') {
      throw new Error(`media-issues.json.unresolved[${index}].decision is invalid`)
    }
    if (item.uploadsPath !== null && typeof item.uploadsPath !== 'string') throw new Error(`media-issues.json.unresolved[${index}].uploadsPath is invalid`)
    if (item.pathSource !== null && typeof item.pathSource !== 'string') throw new Error(`media-issues.json.unresolved[${index}].pathSource is invalid`)
    if (item.replacementNote !== undefined && item.replacementNote !== null && typeof item.replacementNote !== 'string') throw new Error(`media-issues.json.unresolved[${index}].replacementNote is invalid`)
    return {
      wordpressId: positiveId(item.wordpressId, `media-issues.json.unresolved[${index}].wordpressId`),
      slug: string(item.slug, `media-issues.json.unresolved[${index}].slug`),
      originalUrl: string(item.originalUrl, `media-issues.json.unresolved[${index}].originalUrl`),
      uploadsPath: item.uploadsPath,
      pathSource: item.pathSource,
      status: string(item.status, `media-issues.json.unresolved[${index}].status`),
      decision: item.decision,
      ...(item.replacementNote !== undefined ? { replacementNote: item.replacementNote } : {}),
      relevantToPublishedContent: false,
    }
  })
}

const contentKey = (collection: ContentCollection, wordpressId: number): string => `${collection}:wp:${wordpressId}`

const uploadPath = (url: string): string | null => {
  const marker = '/wp-content/uploads/'
  const index = url.indexOf(marker)
  return index < 0 ? null : url.slice(index + marker.length).split(/[?#]/, 1)[0] || null
}

export const buildUrlInventory = async (payload: PayloadClient): Promise<UrlInventoryReport> => {
  const source = await readPublicUrlSource()
  const sources: UrlInventorySource[] = []
  for (const expected of source.expected) {
    const live = await findSource(payload, expected)
    if (live) sources.push(live)
  }

  const redirectChecks: UrlRedirectCheck[] = []
  for (const live of sources) redirectChecks.push(await checkRedirect(payload, live))

  const published = new Set<string>()
  for (const expected of source.expected) {
    if (expected.collection === 'posts' || expected.collection === 'pages') published.add(contentKey(expected.collection, expected.wordpressId))
  }

  const unrewritten = parseUnrewritten(await readReport('unrewritten-media-urls.json')).map((entry) => ({
    ...entry,
    currentlyPublished: published.has(contentKey(entry.collection, entry.wordpressId)),
  }))

  const publishedPaths = new Set<string>()
  for (const entry of unrewritten) if (entry.currentlyPublished) for (const url of entry.urls) {
    const rel = uploadPath(url)
    if (rel) publishedPaths.add(rel)
  }

  const mediaIssues = parseMediaIssues(await readReport('media-issues.json')).map((issue) => {
    const original = uploadPath(issue.originalUrl)
    return {
      ...issue,
      relevantToPublishedContent:
        (issue.uploadsPath !== null && publishedPaths.has(issue.uploadsPath)) ||
        (original !== null && publishedPaths.has(original)),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: source.generatedAt,
    wordpressSource: source.wordpressSource,
    expected: source.expected,
    sources: sources.sort((a, b) => a.expected.fromURL.localeCompare(b.expected.fromURL)),
    missingFromPayload: deriveMissingFromPayload(source.expected, sources),
    notPublicInPayload: sources.filter((item) => !item.isPublic).map((item) => ({ expected: item.expected, payloadId: item.payloadId, payloadStatus: item.payloadStatus })),
    redirectChecks: redirectChecks.sort((a, b) => a.expected.fromURL.localeCompare(b.expected.fromURL)),
    unresolvedPublicIssues: { unrewrittenMediaUrls: unrewritten, mediaIssues },
  }
}

export const writeUrlInventory = async (report: UrlInventoryReport): Promise<void> => {
  await mkdir(REPORTS_DIR, { recursive: true })
  await writeFile(INVENTORY_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

const main = async (): Promise<void> => {
  const payloadConfigModule = '@payload-config'
  const [{ default: config }, { getPayload }] = await Promise.all([import(payloadConfigModule), import('payload')])
  const report = await buildUrlInventory(await getPayload({ config }))
  await writeUrlInventory(report)
  console.log(`URL inventory: ${report.expected.length} source-expected public URL(s); ${report.missingFromPayload.length} missing from Payload`)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) await main()
