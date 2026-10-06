import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mock, test } from 'node:test'

import type { GenerationWorkerRequest } from './generation-processor.js'

import { buildFrozenQueuedOutpaintV1 } from './generation-queue.js'
import { GenerationWorkerClient, GenerationWorkerError } from './generation-worker-client.js'
import { buildQueuedOutpaintWorkerRequest } from './outpaint-worker-request.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { withOutpaintConsumerFixture } from './test-fixtures/outpaint-consumers.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} actual JSONL client rejects legacy capability, changed policy and unverified infill before sending`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const runtimeRoot = path.join(fixture.root, 'transport-runtime')
      await mkdir(runtimeRoot)
      const executable = path.join(runtimeRoot, 'python')
      const marker = path.join(runtimeRoot, 'sent.json')
      // The child is an explicit protocol peer substitute; Main client/capture/file verification
      // stay real. No trained resource is supplied and no numerical execution is claimed here.
      const script = String.raw`#!${process.execPath}
const fs = require('node:fs');
const ready = process.env.PEER_LEGACY ? ${JSON.stringify(ANIMA_BATCH_READY)} : ${JSON.stringify(OUTPAINT_READY)};
process.stdout.write(JSON.stringify({...ready,type:'ready',pythonVersion:'3.12.13'})+'\n');
process.stdin.on('data', bytes=>fs.appendFileSync(${JSON.stringify(marker)},bytes));
`
      await writeFile(executable, script)
      await chmod(executable, 0o700)
      const stage = await mkdtemp(path.join(fixture.scratch, `${family}-request-`))
      const targetPath = path.join(stage, 'target.png')
      await writeFile(targetPath, fixture.outpaintPrepared.targetPngBytes)
      const request = buildQueuedOutpaintWorkerRequest({
        infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
        outputPath: path.join(stage, 'result.png'),
        payload: buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID()),
        provisionalRoot: stage,
        ready: OUTPAINT_READY,
        requestId: randomUUID(),
        targetPath,
      })
      const location = {
        pythonExecutable: executable,
        runtimeRoot,
        scratchBasePath: fixture.scratch,
      }
      const legacy = await GenerationWorkerClient.start(location, {
        environment: { PEER_LEGACY: '1' },
      })
      try {
        await assert.rejects(legacy.generate(request), { code: 'WORKER_VERSION_MISMATCH' })
      } finally {
        await legacy.close()
      }
      const current = await GenerationWorkerClient.start(location)
      try {
        const altered = structuredClone(request)
        Reflect.set(altered.job.conditioning.policy, 'fadeDistance', 0)
        await assert.rejects(current.generate(altered), { code: 'INVALID_REQUEST' })
        // The fixture resolver only substitutes LaMa metadata. Actual transport must not trust
        // that substitution: its tiny local file cannot satisfy the pinned production artifact.
        await assert.rejects(current.generate(request), { code: 'INVALID_PATH' })
        await assert.rejects(lstat(marker), { code: 'ENOENT' })
      } finally {
        await current.close()
      }
    })
  })
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} outpaint correlated JSONL VAE errors keep safe classification with controlled local-file preconditions`, async (t) => {
    for (const [name, workerMessage, expectedReason] of [
      [
        'exact native VAE refusal',
        'VAE inference produced non-finite values.',
        family === 'illustrious' ? 'vae-non-finite' : undefined,
      ],
      [
        'same-code message with a private path',
        'VAE inference produced non-finite values. /private/model.safetensors',
        undefined,
      ],
    ] as const) {
      await t.test(name, async () => {
        await withOutpaintConsumerFixture(family, async (fixture) => {
          const runtimeRoot = path.join(fixture.root, 'transport-runtime')
          await mkdir(runtimeRoot)
          const executable = path.join(runtimeRoot, 'python')
          const marker = path.join(runtimeRoot, 'sent.jsonl')
          // Only the peer's terminal inference error and LaMa verification precondition are
          // controlled. Public generate(), strict capture, handshake, correlated JSONL exchange
          // and physical close stay real. No trained inference or LaMa hash qualification claim.
          await writeFile(
            executable,
            String.raw`#!${process.execPath}
const fs = require('node:fs');
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker.inference_main') process.exit(21);
const ready = ${JSON.stringify(OUTPAINT_READY)};
process.stdout.write(JSON.stringify({...ready,type:'ready',pythonVersion:'3.12.13'})+'\n');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  while (buffer.includes('\n')) {
    const newline = buffer.indexOf('\n');
    const request = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    fs.appendFileSync(${JSON.stringify(marker)}, JSON.stringify(request)+'\n');
    process.stdout.write(JSON.stringify({
      type:'error',protocolVersion:'1',requestId:request.requestId,
      code:'GENERATION_WORKER_FAILED',message:${JSON.stringify(workerMessage)}
    })+'\n');
  }
});
`,
          )
          await chmod(executable, 0o700)
          const stage = await mkdtemp(path.join(fixture.scratch, `${family}-request-`))
          const targetPath = path.join(stage, 'target.png')
          await writeFile(targetPath, fixture.outpaintPrepared.targetPngBytes)
          const request = buildQueuedOutpaintWorkerRequest({
            infill: await fixture.infillResolver.resolveVerifiedOutpaintInfill(),
            outputPath: path.join(stage, 'result.png'),
            payload: buildFrozenQueuedOutpaintV1(fixture.outpaintPrepared, randomUUID()),
            provisionalRoot: stage,
            ready: OUTPAINT_READY,
            requestId: randomUUID(),
            targetPath,
          })
          const client = await GenerationWorkerClient.start({
            pythonExecutable: executable,
            runtimeRoot,
            scratchBasePath: fixture.scratch,
          })
          const pathClient = client as unknown as {
            validateRequestPaths: (request: GenerationWorkerRequest) => Promise<void>
          }
          const verifyPaths = pathClient.validateRequestPaths.bind(pathClient)
          const pathPrecondition = mock.method(
            pathClient,
            'validateRequestPaths',
            async (input: GenerationWorkerRequest) => {
              assert.deepEqual(input, request)
              // The shared fixture intentionally owns a tiny identity-only infill substitute.
              // Reuse the real ordinary-family path verifier for all other files; this disposable
              // validation view never replaces the native outpaint request sent to the peer.
              const { conditioning: _conditioning, infillResource, ...job } = request.job
              assert.equal(
                await readFile(infillResource.path, 'utf8'),
                'Explicit identity-only LaMa resolver substitute',
              )
              await verifyPaths({
                ...request,
                job,
                type:
                  family === 'illustrious'
                    ? 'generate-illustrious-img2img'
                    : 'generate-anima-img2img',
              } as GenerationWorkerRequest)
            },
          )
          try {
            await assert.rejects(client.generate(request), (error) => {
              assert.ok(error instanceof GenerationWorkerError)
              assert.equal(error.code, 'WORKER_REQUEST_FAILED')
              assert.equal(error.workerCode, 'GENERATION_WORKER_FAILED')
              assert.equal(error.failureReason, expectedReason)
              assert.equal(error.message, 'The generation worker rejected the request.')
              assert.ok(!JSON.stringify(error).includes('/private/'))
              assert.ok(!JSON.stringify(error).includes('VAE inference produced'))
              return true
            })
            assert.equal(pathPrecondition.mock.callCount(), 1)
            const sent = JSON.parse((await readFile(marker, 'utf8')).trim())
            assert.deepEqual(sent, request)
            assert.equal(sent.type, `generate-${family}-outpaint`)
            assert.deepEqual(await readFile(targetPath), fixture.outpaintPrepared.targetPngBytes)
            await assert.rejects(lstat(request.job.output.pngPath), { code: 'ENOENT' })
          } finally {
            pathPrecondition.mock.restore()
            await client.close()
          }
        })
      })
    }
  })
}
