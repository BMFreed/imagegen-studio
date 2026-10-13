import type { GenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'

import assert from 'node:assert/strict'
import { ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { pbkdf2, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { mock } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import type { GenerationWorkerRequest } from './generation-processor.js'
import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'

import { buildFrozenQueuedOutpaintV1 } from './generation-queue.js'
import {
  GenerationWorkerClient,
  GenerationWorkerError,
  type GenerationWorkerLocation,
} from './generation-worker-client.js'
import { buildQueuedOutpaintWorkerRequest } from './outpaint-worker-request.js'
import { withAnimaDispatchClientFixture } from './test-fixtures/anima-dispatch.js'
import { withOutpaintConsumerFixture } from './test-fixtures/outpaint-consumers.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'
import { ProjectWorkerClient } from './worker-client.js'

type Fixture = {
  executable: string
  location: GenerationWorkerLocation
  root: string
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-inference-client-'))
  const runtimeRoot = path.join(root, 'runtime')
  const scratchBasePath = path.join(root, 'scratch')
  await mkdir(runtimeRoot)
  await mkdir(scratchBasePath)
  const executable = path.join(runtimeRoot, 'python')
  const script = String.raw`#!${process.execPath}
const fs = require('node:fs')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker.inference_main') process.exit(21)
if (process.env.HF_HUB_OFFLINE !== '1' || process.env.TRANSFORMERS_OFFLINE !== '1') process.exit(23)
const mode = process.env.FAKE_MODE || 'done'
if (process.env.FAKE_SPAWN_MARKER) {
  fs.appendFileSync(process.env.FAKE_SPAWN_MARKER, String(process.pid) + '\n')
}
const ready = {
  type:'ready', protocolVersion:mode === 'bad-protocol' ? '2' : '1',
  workerVersion: mode.startsWith('vae-') ? '0.9.0' : mode.startsWith('precision-') ? '0.8.0' : mode.startsWith('lora-') ? '0.7.0' : mode.startsWith('img2img-') ? '0.6.0' : mode.startsWith('rescale-') ? '0.5.0' : mode === 'thumbnail-done' || mode === 'thumbnail-missing-capability' ? '0.4.0' : mode === 'bad-version' ? '0.1.0' : mode === 'future-version' ? '0.5.0' : mode.startsWith('progress-') || mode === 'new-missing-progress' ? '0.3.0' : '0.2.0',
  runtimeProfile:mode === 'bad-profile' ? 'derivatives-only' : 'linux-nvidia',
  pythonVersion:'3.12.13',
  capabilities: mode === 'vae-done' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora', 'illustrious-vae-precision', 'illustrious-external-vae'] : mode === 'vae-missing-capability' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora', 'illustrious-vae-precision'] : (mode === 'precision-done' || mode === 'precision-error') ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora', 'illustrious-vae-precision'] : mode === 'precision-missing-capability' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora'] : mode === 'lora-done' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora'] : mode === 'lora-missing-capability' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img'] : mode === 'img2img-done' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale', 'illustrious-img2img'] : mode === 'img2img-missing-capability' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale'] : mode === 'rescale-done' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale'] : mode === 'rescale-missing-capability' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'] : mode === 'thumbnail-done' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'] : mode === 'thumbnail-missing-capability' ? ['illustrious-txt2img', 'denoising-progress'] : mode === 'no-capability' ? [] : mode.startsWith('progress-') ? ['illustrious-txt2img', 'denoising-progress'] : ['illustrious-txt2img']
}
if (mode.startsWith('euler-')) {
  ready.workerVersion = mode === 'euler-old-spoof' ? '0.12.0' : '0.13.0'
  ready.capabilities = ${JSON.stringify([...OUTPAINT_READY.capabilities, 'illustrious-euler'])}
  if (mode === 'euler-missing-capability') ready.capabilities = ready.capabilities.filter(value => value !== 'illustrious-euler')
}
if (mode.startsWith('noise-')) {
  ready.workerVersion = mode === 'noise-old-spoof' ? '0.13.0' : '0.14.0'
  ready.capabilities = ${JSON.stringify([...OUTPAINT_READY.capabilities, 'illustrious-euler', 'illustrious-noise-profile'])}
  if (mode === 'noise-missing-capability') ready.capabilities = ready.capabilities.filter(value => value !== 'illustrious-noise-profile')
}
if (mode === 'precision-error') ready.capabilities.push('target-composition')
if (mode === 'delayed-sigterm' || mode === 'ignore-sigterm' || mode === 'silent-ignore-sigterm') {
  process.on('SIGTERM', () => {
    if (mode === 'delayed-sigterm') setTimeout(() => process.exit(0), 70)
  })
  setInterval(() => {}, 1000)
}
if (process.env.FAKE_EXIT_MARKER) {
  process.on('exit', () => fs.writeFileSync(process.env.FAKE_EXIT_MARKER, 'exited'))
}
if (mode === 'silent' || mode === 'silent-ignore-sigterm') { setInterval(() => {}, 1000) }
else if (mode === 'bad-json-ready') process.stdout.write('{oops\n')
else if (mode === 'oversized-ready') process.stdout.write('a'.repeat(65537))
else {
  const startup = JSON.stringify(ready) + '\n'
  process.stdout.write(mode === 'unsolicited-ready'
    ? startup + JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:'unasked',outputPath:'/tmp/unasked',seed:1}) + '\n'
    : startup)
  process.stdin.setEncoding('utf8')
  let buffer = ''
  let precedingRequestId = null
  process.stdin.on('data', chunk => {
    buffer += chunk
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n')
      const request = JSON.parse(buffer.slice(0,newline)); buffer = buffer.slice(newline+1)
      if (request.type !== 'generate-illustrious-txt2img' && !((mode === 'img2img-done' || mode === 'lora-done' || mode === 'precision-done' || mode === 'precision-error' || mode === 'vae-done' || mode.startsWith('euler-') || mode.startsWith('noise-')) && request.type === 'generate-illustrious-img2img') && !((mode.startsWith('euler-') || mode.startsWith('noise-')) && request.type === 'generate-illustrious-outpaint') && !(mode === 'precision-error' && request.type === 'compose-target')) process.exit(22)
      if (process.env.FAKE_REQUEST_MARKER) fs.writeFileSync(process.env.FAKE_REQUEST_MARKER, request.requestId)
      if (process.env.FAKE_PAYLOAD_MARKER) fs.writeFileSync(process.env.FAKE_PAYLOAD_MARKER, JSON.stringify(request))
      if (mode === 'hang' || mode === 'delayed-sigterm' || mode === 'ignore-sigterm') continue
      if (mode === 'crash') process.exit(7)
      if (mode === 'invalid-json') { process.stdout.write('{oops\n'); continue }
      if (mode === 'oversized-response') { process.stdout.write('a'.repeat(65537)); continue }
      if (mode === 'worker-error') {
        process.stdout.write(JSON.stringify({type:'error',protocolVersion:'1',requestId:request.requestId,code:'MODEL_LOAD_FAILED',message:'Safe error.'})+'\n')
        continue
      }
      if (mode === 'precision-error' || mode === 'noise-error') {
        process.stdout.write(JSON.stringify({
          type:'error', protocolVersion:process.env.FAKE_ERROR_PROTOCOL || '1',
          requestId:process.env.FAKE_ERROR_ID || request.requestId,
          code:process.env.FAKE_ERROR_CODE || 'GENERATION_WORKER_FAILED',
          message:process.env.FAKE_ERROR_MESSAGE || 'VAE inference produced non-finite values.'
        })+'\n')
        continue
      }
      const response = {
        type:'generation-done', protocolVersion:'1', requestId:request.requestId,
        outputPath:request.job.output.pngPath, seed:0xffffffff
      }
      if (mode === 'thumbnail-done') response.thumbnail = {
        outputPath: request.job.output.pngPath + '.thumb.webp', sha256: 'a'.repeat(64),
        byteSize: 128, width: 64, height: 64
      }
      if (mode.startsWith('progress-') || mode === 'legacy-progress') {
        const send = (step, totalSteps = 3, extras = {}) => process.stdout.write(JSON.stringify({
          type:'generation-progress', protocolVersion:'1', requestId:request.requestId,
          step, totalSteps, ...extras
        }) + '\n')
        if (mode === 'progress-wrong-id') send(1, 3, {requestId:randomId()})
        else if (mode === 'progress-zero') send(0)
        else if (mode === 'progress-over-total') send(4)
        else if (mode === 'progress-too-many') send(1, 401)
        else if (mode === 'progress-too-many-for-request') send(1, 2 * request.job.sampling.steps + 1)
        else if (mode === 'progress-changed-total') { send(1); send(2, 4) }
        else if (mode === 'progress-extra-field') send(1, 3, {outputPath:'/private/weights'})
        else if (mode === 'progress-timeout') {
          let step = 0
          setInterval(() => send(Math.min(++step, 40), 40), 15)
        } else if (mode === 'progress-held') send(1)
        else if (mode === 'progress-complete-no-done') { send(1); send(2); send(3) }
        else if (mode === 'progress-stale') {
          if (precedingRequestId) send(2, 3, {requestId:precedingRequestId})
          send(1)
          precedingRequestId = request.requestId
        } else { send(1); send(2); send(2); send(1); send(3) }
        if (['progress-timeout','progress-held','progress-complete-no-done'].includes(mode)) continue
      }
      if (mode === 'wrong-id') response.requestId = randomId()
      if (mode === 'wrong-output') response.outputPath = '/tmp/other.png'
      if (mode === 'bad-seed') response.seed = -1
      if (mode === 'wrong-type') response.type = 'done'
      const answer = JSON.stringify(response)+'\n'
      if (mode === 'late-done-after-wrong') {
        const wrong = {...response, requestId:randomId()}
        process.stdout.write(JSON.stringify(wrong)+'\n'+answer)
      } else {
        process.stdout.write(answer)
        if (mode === 'progress-stale') process.stdout.write(JSON.stringify({
          type:'generation-progress', protocolVersion:'1', requestId:request.requestId,
          step:2, totalSteps:3
        })+'\n')
      }
    }
  })
}
function randomId() { return '00000000-0000-4000-8000-000000000000' }
`
  await writeFile(executable, script)
  await chmod(executable, 0o700)
  try {
    await run({
      executable,
      location: { pythonExecutable: executable, runtimeRoot, scratchBasePath },
      root,
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

async function requestFor(fixture: Fixture): Promise<IllustriousTxt2ImgRequestV1> {
  const stage = await mkdtemp(path.join(fixture.location.scratchBasePath, 'illustrious-request-'))
  const targetPath = path.join(stage, 'target.png')
  await writeFile(targetPath, 'frozen target')
  return {
    job: {
      bbox: { height: 64, width: 64, x: 0, y: 0 },
      checkpoint: {
        path: path.join(fixture.root, 'model.safetensors'),
        predictionType: 'epsilon',
        sha256: 'a'.repeat(64),
      },
      output: { pngPath: path.join(stage, 'result.png'), stagingRoot: stage },
      prompts: { negative: '', positive: 'portrait' },
      sampling: { cfgScale: 5, scheduler: 'euler_a', seed: 123, steps: 20 },
      schemaVersion: 1,
      target: {
        byteSize: 13,
        height: 64,
        iccSha256: 'c'.repeat(64),
        path: targetPath,
        sha256: 'b'.repeat(64),
        width: 64,
      },
    },
    protocolVersion: '1',
    requestId: randomUUID(),
    type: 'generate-illustrious-txt2img',
  }
}

test('qualified 0.13.0 ordinary Euler survives actual txt2img and img2img JSONL without a scheduler fallback', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'euler-payload.json')
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_MODE: 'euler-done', FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      for (const mode of ['txt2img', 'img2img'] as const) {
        const original = await requestFor(fixture)
        original.job.sampling.scheduler = 'euler'
        const request =
          mode === 'txt2img'
            ? original
            : {
                ...original,
                job: {
                  ...original.job,
                  sampling: { ...original.job.sampling, denoisingStrength: 0.5 },
                },
                type: 'generate-illustrious-img2img' as const,
              }
        const expected = structuredClone(request)
        const targetBefore = await readFile(request.job.target.path)
        const pending = client.generate(request)
        request.job.sampling.scheduler = 'euler_a'
        const completed = await pending
        assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), expected)
        assert.deepEqual(completed, {
          outputPath: expected.job.output.pngPath,
          protocolVersion: '1',
          requestId: expected.requestId,
          seed: 0xff_ff_ff_ff,
          type: 'generation-done',
        })
        assert.deepEqual(await readFile(expected.job.target.path), targetBefore)
        // The controlled peer proves the client exchange, not trained output publication.
        assert.equal(existsSync(expected.job.output.pngPath), false)
      }
    } finally {
      await client.close()
    }
  })
})

