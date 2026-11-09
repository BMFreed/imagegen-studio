import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeightingForInterpretation,
} from '../../shared/projects/anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { GenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type { BoundSmartPatchAnimaRegionalInput } from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInferenceTransport } from './smart-patch-generation-processor.js'
import type { SmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

import { GenerationWorkerClient } from './generation-worker-client.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  bindSmartPatchAnimaRegionalExecution,
  capturePreparedSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import {
  attachSmartPatchAnimaRegionalInput,
  type SmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import { SmartPatchGenerationProcessor } from './smart-patch-generation-processor.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import {
  captureSmartPatchRegionalWorkerInput,
  prepareSmartPatchRegionalWorkerRequest,
} from './smart-patch-regional-worker-request.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'
import { createSourceOutputWorkerOwner } from './test-fixtures/source-output-worker.js'

// Real files, bundle/SQL/processor/client and CPU world output. The child below is an explicit
// protocol/inference substitute, not original native or trained-model qualification.
const CAPABILITY = 'anima-smart-patch-regional-inpaint-v1'
const ready = {
  ...OUTPAINT_READY,
  capabilities: [
    ...OUTPAINT_READY.capabilities,
    'illustrious-euler',
    'illustrious-noise-profile',
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
    CAPABILITY,
    'linux-owned-inference-v1',
  ],
  workerVersion: '0.14.0',
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string) => ({ embeddingRefs: [], text })
const compile = (text: string) =>
  compileAnimaPromptWeightingForInterpretation(text, ANIMA_PROMPT_INTERPRETATION)

async function regionalMaterial(f: SmartPatchQueueFixture) {
  const material: SmartPatchInputMaterial = {
    files: Object.fromEntries(
      Object.entries(f.material.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
    ),
    manifest: structuredClone(f.material.manifest),
  }
  material.manifest.items = [material.manifest.items[0]]
  const item = material.manifest.items[0]
  assert.equal(item.family, 'anima')
  if (item.family !== 'anima') {
    assert.fail('Anima fixture')
  }
  const context = material.manifest.context
  material.manifest.animaPromptInterpretation = ANIMA_PROMPT_INTERPRETATION
  ;(item.inference as { prompts: typeof item.inference.prompts }).prompts = {
    negative: compile(context.generationDraft.negativePrompt.text),
    positive: compile(context.generationDraft.positivePrompt.text),
  }
  const positive = prompt('(blue scarf)1.25')
  const negative = structuredClone(context.generationDraft.negativePrompt)
  const regionId = randomUUID()
  const alpha = Uint8Array.from({ length: context.bbox.width * context.bbox.height }, (_, index) =>
    index % context.bbox.width < context.bbox.width / 2 ? 255 : 127,
  )
  const prepared = capturePreparedSmartPatchAnimaRegionalInput({
    compiledPrompts: [
      {
        polarity: 'positive',
        prompt: item.inference.prompts.positive,
        sourceId: context.layerId,
        text: context.generationDraft.positivePrompt.text,
      },
      {
        polarity: 'negative',
        prompt: item.inference.prompts.negative,
        sourceId: context.layerId,
        text: negative.text,
      },
      {
        polarity: 'positive',
        prompt: compile(positive.text),
        sourceId: regionId,
        text: positive.text,
      },
      {
        polarity: 'negative',
        prompt: compile(negative.text),
        sourceId: regionId,
        text: negative.text,
      },
    ],
    profile: ANIMA_SMART_PATCH_REGIONAL_PROFILE,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    recipe: {
      bbox: structuredClone(context.bbox),
      documentId: context.documentId,
      documentRevision: context.documentRevision,
      family: 'anima',
      globalPrompts: {
        negative,
        positive: structuredClone(context.generationDraft.positivePrompt),
      },
      internalResolution: structuredClone(context.internalResolution),
      item: {
        iteration: 0,
        promptPairIndex: 0,
        prompts: { ...item.item.prompts },
        seed: item.item.seed,
      },
      kind: 'smart-patch-regional-recipe',
      layerId: context.layerId,
      modelSha256: item.inference.model.checkpoint.sha256,
      regions: [
        {
          authoredPrompts: {
            negative: prompt('dormant local'),
            positive,
            useGlobalNegativePrompt: true,
          },
          coverage: {
            alpha,
            bounds: { ...context.bbox },
            intersection: { ...context.bbox },
            kind: 'covered',
          },
          maskId: randomUUID(),
          maskRevision: 2,
          negative: { prompt: negative, source: 'smart-patch' },
          positive,
          regionId,
        },
      ],
      sampling: {
        animaMethod: item.inference.sampling.scheduler,
        cfgScale: item.inference.sampling.guidanceScale,
        denoisingStrength: item.inference.sampling.strength,
        steps: item.inference.sampling.steps,
      },
      smartMask: { maskId: context.mask.id, maskRevision: context.mask.revision },
    },
    schemaVersion: 1,
  })
  return { material: await attachSmartPatchAnimaRegionalInput(material, prepared), prepared }
}

async function originalRequest(
  f: SmartPatchQueueFixture,
  material: SmartPatchInputMaterial,
  stage?: string,
): Promise<Extract<SmartPatchExecutionRequest, { family: 'anima' }>> {
  const root = stage ?? (await mkdtemp(path.join(f.scratch, 'smart-request-')))
  const item = material.manifest.items[0]
  if (item.family !== 'anima') {
    assert.fail('Anima fixture')
  }
  for (const name of ['model-source.png', 'latent-keep-mask.png']) {
    await writeFile(path.join(root, name), material.files[name], { flag: 'wx', mode: 0o600 })
  }
  return {
    family: 'anima',
    inference: structuredClone(item.inference),
    internalResolution: { ...material.manifest.context.internalResolution },
    latentKeepMask: {
      ...material.manifest.files['latent-keep-mask.png'],
      path: path.join(root, 'latent-keep-mask.png'),
    },
    mode: 'inpaint',
    modelSource: {
      ...material.manifest.files['model-source.png']!,
      path: path.join(root, 'model-source.png'),
    },
    output: { pngPath: path.join(root, 'model-result.png'), stagingRoot: root },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  }
}

async function peer(f: SmartPatchQueueFixture, missing?: string, mode = 'done') {
  const runtimeRoot = path.join(f.root, 'regional-protocol-peer')
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
if(process.platform==='linux' && (args.length!==7 || JSON.stringify(args.slice(0,6))!==JSON.stringify(['-I','-m','imagegen_worker.owned_inference','--parent-pid',String(process.ppid),'--scratch-base']))) process.exit(21);
const ready=${JSON.stringify(ready)};ready.capabilities=ready.capabilities.filter(x=>x!==${JSON.stringify(missing ?? '')});
process.stdout.write(JSON.stringify({...ready,type:'ready',pythonVersion:'3.12.13'})+'\n');
let pending='';process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{pending+=data;while(pending.includes('\n')){
 const split=pending.indexOf('\n'),wire=JSON.parse(pending.slice(0,split));pending=pending.slice(split+1);
 let input=null,request=wire;
 if(wire.type==='execute-anima-smart-patch-regional'){
  const bytes=fs.readFileSync(wire.bundle.path);if(bytes.length!==wire.bundle.byteSize || crypto.createHash('sha256').update(bytes).digest('hex')!==wire.bundle.sha256)process.exit(31);
  input=JSON.parse(bytes);request=input.execution;
  input.recipe.regions.forEach((region,index)=>{
   const d=region.coverage.alpha.$alpha8,raw=fs.readFileSync(d.path);
   if(path.basename(d.path)!=='regional-'+index+'.alpha8'||raw.length!==d.byteSize||crypto.createHash('sha256').update(raw).digest('hex')!==d.sha256)process.exit(32);
  });
 }else if(wire.type!=='execute-smart-patch')process.exit(33);
 fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({wire,input})+'\n');
 const total=request.inference.sampling.totalSteps;
 for(let step=1;step<=total;step++)process.stdout.write(JSON.stringify({type:'generation-progress',protocolVersion:'1',requestId:wire.requestId,step,totalSteps:total})+'\n');
 const image=fs.readFileSync(${JSON.stringify(template)});fs.writeFileSync(request.output.pngPath,image,{flag:'wx'});
 const seed=request.inference.sampling.seed+(${JSON.stringify(mode)}==='wrong-seed'?1:0);
 process.stdout.write(JSON.stringify({type:'smart-patch-executed',protocolVersion:'1',requestId:wire.requestId,actualSeed:seed,output:{byteSize:image.length,colorSpace:'srgb',height:64,sha256:crypto.createHash('sha256').update(image).digest('hex'),width:64}})+'\n');
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

for (const missing of [
  undefined,
  CAPABILITY,
  'smart-patch-execution',
  'smart-patch-seed-confirmation',
  'anima-flow-sampling',
]) {
  test(`actual Smart regional JSONL client requires exact peer combination ${missing ?? 'complete'}`, async () => {
    await withSmartPatchQueueFixture('anima', async (f) => {
      const { material, prepared } = await regionalMaterial(f)
      const request = await originalRequest(f, material)
      const bound = bindSmartPatchAnimaRegionalExecution(prepared, request)
      const { client, marker } = await peer(f, missing)
      const initial = await readdir(request.output.stagingRoot)
      try {
        const progress: GenerationDenoisingProgress[] = []
        if (missing) {
          await assert.rejects(client.executeAnimaSmartPatchRegional(bound), {
            code: 'WORKER_VERSION_MISMATCH',
          })
          assert.deepEqual(await readdir(request.output.stagingRoot), initial)
          await assert.rejects(readFile(marker), { code: 'ENOENT' })
        } else {
          const result = await client.executeAnimaSmartPatchRegional(bound, (value) =>
            progress.push(value),
          )
          assert.equal(result.actualSeed, request.inference.sampling.seed)
          assert.equal(result.output.path, request.output.pngPath)
          const observed = JSON.parse((await readFile(marker, 'utf8')).trim())
          assert.equal(observed.wire.type, 'execute-anima-smart-patch-regional')
          assert.deepEqual(observed.input.execution, request)
          assert.equal(observed.input.promptInterpretation, ANIMA_PROMPT_INTERPRETATION)
          assert.equal(observed.input.recipe.regions[0].negative.source, 'smart-patch')
          assert.deepEqual(
            observed.input.recipe.regions[0].negative.prompt,
            prepared.recipe.globalPrompts.negative,
          )
          assert.deepEqual(
            await readFile(observed.input.recipe.regions[0].coverage.alpha.$alpha8.path),
            Buffer.from(prepared.recipe.regions[0].coverage.alpha),
          )
          assert.ok(Buffer.byteLength(JSON.stringify(observed.wire)) < 64 * 1024)
          assert.deepEqual(
            progress,
            Array.from({ length: request.inference.sampling.totalSteps }, (_, index) => ({
              step: index + 1,
              totalSteps: request.inference.sampling.totalSteps,
            })),
          )
          assert.deepEqual(
            await readFile(request.latentKeepMask.path),
            material.files['latent-keep-mask.png'],
          )
        }
      } finally {
        await client.close()
      }
    })
  })
}

for (const kind of ['compiled', 'inherited', 'profile', 'interpretation', 'extra'] as const) {
  test(`complete regional ${kind} disagreement refuses before writes or actual child exchange`, async () => {
    await withSmartPatchQueueFixture('anima', async (f) => {
      const { material, prepared } = await regionalMaterial(f)
      const bound = bindSmartPatchAnimaRegionalExecution(
        prepared,
        await originalRequest(f, material),
      )
      const bad = structuredClone(bound) as unknown as Record<string, any>
      if (kind === 'compiled') {
        bad.compiledPrompts[2].text = 'crossed stream'
      }
      if (kind === 'inherited') {
        bad.recipe.regions[0].negative.prompt.text = 'Canvas negative'
      }
      if (kind === 'profile') {
        bad.profile = 'invoke-krea2-global-support-v1'
      }
      if (kind === 'interpretation') {
        delete bad.promptInterpretation
      }
      if (kind === 'extra') {
        bad.regional = {}
      }
      const initial = await readdir(bound.execution.output.stagingRoot)
      await assert.rejects(
        prepareSmartPatchRegionalWorkerRequest(bad as unknown as BoundSmartPatchAnimaRegionalInput),
        { code: 'INVALID_REQUEST' },
      )
      assert.deepEqual(await readdir(bound.execution.output.stagingRoot), initial)
    })
  })
}

for (const collision of ['bundle', 'alpha', 'symlink'] as const) {
  test(`pre-existing ${collision} sidecar never causes partial installation or overwrite`, async () => {
    await withSmartPatchQueueFixture('anima', async (f) => {
      const { material, prepared } = await regionalMaterial(f)
      const bound = bindSmartPatchAnimaRegionalExecution(
        prepared,
        await originalRequest(f, material),
      )
      const root = bound.execution.output.stagingRoot
      const destination = path.join(
        root,
        collision === 'bundle' ? 'smart-regional.json' : 'regional-0.alpha8',
      )
      const existing = Buffer.from('foreign sidecar/control')
      const control = path.join(f.root, 'foreign-control')
      await writeFile(control, existing)
      await (collision === 'symlink'
        ? symlink(control, destination)
        : writeFile(destination, existing))
      const initial = await readdir(root)
      await assert.rejects(prepareSmartPatchRegionalWorkerRequest(bound), { code: 'INVALID_PATH' })
      assert.deepEqual(await readdir(root), initial)
      assert.deepEqual(await readFile(control), existing)
      assert.deepEqual(await readFile(destination), existing)
    })
  })
}

test('descriptor planning detaches every raw plane and receipt matching remains authoritative', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { material, prepared } = await regionalMaterial(f)
    const bound = bindSmartPatchAnimaRegionalExecution(prepared, await originalRequest(f, material))
    const before = Buffer.from(bound.recipe.regions[0].coverage.alpha)
    const work = prepareSmartPatchRegionalWorkerRequest(bound, false)
    bound.recipe.regions[0].coverage.alpha.fill(0)
    const wire = await work
    assert.equal(Object.hasOwn(wire, 'reportProgress'), false)
    const stored = JSON.parse(await readFile(wire.bundle.path, 'utf8'))
    assert.deepEqual(await readFile(stored.recipe.regions[0].coverage.alpha.$alpha8.path), before)
    assert.deepEqual(
      captureSmartPatchRegionalWorkerInput(
        bindSmartPatchAnimaRegionalExecution(prepared, bound.execution),
      ).execution,
      bound.execution,
    )
  })
})

test('actual client rejects wrong returned seed after the new descriptor command', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { material, prepared } = await regionalMaterial(f)
    const request = await originalRequest(f, material)
    const { client, marker } = await peer(f, undefined, 'wrong-seed')
    try {
      await assert.rejects(
        client.executeAnimaSmartPatchRegional(
          bindSmartPatchAnimaRegionalExecution(prepared, request),
        ),
        { code: 'OUTPUT_MISMATCH' },
      )
      const observed = JSON.parse((await readFile(marker, 'utf8')).trim())
      assert.equal(observed.wire.type, 'execute-anima-smart-patch-regional')
      assert.ok((await readFile(request.output.pngPath)).length > 0)
    } finally {
      await client.close()
    }
  })
})

