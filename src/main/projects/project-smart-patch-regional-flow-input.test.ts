import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'
import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type {
  CapturedSmartPatchRegionalGenerationInput,
  PreparedSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE,
  bindSmartPatchAnimaRegionalExecution,
  captureFrozenSmartPatchAnimaRegionalInputV1,
  capturePreparedSmartPatchAnimaRegionalInput,
  prepareSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import { attachSmartPatchAnimaRegionalInput } from './smart-patch-frozen-input.js'
import { literalPreparedSmartPatchInputMaterial } from './test-fixtures/smart-patch-input-material.js'

type FlowMode = 'img2img' | 'txt2img'
const PROFILE = {
  img2img: ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE,
  txt2img: ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE,
} as const
const prompt = (text: string) => ({ embeddingRefs: [], text })
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type Mutable<T> = T extends readonly (infer Value)[]
  ? Mutable<Value>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T
const mutableCopy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>

function concrete(material: SmartPatchInputMaterial) {
  const item = material.manifest.items[0].item
  return planGenerationBatch({
    baseSeed: item.seed,
    iterations: 1,
    maxJobs: 1,
    maxPrompts: 1,
    negativePrompt: item.prompts.negative,
    positivePrompt: item.prompts.positive,
    seedBehavior: 'per-prompt',
  }).items[0]
}

/** Actual material parser with literal pixels/resources; no source preparation or ML is implied. */
async function fixture(mode: 'inpaint' | 'outpaint' | FlowMode) {
  const material = await literalPreparedSmartPatchInputMaterial('anima', mode)
  const ctx = material.manifest.context
  const base = createEmptyProjectDocumentV1({ title: 'Private Smart flow regional ownership' })
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...ctx.bbox },
    coherenceSettings: { ...ctx.coherenceSettings },
    generationDraft: structuredClone(ctx.generationDraft),
    id: ctx.layerId,
    internalResolution: { ...ctx.internalResolution },
    kind: 'smart-patch',
    locked: ctx.locked,
    mask: structuredClone(ctx.mask),
    maskSettings: { ...ctx.maskSettings },
    name: 'Selected Smart flow owner',
    opacity: 0.25,
    rasterSubLayers: [],
    visible: ctx.visible,
  }
  const document = parseProjectDocumentV1({
    ...base,
    documentId: ctx.documentId,
    documentRevision: ctx.documentRevision,
    generationDraft: {
      ...base.generationDraft,
      negativePrompt: prompt('Unrelated Canvas exclusion'),
      positivePrompt: prompt('Unrelated Canvas subject'),
    },
    lastActualSeedSnapshot: ctx.lastActualSeedSnapshot,
    layers: [
      patch,
      ...ctx.sourceLayerIds.map((id) => ({
        asset: {
          bytes: material.files['source.png'].length,
          height: ctx.bbox.height,
          path: `assets/layers/${id}.png`,
          sha256: digest(material.files['source.png']),
          width: ctx.bbox.width,
        },
        blendMode: 'normal',
        id,
        kind: 'raster',
        locked: false,
        name: 'Frozen below-source fixture',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: ctx.bbox.x, y: ctx.bbox.y },
        visible: true,
      })),
    ],
    regionalGuidance: [0, 1].map((index) => ({
      enabled: true,
      id: randomUUID(),
      locked: false,
      mask: { asset: null, id: randomUUID(), revision: index },
      name: `Independent signed owner ${index}`,
      overlayOpacity: 0,
      prompts: {
        negative: prompt(index === 0 ? '(local exclusion)1.5' : 'dormant {other|text}'),
        positive: index === 0 ? prompt('(regional subject)1.25') : null,
        useGlobalNegativePrompt: index === 1,
      },
    })),
  })
  return { document, material, patch: document.layers[0] as IgsSmartPatchLayerV1 }
}

