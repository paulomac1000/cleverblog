import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

type ImportStatus = 'created' | 'repaired' | 'unchanged'

type ImportReport = {
  allowlisted: number
  created: number
  repaired: number
  unchanged: number
  imported: Array<{
    payloadId: number
    status: ImportStatus
    wordpressId: number
  }>
}

const report = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'migration-data/reports/pending-comments-import.json'),
    'utf8',
  ),
) as ImportReport

describe('pending comment import report', () => {
  it('uses the current importer status vocabulary and consistent counters', () => {
    expect(report.imported).toHaveLength(report.allowlisted)
    expect(report.created).toBe(
      report.imported.filter((comment) => comment.status === 'created').length,
    )
    expect(report.repaired).toBe(
      report.imported.filter((comment) => comment.status === 'repaired').length,
    )
    expect(report.unchanged).toBe(
      report.imported.filter((comment) => comment.status === 'unchanged').length,
    )
    expect(report.imported.map((comment) => comment.status)).not.toContain('updated')
  })
})