test('frozen Smart regional dispatch reaches actual world publication with its owned signed input', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { material, prepared } = await regionalMaterial(f)
    const [item] = await admitSmartPatch(f, { material })
    const original = structuredClone(prepared)
    material.manifest.context.generationDraft.negativePrompt.text = 'later Smart draft'
    prepared.recipe.regions[0].negative.prompt.text = 'later region edit'
    prepared.recipe.regions[0].coverage.alpha.fill(0)
    const owner = await createSourceOutputWorkerOwner(f)
    const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await staging.recoverAfterRestart()
    const processor = new SmartPatchGenerationProcessor(
      f.queue,
      staging,
      f.models,
      f.scratch,
      owner,
    )
    let ordinaryCalls = 0
    let regionalCalls = 0
    let received: BoundSmartPatchAnimaRegionalInput | null = null
    const transport: SmartPatchInferenceTransport = {
      close: async () => undefined,
      executeAnimaSmartPatchRegional: async (input) => {
        regionalCalls++
        received = structuredClone(input)
        await prepareSmartPatchRegionalWorkerRequest(input)
        return await literalInference(input.execution)
      },
      executeSmartPatch: async (request) => {
        ordinaryCalls++
        return await literalInference(request)
      },
      ready,
    }
    try {
      const result = await processor.runOne(transport)
      assert.equal(result.kind, 'completed')
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'completed')
      const receipts = await f.database.db
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .execute()
      assert.equal(
        receipts.length,
        1,
        'The route oracle follows real CPU/world candidate publication',
      )
      assert.equal(
        regionalCalls,
        1,
        'Frozen regional input was silently dispatched as ordinary Smart',
      )
      assert.equal(ordinaryCalls, 0)
      assert.ok(received)
      const { execution, ...actual } = received as BoundSmartPatchAnimaRegionalInput
      assert.deepEqual(actual, original)
      assert.equal(execution.inference.sampling.seed, original.recipe.item.seed)
      assert.deepEqual(await readdir(f.scratch), [])
    } finally {
      await processor.stopAndCancelActive()
      await owner.cleanup()
    }
  })
})