/** Pure lease/projection collaborators; the separate Service test uses actual saved assets. */
function captured(document: IgsProjectDocumentV1, material: SmartPatchInputMaterial) {
  const calls: string[] = []
  const unused = async (): Promise<never> => {
    throw new Error('Private flow preparation must not invoke another execution owner')
  }
  const capture: CapturedSmartPatchRegionalGenerationInput = {
    regional: {
      assets: [],
      async projectMask(id, target) {
        assert.equal(this, capture.regional)
        calls.push(id)
        const alpha = Uint8Array.from({ length: target.width * target.height }, (_, i) =>
          i % 3 === calls.length - 1 ? 255 : 0,
        )
        return { alpha, bounds: { ...target }, intersection: { ...target }, kind: 'covered' }
      },
      readAsset: unused,
      snapshot: structuredClone({
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        generationDraft: document.generationDraft,
        lastActualSeedSnapshot: document.lastActualSeedSnapshot,
        primaryBbox: document.primaryBbox,
        regionalGuidance: document.regionalGuidance,
      }),
      stagingRoot: '/unused-private-flow-projection',
    },
    smartPatch: {
      composeSource: unused,
      context: structuredClone(material.manifest.context),
      document: structuredClone(document),
      execute: unused,
      executeAndCompose: unused,
      maskPngBytes: null,
      maskPngPath: null,
      prepareBatchInput: unused,
      prepareConditioning: unused,
      prepareContribution: unused,
      prepareInput: unused,
      prepareModelSource: unused,
    },
  }
  return { calls, capture, item: mutableCopy(concrete(material)) }
}

function execution(material: SmartPatchInputMaterial): Mutable<SmartPatchExecutionRequest> {
  const entry = material.manifest.items[0]
  assert.equal(entry.family, 'anima')
  if (entry.family !== 'anima') {
    assert.fail('Original Anima fixture required')
  }
  const root = '/private-smart-flow-stage'
  const request: SmartPatchExecutionRequest = {
    family: 'anima',
    inference: structuredClone(entry.inference),
    internalResolution: { ...material.manifest.context.internalResolution },
    latentKeepMask: {
      ...material.manifest.files['latent-keep-mask.png'],
      path: `${root}/latent-keep-mask.png`,
    },
    mode: material.manifest.mode,
    modelSource: material.manifest.files['model-source.png']
      ? { ...material.manifest.files['model-source.png'], path: `${root}/model-source.png` }
      : null,
    output: { pngPath: `${root}/result.png`, stagingRoot: root },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  }
  return mutableCopy(request)
}

function frozen(prepared: PreparedSmartPatchAnimaRegionalInput) {
  return {
    ...prepared,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    recipe: {
      ...prepared.recipe,
      regions: prepared.recipe.regions.map((region, index) => ({
        ...region,
        coverage: { ...region.coverage, alpha: `regional-${index}.alpha8` },
      })),
    },
  }
}