for (const peerMode of ['euler-old-spoof', 'euler-missing-capability']) {
  test(`${peerMode} refuses ordinary Euler txt2img, img2img and outpaint before path validation or wire`, async () => {
    await withFixture(async (peer) => {
      await withOutpaintConsumerFixture('illustrious', async (fixture) => {
        const location = { ...peer.location, scratchBasePath: fixture.scratch }
        const marker = path.join(peer.root, 'euler-payload.json')
        const client = await GenerationWorkerClient.start(location, {
          environment: { FAKE_MODE: peerMode, FAKE_PAYLOAD_MARKER: marker },
        })
        try {
          const requestFixture = { ...peer, location }
          const txt2img = await requestFor(requestFixture)
          txt2img.job.sampling.scheduler = 'euler'
          const image = await requestFor(requestFixture)
          const img2img = {
            ...image,
            job: {
              ...image.job,
              sampling: {
                ...image.job.sampling,
                denoisingStrength: 0.5,
                scheduler: 'euler' as const,
              },
            },
            type: 'generate-illustrious-img2img' as const,
          }
          const provisionalRoot = await mkdtemp(path.join(fixture.scratch, 'illustrious-request-'))
          const targetPath = path.join(provisionalRoot, 'target.png')
          await writeFile(targetPath, fixture.target.composite.bytes)
          const outpaint = buildQueuedOutpaintWorkerRequest({
            infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
            outputPath: path.join(provisionalRoot, 'result.png'),
            payload: buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID()),
            provisionalRoot,
            ready: OUTPAINT_READY,
            requestId: randomUUID(),
            targetPath,
          })
          assert.equal(outpaint.type, 'generate-illustrious-outpaint')
          if (outpaint.type !== 'generate-illustrious-outpaint') {
            throw new Error('The Illustrious fixture returned another command.')
          }
          outpaint.job.sampling.scheduler = 'euler'
          const requests: GenerationWorkerRequest[] = [txt2img, img2img, outpaint]
          // Observe the actual precondition method; no file validator or dispatch is substituted.
          const pathClient = client as unknown as {
            validateRequestPaths: (request: GenerationWorkerRequest) => Promise<void>
          }
          const pathInspection = mock.method(pathClient, 'validateRequestPaths')
          try {
            for (const request of requests) {
              const expected = structuredClone(request)
              const targetBefore = await readFile(request.job.target.path)
              const scratchBefore = await readdir(request.job.output.stagingRoot)
              await assert.rejects(client.generate(request), (error) => {
                assert.ok(error instanceof GenerationWorkerError)
                assert.equal(error.code, 'WORKER_VERSION_MISMATCH', request.type)
                assert.equal(
                  error.message,
                  'The active worker has not qualified ordinary Illustrious Euler.',
                )
                return true
              })
              assert.equal(pathInspection.mock.callCount(), 0, request.type)
              assert.equal(existsSync(marker), false, request.type)
              assert.equal(existsSync(request.job.output.pngPath), false, request.type)
              assert.deepEqual(await readFile(request.job.target.path), targetBefore)
              assert.deepEqual(await readdir(request.job.output.stagingRoot), scratchBefore)
              assert.deepEqual(request, expected)
            }
          } finally {
            pathInspection.mock.restore()
          }
          // A refusal must release the client and retain the established Euler a path.
          const neighbor = await requestFor(requestFixture)
          const completed = await client.generate(neighbor)
          assert.deepEqual(completed, {
            outputPath: neighbor.job.output.pngPath,
            protocolVersion: '1',
            requestId: neighbor.requestId,
            seed: 0xff_ff_ff_ff,
            type: 'generation-done',
          })
          assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), neighbor)
        } finally {
          await client.close()
        }
      })
    })
  })
}

