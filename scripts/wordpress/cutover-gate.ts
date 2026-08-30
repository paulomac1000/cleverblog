import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { publicUrlExpectedKey } from './build-public-url-source'
import { buildUrlInventory, deriveMissingFromPayload, writeUrlInventory } from './build-url-inventory'
import type { PublicUrlExpected } from './build-public-url-source'
import type { UrlInventoryReport } from './build-url-inventory'

const GATE_PATH = path.join(process.cwd(), 'migration-data/reports/cutover-gate.json')

export const IMPLEMENTED_CUTOVER_CHECKS = [
  'source-derived public URL universe',
  'expected Payload presence and public visibility',
  'legacy query redirect existence and target',
  'published unrewritten WordPress media URLs',
  'relevant unresolved media decisions and replacement notes',
] as const

// CUTOVER COVERAGE CONTRACT: P3 round 2 deliberately does not implement these checks.
// The gate MUST stay blocked while this list is non-empty. Remove an item only in the
// phase that actually implements and tests that check.
export const PENDING_CUTOVER_CHECKS = [
  'full crawler/archive inventory',
  'broken internal links scan',
  'comments coverage check',
  'canonical/sitemap/robots/RSS checks',
  '100% source content reconciliation',
] as const

export type CutoverCoverage = { implemented: string[]; pending: string[] }

export const DEFAULT_CUTOVER_COVERAGE: CutoverCoverage = {
  implemented: [...IMPLEMENTED_CUTOVER_CHECKS],
  pending: [...PENDING_CUTOVER_CHECKS],
}

export type BlockerCode =
  | 'unresolved-media-decision'
  | 'unresolved-media-replacement-note'
  | 'unrewritten-media-url'
  | 'missing-from-payload'
  | 'payload-not-public'
  | 'missing-redirect'
  | 'mismatched-redirect'
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
}

