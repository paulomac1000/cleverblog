import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runHeadlessMigration } from '../scripts/migrate-headless.mjs'

const tempDirs: string[] = []
const wrapperPath = fileURLToPath(new URL('../scripts/migrate-headless.mjs', import.meta.url))

const fakePnpmSource = `#!/usr/bin/env node
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const scenario = process.env.FAKE_MIGRATE_SCENARIO
if (process.argv[2] !== 'payload' || process.argv[3] !== 'migrate') process.exit(91)
if (scenario === 'healthy') {
  process.stdout.write('migration complete\\n')
} else if (scenario === 'nonzero') {
  process.stderr.write('migration sql failed\\n')
  process.exitCode = 23
} else if (scenario === 'silent') {
  setInterval(() => {}, 1_000)
} else if (scenario === 'periodic') {
  process.stdout.write('tick\\n')
  setInterval(() => process.stdout.write('tick\\n'), 50)
} else if (scenario === 'ignore-term') {
  const marker = process.env.FAKE_MIGRATE_MARKER
  process.on('SIGTERM', () => {
    if (marker) fs.appendFileSync(marker, 'sigterm\\n')
  })
  if (marker) fs.writeFileSync(marker, 'armed\\n')
  process.stdout.write('armed\\n')
  setInterval(() => {}, 1_000)
} else if (scenario === 'leader-exits-grandchild-ignores-term') {
  const marker = process.env.FAKE_MIGRATE_MARKER
  const grandchild = spawn(
    process.execPath,
    [
      '-e',
      "const fs=require('node:fs');const marker=process.env.FAKE_MIGRATE_MARKER;process.on('SIGTERM',()=>{});if(marker)fs.appendFileSync(marker,'grandchild-started'+String.fromCharCode(10));setInterval(()=>{if(marker)fs.appendFileSync(marker,'beat'+String.fromCharCode(10))},10)",
    ],
    { env: process.env, stdio: 'ignore' },
  )
  process.on('SIGTERM', () => process.exit(0))
  if (marker) fs.writeFileSync(marker, 'grandchild:' + grandchild.pid + '\\n')
  process.stdout.write('armed\\n')
  setInterval(() => {}, 1_000)
} else if (scenario === 'exit-on-signal') {
  const marker = process.env.FAKE_MIGRATE_MARKER
  const exitOnSignal = (signal) => {
    if (marker) fs.appendFileSync(marker, signal.toLowerCase() + '\\n')
    process.exit(0)
  }
  process.on('SIGTERM', () => exitOnSignal('SIGTERM'))
  process.on('SIGINT', () => exitOnSignal('SIGINT'))
  if (marker) fs.writeFileSync(marker, 'pid:' + process.pid + '\\narmed\\n')
  process.stdout.write('armed\\n')
  setInterval(() => {}, 1_000)
} else if (scenario === 'stdin') {
  let bytes = 0
  process.stdin.on('data', (chunk) => { bytes += chunk.length })
  process.stdin.on('end', () => process.stdout.write('stdin-bytes:' + bytes + '\\n'))
} else {
  process.exit(92)
}
`

const createFakePnpm = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleverblog-migrate-headless-'))
  tempDirs.push(dir)
  const executable = join(dir, 'pnpm')
  await writeFile(executable, fakePnpmSource, 'utf8')
  await chmod(executable, 0o755)

  return {
    dir,
    env: {
      ...process.env,
      PATH: [dir, process.env.PATH].filter(Boolean).join(delimiter),
    },
  }
}

const sawWrite = (
  calls: readonly (readonly unknown[])[],
  text: string,
): boolean => calls.some(([chunk]) => String(chunk).includes(text))

