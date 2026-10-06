import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { buildFrozenQueuedOutpaintV1 } from './generation-queue.js'
import { GenerationWorkerClient } from './generation-worker-client.js'
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