for (const mode of ['txt2img', 'img2img'] as const) {
  test(`private ${mode} prepare and bind retain selected Smart signed ownership and exact original plan`, async () => {
    const f = await fixture(mode)
    const lease = captured(f.document, f.material)
    const prepared = await prepareSmartPatchAnimaRegionalInput({
      ...lease,
      profile: PROFILE[mode],
      promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    })
    assert.equal(prepared.profile, PROFILE[mode])
    assert.deepEqual(
      lease.calls,
      f.document.regionalGuidance!.map((r) => r.id),
    )
    assert.deepEqual(prepared.recipe.globalPrompts, {
      negative: f.patch.generationDraft.negativePrompt,
      positive: f.patch.generationDraft.positivePrompt,
    })
    assert.equal(prepared.recipe.regions[1].negative.source, 'smart-patch')
    assert.equal(prepared.recipe.regions[1].negative.prompt.text, 'blur')
    assert.equal(prepared.recipe.regions[0].negative.source, 'regional')
    const request = mutableCopy(execution(f.material))
    const result = bindSmartPatchAnimaRegionalExecution(prepared, request)
    assert.equal(result.execution.mode, mode)
    assert.deepEqual(result.execution, request)
    assert.notEqual(result.execution, request)
    assert.deepEqual(result.recipe, prepared.recipe)
    assert.deepEqual(capturePreparedSmartPatchAnimaRegionalInput(prepared), prepared)
    assert.equal(result.execution.inference.sampling.mode, mode)
    assert.equal(result.execution.inference.sampling.strength, mode === 'txt2img' ? null : 0.5)
    assert.equal(result.execution.modelSource === null, mode === 'txt2img')
    const before = structuredClone(result)
    prepared.recipe.regions[0].coverage.alpha.fill(0)
    prepared.recipe.globalPrompts.negative.text = 'late caller mutation'
    assert.equal(request.family, 'anima')
    if (request.family !== 'anima') {
      assert.fail('Anima fixture required')
    }
    request.inference.prompts.negative.cleanedText = 'late command mutation'
    assert.deepEqual(result, before)
  })

  test(`private ${mode} profile is refused by frozen metadata and public material attachment`, async () => {
    const f = await fixture(mode)
    const prepared = await prepareSmartPatchAnimaRegionalInput({
      ...captured(f.document, f.material),
      profile: PROFILE[mode],
      promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    })
    const before = structuredClone(f.material)
    assert.throws(() => captureFrozenSmartPatchAnimaRegionalInputV1(frozen(prepared)), {
      code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    })
    await assert.rejects(attachSmartPatchAnimaRegionalInput(f.material, prepared), {
      code: 'SMART_PATCH_INPUT_INVALID',
      message: 'Private Smart TXT/IMG regional profiles cannot enter the public frozen bundle.',
    })
    assert.deepEqual(f.material.manifest, before.manifest)
    assert.deepEqual(Object.keys(f.material.files), Object.keys(before.files))
    for (const [name, bytes] of Object.entries(f.material.files)) {
      assert.ok(bytes.equals(Buffer.from(before.files[name])), `Refusal changed ${name}`)
    }
  })

  for (const profile of [
    ANIMA_SMART_PATCH_REGIONAL_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    PROFILE[mode === 'txt2img' ? 'img2img' : 'txt2img'],
  ]) {
    test(`private ${mode} original command refuses crossed profile ${profile}`, async () => {
      const f = await fixture(mode)
      const prepared = await prepareSmartPatchAnimaRegionalInput({
        ...captured(f.document, f.material),
        profile,
      })
      assert.throws(() => bindSmartPatchAnimaRegionalExecution(prepared, execution(f.material)), {
        code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
      })
    })
  }

  test(`private ${mode} retains authored strength while only IMG consumes it`, async () => {
    const f = await fixture(mode)
    f.document.layers[0] = { ...f.patch, generationDraft: structuredClone(f.patch.generationDraft) }
    const patch = f.document.layers[0]
    patch.generationDraft.sampling.denoisingStrength = 0.75
    f.material.manifest.context.generationDraft.sampling.denoisingStrength = 0.75
    const prepared = await prepareSmartPatchAnimaRegionalInput({
      ...captured(f.document, f.material),
      profile: PROFILE[mode],
    })
    assert.equal(prepared.recipe.sampling.denoisingStrength, 0.75)
    const request = execution(f.material)
    if (mode === 'txt2img') {
      assert.equal(
        bindSmartPatchAnimaRegionalExecution(prepared, request).execution.inference.sampling
          .strength,
        null,
      )
    } else {
      assert.throws(() => bindSmartPatchAnimaRegionalExecution(prepared, request), {
        code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
      })
      assert.equal(request.family, 'anima')
      if (request.family !== 'anima') {
        assert.fail('Anima fixture required')
      }
      request.inference.sampling = mutableCopy(
        compileAnimaFlowSamplingPlan({
          guidanceScale: 4,
          height: 64,
          mode,
          scheduler: 'euler',
          seed: 0,
          steps: 3,
          strength: 0.75,
          width: 64,
        }),
      )
      assert.equal(
        bindSmartPatchAnimaRegionalExecution(prepared, request).execution.inference.sampling
          .strength,
        0.75,
      )
    }
  })
}

