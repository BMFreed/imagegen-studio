import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const probe = fileURLToPath(
  new URL('./test-fixtures/outpaint-final-admission-probe.ts', import.meta.url),
)

// Boundary: real SQLite, input publication/CAS and retained staging files. The document assertion
// is the caller's synchronous identity seam; tiny exact-resource peers query the same connection.
// Neighbor: unchanged document accepts the pre-await capture. Moving verification into SQL or
// removing either final assertion must fail without hanging the parent test process.
test('outpaint Generate and Retry reject a late closed/replaced document and preserve existing work through the final SQL boundary', async (t) => {
  for (const family of ['illustrious', 'anima'] as const) {
    await t.test(family, async () => {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'igs-outpaint-admission-child-'))
      try {
        // This child deadline bounds a SQLite deadlock regression; it is not a product timeout.
        const { stdout } = await promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', probe, family],
          {
            cwd: process.cwd(),
            env: { ...process.env, TMPDIR: temporary },
            killSignal: 'SIGKILL',
            timeout: 30_000,
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
            `Outpaint final-admission probe did not complete: ${JSON.stringify({
              code: failure.code ?? null,
              killed: failure.killed ?? false,
              signal: failure.signal ?? null,
              stderr: failure.stderr?.slice(-2000) ?? '',
              stdout: failure.stdout?.slice(-2000) ?? '',
            })}`,
          )
        })
        const cases = []
        for (const action of ['generate', 'retry']) {
          for (const hold of ['last-qualifier', 'before-commit']) {
            for (const document of ['closed', 'replaced', 'current']) {
              cases.push({ action, document, hold, published: document === 'current' })
            }
          }
        }
        assert.deepEqual(JSON.parse(stdout), { cases, family })
      } finally {
        await rm(temporary, { force: true, recursive: true })
      }
    })
  }
})
