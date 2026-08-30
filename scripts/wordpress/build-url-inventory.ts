import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildRedirectSpecs } from './map-redirects'
import { loadLiveRedirectSources } from './redirect-sources'

import type { RedirectCollection } from './map-redirects'

const REPORTS_DIR = path.join(process.cwd(), 'migration-data/reports')
const INVENTORY_PATH = path.join(REPORTS_DIR, 'url-inventory.json')

type ContentCollection = 'posts' | 'pages'
type PayloadClient = Awaited<ReturnType<typeof getPayload>>
type UnrewrittenMediaEntry = { collection: ContentCollection; wordpressId: number; urls: string[] }
type MediaIssue = {
  wordpressId: number
  slug: string
  originalUrl: string
  uploadsPath: string | null
  pathSource: string | null
  status: string
  decision: 'recover' | 'retire' | null
}

export type UrlInventorySource = {
  sourceClass: 'published-post-query' | 'published-page-query' | 'category-archive-query' | 'tag-archive-query'
  fromURL: string
  relationTo: RedirectCollection
  payloadId: string | number
  wordpressId: number
  slug: string
}

export type UrlInventoryReport = {
  generatedAt: string
  sources: UrlInventorySource[]
  unresolvedPublicIssues: {
    unrewrittenMediaUrls: Array<UnrewrittenMediaEntry & { currentlyPublished: boolean }>
    mediaIssues: Array<MediaIssue & { relevantToPublishedContent: boolean }>
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const positiveId = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

const readReport = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(REPORTS_DIR, name), 'utf8')) as unknown

const parseUnrewritten = (value: unknown): UnrewrittenMediaEntry[] => {
  if (!Array.isArray(value)) throw new Error('unrewritten-media-urls.json must be an array')
  return value.map((entry, index) => {
    if (!isRecord(entry) || (entry.collection !== 'posts' && entry.collection !== 'pages')) {
      throw new Error(`unrewritten-media-urls.json[${index}] is invalid`)
    }
    if (!Array.isArray(entry.urls) || !entry.urls.every((url) => typeof url === 'string')) {
      throw new Error(`unrewritten-media-urls.json[${index}].urls must be a string array`)
    }
    return {
      collection: entry.collection,
      wordpressId: positiveId(entry.wordpressId, `unrewritten-media-urls.json[${index}].wordpressId`),
      urls: entry.urls,
    }
  })
}

const parseMediaIssues = (value: unknown): MediaIssue[] => {
  if (!isRecord(value) || !Array.isArray(value.unresolved)) {
    throw new Error('media-issues.json must contain unresolved[]')
  }
  return value.unresolved.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`media-issues.json.unresolved[${index}] is invalid`)
    if (entry.decision !== null && entry.decision !== 'recover' && entry.decision !== 'retire') {
      throw new Error(`media-issues.json.unresolved[${index}].decision is invalid`)
    }
    if (entry.uploadsPath !== null && typeof entry.uploadsPath !== 'string') {
      throw new Error(`media-issues.json.unresolved[${index}].uploadsPath is invalid`)
    }
    if (entry.pathSource !== null && typeof entry.pathSource !== 'string') {
      throw new Error(`media-issues.json.unresolved[${index}].pathSource is invalid`)
    }
    return {
      wordpressId: positiveId(entry.wordpressId, `media-issues.json.unresolved[${index}].wordpressId`),
      slug: text(entry.slug, `media-issues.json.unresolved[${index}].slug`),
      originalUrl: text(entry.originalUrl, `media-issues.json.unresolved[${index}].originalUrl`),
      uploadsPath: entry.uploadsPath,
      pathSource: entry.pathSource,
      status: text(entry.status, `media-issues.json.unresolved[${index}].status`),
      decision: entry.decision,
    }
  })
}

const classFor = (collection: RedirectCollection): UrlInventorySource['sourceClass'] => {
  if (collection === 'posts') return 'published-post-query'
  if (collection === 'pages') return 'published-page-query'
  if (collection === 'categories') return 'category-archive-query'
  return 'tag-archive-query'
}

const uploadsPath = (url: string): string | null => {
  const marker = '/wp-content/uploads/'
  const index = url.indexOf(marker)
  return index < 0 ? null : url.slice(index + marker.length).split(/[?#]/, 1)[0] || null
}

const isPublished = async (payload: PayloadClient, entry: UnrewrittenMediaEntry): Promise<boolean> => {
  const result = await payload.find({
    collection: entry.collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { and: [
      { 'legacy.wordpressId': { equals: entry.wordpressId } },
      { _status: { equals: 'published' } },
    ] },
  })
  return result.docs.length > 0
}

export const buildUrlInventory = async (payload: PayloadClient): Promise<UrlInventoryReport> => {
  const liveSources = await loadLiveRedirectSources(payload)
  const specs = buildRedirectSpecs(liveSources)
  const specByTarget = new Map(
    specs.map((spec) => [`${spec.toURL.relationTo}:${String(spec.toURL.value)}`, spec]),
  )

  const sources = liveSources.map((source): UrlInventorySource => {
    const spec = specByTarget.get(`${source.collection}:${String(source.payloadId)}`)
    if (!spec) throw new Error(`No inventory redirect for ${source.collection} payload:${String(source.payloadId)}`)
    return {
      sourceClass: classFor(source.collection),
      fromURL: spec.fromURL,
      relationTo: source.collection,
      payloadId: source.payloadId,
      wordpressId: source.wordpressId,
      slug: source.slug,
    }
  }).sort((a, b) => a.fromURL.localeCompare(b.fromURL))

  const annotatedUnrewritten: UrlInventoryReport['unresolvedPublicIssues']['unrewrittenMediaUrls'] = []
  for (const entry of parseUnrewritten(await readReport('unrewritten-media-urls.json'))) {
    annotatedUnrewritten.push({ ...entry, currentlyPublished: await isPublished(payload, entry) })
  }

  const publishedPaths = new Set<string>()
  for (const entry of annotatedUnrewritten) {
    if (!entry.currentlyPublished) continue
    for (const url of entry.urls) {
      const pathValue = uploadsPath(url)
      if (pathValue) publishedPaths.add(pathValue)
    }
  }

  const mediaIssues = parseMediaIssues(await readReport('media-issues.json')).map((issue) => {
    const originalPath = uploadsPath(issue.originalUrl)
    return {
      ...issue,
      relevantToPublishedContent:
        (issue.uploadsPath !== null && publishedPaths.has(issue.uploadsPath)) ||
        (originalPath !== null && publishedPaths.has(originalPath)),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    sources,
    unresolvedPublicIssues: { unrewrittenMediaUrls: annotatedUnrewritten, mediaIssues },
  }
}

export const writeUrlInventory = async (report: UrlInventoryReport): Promise<void> => {
  await mkdir(REPORTS_DIR, { recursive: true })
  await writeFile(INVENTORY_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

const main = async (): Promise<void> => {
  const report = await buildUrlInventory(await getPayload({ config }))
  await writeUrlInventory(report)
  console.log(`URL inventory: ${report.sources.length} redirect source(s)`)
  console.log('wrote migration-data/reports/url-inventory.json')
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) await main()
