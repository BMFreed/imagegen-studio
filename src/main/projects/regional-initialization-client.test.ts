import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { supportsInferenceRegionalInvokeInitialization } from '../../shared/projects/inference-worker-capabilities.js'

import assert from 'node:assert/strict'
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { GenerationWorkerClient } from './generation-worker-client.js'
import {
  createRegionalQueueFixture,
  REGIONAL_QUEUE_READY,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'

const INITIALIZATION = 'invoke-cpu-f32-add-noise-v1' as const
const CAPABILITY = 'illustrious-regional-invoke-init-v1'
const BASE_CAPABILITY = 'private-current-canvas-regional-v1'

interface Observation {
  bundleHasInitialization: boolean
  initializationProfile?: unknown
  requestId: string
  scheduler: string
  stagingRoot: string
  wireKeys: string[]
}

async function withClient(
  capabilities: string[],
  run: (value: {
    client: GenerationWorkerClient
    fixture: RegionalQueueFixture
    input: RegionalWorkerInput
    observations: () => Promise<Observation[]>
    received: string
    scratch: string
  }) => Promise<void>,
): Promise<void> {
  const fixture = await createRegionalQueueFixture()
  let client: GenerationWorkerClient | undefined
  try {
    const runtime = path.join(fixture.root, 'runtime')
    const scratch = path.join(fixture.root, 'client-scratch')
    const received = path.join(fixture.root, 'client-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    const ready = {
      ...REGIONAL_QUEUE_READY,
      capabilities: [
        ...capabilities,
        ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
      ],
      pythonVersion: '3.12.13',
      type: 'ready',
    }
    // A real OS/JSONL peer with declared fake native computation; it is no ML qualification.
    const script = String.raw`#!${process.execPath}
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const args = process.argv.slice(2);
const validArgs = process.platform === 'linux'
  ? args.length === 7 && JSON.stringify(args.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base']) && path.isAbsolute(args[6])
  : args.join(' ') === '-I -m imagegen_worker.inference_main';
if (!validArgs) process.exit(21);
const received = ${JSON.stringify(received)};
const output = Buffer.from(${JSON.stringify(fixture.outputBytes.toString('base64'))}, 'base64');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)}) + '\n');
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
  const wire = JSON.parse(line);
  if (wire.type !== 'execute-current-canvas-regional') throw Error('Wrong dispatch owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if (bytes.length !== wire.bundle.byteSize || sha(bytes) !== wire.bundle.sha256) throw Error('Bundle snapshot differs');
  const bundle = JSON.parse(bytes);
  const target = fs.readFileSync(bundle.request.job.target.path);
  if (sha(target) !== bundle.request.job.target.sha256) throw Error('Target snapshot differs');
  fs.appendFileSync(received, JSON.stringify({
    bundleHasInitialization: Object.hasOwn(bundle, 'initializationProfile'),
    initializationProfile: bundle.initializationProfile,
    requestId: wire.requestId,
    scheduler: bundle.request.job.sampling.scheduler,
    stagingRoot: wire.stagingRoot,
    wireKeys: Object.keys(wire).sort(),
  }) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, output, {flag: 'wx'});
  process.stdout.write(JSON.stringify({
    type: 'generation-done', protocolVersion: '1', requestId: wire.requestId,
    outputPath: bundle.request.job.output.pngPath, seed: bundle.request.job.sampling.seed,
  }) + '\n');
});
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    client = await GenerationWorkerClient.start(
      { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
      { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
    )
    const input: RegionalWorkerInput = {
      ...fixture.regional,
      initializationProfile: INITIALIZATION,
      request: fixture.request,
    }
    input.request.job.sampling.scheduler = 'euler_a'
    await run({
      client,
      fixture,
      input,
      observations: async () =>
        (await readFile(received, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as Observation),
      received,
      scratch,
    })
  } finally {
    // Confirmation of the real child's physical exit precedes fixture-directory disposal.
    await client?.close()
    await fixture.close()
  }
}

test('new initialization capability requires a qualified ready plus its existing regional owner', () => {
  const ready = {
    ...REGIONAL_QUEUE_READY,
    capabilities: [...REGIONAL_QUEUE_READY.capabilities, CAPABILITY],
  }
  assert.equal(supportsInferenceRegionalInvokeInitialization(ready), true)
  for (const unsupported of [
    null,
    REGIONAL_QUEUE_READY,
    { ...ready, workerVersion: '0.13.0' },
    { ...ready, workerVersion: '0.15.0' },
    { ...ready, runtimeProfile: 'linux-cpu' },
    { ...ready, protocolVersion: '2' },
    { ...ready, capabilities: ready.capabilities.filter((value) => value !== BASE_CAPABILITY) },
    {
      ...ready,
      capabilities: ready.capabilities.filter((value) => value !== 'illustrious-txt2img'),
    },
  ]) {
    assert.equal(supportsInferenceRegionalInvokeInitialization(unsupported), false)
  }
})

test('explicit initialization reaches the child bundle while same-sampler legacy transport omits it', async () => {
  await withClient(
    [...REGIONAL_QUEUE_READY.capabilities, CAPABILITY],
    async ({ client, fixture, input, observations, scratch }) => {
      const pending = client.executeCurrentCanvasRegional(input)
      delete input.initializationProfile
      const initialized = await pending
      assert.ok(initialized.pngBytes.equals(fixture.outputBytes))
      assert.equal(initialized.output.sha256, regionalFixtureSha256(fixture.outputBytes))
      assert.equal(initialized.output.iccSha256, IGS_SRGB_ICC_SHA256)
      assert.equal(initialized.seed, 123)
      assert.deepEqual(await readdir(scratch), [])
      const legacy = await client.executeCurrentCanvasRegional(input)
      assert.ok(legacy.pngBytes.equals(fixture.outputBytes))
      const seen = await observations()
      assert.equal(seen.length, 2)
      assert.equal(seen[0].bundleHasInitialization, true)
      assert.equal(seen[0].initializationProfile, INITIALIZATION)
      assert.equal(seen[1].bundleHasInitialization, false)
      assert.equal(Object.hasOwn(seen[1], 'initializationProfile'), false)
      for (const item of seen) {
        assert.equal(item.scheduler, 'euler_a')
        assert.deepEqual(item.wireKeys, [
          'bundle',
          'protocolVersion',
          'requestId',
          'stagingRoot',
          'type',
        ])
        await assert.rejects(readFile(path.join(item.stagingRoot, 'bundle.json')), {
          code: 'ENOENT',
        })
      }
      assert.notEqual(seen[0].stagingRoot, seen[1].stagingRoot)
      assert.deepEqual(await readdir(scratch), [])
      assert.ok(
        (await readFile(input.request.job.target.path)).equals(fixture.prepared.targetPngBytes),
      )
    },
  )
})

test('older regional capability refuses initialization before files or dispatch but remains usable for legacy work', async () => {
  await withClient(
    [...REGIONAL_QUEUE_READY.capabilities],
    async ({ client, input, observations, received, scratch }) => {
      assert.deepEqual(await readdir(scratch), [])
      await assert.rejects(client.executeCurrentCanvasRegional(input), {
        code: 'WORKER_VERSION_MISMATCH',
      })
      await assert.rejects(readFile(received), { code: 'ENOENT' })
      assert.deepEqual(await readdir(scratch), [])
      delete input.initializationProfile
      const done = await client.executeCurrentCanvasRegional(input)
      assert.equal(done.seed, 123)
      const seen = await observations()
      assert.equal(seen.length, 1)
      assert.equal(seen[0].bundleHasInitialization, false)
      assert.deepEqual(await readdir(scratch), [])
    },
  )
})

test('initialization advertisement alone cannot replace the regional execution capability', async () => {
  const capabilities = REGIONAL_QUEUE_READY.capabilities
    .filter((value) => value !== BASE_CAPABILITY)
    .concat(CAPABILITY)
  await withClient(capabilities, async ({ client, input, received, scratch }) => {
    await assert.rejects(client.executeCurrentCanvasRegional(input), {
      code: 'WORKER_VERSION_MISMATCH',
    })
    await assert.rejects(readFile(received), { code: 'ENOENT' })
    assert.deepEqual(await readdir(scratch), [])
  })
})