test('legacy default INP and explicit OUT keep their prepared and frozen profile meanings', async () => {
  for (const mode of ['inpaint', 'outpaint'] as const) {
    const f = await fixture(mode)
    const options = captured(f.document, f.material)
    const prepared = await prepareSmartPatchAnimaRegionalInput({
      ...options,
      promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
      ...(mode === 'outpaint' ? { profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE } : {}),
    })
    assert.equal(
      prepared.profile,
      mode === 'inpaint'
        ? ANIMA_SMART_PATCH_REGIONAL_PROFILE
        : ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    )
    assert.equal(
      captureFrozenSmartPatchAnimaRegionalInputV1(frozen(prepared)).profile,
      prepared.profile,
    )
    assert.equal(
      bindSmartPatchAnimaRegionalExecution(prepared, execution(f.material)).execution.mode,
      mode,
    )
  }
})

for (const mode of ['txt2img', 'img2img'] as const) {
  test(`genuine saved reopened Service capture prepares and binds private ${mode} without durable edits`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'igs-smart-regional-flow-'))
    const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
      repository: new ProjectIndexRepository(database.db),
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(root, 'scratch'),
      },
      shadow: new ProjectShadowStore(path.join(root, 'autosave')),
    })
    try {
      const tab = await service.create({
        height: 128,
        title: `Genuine private ${mode}`,
        width: 128,
      })
      const f = await fixture(mode)
      const request = execution(f.material)
      assert.equal(request.family, 'anima')
      if (request.family !== 'anima') {
        assert.fail('Original Anima fixture required')
      }
      const destination = process.env['IGS_SMART_FLOW_HANDOFF_DIR']
      let handoffDirectory: string | undefined
      if (destination) {
        assert.ok(path.isAbsolute(destination) && path.resolve(destination) === destination)
        handoffDirectory = path.join(destination, mode)
        await mkdir(handoffDirectory, { mode: 0o700, recursive: true })
        for (const [name, bytes] of Object.entries(f.material.files)) {
          await writeFile(path.join(handoffDirectory, name), bytes, { flag: 'wx', mode: 0o600 })
        }
        // Explicit synthetic resource bytes exercise real file verification. Native model
        // construction is a declared collaborator; these files are not trained weights.
        const resourceDirectory = path.join(destination, `${mode}-resources`)
        await mkdir(resourceDirectory, { mode: 0o700, recursive: true })
        for (const role of ['checkpoint', 'qwen3Encoder', 'vae'] as const) {
          const bytes = Buffer.from(`private Smart Anima flow ${role} fixture`)
          const resourcePath = path.join(resourceDirectory, `${role}.safetensors`)
          await writeFile(resourcePath, bytes, { flag: 'wx', mode: 0o600 })
          request.inference.model[role] = {
            byteSize: bytes.length,
            path: resourcePath,
            sha256: digest(bytes),
          }
        }
        assert.ok(f.patch.generationDraft.model)
        f.patch.generationDraft.model.fileSha256 = request.inference.model.checkpoint.sha256
        request.latentKeepMask.path = path.join(handoffDirectory, 'latent-keep-mask.png')
        if (request.modelSource) {
          request.modelSource.path = path.join(handoffDirectory, 'model-source.png')
        }
        request.output = {
          pngPath: path.join(handoffDirectory, 'processing.png'),
          stagingRoot: handoffDirectory,
        }
      }
      const co = () => service.getOpenDocumentForAcceptance(tab.id)!
      const document = parseProjectDocumentV1({
        ...f.document,
        documentId: co().document.documentId,
        documentRevision: co().document.documentRevision,
      })
      const sources: Record<string, { bytes: Buffer }> = {}
      for (const layer of document.layers) {
        if (layer.kind === 'raster') {
          sources[layer.asset.path] = { bytes: f.material.files['source.png'] }
        }
      }
      for (const [index, region] of document.regionalGuidance!.entries()) {
        const { height, x, y } = f.patch.boundingBox
        const fullWidth = f.patch.boundingBox.width
        const width = (fullWidth * 3) / 4
        const offset = index === 0 ? 0 : fullWidth / 4
        const alpha = Uint8Array.from({ length: width * height }, (_, pixel) => {
          const column = (pixel % width) + offset
          if (column === fullWidth / 2 - 1) {
            return index === 0 ? 127 : 128
          }
          if (column === fullWidth / 2) {
            return index === 0 ? 128 : 127
          }
          return 255
        })
        const bytes = encodeProjectMaskPng(alpha, width, height)
        region.mask = {
          asset: {
            bytes: bytes.length,
            height,
            path: `assets/masks/${region.mask.id}/${digest(bytes)}.png`,
            sha256: digest(bytes),
            width,
          },
          bounds: { height, width, x: x + offset, y },
          id: region.mask.id,
          revision: 1,
        }
        sources[region.mask.asset.path] = { bytes }
      }
      await co().applyDocument(document, sources)
      await service.save(tab.id)
      const savedPath = co().filePath
      await service.close(tab.id)
      assert.equal((await service.open(tab.id)).kind, 'opened')
      await service.flushAutosave(tab.id)
      const before = {
        document: structuredClone(co().document),
        epoch: co().documentEpoch,
        package: await readFile(savedPath),
        tabs: service
          .getOpenTabs()
          .map((t) => ({ canRedo: t.canRedo, canUndo: t.canUndo, dirty: t.dirty })),
      }
      await service.withCapturedSmartPatchRegionalGenerationInput(
        tab.id,
        f.patch.id,
        async (capture) => {
          const prepared = await prepareSmartPatchAnimaRegionalInput({
            capture,
            item: mutableCopy(concrete(f.material)),
            profile: PROFILE[mode],
            promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
          })
          assert.deepEqual(
            prepared.recipe.regions.map((r) => r.coverage.intersection),
            document.regionalGuidance!.map((r) => {
              assert.ok(r.mask.asset)
              return r.mask.bounds
            }),
          )
          assert.ok(prepared.recipe.regions.every((r) => r.coverage.alpha.some((a) => a > 0)))
          assert.equal(prepared.recipe.regions[1].negative.prompt.text, 'blur')
          assert.notEqual(
            prepared.recipe.regions[1].negative.prompt.text,
            before.document.generationDraft.negativePrompt.text,
          )
          const bound = bindSmartPatchAnimaRegionalExecution(prepared, request)
          assert.equal(bound.execution.mode, mode)
          if (destination && handoffDirectory) {
            const transport = {
              ...bound,
              recipe: {
                ...bound.recipe,
                regions: bound.recipe.regions.map((r) => ({
                  ...r,
                  coverage: { ...r.coverage, alpha: Array.from(r.coverage.alpha) },
                })),
              },
            }
            await writeFile(
              path.join(destination, `bound-${mode}.json`),
              `${JSON.stringify(transport)}\n`,
              { flag: 'wx' },
            )
            await writeFile(path.join(handoffDirectory, 'saved-project.igs'), before.package, {
              flag: 'wx',
            })
          }
        },
      )
      assert.deepEqual(
        {
          document: co().document,
          epoch: co().documentEpoch,
          tabs: service
            .getOpenTabs()
            .map((t) => ({ canRedo: t.canRedo, canUndo: t.canUndo, dirty: t.dirty })),
        },
        { document: before.document, epoch: before.epoch, tabs: before.tabs },
      )
      assert.ok(
        (await readFile(savedPath)).equals(before.package),
        'Capture must not change saved package bytes',
      )
      assert.deepEqual((await readIgsPackage(savedPath)).project, before.document)
    } finally {
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    }
  })
}