test('native Anima Euler txt2img and img2img do not require the Illustrious 0.13.0 capability', async () => {
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker },
    })
    try {
      assert.equal(client.ready.workerVersion, '0.11.0')
      assert.equal(client.ready.capabilities.includes('illustrious-euler'), false)
      const sent: GenerationWorkerRequest[] = []
      for (const strength of [null, 0.5]) {
        const request = await fixture.request('euler', strength)
        const completed = await client.generate(request)
        assert.deepEqual(completed, {
          outputPath: request.job.output.pngPath,
          protocolVersion: '1',
          requestId: request.requestId,
          seed: 0,
          type: 'generation-done',
        })
        sent.push(request)
      }
      const received = (await readFile(fixture.marker, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      assert.deepEqual(received, sent)
    } finally {
      await client.close()
    }
  })
})

test('actual JSONL dispatch preserves rescale for 0.5.0, strips neutral zero for old peers and refuses nonneutral before sending', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'payload.json')
    const current = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_MODE: 'rescale-done', FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      for (const cfgRescale of [0, 0.3, 0.99]) {
        const request = await requestFor(fixture)
        request.job.sampling.cfgRescale = cfgRescale
        await current.generate(request)
        assert.equal(JSON.parse(await readFile(marker, 'utf8')).job.sampling.cfgRescale, cfgRescale)
      }
    } finally {
      await current.close()
    }
    const legacy = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      const neutral = await requestFor(fixture)
      neutral.job.sampling.cfgRescale = 0
      await legacy.generate(neutral)
      assert.equal(
        Object.hasOwn(JSON.parse(await readFile(marker, 'utf8')).job.sampling, 'cfgRescale'),
        false,
      )
      assert.equal(
        neutral.job.sampling.cfgRescale,
        0,
        'wire adaptation does not alter caller or durable input',
      )
      await rm(marker)
      for (const cfgRescale of [0.3, -0.1, 1, NaN]) {
        const request = await requestFor(fixture)
        request.job.sampling.cfgRescale = cfgRescale
        await assert.rejects(legacy.generate(request), {
          code: cfgRescale === 0.3 ? 'WORKER_VERSION_MISMATCH' : 'INVALID_REQUEST',
        })
        assert.equal(existsSync(marker), false, 'no unsupported command reached the child')
      }
    } finally {
      await legacy.close()
    }
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: 'rescale-missing-capability' },
      }),
      { code: 'WORKER_VERSION_MISMATCH' },
    )
  })
})

function options(mode: string, more: Record<string, string> = {}) {
  return {
    environment: { FAKE_MODE: mode, ...more },
    requestTimeoutMs: 300,
    shutdownWaitMs: 40,
    startupTimeoutMs: 300,
  }
}

function isCode(code: GenerationWorkerError['code']) {
  return (error: unknown): boolean => error instanceof GenerationWorkerError && error.code === code
}

test('validated native Illustrious JSONL VAE and UNet non-finite errors retain only a typed private reason', async () => {
  await withFixture(async (fixture) => {
    for (const [workerMessage, reason, mode] of [
      ['VAE inference produced non-finite values.', 'vae-non-finite', 'txt2img'],
      ['VAE inference produced non-finite values.', 'vae-non-finite', 'img2img'],
      ['UNet inference produced non-finite values.', 'unet-non-finite', 'txt2img'],
      ['UNet inference produced non-finite values.', 'unet-non-finite', 'img2img'],
    ] as const) {
      const client = await GenerationWorkerClient.start(
        fixture.location,
        options('precision-error', { FAKE_ERROR_MESSAGE: workerMessage }),
      )
      try {
        const original = await requestFor(fixture)
        const request =
          mode === 'txt2img'
            ? original
            : {
                ...original,
                job: {
                  ...original.job,
                  sampling: { ...original.job.sampling, denoisingStrength: 0.5 },
                },
                type: 'generate-illustrious-img2img' as const,
              }
        request.job.vaePrecision = 'FP16'
        await assert.rejects(client.generate(request), (error) => {
          assert.ok(error instanceof GenerationWorkerError)
          assert.equal(error.code, 'WORKER_REQUEST_FAILED')
          assert.equal(error.workerCode, 'GENERATION_WORKER_FAILED')
          assert.equal(error.failureReason, reason)
          assert.equal(error.message, 'The generation worker rejected the request.')
          assert.ok(!JSON.stringify(error).includes('inference produced'))
          return true
        })
        assert.deepEqual(request.job.loras ?? [], [], 'UNet refusal does not require a LoRA')
        assert.equal(existsSync(request.job.output.pngPath), false)
      } finally {
        await client.close()
      }
    }
  })
})

test('validated Illustrious outpaint JSONL UNet refusal retains its stage without publishing output', async () => {
  await withFixture(async (peer) => {
    await withOutpaintConsumerFixture('illustrious', async (fixture) => {
      const marker = path.join(peer.root, 'unet-outpaint-wire.json')
      const client = await GenerationWorkerClient.start(
        { ...peer.location, scratchBasePath: fixture.scratch },
        options('noise-error', {
          FAKE_ERROR_MESSAGE: 'UNet inference produced non-finite values.',
          FAKE_PAYLOAD_MARKER: marker,
        }),
      )
      try {
        const provisionalRoot = await mkdtemp(path.join(fixture.scratch, 'illustrious-request-'))
        const targetPath = path.join(provisionalRoot, 'target.png')
        await writeFile(targetPath, fixture.target.composite.bytes)
        const request = buildQueuedOutpaintWorkerRequest({
          infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
          outputPath: path.join(provisionalRoot, 'result.png'),
          payload: buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID()),
          provisionalRoot,
          ready: client.ready,
          requestId: randomUUID(),
          targetPath,
        })
        assert.equal(request.type, 'generate-illustrious-outpaint')
        const expectedWire = structuredClone(request)
        const pathClient = client as unknown as {
          validateRequestPaths: (request: GenerationWorkerRequest) => Promise<void>
        }
        const verifyPaths = pathClient.validateRequestPaths.bind(pathClient)
        // This fixture supplies a tiny identity-only LaMa substitute. Control only that
        // verification precondition; validate every other file with the actual ordinary-family
        // path verifier. The native outpaint DTO, JSONL dispatch and physical close stay real.
        // This test makes no LaMa hash qualification or trained inference claim.
        const pathPrecondition = mock.method(
          pathClient,
          'validateRequestPaths',
          async (input: GenerationWorkerRequest) => {
            assert.deepEqual(input, expectedWire)
            const { conditioning: _conditioning, infillResource, ...job } = request.job
            assert.equal(
              await readFile(infillResource.path, 'utf8'),
              'Explicit identity-only LaMa resolver substitute',
            )
            await verifyPaths({
              ...request,
              job,
              type: 'generate-illustrious-img2img',
            })
          },
        )
        try {
          await assert.rejects(client.generate(request), (error) => {
            assert.ok(error instanceof GenerationWorkerError)
            assert.equal(error.code, 'WORKER_REQUEST_FAILED')
            assert.equal(error.workerCode, 'GENERATION_WORKER_FAILED')
            assert.equal(error.failureReason, 'unet-non-finite')
            assert.equal(error.message, 'The generation worker rejected the request.')
            assert.ok(!JSON.stringify(error).includes('inference produced'))
            return true
          })
          assert.equal(pathPrecondition.mock.callCount(), 1)
          assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), expectedWire)
        } finally {
          pathPrecondition.mock.restore()
        }
        assert.deepEqual(await readFile(targetPath), fixture.target.composite.bytes)
        assert.equal(existsSync(request.job.output.pngPath), false)
      } finally {
        await client.close()
      }
    })
  })
})