test('ordinary Smart dispatch control stays on its existing method with a legacy peer', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    const material = {
      ...f.material,
      manifest: { ...f.material.manifest, items: [f.material.manifest.items[0]] },
    }
    const [item] = await admitSmartPatch(f, { material })
    const owner = await createSourceOutputWorkerOwner(f)
    const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await staging.recoverAfterRestart()
    const processor = new SmartPatchGenerationProcessor(
      f.queue,
      staging,
      f.models,
      f.scratch,
      owner,
    )
    let calls = 0
    try {
      assert.equal(
        (
          await processor.runOne({
            close: async () => undefined,
            executeSmartPatch: async (request) => {
              calls++
              return await literalInference(request)
            },
            ready: { ...ready, capabilities: ready.capabilities.filter((x) => x !== CAPABILITY) },
          })
        ).kind,
        'completed',
      )
      assert.equal(calls, 1)
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'completed')
      assert.deepEqual(await readdir(f.scratch), [])
    } finally {
      await processor.stopAndCancelActive()
      await owner.cleanup()
    }
  })
})

for (const missing of ['capability', 'method'] as const) {
  test(`regional frozen dispatch missing ${missing} cannot fall back or start model/CPU work`, async () => {
    await withSmartPatchQueueFixture('anima', async (f) => {
      const { material } = await regionalMaterial(f)
      const [item] = await admitSmartPatch(f, { material })
      const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
      await staging.recoverAfterRestart()
      let cpu = 0
      let dispatched = 0
      let models = 0
      const resolver = f.models.resolveVerifiedGenerationAnimaBundleForPlan
      const tracked: SmartPatchExecutionModelResolver = {
        ...f.models,
        resolveVerifiedGenerationAnimaBundleForPlan: async (...args) => {
          models++
          return await resolver(...args)
        },
      }
      const processor = new SmartPatchGenerationProcessor(f.queue, staging, tracked, f.scratch, {
        start: async () => {
          cpu++
          throw new Error('CPU must not start')
        },
      })
      try {
        const transport: SmartPatchInferenceTransport = {
          close: async () => undefined,
          executeSmartPatch: async () => {
            dispatched++
            throw new Error('No ordinary fallback')
          },
          ...(missing === 'method'
            ? {}
            : {
                executeAnimaSmartPatchRegional: async () => {
                  dispatched++
                  throw new Error('Unsupported peer')
                },
              }),
          ready: {
            ...ready,
            capabilities:
              missing === 'capability'
                ? ready.capabilities.filter((x) => x !== CAPABILITY)
                : ready.capabilities,
          },
        }
        assert.equal((await processor.runOne(transport)).kind, 'failed')
        assert.equal((await f.queue.getManagerEntry(item.id)).status, 'failed')
        assert.equal(models + cpu + dispatched, 0)
        assert.deepEqual(await readdir(f.scratch), [])
        assert.equal(
          (await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute())
            .length,
          0,
        )
      } finally {
        await processor.stopAndCancelActive()
      }
    })
  })
}

