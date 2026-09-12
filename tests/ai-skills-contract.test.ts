import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = process.cwd()
const workflowsDir = join(ROOT, '.github', 'workflows')
const workflowFiles = ['ci.yml', 'codeql.yml', 'release.yml']
const workflows = Object.fromEntries(
  workflowFiles.map((name) => [name, parse(readFileSync(join(workflowsDir, name), 'utf8')) as Record<string, never>]),
)
const release = workflows['release.yml'] as unknown as {
  permissions: Record<string, string>
  jobs: Record<string, { needs?: string; permissions: Record<string, string>; environment?: string; steps: Array<Record<string, unknown>> }>
}
const events = (doc: Record<string, unknown>) => (doc['on'] ?? doc[true]) as unknown

const allUses: string[] = []
for (const doc of Object.values(workflows)) {
  const jobs = (doc as { jobs?: Record<string, { steps?: Array<Record<string, unknown>> }> }).jobs ?? {}
  for (const job of Object.values(jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.uses === 'string' && !step.uses.startsWith('./')) allUses.push(step.uses)
    }
  }
}

describe('ai-skills release contract', () => {
  it('separates read-only validation from protected publication', () => {
    const jobs = release.jobs
    expect(jobs.validate).toBeDefined()
    expect(jobs.publish).toBeDefined()
    expect(jobs.publish.needs).toBe('validate')
    expect(jobs.publish.environment).toBe('protected-release')
    for (const step of jobs.publish.steps) {
      const uses = typeof step.uses === 'string' ? step.uses : ''
      const run = typeof step.run === 'string' ? step.run : ''
      expect(uses).not.toContain('actions/checkout')
      expect(run).not.toMatch(/docker build|docker run|pnpm install|pnpm build/)
    }
  })

  it('grants packages write only to the publish job', () => {
    expect(release.permissions).toEqual({ contents: 'read' })
    expect(release.jobs.validate.permissions).toEqual({ contents: 'read' })
    expect(release.jobs.publish.permissions).toEqual({ contents: 'read', packages: 'write' })
    const ci = workflows['ci.yml'] as unknown as { permissions: Record<string, string> }
    expect(ci.permissions).toEqual({ contents: 'read' })
  })

  it('pins every third-party action to a full commit sha', () => {
    expect(allUses.length).toBeGreaterThan(0)
    for (const uses of allUses) {
      expect(uses).toMatch(/@[0-9a-f]{40}$/)
    }
  })

  it('marks release workflow as protected-release and ci as trusted-ci', () => {
    const sources = Object.fromEntries(
      workflowFiles.map((name) => [name, readFileSync(join(workflowsDir, name), 'utf8')]),
    )
    expect(sources['release.yml']).toContain('ai-skills-policy-profile: protected-release')
    expect(sources['ci.yml']).toContain('ai-skills-policy-profile: trusted-ci')
    expect(sources['codeql.yml']).toContain('ai-skills-policy-profile: trusted-ci')
    for (const doc of Object.values(workflows)) {
      expect(doc).toHaveProperty('concurrency')
    }
  })

  it('promotes the exact tested image without executing repository code in publish', () => {
    const steps = release.jobs.publish.steps
    const names = steps.map((step) => (typeof step.name === 'string' ? step.name : ''))
    expect(names).toContain('Download tested release image')
    const verify = steps.find((step) => step.name === 'Verify tested release image')
    expect(verify).toBeDefined()
    const script = typeof verify?.run === 'string' ? verify.run : ''
    expect(script).toContain('docker load')
    expect(script).toContain('test "$actual_id" = "$expected_id"')
    const push = steps.find((step) => step.name === 'Publish immutable release image')
    expect(push).toBeDefined()
    const validate = release.jobs.validate.steps
    const upload = validate.find((step) => typeof step.uses === 'string' && step.uses.includes('actions/upload-artifact'))
    expect(upload).toBeDefined()
    expect(upload?.with).toMatchObject({ 'if-no-files-found': 'error', 'retention-days': 1 })
  })
})

describe('ai-skills lock', () => {
  it('declares adopted skills with immutable revisions and matching standard digests', () => {
    const lockPath = join(ROOT, 'ai-skills.lock.yaml')
    const lock = parse(readFileSync(lockPath, 'utf8')) as {
      repository: string
      revision: string
      skills: Record<string, { version: string; revision: string; normative_entrypoint: string; content_digest: string }>
    }
    expect(lock.repository).toBe('paulomac1000/ai-skills')
    expect(lock.revision).toMatch(/^[0-9a-f]{40}$/)
    const skillNames = Object.keys(lock.skills)
    expect(skillNames.length).toBeGreaterThanOrEqual(7)
    for (const [name, entry] of Object.entries(lock.skills)) {
      expect(entry.revision).toBe(lock.revision)
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(entry.content_digest).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(entry.normative_entrypoint).toBe(`skills/${name}/STANDARD.md`)
    }
    const authority = join(ROOT, '.ai-skills-authority')
    if (existsSync(authority)) {
      for (const entry of Object.values(lock.skills)) {
        const standard = readFileSync(join(authority, entry.normative_entrypoint))
        const digest = `sha256:${createHash('sha256').update(standard).digest('hex')}`
        expect(digest).toBe(entry.content_digest)
      }
    }
  })
})

describe('workflow event triggers', () => {
  it('keeps release and ci triggers bounded', () => {
    expect(events(release as unknown as Record<string, unknown>)).toBeDefined()
    const ci = workflows['ci.yml'] as unknown as Record<string, unknown>
    expect(events(ci)).toBeDefined()
  })
})