test('other or malformed JSONL errors cannot acquire a VAE or UNet non-finite classification', async () => {
  await withFixture(async (fixture) => {
    for (const [environment, code] of [
      [
        { FAKE_ERROR_MESSAGE: 'Resource conditioning produced non-finite values.' },
        'WORKER_REQUEST_FAILED',
      ],
      [
        {
          FAKE_ERROR_MESSAGE:
            'VAE inference produced non-finite values. /private/worker-model.safetensors',
        },
        'WORKER_REQUEST_FAILED',
      ],
      [
        {
          FAKE_ERROR_MESSAGE:
            'UNet inference produced non-finite values. /private/worker-model.safetensors',
        },
        'WORKER_REQUEST_FAILED',
      ],
      [
        { FAKE_ERROR_MESSAGE: 'LoRA inference produced non-finite values.' },
        'WORKER_REQUEST_FAILED',
      ],
      [
        {
          FAKE_ERROR_CODE: 'MODEL_LOAD_FAILED',
          FAKE_ERROR_MESSAGE: 'UNet inference produced non-finite values.',
        },
        'WORKER_REQUEST_FAILED',
      ],
      [{ FAKE_ERROR_CODE: 'MODEL_LOAD_FAILED' }, 'WORKER_REQUEST_FAILED'],
      [{ FAKE_ERROR_CODE: 'malformed_code' }, 'PROTOCOL_ERROR'],
      [{ FAKE_ERROR_MESSAGE: 'x'.repeat(513) }, 'PROTOCOL_ERROR'],
      [{ FAKE_ERROR_ID: randomUUID() }, 'PROTOCOL_ERROR'],
      [{ FAKE_ERROR_PROTOCOL: '2' }, 'WORKER_VERSION_MISMATCH'],
    ] as const) {
      const client = await GenerationWorkerClient.start(
        fixture.location,
        options('precision-error', environment),
      )
      try {
        await assert.rejects(client.generate(await requestFor(fixture)), (error) => {
          assert.ok(error instanceof GenerationWorkerError)
          assert.equal(error.code, code)
          assert.equal(error.failureReason, undefined)
          assert.ok(!JSON.stringify(error).includes('/private/'))
          assert.ok(!error.message.includes('inference produced'))
          return true
        })
      } finally {
        await client.close()
      }
    }
  })
})

test('target composition JSONL errors never acquire a native generation failure reason', async () => {
  await withFixture(async (fixture) => {
    for (const workerMessage of [
      'VAE inference produced non-finite values.',
      'UNet inference produced non-finite values.',
    ]) {
      const client = await GenerationWorkerClient.start(
        fixture.location,
        options('precision-error', { FAKE_ERROR_MESSAGE: workerMessage }),
      )
      try {
        const stagingRoot = await mkdtemp(
          path.join(fixture.location.scratchBasePath, 'target-error-'),
        )
        await assert.rejects(
          client.composeTarget({
            bbox: { height: 64, width: 64, x: 0, y: 0 },
            layers: [],
            stagingRoot,
            targetPngPath: path.join(stagingRoot, 'target.png'),
          }),
          (error) => {
            assert.ok(error instanceof GenerationWorkerError)
            assert.equal(error.code, 'WORKER_REQUEST_FAILED')
            assert.equal(error.workerCode, 'GENERATION_WORKER_FAILED')
            assert.equal(error.failureReason, undefined)
            return true
          },
        )
      } finally {
        await client.close()
      }
    }
  })
})

test('native Anima JSONL errors with the same code and message stay unclassified', async () => {
  for (const workerMessage of [
    'VAE inference produced non-finite values.',
    'UNet inference produced non-finite values.',
  ]) {
    await withAnimaDispatchClientFixture(async (fixture) => {
      const executable = fixture.location.pythonExecutable
      const source = await readFile(executable, 'utf8')
      const anchor = 'const total = request.job.sampling.totalSteps'
      assert.equal(source.split(anchor).length, 2)
      await writeFile(
        executable,
        source.replace(
          anchor,
          String.raw`process.stdout.write(JSON.stringify({
      type:'error', protocolVersion:'1', requestId:request.requestId,
      code:'GENERATION_WORKER_FAILED', message:${JSON.stringify(workerMessage)}
    })+'\n')
    continue
    const total = request.job.sampling.totalSteps`,
        ),
      )
      for (const strength of [null, 0.5]) {
        const client = await GenerationWorkerClient.start(fixture.location, {
          environment: { MARKER: fixture.marker },
        })
        try {
          await assert.rejects(
            client.generate(await fixture.request('euler', strength)),
            (error) => {
              assert.ok(error instanceof GenerationWorkerError)
              assert.equal(error.code, 'WORKER_REQUEST_FAILED')
              assert.equal(error.workerCode, 'GENERATION_WORKER_FAILED')
              assert.equal(error.failureReason, undefined)
              return true
            },
          )
        } finally {
          await client.close()
        }
      }
    })
  }
})

