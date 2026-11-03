import {
  type AnimaWorkerRequest,
  buildAnimaWorkerRequest,
} from '../../../shared/projects/anima-worker-request.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GenerationWorkerLocation } from '../generation-worker-client.js'

import { ANIMA_BATCH_READY, type AnimaBatchFixture, withAnimaBatchFixture } from './anima-batch.js'

export type AnimaDispatchClientFixture = AnimaBatchFixture & {
  location: GenerationWorkerLocation
  marker: string
  request: (scheduler?: string, strength?: number | null) => Promise<AnimaWorkerRequest>
}

/** Actual JSONL client/child boundary; only inference replies are controlled, no trained ML claim. */
export async function withAnimaDispatchClientFixture(
  run: (fixture: AnimaDispatchClientFixture) => Promise<void>,
): Promise<void> {
  await withAnimaBatchFixture(async (fixture) => {
    const runtimeRoot = path.join(fixture.root, 'runtime')
    await mkdir(runtimeRoot)
    const executable = path.join(runtimeRoot, 'python')
    const marker = path.join(fixture.root, 'requests.jsonl')
    const source = String.raw`#!${process.execPath}
const fs = require('node:fs')
// Protocol peer only; actual kernel ownership is covered by the lifetime subprocess suite.
const inferenceArgs = process.argv.slice(2)
const inferenceArgsValid = process.platform === 'linux'
 ? inferenceArgs.length === 7 && JSON.stringify(inferenceArgs.slice(0,6)) === JSON.stringify(['-I','-m','imagegen_worker.owned_inference','--parent-pid',String(process.ppid),'--scratch-base']) && require('node:path').isAbsolute(inferenceArgs[6]) && require('node:path').resolve(inferenceArgs[6]) === inferenceArgs[6]
 : inferenceArgs.join(' ') === '-I -m imagegen_worker.inference_main'
if (!inferenceArgsValid) process.exit(21)
if (process.env.HF_HUB_OFFLINE !== '1' || process.env.TRANSFORMERS_OFFLINE !== '1') process.exit(23)
const mode = process.env.MODE || 'done'
fs.writeFileSync(process.env.MARKER + '.pid', String(process.pid))
const ready = ${JSON.stringify(ANIMA_BATCH_READY)}
if (mode === 'no-anima') ready.capabilities = ready.capabilities.filter(x => !x.startsWith('anima-'))
if (mode.startsWith('missing-')) ready.capabilities = ready.capabilities.filter(x => x !== mode.slice(8))
if (mode === 'old') { ready.workerVersion = '0.10.0'; ready.capabilities = ready.capabilities.filter(x => !x.startsWith('anima-')) }
if (process.platform === 'linux') ready.capabilities.push('linux-owned-inference-v1')
if (mode === 'ignore-sigterm') process.on('SIGTERM', () => {})
process.stdout.write(JSON.stringify({...ready, type:'ready', pythonVersion:'3.12.13'}) + '\n')
let buffer = ''; let previous = null
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk
  while (buffer.includes('\n')) {
    const i = buffer.indexOf('\n'); const request = JSON.parse(buffer.slice(0,i)); buffer = buffer.slice(i+1)
    if (!['generate-anima-txt2img','generate-anima-img2img'].includes(request.type)) process.exit(22)
    fs.appendFileSync(process.env.MARKER, JSON.stringify(request) + '\n')
    const total = request.job.sampling.totalSteps
    const send = (step, totalSteps=total, requestId=request.requestId) => process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId,step,totalSteps}) + '\n')
    if (mode === 'stale' && previous) send(1,previous.total,previous.id)
    if (mode === 'bad-stale' && previous) send(1,previous.total+1,previous.id)
    if (mode === 'wrong-total') send(1,total === 0 ? 1 : total + 1)
    else if (mode === 'zero-progress') send(1,1)
    else if (mode === 'crossed-progress') send(1,total, '00000000-0000-4000-8000-000000000000')
    else if (mode === 'changed-total') { send(1); send(2,total-1) }
    else if (mode === 'held' || mode === 'ignore-sigterm') { if(total) send(1); continue }
    else {
      for (let step=1;step<=total;step++) { send(step); if(step===1) {send(1);send(1)} }
    }
    if (mode === 'complete-without-done') continue
    const response = {type:'generation-done',protocolVersion:'1',requestId:request.requestId,outputPath:request.job.output.pngPath,seed:request.job.sampling.seed}
    if (mode === 'wrong-id') response.requestId = '00000000-0000-4000-8000-000000000000'
    if (mode === 'wrong-output') response.outputPath = '/tmp/wrong.png'
    if (mode === 'bad-seed') response.seed = -1
    if (mode === 'wrong-type') response.type = 'target-done'
    process.stdout.write(JSON.stringify(response) + '\n')
    if ((mode === 'stale' || mode === 'bad-stale') && total) {if(mode === 'stale') send(1); previous={id:request.requestId,total}}
  }
})
`
    await writeFile(executable, source)
    await chmod(executable, 0o700)
    const request = async (scheduler = 'heun', strength: number | null = null) => {
      const stage = await mkdtemp(path.join(fixture.scratch, 'anima-request-'))
      const bytes = await (
        await import('./anima-batch.js')
      ).animaFixturePng(strength === null ? 0 : 255)
      const targetPath = path.join(stage, 'target.png')
      await writeFile(targetPath, bytes, { mode: 0o600 })
      const context = fixture.prepared.context
      return buildAnimaWorkerRequest(
        {
          bbox: context.bbox,
          loras: context.loras.map((entry) => ({
            byteSize: entry.byteSize,
            path: entry.managedPath,
            sha256: entry.reference.fileSha256,
            weight: entry.weight,
          })),
          mode: strength === null ? 'txt2img' : 'img2img',
          model: {
            architecture: context.model.architecture,
            checkpoint: {
              byteSize: context.model.checkpoint.byteSize,
              path: context.model.checkpoint.managedPath,
              sha256: context.model.checkpoint.reference.fileSha256,
            },
            qwen3Encoder: {
              byteSize: context.model.qwen3Encoder.byteSize,
              path: context.model.qwen3Encoder.managedPath,
              sha256: context.model.qwen3Encoder.sha256,
            },
            vae: {
              byteSize: context.model.vae.byteSize,
              path: context.model.vae.managedPath,
              sha256: context.model.vae.sha256,
            },
          },
          output: { pngPath: path.join(stage, 'result.png'), stagingRoot: stage },
          prompts: { negative: '(bad:0.5)', positive: '𐐀 (cat:2) dog++' },
          requestId: randomUUID(),
          sampling: { guidanceScale: 4.5, scheduler, seed: 0, steps: 3, strength },
          target: {
            byteSize: bytes.length,
            height: 64,
            iccSha256: context.target.iccSha256,
            path: targetPath,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            width: 64,
          },
        },
        ANIMA_BATCH_READY,
      )
    }
    await run({
      ...fixture,
      location: { pythonExecutable: executable, runtimeRoot, scratchBasePath: fixture.scratch },
      marker,
      request,
    })
  })
}

export async function readAnimaDispatchMarker(
  fixture: AnimaDispatchClientFixture,
): Promise<AnimaWorkerRequest[]> {
  const content = await readFile(fixture.marker, 'utf8')
  return content
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as AnimaWorkerRequest)
}

export async function assertNoAnimaDispatchMarker(
  fixture: AnimaDispatchClientFixture,
): Promise<void> {
  await assert.rejects(
    readFile(fixture.marker),
    (error: unknown) =>
      !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT',
  )
}
