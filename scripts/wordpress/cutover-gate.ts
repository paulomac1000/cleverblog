import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildUrlInventory, writeUrlInventory } from './build-url-inventory'

import type { UrlInventoryReport, UrlInventorySource } from './build-url-inventory'

const REPORTS_DIR = path.join(process.cwd(), 'migration-data/reports')
const GATE_PATH = path.join(REPORTS_DIR, 'cutover-gate.json')

type BlockerCode =
  | 'unresolved-media-decision'
  | 'unrewritten-media-url'
  | 'missing-redirect'
  | 'mismatched-redirect'
  | 'gate-error'

type GateBlocker = {
  code: BlockerCode
  message: string
  collection?: string
  wordpressId?: number
  fromURL?: string
  payloadId?: string | number
  urls?: string[]
}

type CutoverGateReport = {
  generatedAt: string
  status: 'ready' | 'blocked'
  checks: {
    redirectSources: number
    missingRedirects: number
    mismatchedRedirects: number
    publishedUnrewrittenMediaEntries: number
    pendingRelevantMediaDecisions: number
  }
  blockers: GateBlocker[]
}

type PayloadClient = Awaited<ReturnType<typeof getPayload>>

const writeGateReport = async (report: CutoverGateReport): Promise<void> => {
  await mkdir(REPORTS_DIR, { recursive: true })
  await writeFile(GATE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

const checkRedirect = async (
  payload: PayloadClient,
  source: UrlInventorySource,
): Promise<GateBlocker | null> => {
  const result = await payload.find({
    collection: 'redirects',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { from: { equals: source.fromURL } },
  })
  const redirect = result.docs[0]
  if (!redirect) {
    return {
      code: 'missing-redirect',
      message: `No live redirect exists for ${source.fromURL}`,
      collection: source.relationTo,
      wordpressId: source.wordpressId,
      fromURL: source.fromURL,
      payloadId: source.payloadId,
    }
  }

  const reference = redirect.to?.type === 'reference' ? redirect.to.reference : null
  const rawValue = reference?.value
  const value = typeof rawValue === 'object' && rawValue !== null && 'id' in rawValue
    ? (rawValue as { id?: unknown }).id
    : rawValue

  if (reference?.relationTo === source.relationTo && String(value) === String(source.payloadId)) {
    return null
  }

  return {
    code: 'mismatched-redirect',
    message: `Redirect ${source.fromURL} does not point to ${source.relationTo} payload:${String(source.payloadId)}`,
    collection: source.relationTo,
    wordpressId: source.wordpressId,
    fromURL: source.fromURL,
    payloadId: source.payloadId,
  }
}

const count = (blockers: GateBlocker[], code: BlockerCode): number =>
  blockers.filter((blocker) => blocker.code === code).length

const evaluateGate = async (
  payload: PayloadClient,
  inventory: UrlInventoryReport,
): Promise<CutoverGateReport> => {
  const blockers: GateBlocker[] = []

  for (const issue of inventory.unresolvedPublicIssues.mediaIssues) {
    if (issue.relevantToPublishedContent && issue.decision === null) {
      blockers.push({
        code: 'unresolved-media-decision',
        message: `Media wp:${issue.wordpressId} (${issue.uploadsPath ?? issue.originalUrl}) is referenced by published content and has no recover/retire decision`,
        wordpressId: issue.wordpressId,
      })
    }
  }

  for (const entry of inventory.unresolvedPublicIssues.unrewrittenMediaUrls) {
    if (entry.currentlyPublished) {
      blockers.push({
        code: 'unrewritten-media-url',
        message: `${entry.collection} wp:${entry.wordpressId} is published with ${entry.urls.length} unreconciled WordPress media URL(s)`,
        collection: entry.collection,
        wordpressId: entry.wordpressId,
        urls: entry.urls,
      })
    }
  }

  for (const source of inventory.sources) {
    const blocker = await checkRedirect(payload, source)
    if (blocker) blockers.push(blocker)
  }

  return {
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? 'ready' : 'blocked',
    checks: {
      redirectSources: inventory.sources.length,
      missingRedirects: count(blockers, 'missing-redirect'),
      mismatchedRedirects: count(blockers, 'mismatched-redirect'),
      publishedUnrewrittenMediaEntries: count(blockers, 'unrewritten-media-url'),
      pendingRelevantMediaDecisions: count(blockers, 'unresolved-media-decision'),
    },
    blockers,
  }
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const main = async (): Promise<void> => {
  try {
    const payload = await getPayload({ config })
    const inventory = await buildUrlInventory(payload)
    await writeUrlInventory(inventory)
    const report = await evaluateGate(payload, inventory)
    await writeGateReport(report)
    console.log(`cutover gate: ${report.status} (${report.blockers.length} blocker(s))`)
    if (report.status === 'blocked') process.exitCode = 1
  } catch (error) {
    const report: CutoverGateReport = {
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      checks: {
        redirectSources: 0,
        missingRedirects: 0,
        mismatchedRedirects: 0,
        publishedUnrewrittenMediaEntries: 0,
        pendingRelevantMediaDecisions: 0,
      },
      blockers: [{ code: 'gate-error', message: errorMessage(error) }],
    }
    await writeGateReport(report)
    console.error(`cutover gate: blocked: ${errorMessage(error)}`)
    process.exitCode = 1
  }
}

await main()