test(
  'an established image close failure during path inspection blocks the actual inference spawn until physical exit',
  { timeout: 10_000 },
  async () => {
    await withFixture(async (fixture) => {
      const cpuExecutable = path.join(fixture.location.runtimeRoot, 'cpu-python')
      await writeFile(
        cpuExecutable,
        `#!${process.execPath}\nprocess.on('SIGTERM', () => {})\nsetInterval(() => {}, 1000)\nprocess.stdin.resume()\nprocess.stdout.write(JSON.stringify({type:'ready',protocolVersion:'1',workerVersion:'0.1.0',pythonVersion:'3.12.13',runtimeProfile:'derivatives-only',capabilities:['image-derivatives','import-normalization','self-test']})+'\\n')\n`,
      )
      await chmod(cpuExecutable, 0o700)
      const cpu = await ProjectWorkerClient.start(
        {
          pythonExecutable: cpuExecutable,
          runtimeRoot: fixture.location.runtimeRoot,
          stagingBasePath: fixture.location.scratchBasePath,
        },
        { shutdownWaitMs: 1 },
      )
      const child = (cpu as unknown as { child: ChildProcessWithoutNullStreams }).child
      const originalKill = child.kill.bind(child)
      child.kill = (signal) => (signal === 'SIGKILL' ? false : originalKill(signal))
      const spawnMarker = path.join(fixture.root, 'inference-spawns')
      // Delay real async path inspection, while actual OS close/timer progress remains runnable.
      const inspections = Array.from(
        { length: Number(process.env.UV_THREADPOOL_SIZE ?? 4) },
        () =>
          new Promise<void>((resolve, reject) => {
            pbkdf2('path-inspection-control', 'salt', 200_000, 32, 'sha256', (error) => {
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            })
          }),
      )
      let unexpected: GenerationWorkerClient | undefined
      try {
        const closing = assert.rejects(cpu.close(), { code: 'WORKER_EXIT_UNCONFIRMED' })
        assert.equal(
          ProjectWorkerClient.hasUnconfirmedExit(),
          false,
          'the late fence is not yet set',
        )
        const attempt = await GenerationWorkerClient.start(
          fixture.location,
          options('done', {
            FAKE_SPAWN_MARKER: spawnMarker,
          }),
        ).then(
          (client) => ({ client, error: undefined }),
          (error: unknown) => ({ client: undefined, error }),
        )
        unexpected = attempt.client
        if (unexpected) {
          await unexpected.close()
        }
        await closing
        assert.equal(
          existsSync(spawnMarker),
          false,
          'no inference child starts after the late CPU exit failure',
        )
        assert.ok(attempt.error instanceof GenerationWorkerError)
        assert.equal(attempt.error.code, 'WORKER_EXIT_UNCONFIRMED')
        child.kill = originalKill
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
        child.kill('SIGKILL')
        await exited
        assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
        const resumed = await GenerationWorkerClient.start(
          fixture.location,
          options('done', {
            FAKE_SPAWN_MARKER: spawnMarker,
          }),
        )
        await resumed.close()
        assert.equal((await readFile(spawnMarker, 'utf8')).trim().split('\n').length, 1)
      } finally {
        await Promise.all(inspections)
        child.kill = originalKill
        if (child.exitCode === null && child.signalCode === null) {
          const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
          child.kill('SIGKILL')
          await exited
        }
        await cpu.close()
        if (unexpected) {
          await unexpected.close()
        }
      }
    })
  },
)

test('real inference subprocess requires an exact ready and returns correlated actual seed', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(
      fixture.location,
      options('done', { HF_HUB_OFFLINE: '0', TRANSFORMERS_OFFLINE: '0' }),
    )
    try {
      assert.deepEqual(client.ready.capabilities, ['illustrious-txt2img'])
      const request = await requestFor(fixture)
      const result = await client.generate(request)
      assert.deepEqual(result, {
        outputPath: request.job.output.pngPath,
        protocolVersion: '1',
        requestId: request.requestId,
        seed: 0xff_ff_ff_ff,
        type: 'generation-done',
      })
    } finally {
      await client.close()
    }
  })
})

test('unqualified, silent, malformed, and unsolicited startup fail before a client is returned', async () => {
  await withFixture(async (fixture) => {
    for (const mode of [
      'bad-protocol',
      'bad-version',
      'future-version',
      'thumbnail-missing-capability',
      'bad-profile',
      'no-capability',
      'new-missing-progress',
    ]) {
      await assert.rejects(
        GenerationWorkerClient.start(fixture.location, options(mode)),
        isCode('WORKER_VERSION_MISMATCH'),
        mode,
      )
    }
    for (const mode of ['bad-json-ready', 'oversized-ready', 'unsolicited-ready']) {
      await assert.rejects(
        GenerationWorkerClient.start(fixture.location, options(mode)),
        isCode('PROTOCOL_ERROR'),
        mode,
      )
    }
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, options('silent')),
      isCode('STARTUP_TIMEOUT'),
    )
  })
})

test('qualified JSONL progress is monotonic, request-scoped, and cannot replace the terminal result', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('progress-done'))
    try {
      assert.equal(client.ready.workerVersion, '0.3.0', 'preserve the actual qualified version')
      const observed: GenerationDenoisingProgress[] = []
      const request = await requestFor(fixture)
      const done = await client.generate(request, (progress) => {
        assert.equal(Object.isFrozen(progress), true)
        observed.push(progress)
      })
      assert.deepEqual(observed, [
        { step: 1, totalSteps: 3 },
        { step: 2, totalSteps: 3 },
        { step: 3, totalSteps: 3 },
      ])
      assert.equal((done as { requestId: string }).requestId, request.requestId)
      assert.equal((done as { type: string }).type, 'generation-done')
    } finally {
      await client.close()
    }
  })
})

test('a throwing progress observer does not reject a valid inference result', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('progress-done'))
    try {
      let callbacks = 0
      const done = await client.generate(await requestFor(fixture), () => {
        callbacks += 1
        throw new Error('presentation observer failed')
      })
      assert.equal(callbacks, 3)
      assert.equal((done as { type: string }).type, 'generation-done')
    } finally {
      await client.close()
    }
  })
})

test('settled generation progress is ignored after completion and while the next request is active', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('progress-stale'))
    try {
      const first: GenerationDenoisingProgress[] = []
      const second: GenerationDenoisingProgress[] = []
      await client.generate(await requestFor(fixture), (progress) => first.push(progress))
      await client.generate(await requestFor(fixture), (progress) => second.push(progress))
      assert.deepEqual(first, [{ step: 1, totalSteps: 3 }])
      assert.deepEqual(second, [{ step: 1, totalSteps: 3 }])
      assert.equal(client.ready.workerVersion, '0.3.0')
    } finally {
      await client.close()
    }
  })
})

test('legacy, crossed, malformed, unbounded and inconsistent progress fail the actual exchange', async () => {
  await withFixture(async (fixture) => {
    for (const mode of [
      'legacy-progress',
      'progress-wrong-id',
      'progress-zero',
      'progress-over-total',
      'progress-too-many',
      'progress-too-many-for-request',
      'progress-changed-total',
      'progress-extra-field',
    ]) {
      const client = await GenerationWorkerClient.start(fixture.location, options(mode))
      try {
        await assert.rejects(
          client.generate(await requestFor(fixture)),
          isCode('PROTOCOL_ERROR'),
          mode,
        )
        await assert.rejects(client.generate(await requestFor(fixture)), isCode('CLOSED'), mode)
      } finally {
        await client.close()
      }
    }
  })
})

test('progress keeps the request slot occupied and close rejects a generation without done', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...options('progress-held'),
      requestTimeoutMs: 5000,
    })
    try {
      let acknowledge!: () => void
      const observed = new Promise<void>((resolve) => {
        acknowledge = resolve
      })
      const pending = client.generate(await requestFor(fixture), () => acknowledge())
      void pending.catch(() => undefined)
      await observed
      await assert.rejects(client.generate(await requestFor(fixture)), isCode('BUSY'))
      await client.close()
      await assert.rejects(pending, isCode('CLOSED'))
    } finally {
      await client.close()
    }
  })
})

test('complete denoising progress still times out without a terminal completion', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(
      fixture.location,
      options('progress-complete-no-done'),
    )
    try {
      const observed: GenerationDenoisingProgress[] = []
      await assert.rejects(
        client.generate(await requestFor(fixture), (progress) => observed.push(progress)),
        isCode('REQUEST_TIMEOUT'),
      )
      assert.equal(observed.at(-1)?.step, 3)
    } finally {
      await client.close()
    }
  })
})

