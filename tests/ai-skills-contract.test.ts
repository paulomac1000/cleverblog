import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = process.cwd()
const AUTHORITY = join(ROOT, '.ai-skills-authority')
const workflowFiles = ['ci.yml', 'codeql.yml', 'release.yml']
const workflows = Object.fromEntries(
  workflowFiles.map((name) => [name, parse(readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8')) as Record<string, unknown>]),
)
const release = workflows['release.yml'] as unknown as {
  permissions: Record<string, string>
  concurrency: Record<string, unknown>
  jobs: Record<
    string,
    {
      'timeout-minutes'?: number
      needs?: string
      permissions?: Record<string, string>
      environment?: string
      steps: Array<Record<string, unknown>>
    }
  >
}

const jobEntries = (doc: Record<string, unknown>) =>
  Object.entries((doc['jobs'] ?? {}) as Record<string, Record<string, unknown>>)

const stepScripts = (job: Record<string, unknown>) =>
  ((job['steps'] ?? []) as Array<Record<string, unknown>>)
    .map((step) => (typeof step['run'] === 'string' ? step['run'] : ''))
    .join('\n')

const stepUses = (job: Record<string, unknown>) =>
  ((job['steps'] ?? []) as Array<Record<string, unknown>>)
    .map((step) => (typeof step['uses'] === 'string' ? step['uses'] : ''))
    .filter(Boolean)

describe('ai-skills release contract', () => {
  it('separates read-only validation from protected publication', () => {
    const validate = release.jobs.validate
    const publish = release.jobs.publish
    expect(validate).toBeDefined()
    expect(publish).toBeDefined()
    expect(publish.needs).toBe('validate')
    expect(publish.environment).toBe('protected-release')

    const validateScript = stepScripts(validate as unknown as Record<string, unknown>)
    const validateStepNames = (validate.steps ?? []).map((step) =>
      typeof step.name === 'string' ? step.name : '',
    )
    expect(validateScript).toContain('docker build')
    expect(validateStepNames).toContain('Stage tested image in quarantine')
    expect(validateScript).toContain('IMAGE_DIGEST')

    for (const step of publish.steps) {
      const uses = typeof step.uses === 'string' ? step.uses : ''
      const run = typeof step.run === 'string' ? step.run : ''
      expect(uses).not.toContain('actions/checkout')
      expect(run).not.toMatch(/docker (build|run|load|save)\b|pnpm install|pnpm build|payload migrate/)
    }
  })

  it('grants packages write only to the publish job and bounds every job', () => {
    expect(release.permissions).toEqual({ contents: 'read' })
    expect(release.jobs.validate.permissions).toEqual({ contents: 'read' })
    expect(release.jobs.publish.permissions).toEqual({ contents: 'read', packages: 'write' })
    const ci = workflows['ci.yml'] as unknown as { permissions: Record<string, string> }
    expect(ci.permissions).toEqual({ contents: 'read' })

    for (const doc of Object.values(workflows)) {
      expect(doc).toHaveProperty('concurrency')
      const concurrency = doc['concurrency'] as Record<string, unknown>
      expect(concurrency).toHaveProperty('group')
      expect(concurrency).toHaveProperty('cancel-in-progress')
      for (const [, job] of jobEntries(doc as Record<string, unknown>)) {
        expect(job['timeout-minutes']).toBeGreaterThan(0)
      }
    }
    expect(release.concurrency['cancel-in-progress']).toBe(false)
  })

  it('pins every third-party action to a full commit sha', () => {
    const uses: string[] = []
    for (const doc of Object.values(workflows)) {
      for (const [, job] of jobEntries(doc as Record<string, unknown>)) {
        for (const step of ((job['steps'] ?? []) as Array<Record<string, unknown>>)) {
          if (typeof step['uses'] === 'string' && !step['uses'].startsWith('./')) uses.push(step['uses'])
        }
      }
    }
    expect(uses.length).toBeGreaterThan(0)
    for (const value of uses) {
      expect(value).toMatch(/@[0-9a-f]{40}$/)
    }
  })

  it('audits workflows with the pinned policy tool', () => {
    const sources = Object.fromEntries(
      workflowFiles.map((name) => [name, readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8')]),
    )
    expect(sources['release.yml']).toContain('ai-skills-policy-profile: protected-release')
    expect(sources['ci.yml']).toContain('ai-skills-policy-profile: trusted-ci')
    expect(sources['codeql.yml']).toContain('ai-skills-policy-profile: trusted-ci')

    expect(existsSync(AUTHORITY)).toBe(true)
    const output = execFileSync(
      'python3',
      [
        join(AUTHORITY, 'skills', 'ci-cd-architect', 'tools', 'check_github_actions_policy.py'),
        ROOT,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    expect(output).toContain('PASS')
  })

  it('promotes the exact tested digest without executing candidate code in publish', () => {
    const validateScript = stepScripts(release.jobs.validate as unknown as Record<string, unknown>)
    expect(validateScript).toContain('quarantine-')
    expect(validateScript).toContain('docker pull "ghcr.io/paulomac1000/cleverblog-site@${IMAGE_DIGEST}"')
    expect(validateScript).toMatch(/docker run[\s\S]*cleverblog-site@\$\{IMAGE_DIGEST\}/)

    const publish = release.jobs.publish as unknown as Record<string, unknown>
    const publishUses = stepUses(publish)
    expect(publishUses).toEqual([
      expect.stringContaining('actions/download-artifact@'),
    ])
    const script = stepScripts(publish)
    expect(script).toContain('docker buildx imagetools create -t "$SHA_REF" "$DIGEST_REF"')
    expect(script.indexOf('imagetools create -t "$SHA_REF"')).toBeLessThan(
      script.indexOf('imagetools create -t "$RELEASE_REF"'),
    )
    expect(script).toMatch(/refusing to move it/)
    expect(script).toMatch(/test "\$resolved" = "\$IMAGE_DIGEST"/)
    expect(script).not.toMatch(/docker (load|run|build)\b/)
  })
})

describe('ai-skills lock', () => {
  it('declares adopted skills with immutable revisions and matching standard digests', () => {
    const lock = parse(readFileSync(join(ROOT, 'ai-skills.lock.yaml'), 'utf8')) as {
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
    expect(existsSync(AUTHORITY)).toBe(true)
    for (const entry of Object.values(lock.skills)) {
      const standard = readFileSync(join(AUTHORITY, entry.normative_entrypoint))
      const digest = `sha256:${createHash('sha256').update(standard).digest('hex')}`
      expect(digest).toBe(entry.content_digest)
    }
  })
})