export type CutoverGateReport = {
  generatedAt: string
  status: 'ready' | 'blocked'
  coverage: CutoverCoverage
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

const identity = (item: PublicUrlExpected): Pick<GateBlocker, 'collection' | 'wordpressId' | 'slug' | 'fromURL'> =>
  item.collection === 'tags'
    ? { collection: item.collection, slug: item.slug, fromURL: item.fromURL }
    : { collection: item.collection, wordpressId: item.wordpressId, fromURL: item.fromURL }

const count = (blockers: GateBlocker[], code: BlockerCode): number =>
  blockers.filter((item) => item.code === code).length

const contentKey = (collection: 'posts' | 'pages', wordpressId: number): string =>
  `${collection}:wp:${wordpressId}`

const uploadPath = (url: string): string | null => {
  const marker = '/wp-content/uploads/'
  const index = url.indexOf(marker)
  return index < 0 ? null : url.slice(index + marker.length).split(/[?#]/, 1)[0] || null
}

const assertInventory = (inventory: UrlInventoryReport): void => {
  const expected = new Set<string>()
  for (const item of inventory.expected) {
    const key = publicUrlExpectedKey(item)
    if (expected.has(key)) throw new Error(`Inventory has duplicate expected source: ${key}`)
    expected.add(key)
  }

  const sources = new Map<string, UrlInventoryReport['sources'][number]>()
  for (const source of inventory.sources) {
    const key = publicUrlExpectedKey(source.expected)
    if (!expected.has(key)) throw new Error(`Inventory source ${key} is outside expected[]`)
    if (sources.has(key)) throw new Error(`Inventory has duplicate resolved source: ${key}`)
    sources.set(key, source)
  }

  const checks = new Set<string>()
  for (const check of inventory.redirectChecks) {
    const key = publicUrlExpectedKey(check.expected)
    const source = sources.get(key)
    if (!source) throw new Error(`Redirect check ${key} has no resolved Payload source`)
    if (checks.has(key)) throw new Error(`Inventory has duplicate redirect check: ${key}`)
    if (String(check.payloadId) !== String(source.payloadId)) throw new Error(`Redirect check ${key} targets a different Payload ID`)
    checks.add(key)
  }

  for (const key of sources.keys()) {
    if (!checks.has(key)) throw new Error(`Inventory is missing redirect check for ${key}`)
  }
}

export const evaluateGate = (
  inventory: UrlInventoryReport,
  coverage: CutoverCoverage = DEFAULT_CUTOVER_COVERAGE,
): CutoverGateReport => {
  assertInventory(inventory)
  const blockers: GateBlocker[] = []

  for (const expected of deriveMissingFromPayload(inventory.expected, inventory.sources)) {
    blockers.push({
      code: 'missing-from-payload',
      message: `${publicUrlExpectedKey(expected)} is expected public content but is missing from Payload`,
      ...identity(expected),
    })
  }

  for (const source of inventory.sources) if (!source.isPublic) {
    blockers.push({
      code: 'payload-not-public',
      message: `${publicUrlExpectedKey(source.expected)} exists as payload:${String(source.payloadId)} but is not public (status=${source.payloadStatus ?? 'unknown'})`,
      ...identity(source.expected),
      payloadId: source.payloadId,
    })
  }

  const published = new Set<string>()
  for (const expected of inventory.expected) {
    if (expected.collection === 'posts' || expected.collection === 'pages') {
      published.add(contentKey(expected.collection, expected.wordpressId))
    }
  }

  const publishedPaths = new Set<string>()
  for (const entry of inventory.unresolvedPublicIssues.unrewrittenMediaUrls) {
    if (!published.has(contentKey(entry.collection, entry.wordpressId))) continue

    blockers.push({
      code: 'unrewritten-media-url',
      message: `${entry.collection} wp:${entry.wordpressId} is source-published with ${entry.urls.length} unreconciled WordPress media URL(s)`,
      collection: entry.collection,
      wordpressId: entry.wordpressId,
      urls: entry.urls,
    })

    for (const url of entry.urls) {
      const rel = uploadPath(url)
      if (rel) publishedPaths.add(rel)
    }
  }

  for (const issue of inventory.unresolvedPublicIssues.mediaIssues) {
    if (issue.decision === 'replace' && !issue.replacementNote?.trim()) {
      blockers.push({
        code: 'unresolved-media-replacement-note',
        message: `Media wp:${issue.wordpressId} is marked replace but replacementNote is missing or empty`,
        wordpressId: issue.wordpressId,
      })
    }

    const original = uploadPath(issue.originalUrl)
    const relevant =
      (issue.uploadsPath !== null && publishedPaths.has(issue.uploadsPath)) ||
      (original !== null && publishedPaths.has(original))

    if (relevant && issue.decision === null) {
      blockers.push({
        code: 'unresolved-media-decision',
        message: `Media wp:${issue.wordpressId} (${issue.uploadsPath ?? issue.originalUrl}) has no recover/retire/replace decision`,
        wordpressId: issue.wordpressId,
      })
    }
  }

  for (const check of inventory.redirectChecks) {
    if (check.status === 'missing') {
      blockers.push({
        code: 'missing-redirect',
        message: `No live redirect exists for ${check.expected.fromURL}`,
        ...identity(check.expected),
        payloadId: check.payloadId,
      })
    }

    if (check.status === 'mismatched') {
      blockers.push({
        code: 'mismatched-redirect',
        message: `Redirect ${check.expected.fromURL} does not point to ${check.expected.collection} payload:${String(check.payloadId)}`,
        ...identity(check.expected),
        payloadId: check.payloadId,
      })
    }
  }

  if (coverage.pending.length) {
    blockers.push({
      code: 'gate-coverage-incomplete',
      message: `Cutover coverage is incomplete: ${coverage.pending.join('; ')}`,
      pendingChecks: [...coverage.pending],
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    status: blockers.length ? 'blocked' : 'ready',
    coverage: { implemented: [...coverage.implemented], pending: [...coverage.pending] },
    checks: {
      expectedPublicUrls: inventory.expected.length,
      missingFromPayload: count(blockers, 'missing-from-payload'),
      payloadNotPublic: count(blockers, 'payload-not-public'),
      redirectSources: inventory.redirectChecks.length,
      missingRedirects: count(blockers, 'missing-redirect'),
      mismatchedRedirects: count(blockers, 'mismatched-redirect'),
      publishedUnrewrittenMediaEntries: count(blockers, 'unrewritten-media-url'),
      pendingRelevantMediaDecisions: count(blockers, 'unresolved-media-decision'),
      missingReplacementNotes: count(blockers, 'unresolved-media-replacement-note'),
    },
    blockers,
  }
}

const writeGate = async (report: CutoverGateReport): Promise<void> => {
  await mkdir(path.dirname(GATE_PATH), { recursive: true })
  await writeFile(GATE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const main = async (): Promise<void> => {
  try {
    const payloadConfigModule = '@payload-config'
    const [{ default: config }, { getPayload }] = await Promise.all([
      import(payloadConfigModule),
      import('payload'),
    ])

    const inventory = await buildUrlInventory(await getPayload({ config }))
    await writeUrlInventory(inventory)

    const report = evaluateGate(inventory)
    await writeGate(report)

    console.log(`cutover gate: ${report.status} (${report.blockers.length} blocker(s))`)
    if (report.status === 'blocked') process.exitCode = 1
  } catch (error) {
    const pending = [...DEFAULT_CUTOVER_COVERAGE.pending]
    const blockers: GateBlocker[] = [
      { code: 'gate-error', message: message(error) },
    ]

    if (pending.length) {
      blockers.push({
        code: 'gate-coverage-incomplete',
        message: `Cutover coverage is incomplete: ${pending.join('; ')}`,
        pendingChecks: pending,
      })
    }

    await writeGate({
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      coverage: {
        implemented: [...DEFAULT_CUTOVER_COVERAGE.implemented],
        pending,
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

    console.error(`cutover gate: blocked: ${message(error)}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) await main()