test(
  'continuous valid progress does not reset the original request deadline',
  { timeout: 2500 },
  async () => {
    await withFixture(async (fixture) => {
      const client = await GenerationWorkerClient.start(fixture.location, {
        ...options('progress-timeout'),
        requestTimeoutMs: 120,
      })
      try {
        let callbacks = 0
        await assert.rejects(
          client.generate(await requestFor(fixture), () => {
            callbacks += 1
          }),
          isCode('REQUEST_TIMEOUT'),
        )
        assert.ok(callbacks > 1, 'the real child emitted multiple steps before the deadline')
      } finally {
        await client.close()
      }
    })
  },
)

test('transport rejects unowned executable, scratch, and unsafe target paths', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      GenerationWorkerClient.start({ ...fixture.location, pythonExecutable: process.execPath }),
      isCode('INVALID_PATH'),
    )
    const escapedExecutable = path.join(fixture.location.runtimeRoot, 'python-outside')
    await symlink(process.execPath, escapedExecutable)
    await assert.rejects(
      GenerationWorkerClient.start({ ...fixture.location, pythonExecutable: escapedExecutable }),
      isCode('INVALID_PATH'),
    )
    const outside = path.join(fixture.root, 'outside')
    await mkdir(outside)
    await assert.rejects(
      GenerationWorkerClient.start({ ...fixture.location, scratchBasePath: `${outside}/..` }),
      isCode('INVALID_PATH'),
    )
    const client = await GenerationWorkerClient.start(fixture.location, options('done'))
    try {
      const request = await requestFor(fixture)
      const external = path.join(fixture.root, 'external')
      await mkdir(external)
      request.job.output.stagingRoot = external
      request.job.target.path = path.join(external, 'target.png')
      request.job.output.pngPath = path.join(external, 'result.png')
      await assert.rejects(client.generate(request), isCode('INVALID_PATH'))
      const valid = await requestFor(fixture)
      await rm(valid.job.target.path)
      await symlink(path.join(fixture.root, 'external-target'), valid.job.target.path)
      await assert.rejects(client.generate(valid), isCode('INVALID_PATH'))
      const missing = await requestFor(fixture)
      await rm(missing.job.target.path)
      await assert.rejects(client.generate(missing), isCode('INVALID_PATH'))
      const occupied = await requestFor(fixture)
      await writeFile(occupied.job.output.pngPath, 'already present')
      await assert.rejects(client.generate(occupied), isCode('INVALID_PATH'))
      const oversized = await requestFor(fixture)
      oversized.job.prompts.positive = 'x'.repeat(65_536)
      await assert.rejects(client.generate(oversized), isCode('INVALID_REQUEST'))
      const accepted = await requestFor(fixture)
      assert.deepEqual(
        ((await client.generate(accepted)) as { requestId: string }).requestId,
        accepted.requestId,
      )
    } finally {
      await client.close()
    }
  })
})

test('worker errors and malformed completions fail closed on the real child boundary', async () => {
  await withFixture(async (fixture) => {
    for (const [mode, code] of [
      ['worker-error', 'WORKER_REQUEST_FAILED'],
      ['wrong-id', 'PROTOCOL_ERROR'],
      ['wrong-output', 'PROTOCOL_ERROR'],
      ['bad-seed', 'PROTOCOL_ERROR'],
      ['wrong-type', 'PROTOCOL_ERROR'],
      ['invalid-json', 'PROTOCOL_ERROR'],
      ['oversized-response', 'PROTOCOL_ERROR'],
      ['late-done-after-wrong', 'PROTOCOL_ERROR'],
      ['crash', 'WORKER_EXITED'],
    ] as const) {
      const client = await GenerationWorkerClient.start(fixture.location, options(mode))
      try {
        await assert.rejects(client.generate(await requestFor(fixture)), isCode(code), mode)
        await assert.rejects(client.generate(await requestFor(fixture)), isCode('CLOSED'), mode)
      } finally {
        await client.close()
      }
    }
  })
})

test('a hung generation times out and close confirms subprocess exit', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'exit-marker')
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...options('delayed-sigterm', { FAKE_EXIT_MARKER: marker }),
      shutdownWaitMs: 250,
    })
    await assert.rejects(client.generate(await requestFor(fixture)), isCode('REQUEST_TIMEOUT'))
    await client.close()
    assert.equal(existsSync(marker), true)
  })
})

test('an active generation rejects on close, retains a single request slot, and waits for exit', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'request-marker')
    const client = await GenerationWorkerClient.start(fixture.location, {
      ...options('ignore-sigterm', { FAKE_REQUEST_MARKER: marker }),
      requestTimeoutMs: 5000,
    })
    try {
      const pending = client.generate(await requestFor(fixture))
      void pending.catch(() => undefined)
      for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt += 1) {
        await delay(5)
      }
      assert.equal(existsSync(marker), true, 'the real child received the active request')
      await assert.rejects(client.generate(await requestFor(fixture)), isCode('BUSY'))
      const close = client.close()
      await assert.rejects(pending, isCode('CLOSED'))
      await close
    } finally {
      await client.close()
    }
  })
})

test('close escalates to SIGKILL, and unconfirmed exit remains retryable', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('ignore-sigterm'))
    const child = (client as unknown as { child: ChildProcessWithoutNullStreams }).child
    const pid = child.pid
    assert.ok(pid)
    await client.close()
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    await client.close()

    const retry = await GenerationWorkerClient.start(fixture.location, options('ignore-sigterm'))
    const retryChild = (retry as unknown as { child: ChildProcessWithoutNullStreams }).child
    const actualKill = retryChild.kill.bind(retryChild)
    retryChild.kill = () => true
    try {
      await assert.rejects(retry.close(), isCode('WORKER_EXIT_UNCONFIRMED'))
      await assert.rejects(retry.generate(await requestFor(fixture)), isCode('CLOSED'))
    } finally {
      retryChild.kill = actualKill
      await retry.close()
    }
  })
})

test('an unconfirmed startup child blocks concurrent and later starts until its exit is observed', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'started-pids')
    const actualKill = ChildProcess.prototype.kill
    ChildProcess.prototype.kill = function (this: ChildProcess, signal) {
      return this.spawnfile === fixture.executable ? true : actualKill.call(this, signal)
    }
    try {
      const first = GenerationWorkerClient.start(
        fixture.location,
        options('silent-ignore-sigterm', { FAKE_SPAWN_MARKER: marker }),
      )
      for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt += 1) {
        await delay(5)
      }
      assert.equal(existsSync(marker), true, 'the first subprocess started')
      const concurrent = GenerationWorkerClient.start(
        fixture.location,
        options('done', { FAKE_SPAWN_MARKER: marker }),
      )
      await assert.rejects(first, isCode('WORKER_EXIT_UNCONFIRMED'))
      await assert.rejects(concurrent, isCode('WORKER_EXIT_UNCONFIRMED'))
      await assert.rejects(
        GenerationWorkerClient.start(
          fixture.location,
          options('done', { FAKE_SPAWN_MARKER: marker }),
        ),
        isCode('WORKER_EXIT_UNCONFIRMED'),
      )
      assert.equal(await GenerationWorkerClient.retryUnconfirmedStartExit(), false)
      assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 1)

      ChildProcess.prototype.kill = actualKill
      assert.equal(await GenerationWorkerClient.retryUnconfirmedStartExit(), true)
      assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 1)
      const recovered = await GenerationWorkerClient.start(
        fixture.location,
        options('done', { FAKE_SPAWN_MARKER: marker }),
      )
      await recovered.close()
      assert.equal((await readFile(marker, 'utf8')).trim().split('\n').length, 2)
    } finally {
      ChildProcess.prototype.kill = actualKill
      if (existsSync(marker)) {
        for (const pid of (await readFile(marker, 'utf8')).trim().split('\n').map(Number)) {
          try {
            // PID reuse must not let test cleanup signal an unrelated process.
            const commandLine = await readFile(`/proc/${pid}/cmdline`, 'utf8')
            if (commandLine.includes(fixture.executable)) {
              process.kill(pid, 'SIGKILL')
            }
          } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) {
              throw error
            }
          }
        }
      }
    }
  })
})