test('unconfirmed regional inference exit retains source KEEP and all sidecars until explicit close retry', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { material } = await regionalMaterial(f)
    const [item] = await admitSmartPatch(f, { material })
    const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await staging.recoverAfterRestart()
    const processor = new SmartPatchGenerationProcessor(f.queue, staging, f.models, f.scratch, {
      start: async () => {
        throw new Error('No CPU after controlled inference exit failure')
      },
    })
    let allowExit = false
    let root = ''
    const error = () =>
      Object.assign(new Error('Controlled missing physical exit'), {
        code: 'WORKER_EXIT_UNCONFIRMED',
      })
    try {
      await assert.rejects(
        processor.runOne({
          close: async () => {
            if (!allowExit) {
              throw error()
            }
          },
          executeAnimaSmartPatchRegional: async (input) => {
            root = input.execution.output.stagingRoot
            await prepareSmartPatchRegionalWorkerRequest(input)
            throw error()
          },
          executeSmartPatch: async () => {
            throw new Error('No ordinary fallback')
          },
          ready,
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'running')
      assert.ok((await readdir(root)).includes('model-source.png'))
      assert.ok((await readdir(root)).includes('latent-keep-mask.png'))
      assert.ok((await readdir(root)).includes('regional-0.alpha8'))
      assert.ok((await readdir(root)).includes('smart-regional.json'))
      assert.equal(
        (await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute())
          .length,
        0,
      )
      allowExit = true
      assert.equal((await processor.cancelAndWait(item.id)).status, 'canceled')
      assert.deepEqual(await readdir(f.scratch), [])
    } finally {
      allowExit = true
      await processor.stopAndCancelActive()
    }
  })
})
