import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const DEFAULT_IDLE_TIMEOUT_MS = 120_000
const DEFAULT_MAX_RUNTIME_MS = 1_800_000
const TERMINATION_GRACE_MS = 5_000

const parsePositiveInteger = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds`)
  }

  return parsed
}

const formatSeconds = (milliseconds) => {
  const seconds = milliseconds / 1_000
  return Number.isInteger(seconds) ? String(seconds) : String(Number(seconds.toFixed(3)))
}

const idleTimeoutMessage = (idleTimeoutMs) =>
  `payload migrate produced no visible output for ${formatSeconds(idleTimeoutMs)} seconds and was terminated without sending any input. In this repository this commonly indicates that Payload detected a database previously modified by development push mode and is waiting for an interactive confirmation that is not visible in a non-TTY session. No prompt was accepted automatically.\n` +
  '1. Disposable development DB: reset/recreate it and rerun migrations.\n' +
  '2. If a data-loss warning is truly expected: run the migration interactively, read the prompt, decide manually — note that --force-accept-warning does not auto-accept the dev-push confirmation prompt.\n' +
  '3. If the DB must be preserved: reconcile the schema manually with the migration SQL and update payload_migrations only after verifying the outcome, per AGENTS.md.\n' +
  'Do not pipe y, yes, or other automatic input into migrations.\n'

const signalExitCode = (signal) => {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  if (signal === 'SIGKILL') return 137
  return 1
}

export const runHeadlessMigration = ({
  env = process.env,
  idleTimeoutMs = parsePositiveInteger(
    env.MIGRATE_HEADLESS_IDLE_TIMEOUT_MS,
    DEFAULT_IDLE_TIMEOUT_MS,
    'MIGRATE_HEADLESS_IDLE_TIMEOUT_MS',
  ),
  maxRuntimeMs = parsePositiveInteger(
    env.MIGRATE_HEADLESS_MAX_RUNTIME_MS,
    DEFAULT_MAX_RUNTIME_MS,
    'MIGRATE_HEADLESS_MAX_RUNTIME_MS',
  ),
  terminationGraceMs = TERMINATION_GRACE_MS,
  registerSignalHandlers = true,
} = {}) =>
  new Promise((resolvePromise) => {
    let settled = false
    let forcedExitCode = null
    let graceTimer = null
    let idleTimer = null
    let runtimeTimer = null

    const child = spawn('pnpm', ['payload', 'migrate'], {
      detached: true,
      env,
      shell: false,
      stdio: [
        // Migrations must never receive automatic input.
        'ignore',
        'pipe',
        'pipe',
      ],
    })

    const signalGroup = (signal) => {
      if (typeof child.pid !== 'number') return false

      try {
        process.kill(-child.pid, signal)
        return true
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
          return false
        }
        throw error
      }
    }

    const cleanup = () => {
      if (idleTimer !== null) clearTimeout(idleTimer)
      if (runtimeTimer !== null) clearTimeout(runtimeTimer)
      if (graceTimer !== null) clearTimeout(graceTimer)
      if (registerSignalHandlers) {
        process.off('SIGINT', onSigint)
        process.off('SIGTERM', onSigterm)
      }
    }

    const finish = (exitCode) => {
      if (settled) return
      settled = true
      cleanup()
      resolvePromise(exitCode)
    }

    const startGracePeriod = () => {
      if (graceTimer !== null) return
      graceTimer = setTimeout(() => {
        signalGroup('SIGKILL')
        if (forcedExitCode !== null) finish(forcedExitCode)
      }, terminationGraceMs)
    }

    const terminateFor = (exitCode, signal = 'SIGTERM') => {
      if (forcedExitCode !== null) return
      forcedExitCode = exitCode
      if (!signalGroup(signal)) {
        finish(exitCode)
        return
      }
      startGracePeriod()
    }

    const armIdleWatchdog = () => {
      if (settled || forcedExitCode !== null) return
      if (idleTimer !== null) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        process.stderr.write(idleTimeoutMessage(idleTimeoutMs))
        terminateFor(124)
      }, idleTimeoutMs)
    }

    const onOutput = (destination) => (chunk) => {
      destination.write(chunk)
      armIdleWatchdog()
    }

    const onSigint = () => terminateFor(130, 'SIGINT')
    const onSigterm = () => terminateFor(143, 'SIGTERM')

    child.stdout?.on('data', onOutput(process.stdout))
    child.stderr?.on('data', onOutput(process.stderr))

    child.once('error', (error) => {
      process.stderr.write(`Failed to start payload migrate: ${error.message}\n`)
      finish(1)
    })

    child.once('close', (code, signal) => {
      if (forcedExitCode !== null) {
        if (!signalGroup(0)) finish(forcedExitCode)
        return
      }

      if (typeof code === 'number') {
        finish(code)
        return
      }

      finish(signalExitCode(signal))
    })

    if (registerSignalHandlers) {
      process.on('SIGINT', onSigint)
      process.on('SIGTERM', onSigterm)
    }

    armIdleWatchdog()
    runtimeTimer = setTimeout(() => {
      process.stderr.write(
        `payload migrate exceeded the maximum runtime of ${formatSeconds(maxRuntimeMs)} seconds and was terminated without sending any input.\n`,
      )
      terminateFor(124)
    }, maxRuntimeMs)
  })

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    process.exitCode = await runHeadlessMigration()
  } catch (error) {
    process.stderr.write(
      `Failed to run payload migrate wrapper: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