test('thumbnail-capable 0.4.0 peer qualifies through the actual subprocess boundary', async () => {
  await withFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, options('thumbnail-done'))
    try {
      assert.equal(client.ready.workerVersion, '0.4.0')
      assert.ok(client.ready.capabilities.includes('candidate-thumbnails'))
      const request = await requestFor(fixture)
      const result = await client.generate(request)
      assert.equal((result as { requestId: string }).requestId, request.requestId)
      assert.deepEqual((result as { thumbnail: unknown }).thumbnail, {
        byteSize: 128,
        height: 64,
        outputPath: `${request.job.output.pngPath}.thumb.webp`,
        sha256: 'a'.repeat(64),
        width: 64,
      })
    } finally {
      await client.close()
    }
  })
})

test('real transport carries opaque strength only to qualified 0.6 peers and refuses legacy before wire', async () => {
  await withFixture(async (fixture) => {
    const request = await requestFor(fixture)
    const payloadMarker = path.join(fixture.root, 'opaque-wire.json')
    const imgRequest = {
      ...request,
      job: {
        ...request.job,
        sampling: { ...request.job.sampling, cfgRescale: 0, denoisingStrength: 0.65 },
      },
      type: 'generate-illustrious-img2img' as const,
    }
    const old = await GenerationWorkerClient.start(fixture.location, {
      ...options('rescale-done'),
      environment: { FAKE_MODE: 'rescale-done', FAKE_PAYLOAD_MARKER: payloadMarker },
    })
    try {
      await assert.rejects(old.generate(imgRequest), { code: 'WORKER_VERSION_MISMATCH' })
      assert.equal(existsSync(payloadMarker), false)
      await old.generate(request)
      assert.equal(
        JSON.parse(await readFile(payloadMarker, 'utf8')).type,
        'generate-illustrious-txt2img',
      )
    } finally {
      await old.close()
    }
    await rm(payloadMarker)
    const current = await GenerationWorkerClient.start(fixture.location, {
      ...options('img2img-done'),
      environment: { FAKE_MODE: 'img2img-done', FAKE_PAYLOAD_MARKER: payloadMarker },
    })
    try {
      for (const denoisingStrength of [0, 0.65, 1]) {
        await current.generate({
          ...imgRequest,
          job: { ...imgRequest.job, sampling: { ...imgRequest.job.sampling, denoisingStrength } },
          requestId: randomUUID(),
        })
        const wire = JSON.parse(await readFile(payloadMarker, 'utf8'))
        assert.equal(wire.type, 'generate-illustrious-img2img')
        assert.equal(wire.job.sampling.denoisingStrength, denoisingStrength)
        assert.equal(wire.job.sampling.cfgRescale, 0)
      }
      await rm(payloadMarker)
      for (const denoisingStrength of [undefined, -0.1, 1.1, Infinity, NaN]) {
        await assert.rejects(
          current.generate({
            ...imgRequest,
            job: { ...imgRequest.job, sampling: { ...imgRequest.job.sampling, denoisingStrength } },
          } as never),
          { code: 'INVALID_REQUEST' },
        )
      }
      assert.equal(existsSync(payloadMarker), false)
    } finally {
      await current.close()
    }
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, options('img2img-missing-capability')),
      { code: 'WORKER_VERSION_MISMATCH' },
    )
  })
})

test('qualified native LoRA transport snapshots exact ordered signed, zero and tiny weights', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'actual-lora-wire.json')
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_MODE: 'lora-done', FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      const request = await requestFor(fixture)
      request.job.loras = []
      for (const [index, weight] of [-0.5, 0, 1e-10].entries()) {
        const loraPath = path.join(fixture.root, `adapter-${index}.safetensors`)
        await writeFile(loraPath, 'adapter')
        request.job.loras.push({
          byteSize: 7,
          path: loraPath,
          sha256: String(index + 1).repeat(64),
          weight,
        })
      }
      const expected = structuredClone(request.job.loras)
      const pending = client.generate(request)
      request.job.loras[0].weight = 0.9
      await pending
      const actual = JSON.parse(await readFile(marker, 'utf8'))
      assert.deepEqual(actual.job.loras, expected)
      assert.deepEqual(
        actual.job.loras.map((entry: { weight: number }) => entry.weight),
        [-0.5, 0, 1e-10],
      )
    } finally {
      await client.close()
    }
  })
})

test('VAE Precision transport freezes both modes and strips Auto only from the disposable legacy wire copy', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'precision-wire.json')
    for (const mode of ['precision-done', 'lora-done']) {
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: mode, FAKE_PAYLOAD_MARKER: marker },
      })
      try {
        for (const opaque of [false, true]) {
          for (const precision of ['Auto', 'FP16', 'FP32'] as const) {
            const source = await requestFor(fixture)
            const request = opaque
              ? {
                  ...source,
                  job: {
                    ...source.job,
                    sampling: { ...source.job.sampling, denoisingStrength: 0.65 },
                  },
                  type: 'generate-illustrious-img2img' as const,
                }
              : source
            request.job.vaePrecision = precision
            await rm(marker, { force: true })
            if (mode === 'lora-done' && precision !== 'Auto') {
              await assert.rejects(client.generate(request), { code: 'WORKER_VERSION_MISMATCH' })
              assert.equal(existsSync(marker), false)
              continue
            }
            const pending = client.generate(request)
            request.job.vaePrecision = precision === 'FP32' ? 'FP16' : 'FP32'
            await pending
            const actual = JSON.parse(await readFile(marker, 'utf8'))
            assert.equal(actual.type, request.type)
            if (mode === 'precision-done') {
              assert.equal(actual.job.vaePrecision, precision)
            } else {
              assert.equal(Object.hasOwn(actual.job, 'vaePrecision'), false)
            }
            assert.equal(request.job.vaePrecision, precision === 'FP32' ? 'FP16' : 'FP32')
          }
        }
        for (const value of [null, 'BF16', 16]) {
          const invalid = await requestFor(fixture)
          Object.assign(invalid.job, { vaePrecision: value })
          await rm(marker, { force: true })
          await assert.rejects(client.generate(invalid), { code: 'INVALID_REQUEST' })
          assert.equal(existsSync(marker), false)
        }
      } finally {
        await client.close()
      }
    }
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: 'precision-missing-capability' },
      }),
      { code: 'WORKER_VERSION_MISMATCH' },
    )
  })
})

