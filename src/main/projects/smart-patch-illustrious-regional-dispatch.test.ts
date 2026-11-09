import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { BoundSmartPatchIllustriousRegionalInput } from './project-smart-patch-illustrious-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import type { SmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

import { GenerationWorkerClient } from './generation-worker-client.js'
import {
  bindSmartPatchIllustriousRegionalExecution,
  capturePreparedSmartPatchIllustriousRegionalInput,
} from './project-smart-patch-illustrious-regional-input.js'
import { attachSmartPatchIllustriousRegionalInput } from './smart-patch-frozen-input.js'
import { SmartPatchGenerationProcessor } from './smart-patch-generation-processor.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import { prepareSmartPatchRegionalWorkerRequest } from './smart-patch-regional-worker-request.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'
import { createSourceOutputWorkerOwner } from './test-fixtures/source-output-worker.js'

// Actual files/SQLite/processor/JSONL/client/world output. The explicit protocol peer
// substitutes inference; original native/trained execution is qualified separately.
const MODES = ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const
const ready = {
  ...OUTPAINT_READY,
  capabilities: [
    ...OUTPAINT_READY.capabilities,
    'illustrious-euler',
    'illustrious-noise-profile',
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    'linux-owned-inference-v1',
    ...MODES.map((mode) => `illustrious-smart-patch-regional-${mode}-v1`),
  ],
  workerVersion: '0.14.0',
}
const prompt = (text: string) => ({ embeddingRefs: [], text })
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function regionalMaterial(f: SmartPatchQueueFixture, mode: (typeof MODES)[number]) {
  const material: SmartPatchInputMaterial = {
    files: Object.fromEntries(
      Object.entries(f.material.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
    ),
    manifest: structuredClone(f.material.manifest),
  }
  material.manifest.items = [material.manifest.items[0]]
  const item = material.manifest.items[0]
  if (item.family !== 'illustrious') {
    assert.fail('Illustrious fixture')
  }
  item.inference = {
    ...item.inference,
    checkpoint: { ...item.inference.checkpoint, predictionType: 'epsilon' },
    loras: [],
    sampling: {
      ...item.inference.sampling,
      cfgRescale: 0,
      noiseProfile: defaultIllustriousNoiseProfile(),
    },
    vae: null,
    vaePrecision: 'Auto',
  }
  const context = material.manifest.context
  context.generationDraft.model!.predictionType = 'epsilon'
  const positive = prompt('(blue scarf)1.25')
  const negative = structuredClone(context.generationDraft.negativePrompt)
  const prepared = capturePreparedSmartPatchIllustriousRegionalInput({
    profile: `invoke-illustrious-smart-regional-${mode}-v1`,
    recipe: {
      bbox: { ...context.bbox },
      documentId: context.documentId,
      documentRevision: context.documentRevision,
      family: 'illustrious',
      globalPrompts: {
        negative,
        positive: structuredClone(context.generationDraft.positivePrompt),
      },
      internalResolution: { ...context.internalResolution },
      item: {
        iteration: 0,
        promptPairIndex: 0,
        prompts: { ...item.item.prompts },
        seed: item.item.seed,
      },
      kind: 'smart-patch-regional-recipe',
      layerId: context.layerId,
      modelSha256: item.inference.checkpoint.sha256,
      regions: [
        {
          authoredPrompts: {
            negative: prompt('dormant {regional|selection}'),
            positive,
            useGlobalNegativePrompt: true,
          },
          coverage: {
            alpha: Uint8Array.from({ length: context.bbox.width * context.bbox.height }, (_, i) =>
              i % 7 ? 127 : 0,
            ),
            bounds: { ...context.bbox },
            intersection: { ...context.bbox },
            kind: 'covered',
          },
          maskId: randomUUID(),
          maskRevision: 2,
          negative: { prompt: negative, source: 'smart-patch' },
          positive,
          regionId: randomUUID(),
        },
      ],
      sampling: {
        cfgScale: item.inference.sampling.cfgScale,
        denoisingStrength: context.generationDraft.sampling.denoisingStrength,
        scheduler: 'euler',
        steps: item.inference.sampling.steps,
      },
      smartMask: { maskId: context.mask.id, maskRevision: context.mask.revision },
    },
    schemaVersion: 1,
  })
  return { material: await attachSmartPatchIllustriousRegionalInput(material, prepared), prepared }
}

async function originalRequest(
  f: SmartPatchQueueFixture,
  material: SmartPatchInputMaterial,
): Promise<Extract<SmartPatchExecutionRequest, { family: 'illustrious' }>> {
  const root = await mkdtemp(path.join(f.scratch, 'illustrious-regional-'))
  const item = material.manifest.items[0]
  if (item.family !== 'illustrious') {
    assert.fail('Illustrious fixture')
  }
  for (const name of ['model-source.png', 'latent-keep-mask.png'] as const) {
    if (material.files[name]) {
      await writeFile(path.join(root, name), material.files[name], { flag: 'wx', mode: 0o600 })
    }
  }
  return {
    family: 'illustrious',
    inference: structuredClone(item.inference),
    internalResolution: { ...material.manifest.context.internalResolution },
    latentKeepMask: {
      ...material.manifest.files['latent-keep-mask.png'],
      path: path.join(root, 'latent-keep-mask.png'),
    },
    mode: material.manifest.mode,
    modelSource: material.manifest.files['model-source.png']
      ? {
          ...material.manifest.files['model-source.png'],
          path: path.join(root, 'model-source.png'),
        }
      : null,
    output: { pngPath: path.join(root, 'model-result.png'), stagingRoot: root },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  }
}

async function peer(f: SmartPatchQueueFixture, missing?: string, wrongSeed = false) {
  const runtimeRoot = path.join(f.root, 'illustrious-regional-protocol-peer')
  await mkdir(runtimeRoot, { mode: 0o700 })
  const executable = path.join(runtimeRoot, 'python')
  const marker = path.join(runtimeRoot, 'requests.jsonl')
  const output = literalSmartPatchColorPng(
    64,
    64,
    Array.from({ length: 64 * 64 }, () => [23, 47, 91]).flat(),
    3,
  )
  const template = path.join(runtimeRoot, 'literal-output.png')
  await writeFile(template, output, { mode: 0o600 })
  const source = String.raw`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const args=process.argv.slice(2);
if(process.platform==='linux' && (args.length!==7 || JSON.stringify(args.slice(0,6))!==JSON.stringify(['-I','-m','imagegen_worker.owned_inference','--parent-pid',String(process.ppid),'--scratch-base'])))process.exit(21);
const ready=${JSON.stringify(ready)};ready.capabilities=ready.capabilities.filter(x=>x!==${JSON.stringify(missing ?? '')});
process.stdout.write(JSON.stringify({...ready,type:'ready',pythonVersion:'3.12.13'})+'\n');
let pending='';process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{pending+=data;while(pending.includes('\n')){
const split=pending.indexOf('\n'),wire=JSON.parse(pending.slice(0,split));pending=pending.slice(split+1);
if(wire.type!=='execute-illustrious-smart-patch-regional')process.exit(33);
const bytes=fs.readFileSync(wire.bundle.path);if(bytes.length!==wire.bundle.byteSize||crypto.createHash('sha256').update(bytes).digest('hex')!==wire.bundle.sha256)process.exit(31);
const input=JSON.parse(bytes),request=input.execution;
input.recipe.regions.forEach((region,index)=>{const d=region.coverage.alpha.$alpha8,raw=fs.readFileSync(d.path);if(path.basename(d.path)!=='regional-'+index+'.alpha8'||raw.length!==d.byteSize||crypto.createHash('sha256').update(raw).digest('hex')!==d.sha256)process.exit(32)});
fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({wire,input})+'\n');
const total=request.inference.sampling.steps;for(let step=1;step<=total;step++)process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId:wire.requestId,step,totalSteps:total})+'\n');
const image=fs.readFileSync(${JSON.stringify(template)});fs.writeFileSync(request.output.pngPath,image,{flag:'wx'});
process.stdout.write(JSON.stringify({type:'smart-patch-executed',protocolVersion:'1',requestId:wire.requestId,actualSeed:request.inference.sampling.seed+${wrongSeed ? 1 : 0},output:{byteSize:image.length,colorSpace:'srgb',height:64,width:64,sha256:crypto.createHash('sha256').update(image).digest('hex')}})+'\n');
}});
`
  await writeFile(executable, source, { mode: 0o700 })
  await chmod(executable, 0o700)
  const client = await GenerationWorkerClient.start(
    { pythonExecutable: executable, runtimeRoot, scratchBasePath: f.scratch },
    { requestTimeoutMs: 5000, shutdownWaitMs: 100, startupTimeoutMs: 5000 },
  )
  return { client, marker }
}

for (const mode of MODES) {
  for (const missing of [
    undefined,
    `illustrious-smart-patch-regional-${mode}-v1`,
    'illustrious-euler',
    'illustrious-noise-profile',
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
  ]) {
    test(`Illustrious Smart ${mode} actual JSONL client requires ${missing ?? 'complete peer'}`, async () => {
      await withSmartPatchQueueFixture(
        'illustrious',
        async (f) => {
          const { material, prepared } = await regionalMaterial(f, mode)
          const request = await originalRequest(f, material)
          const bound = bindSmartPatchIllustriousRegionalExecution(prepared, request)
          const { client, marker } = await peer(f, missing)
          const before = await readdir(request.output.stagingRoot)
          try {
            if (missing) {
              await assert.rejects(client.executeIllustriousSmartPatchRegional(bound), {
                code: 'WORKER_VERSION_MISMATCH',
              })
              assert.deepEqual(await readdir(request.output.stagingRoot), before)
              await assert.rejects(readFile(marker), { code: 'ENOENT' })
            } else {
              const progress: { step: number; totalSteps: number }[] = []
              const result = await client.executeIllustriousSmartPatchRegional(bound, (p) =>
                progress.push(p),
              )
              const observed = JSON.parse((await readFile(marker, 'utf8')).trim())
              assert.equal(observed.wire.type, 'execute-illustrious-smart-patch-regional')
              assert.deepEqual(observed.input.execution, request)
              assert.equal(observed.input.recipe.family, 'illustrious')
              assert.equal(Object.hasOwn(observed.input, 'compiledPrompts'), false)
              assert.equal(Object.hasOwn(observed.input, 'promptInterpretation'), false)
              assert.deepEqual(
                await readFile(observed.input.recipe.regions[0].coverage.alpha.$alpha8.path),
                Buffer.from(prepared.recipe.regions[0].coverage.alpha),
              )
              assert.equal(observed.input.recipe.regions[0].negative.source, 'smart-patch')
              assert.equal(result.actualSeed, request.inference.sampling.seed)
              assert.equal(progress.length, request.inference.sampling.steps)
              assert.deepEqual(
                await readFile(request.latentKeepMask.path),
                material.files['latent-keep-mask.png'],
              )
            }
          } finally {
            await client.close()
          }
        },
        {},
        mode,
      )
    })
  }
  test(`Illustrious Smart ${mode} wrong numeric returned seed refuses after PNG`, async () => {
    await withSmartPatchQueueFixture(
      'illustrious',
      async (f) => {
        const { material, prepared } = await regionalMaterial(f, mode)
        const request = await originalRequest(f, material)
        const { client, marker } = await peer(f, undefined, true)
        try {
          await assert.rejects(
            client.executeIllustriousSmartPatchRegional(
              bindSmartPatchIllustriousRegionalExecution(prepared, request),
            ),
            { code: 'OUTPUT_MISMATCH' },
          )
          assert.ok((await readFile(marker)).length > 0)
          assert.ok((await readFile(request.output.pngPath)).length > 0)
        } finally {
          await client.close()
        }
      },
      {},
      mode,
    )
  })
}

for (const collision of ['bundle', 'alpha', 'symlink'] as const) {
  test(`Illustrious regional preexisting ${collision} preserves every original path`, async () => {
    await withSmartPatchQueueFixture('illustrious', async (f) => {
      const { material, prepared } = await regionalMaterial(f, 'inpaint')
      const request = await originalRequest(f, material)
      const bound = bindSmartPatchIllustriousRegionalExecution(prepared, request)
      const root = request.output.stagingRoot
      const control = path.join(f.root, 'foreign-control')
      const destination = path.join(
        root,
        collision === 'bundle' ? 'smart-regional.json' : 'regional-0.alpha8',
      )
      const content = Buffer.from('preserved foreign bytes')
      await writeFile(control, content)
      await (collision === 'symlink'
        ? symlink(control, destination)
        : writeFile(destination, content))
      const before = await readdir(root)
      await assert.rejects(prepareSmartPatchRegionalWorkerRequest(bound), { code: 'INVALID_PATH' })
      assert.deepEqual(await readdir(root), before)
      assert.deepEqual(await readFile(control), content)
      assert.deepEqual(await readFile(destination), content)
    })
  })
}

for (const mode of MODES) {
  test(`Illustrious Smart regional ${mode} frozen processor publishes world candidate without ordinary fallback`, async () => {
    await withSmartPatchQueueFixture(
      'illustrious',
      async (f) => {
        const { material, prepared } = await regionalMaterial(f, mode)
        const owner = await createSourceOutputWorkerOwner(f)
        const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
        await staging.recoverAfterRestart()
        const resolve = f.models.resolveVerifiedGenerationCheckpointForPlan
        const models = {
          ...f.models,
          resolveVerifiedGenerationCheckpointForPlan: async (
            ...args: Parameters<typeof resolve>
          ) => {
            const result = await resolve(...args)
            return {
              ...result,
              reference: { ...result.reference, predictionType: 'epsilon' as const },
            }
          },
        }
        const [row] = await admitSmartPatch({ ...f, models }, { material })
        const processor = new SmartPatchGenerationProcessor(
          f.queue,
          staging,
          models,
          f.scratch,
          owner,
        )
        let ordinary = 0
        let regional = 0
        let received: BoundSmartPatchIllustriousRegionalInput | undefined
        try {
          const result = await processor.runOne({
            close: async () => undefined,
            executeIllustriousSmartPatchRegional: async (input) => {
              regional++
              received = structuredClone(input)
              await prepareSmartPatchRegionalWorkerRequest(input)
              return literalInference(input.execution)
            },
            executeSmartPatch: async (request) => {
              ordinary++
              return literalInference(request)
            },
            ready,
          })
          assert.equal(result.kind, 'completed')
          assert.equal((await f.queue.getManagerEntry(row.id)).status, 'completed')
          const receipts = await f.database.db
            .selectFrom('generation_candidate_receipt')
            .selectAll()
            .execute()
          assert.equal(
            receipts.length,
            1,
            'Actual CPU/world publication precedes the routing assertion',
          )
          assert.equal(regional, 1)
          assert.equal(ordinary, 0)
          assert.ok(received)
          const { execution, ...actual } = received
          assert.deepEqual(actual, prepared)
          assert.equal(execution.mode, mode)
          assert.deepEqual(await readdir(f.scratch), [])
        } finally {
          await processor.stopAndCancelActive()
          await owner.cleanup()
        }
      },
      {},
      mode,
    )
  })
}

async function literalInference(request: SmartPatchExecutionRequest) {
  const { height, width } = request.internalResolution
  const bytes = literalSmartPatchColorPng(
    width,
    height,
    Array.from({ length: width * height }, () => [23, 47, 91]).flat(),
    3,
  )
  await writeFile(request.output.pngPath, bytes, { flag: 'wx', mode: 0o600 })
  return {
    actualSeed: request.inference.sampling.seed,
    output: {
      byteSize: bytes.length,
      colorSpace: 'srgb' as const,
      height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: request.output.pngPath,
      sha256: sha(bytes),
      width,
    },
  }
}