const waitForMarker = async (path: string, text: string, timeoutMs = 1_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const contents = await readFile(path, 'utf8')
      if (contents.includes(text)) return contents
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(text)} in ${path}`)
}

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('migrate-headless', () => {
  it('returns zero for a healthy child with visible output', async () => {
    const fake = await createFakePnpm()
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: { ...fake.env, FAKE_MIGRATE_SCENARIO: 'healthy' },
      idleTimeoutMs: 500,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(0)
    expect(sawWrite(stdoutWrite.mock.calls, 'migration complete')).toBe(true)
  })

  it('preserves a nonzero child exit code', async () => {
    const fake = await createFakePnpm()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: { ...fake.env, FAKE_MIGRATE_SCENARIO: 'nonzero' },
      idleTimeoutMs: 500,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(23)
  })

  it('kills a silent child and returns 124', async () => {
    const fake = await createFakePnpm()
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: { ...fake.env, FAKE_MIGRATE_SCENARIO: 'silent' },
      idleTimeoutMs: 150,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(124)
    expect(sawWrite(stderrWrite.mock.calls, 'payload migrate produced no visible output for 0.15 seconds and was terminated without sending any input.')).toBe(true)
    expect(sawWrite(stderrWrite.mock.calls, 'Do not pipe y, yes, or other automatic input into migrations.')).toBe(true)
  })

  it('resets the idle watchdog on periodic output until the runtime ceiling', async () => {
    const fake = await createFakePnpm()
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: { ...fake.env, FAKE_MIGRATE_SCENARIO: 'periodic' },
      idleTimeoutMs: 400,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(124)
    expect(sawWrite(stdoutWrite.mock.calls, 'tick')).toBe(true)
    expect(sawWrite(stderrWrite.mock.calls, 'payload migrate exceeded the maximum runtime of 0.5 seconds')).toBe(true)
    expect(sawWrite(stderrWrite.mock.calls, 'produced no visible output')).toBe(false)
  })

  it('uses SIGKILL after the grace period when SIGTERM is ignored', async () => {
    const fake = await createFakePnpm()
    const marker = join(fake.dir, 'signals.txt')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: {
        ...fake.env,
        FAKE_MIGRATE_MARKER: marker,
        FAKE_MIGRATE_SCENARIO: 'ignore-term',
      },
      idleTimeoutMs: 300,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(124)
    const signals = await readFile(marker, 'utf8')
    expect(signals).toContain('armed')
    expect(signals).toContain('sigterm')
  })

  it('kills descendants after the pnpm leader exits during forced termination', async () => {
    const fake = await createFakePnpm()
    const marker = join(fake.dir, 'descendant.txt')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: {
        ...fake.env,
        FAKE_MIGRATE_MARKER: marker,
        FAKE_MIGRATE_SCENARIO: 'leader-exits-grandchild-ignores-term',
      },
      idleTimeoutMs: 150,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(124)
    const atReturn = await readFile(marker, 'utf8')
    const pidMatch = atReturn.match(/grandchild:(\d+)/)
    expect(pidMatch).not.toBeNull()
    expect(atReturn).toContain('grandchild-started')

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await readFile(marker, 'utf8')).toBe(atReturn)

    if (!pidMatch) throw new Error('Fake pnpm did not record the grandchild pid')
    const grandchildPid = Number(pidMatch[1])
    if (processIsAlive(grandchildPid)) {
      const stat = await readFile(`/proc/${grandchildPid}/stat`, 'utf8').catch(() => '')
      expect(stat.split(' ')[2]).toBe('Z')
    }
  })

  it.each([
    ['SIGTERM', 143, 'sigterm'],
    ['SIGINT', 130, 'sigint'],
  ] as const)('propagates %s from the actual wrapper and exits %i', async (signal, expectedExitCode, markerSignal) => {
    const fake = await createFakePnpm()
    const marker = join(fake.dir, 'wrapper-signal.txt')
    const wrapper = spawn(process.execPath, [wrapperPath], {
      env: {
        ...fake.env,
        FAKE_MIGRATE_MARKER: marker,
        FAKE_MIGRATE_SCENARIO: 'exit-on-signal',
        MIGRATE_HEADLESS_IDLE_TIMEOUT_MS: '5000',
        MIGRATE_HEADLESS_MAX_RUNTIME_MS: '5000',
      },
      stdio: 'ignore',
    })
    const closePromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      wrapper.once('close', (code, closeSignal) => resolve({ code, signal: closeSignal }))
    })

    const armed = await waitForMarker(marker, 'armed')
    const childPidMatch = armed.match(/pid:(\d+)/)
    expect(childPidMatch).not.toBeNull()
    if (!childPidMatch) throw new Error('Fake pnpm did not record its pid')

    expect(wrapper.kill(signal)).toBe(true)
    await expect(closePromise).resolves.toEqual({ code: expectedExitCode, signal: null })

    const markerContents = await readFile(marker, 'utf8')
    expect(markerContents).toContain(markerSignal)
    expect(processIsAlive(Number(childPidMatch[1]))).toBe(false)
  })

  it('never sends bytes to a child that attempts to read stdin', async () => {
    const fake = await createFakePnpm()
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const exitCode = await runHeadlessMigration({
      env: { ...fake.env, FAKE_MIGRATE_SCENARIO: 'stdin' },
      idleTimeoutMs: 500,
      maxRuntimeMs: 500,
      registerSignalHandlers: false,
      terminationGraceMs: 100,
    })

    expect(exitCode).toBe(0)
    expect(sawWrite(stdoutWrite.mock.calls, 'stdin-bytes:0')).toBe(true)
  })
})