test('external VAE JSONL freezes exact file DTO in both modes and adapts only Embedded for an older peer', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'vae-wire.json')
    const filePath = path.join(fixture.root, 'selected-vae.safetensors')
    await writeFile(filePath, 'verified VAE')
    const file = { byteSize: 12, path: filePath, sha256: 'e'.repeat(64) }
    for (const mode of ['vae-done', 'precision-done']) {
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: mode, FAKE_PAYLOAD_MARKER: marker },
      })
      try {
        for (const opaque of [false, true]) {
          for (const choice of [undefined, null, file]) {
            const base = await requestFor(fixture)
            const request = opaque
              ? {
                  ...base,
                  job: { ...base.job, sampling: { ...base.job.sampling, denoisingStrength: 0.65 } },
                  type: 'generate-illustrious-img2img' as const,
                }
              : base
            if (choice !== undefined) {
              request.job.vae = structuredClone(choice)
            }
            await rm(marker, { force: true })
            if (mode === 'precision-done' && choice) {
              await assert.rejects(client.generate(request), { code: 'WORKER_VERSION_MISMATCH' })
              assert.equal(existsSync(marker), false)
              continue
            }
            const pending = client.generate(request)
            request.job.vae = null
            await pending
            const actual = JSON.parse(await readFile(marker, 'utf8'))
            assert.equal(actual.type, request.type)
            assert.deepEqual(actual.job.vae, mode === 'vae-done' ? choice : undefined)
            assert.equal(
              Object.hasOwn(actual.job, 'vae'),
              mode === 'vae-done' && choice !== undefined,
            )
            assert.equal(request.job.vae, null)
          }
        }
        for (const choice of [
          false,
          1,
          {},
          { ...file, unexpected: true },
          { ...file, byteSize: 0 },
          { ...file, sha256: 'invalid' },
          { ...file, path: 'relative.safetensors' },
        ]) {
          const request = await requestFor(fixture)
          Object.assign(request.job, { vae: choice })
          await rm(marker, { force: true })
          await assert.rejects(client.generate(request), { code: 'INVALID_REQUEST' })
          assert.equal(existsSync(marker), false)
        }
      } finally {
        await client.close()
      }
    }
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: 'vae-missing-capability' },
      }),
      { code: 'WORKER_VERSION_MISMATCH' },
    )
  })
})

test('external VAE transport refuses missing, changed-size and symlink files before writing a JSONL request', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'unsafe-vae-wire.json')
    const filePath = path.join(fixture.root, 'vae.safetensors')
    const aliasPath = path.join(fixture.root, 'alias-vae.safetensors')
    await writeFile(filePath, 'VAE')
    await symlink(filePath, aliasPath)
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_MODE: 'vae-done', FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      for (const [vaePath, byteSize] of [
        [filePath, 4],
        [aliasPath, 3],
        [path.join(fixture.root, 'missing.safetensors'), 3],
      ] as const) {
        const request = await requestFor(fixture)
        request.job.vae = { byteSize, path: vaePath, sha256: 'e'.repeat(64) }
        await assert.rejects(client.generate(request), { code: 'INVALID_PATH' })
        assert.equal(existsSync(marker), false)
      }
      const neighbor = await requestFor(fixture)
      neighbor.job.vae = { byteSize: 3, path: filePath, sha256: 'e'.repeat(64) }
      await client.generate(neighbor)
      assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')).job.vae, neighbor.job.vae)
    } finally {
      await client.close()
    }
  })
})

test('older qualified transport strips only empty disposable LoRA data and refuses active adapters before writing', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'old-lora-wire.json')
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_MODE: 'img2img-done', FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      const empty = await requestFor(fixture)
      empty.job.loras = []
      await client.generate(empty)
      assert.deepEqual(empty.job.loras, [])
      assert.equal(Object.hasOwn(JSON.parse(await readFile(marker, 'utf8')).job, 'loras'), false)
      await rm(marker)
      const active = await requestFor(fixture)
      active.job.loras = [
        {
          byteSize: 1,
          path: path.join(fixture.root, 'missing.safetensors'),
          sha256: 'a'.repeat(64),
          weight: 0,
        },
      ]
      await assert.rejects(client.generate(active), { code: 'WORKER_VERSION_MISMATCH' })
      assert.equal(existsSync(marker), false)
    } finally {
      await client.close()
    }
  })
})

test('LoRA transport rejects malformed, duplicate and exchanged file records before any worker request', async () => {
  await withFixture(async (fixture) => {
    const marker = path.join(fixture.root, 'refused-lora-wire.json')
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { FAKE_MODE: 'lora-done', FAKE_PAYLOAD_MARKER: marker },
    })
    try {
      const loraPath = path.join(fixture.root, 'adapter.safetensors')
      await writeFile(loraPath, 'adapter')
      const valid = { byteSize: 7, path: loraPath, sha256: 'a'.repeat(64), weight: -0.5 }
      for (const change of [
        { byteSize: 0 },
        { byteSize: 1.5 },
        { byteSize: Infinity },
        { weight: NaN },
        { sha256: 'z'.repeat(64) },
        { path: 'relative.safetensors' },
        { extra: true },
      ]) {
        const request = await requestFor(fixture)
        request.job.loras = [{ ...valid, ...change }]
        await assert.rejects(client.generate(request), { code: 'INVALID_REQUEST' })
        assert.equal(existsSync(marker), false)
      }
      const duplicate = await requestFor(fixture)
      duplicate.job.loras = [valid, { ...valid, weight: 0 }]
      await assert.rejects(client.generate(duplicate), { code: 'INVALID_REQUEST' })
      const changed = await requestFor(fixture)
      changed.job.loras = [{ ...valid, byteSize: 8 }]
      await assert.rejects(client.generate(changed), { code: 'INVALID_PATH' })
      assert.equal(existsSync(marker), false)
      const neighbor = await requestFor(fixture)
      neighbor.job.loras = [valid]
      await client.generate(neighbor)
      assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')).job.loras, [valid])
    } finally {
      await client.close()
    }
  })
})

test('worker 0.7.0 without its adapter capability fails handshake qualification', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: 'lora-missing-capability' },
      }),
      { code: 'WORKER_VERSION_MISMATCH' },
    )
  })
})

test('noise profile crosses real JSONL detached; legacy neutral adaptation never rewrites durable request', async () => {
  await withFixture(async (fixture) => {
    for (const mode of ['noise-done', 'done'] as const) {
      const marker = path.join(fixture.root, `${mode}.json`)
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: mode, FAKE_PAYLOAD_MARKER: marker },
      })
      try {
        const request = await requestFor(fixture)
        request.job.sampling.noiseProfile = {
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: false,
          schemaVersion: 1,
          timestepSpacing: 'leading',
        }
        const original = structuredClone(request)
        await client.generate(request)
        const wire = JSON.parse(await readFile(marker, 'utf8'))
        if (mode === 'noise-done') {
          assert.deepEqual(wire.job.sampling.noiseProfile, original.job.sampling.noiseProfile)
        } else {
          assert.equal('noiseProfile' in wire.job.sampling, false)
        }
        assert.deepEqual(request, original)
      } finally {
        await client.close()
      }
    }
  })
})

test('non-neutral profile refuses old or unqualified peers before JSONL publication and native peer preserves both fields', async () => {
  await withFixture(async (fixture) => {
    for (const mode of ['noise-old-spoof', 'noise-missing-capability', 'noise-done']) {
      const marker = path.join(fixture.root, `${mode}.json`)
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { FAKE_MODE: mode, FAKE_PAYLOAD_MARKER: marker },
      })
      try {
        const request = await requestFor(fixture)
        request.job.sampling.noiseProfile = {
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: true,
          schemaVersion: 1,
          timestepSpacing: 'trailing',
        }
        if (mode === 'noise-done') {
          await client.generate(request)
          assert.deepEqual(
            JSON.parse(await readFile(marker, 'utf8')).job.sampling.noiseProfile,
            request.job.sampling.noiseProfile,
          )
          request.job.sampling.scheduler = 'dpmpp_sde'
          await assert.rejects(client.generate(request), { code: 'INVALID_REQUEST' })
        } else {
          await assert.rejects(client.generate(request), { code: 'WORKER_VERSION_MISMATCH' })
          await assert.rejects(readFile(marker), { code: 'ENOENT' })
        }
      } finally {
        await client.close()
      }
    }
  })
})
