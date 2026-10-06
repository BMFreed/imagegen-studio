import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const probe = fileURLToPath(
  new URL('./test-fixtures/outpaint-resource-db-probe.ts', import.meta.url),
)

test('both outpaint families requalify shared resources outside the real SQLite transaction with no previous-boundary cache', async (t) => {
  for (const family of ['illustrious', 'anima'] as const) {
    await t.test(family, async () => {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'igs-outpaint-db-child-'))
      try {
        // Ten seconds is a harness hang limit, not a product timeout or throughput measurement.
        // TMPDIR keeps every fixture beneath the parent's owned root, even when killed mid-query.
        const { stdout } = await promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', probe, family],
          {
            cwd: process.cwd(),
            env: { ...process.env, TMPDIR: temporary },
            killSignal: 'SIGKILL',
            timeout: 10_000,
          },
        ).catch((error: unknown) => {
          const failure = error as {
            code?: unknown
            killed?: boolean
            signal?: string | null
            stderr?: string
            stdout?: string
          }
          assert.fail(
            `Outpaint resource probe did not complete: ${JSON.stringify({
              code: failure.code ?? null,
              killed: failure.killed ?? false,
              signal: failure.signal ?? null,
              stderr: failure.stderr?.slice(-2000) ?? '',
              stdout: failure.stdout?.slice(-2000) ?? '',
            })}`,
          )
        })
        assert.deepEqual(JSON.parse(stdout), {
          family,
          firstAdmission: { infill: 2, registry: 2, rows: 32 },
          newAdmission: { infill: 2, registry: 2, rows: 1 },
          retry: { freshId: true, infill: 2, registry: 2, sameFrozenPayload: true },
        })
      } finally {
        await rm(temporary, { force: true, recursive: true })
      }
    })
  }
})
