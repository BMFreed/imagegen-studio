import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ProjectTargetInspectionOwner } from '../projects/project-target-inspection-owner.js'
import {
  ProjectWorkerClient,
  ProjectWorkerError,
  type ProjectWorkerLocation,
} from '../projects/worker-client.js'
import { ModelPreviewCache, type ModelPreviewCacheOptions } from './model-preview-cache.js'

const SOURCE_URL = 'https://image.civitai.com/exit-barrier/source.png'

/** Real JSONL peer/OS child; image generation is a declared fixture collaborator. */
async function withPeer(
  run: (fixture: {
    directory: string
    environment: NodeJS.ProcessEnv
    location: ProjectWorkerLocation
    observation: string
    options: ModelPreviewCacheOptions
    request: string
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-model-preview-owner-'))
  let safeToRemove = false
  try {
    const source = await readFile(new URL('../projects/placeholders/empty.png', import.meta.url))
    const preview = await readFile(
      new URL('../projects/test-fixtures/candidate-thumbnail-256x128.webp', import.meta.url),
    )
    const thumbnail = await readFile(
      new URL('../projects/test-fixtures/candidate-thumbnail-64x64.webp', import.meta.url),
    )
    const observation = path.join(directory, 'before-exit.json')
    const request = path.join(directory, 'request.json')
    const executable = path.join(directory, 'peer-python')
    const scratchRoot = path.join(directory, 'scratch')
    await mkdir(scratchRoot, { mode: 0o700 })
    await writeFile(
      executable,
      String.raw`#!${process.execPath}
const fs = require('node:fs')
const crypto = require('node:crypto')
const readline = require('node:readline')
const path = require('node:path')
const keepAlive = setInterval(() => {}, 1000)
let request = null
let terminating = false
process.on('SIGTERM', () => {
  if (terminating) return
  terminating = true
  setTimeout(() => {
    const stage = request?.output.stagingRoot
    let wroteWhileAlive = false
    try {
      fs.writeFileSync(path.join(stage, 'late-worker.txt'), 'worker is still alive')
      wroteWhileAlive = true
    } catch {}
    fs.writeFileSync(process.env.OBSERVATION, JSON.stringify({
      stageExists: Boolean(stage && fs.existsSync(stage)),
      sourceExists: Boolean(request && fs.existsSync(request.input.path)),
      wroteWhileAlive,
    }))
  }, 70)
  setTimeout(() => { clearInterval(keepAlive); process.exit(0) }, 150)
})
process.stdout.write(JSON.stringify({
  type: 'ready', protocolVersion: '1', workerVersion: '0.1.0',
  pythonVersion: '3.12.13', runtimeProfile: 'derivatives-only',
  capabilities: ['image-derivatives', 'import-normalization', 'self-test', 'resource-preview'],
}) + '\n')
const image = (destination, encoded, width, height) => {
  const bytes = Buffer.from(encoded, 'base64')
  fs.writeFileSync(destination, bytes)
  return {
    path: destination, byteSize: bytes.length, width, height, colorSpace: 'srgb',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    iccSha256: ${JSON.stringify(IGS_SRGB_ICC_SHA256)},
  }
}
;(async () => {
  for await (const line of readline.createInterface({ input: process.stdin })) {
    const message = JSON.parse(line)
    if (message.type !== 'create-resource-preview') continue
    request = message
    fs.writeFileSync(process.env.REQUEST, JSON.stringify({
      stagingRoot: request.output.stagingRoot, pid: process.pid,
    }))
    if (process.env.PEER_MODE === 'timeout') continue
    const preview = image(request.output.previewWebpPath, ${JSON.stringify(preview.toString('base64'))}, 256, 128)
    const thumbnail = image(request.output.thumbnailWebpPath, ${JSON.stringify(thumbnail.toString('base64'))}, 64, 64)
    process.stdout.write(JSON.stringify({ type: 'resource-preview-done', protocolVersion: '1', requestId: request.requestId, preview, thumbnail }) + '\n')
  }
})().catch(() => process.exit(19))
`,
      { mode: 0o700 },
    )
    const location = {
      pythonExecutable: executable,
      runtimeRoot: directory,
      stagingBasePath: scratchRoot,
    }
    const environment = { OBSERVATION: observation, REQUEST: request }
    const options: ModelPreviewCacheOptions = {
      cacheRoot: path.join(directory, 'cache'),
      canBuild: async () => true,
      fetchSource: async () => `data:image/png;base64,${source.toString('base64')}`,
      scratchRoot,
      withWorker: async () => {
        throw new Error('the test must provide its real child exit barrier')
      },
    }
    await run({ directory, environment, location, observation, options, request })
    safeToRemove = true
  } finally {
    // Successful tests confirm physical exit. A failing exit check keeps its diagnostic payload.
    if (safeToRemove) {
      await rm(directory, { force: true, recursive: true })
    }
  }
}

test(
  'request timeout retains scratch until the delayed real peer confirms physical exit',
  { timeout: 10_000 },
  async () => {
    await withPeer(async ({ environment, location, observation, options, request }) => {
      const started: { client: ProjectWorkerClient | null } = { client: null }
      let timeoutCode: string | null = null
      const cache = new ModelPreviewCache({
        ...options,
        withWorker: async (use) => {
          const client = (started.client = await ProjectWorkerClient.start(location, {
            environment: { ...environment, PEER_MODE: 'timeout' },
            requestTimeoutMs: 100,
            shutdownWaitMs: 1000,
          }))
          try {
            return await use(client)
          } catch (error) {
            timeoutCode = error instanceof ProjectWorkerError ? error.code : null
            throw error
          } finally {
            await client.close()
          }
        },
      })
      try {
        assert.equal(await cache.get(SOURCE_URL), null)
        assert.equal(timeoutCode, 'REQUEST_TIMEOUT')
        assert.deepEqual(JSON.parse(await readFile(observation, 'utf8')), {
          sourceExists: true,
          stageExists: true,
          wroteWhileAlive: true,
        })
        const captured = JSON.parse(await readFile(request, 'utf8')) as {
          pid: number
          stagingRoot: string
        }
        assert.equal(existsSync(captured.stagingRoot), false)
        assert.equal(existsSync(`/proc/${captured.pid}`), false)
        assert.deepEqual(await readdir(options.scratchRoot), [])
      } finally {
        await started.client?.close()
      }
    })
  },
)

test(
  'strict owner exit refusal preserves scratch and fences another action even after valid cache publication',
  { timeout: 10_000 },
  async () => {
    await withPeer(async ({ environment, location, observation, options, request }) => {
      const owner = new ProjectTargetInspectionOwner(async () => ({ environment, location }))
      let closes = 0
      const cache = new ModelPreviewCache({
        ...options,
        withWorker: async (use) =>
          owner.useWorker(
            async (worker) => {
              const close = worker.close.bind(worker)
              // Controlled close failure is the declared collaborator. The owner/client/cache are real,
              // and the actual peer remains alive until shutdown calls the original close implementation.
              worker.close = async () => {
                closes++
                if (closes === 1) {
                  throw new ProjectWorkerError(
                    'WORKER_EXIT_UNCONFIRMED',
                    'Controlled first exit refusal',
                  )
                }
                await close()
              }
              return use(worker)
            },
            { retainCompletedResult: false },
          ),
      })
      try {
        assert.equal(await cache.get(SOURCE_URL), null)
        assert.equal(closes, 1)
        const captured = JSON.parse(await readFile(request, 'utf8')) as {
          pid: number
          stagingRoot: string
        }
        assert.equal(existsSync(captured.stagingRoot), true)
        assert.equal(existsSync(`/proc/${captured.pid}`), true)
        assert.ok(
          await cache.read(SOURCE_URL),
          'independently verified published artwork remains readable',
        )
        let nextAction = false
        assert.equal(
          await owner.useWorker(async () => {
            nextAction = true
            return 'unexpected'
          }),
          null,
        )
        assert.equal(nextAction, false)
        await owner.shutdown()
        assert.equal(closes, 2)
        assert.equal(existsSync(`/proc/${captured.pid}`), false)
        assert.deepEqual(JSON.parse(await readFile(observation, 'utf8')), {
          sourceExists: true,
          stageExists: true,
          wroteWhileAlive: true,
        })
        assert.equal(
          existsSync(captured.stagingRoot),
          true,
          'unconfirmed-exit payload is retained for later safe disposal',
        )
      } finally {
        await owner.shutdown()
      }
    })
  },
)
