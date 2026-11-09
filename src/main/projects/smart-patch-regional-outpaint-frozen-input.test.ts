import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import {
  createEmptyProjectDocumentV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type {
  CapturedSmartPatchRegionalGenerationInput,
  PreparedSmartPatchAnimaRegionalInput,
  SmartPatchAnimaRegionalProfile,
} from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  bindSmartPatchAnimaRegionalExecution,
  captureFrozenSmartPatchAnimaRegionalInputV1,
  capturePreparedSmartPatchAnimaRegionalInput,
  prepareSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import {
  attachSmartPatchAnimaRegionalInput,
  hydrateFrozenSmartPatchAnimaRegionalInput,
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import {
  assertQueuedSmartPatchBundle,
  buildFrozenQueuedSmartPatchV1,
  parseFrozenQueuedSmartPatchV1,
} from './smart-patch-queued-generation.js'
import {
  literalPreparedSmartPatchInputMaterial,
  literalSmartPatchColorPng,
} from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const prompt = (text: string) => ({ embeddingRefs: [], text })

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T
const mutableCopy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>

/** Literal source/KEEP/infilled RGB fixtures, not an executed infill or numerical oracle. */
function regionalInput(
  material: SmartPatchInputMaterial,
  profile: SmartPatchAnimaRegionalProfile = ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
): PreparedSmartPatchAnimaRegionalInput {
  const ctx = material.manifest.context
  const recipe: PreparedSmartPatchAnimaRegionalInput['recipe'] = {
    bbox: { ...ctx.bbox },
    documentId: ctx.documentId,
    documentRevision: ctx.documentRevision,
    family: 'anima',
    globalPrompts: {
      negative: structuredClone(ctx.generationDraft.negativePrompt),
      positive: structuredClone(ctx.generationDraft.positivePrompt),
    },
    internalResolution: { ...ctx.internalResolution },
    item: { ...structuredClone(material.manifest.items[0].item), iteration: 0, promptPairIndex: 0 },
    kind: 'smart-patch-regional-recipe',
    layerId: ctx.layerId,
    modelSha256: ctx.generationDraft.model!.fileSha256,
    regions: [0, 1].map((index) => {
      const positive = index === 0 ? prompt('(one cat)1.5') : null
      const negative = index === 0 ? prompt('(red scarf)1.5') : prompt('dormant {local|text}')
      return {
        authoredPrompts: { negative, positive, useGlobalNegativePrompt: index === 1 },
        coverage: {
          alpha: Uint8Array.from({ length: ctx.bbox.width * ctx.bbox.height }, (_, pixel) =>
            pixel % 3 === index ? 255 : pixel % 3 === 2 ? 127 + index : 0,
          ),
          bounds: { ...ctx.bbox },
          intersection: { ...ctx.bbox },
          kind: 'covered' as const,
        },
        maskId: randomUUID(),
        maskRevision: index + 1,
        negative: {
          prompt: index === 0 ? negative : structuredClone(ctx.generationDraft.negativePrompt),
          source: index === 0 ? ('regional' as const) : ('smart-patch' as const),
        },
        positive,
        regionId: randomUUID(),
      }
    }),
    sampling: {
      animaMethod: ctx.generationDraft.sampling.animaMethod as 'euler' | 'heun',
      cfgScale: ctx.generationDraft.sampling.cfgScale!,
      denoisingStrength: ctx.generationDraft.sampling.denoisingStrength!,
      steps: ctx.generationDraft.sampling.steps!,
    },
    smartMask: { maskId: ctx.mask.id, maskRevision: ctx.mask.revision },
  }
  const sources: { polarity: 'negative' | 'positive'; sourceId: string; text: string }[] = [
    { polarity: 'positive', sourceId: ctx.layerId, text: recipe.globalPrompts.positive.text },
    { polarity: 'negative', sourceId: ctx.layerId, text: recipe.globalPrompts.negative.text },
  ]
  for (const region of recipe.regions) {
    if (region.positive !== null) {
      sources.push({ polarity: 'positive', sourceId: region.regionId, text: region.positive.text })
    }
    if (region.negative.prompt.text !== '') {
      sources.push({
        polarity: 'negative',
        sourceId: region.regionId,
        text: region.negative.prompt.text,
      })
    }
  }
  return capturePreparedSmartPatchAnimaRegionalInput({
    compiledPrompts: sources.map((source) => ({
      ...source,
      prompt: compileAnimaPromptWeighting(source.text),
    })),
    profile,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    recipe,
    schemaVersion: 1,
  })
}

async function fixture() {
  const ordinary = await literalPreparedSmartPatchInputMaterial('anima', 'outpaint')
  const prepared = regionalInput(ordinary)
  const regional = await attachSmartPatchAnimaRegionalInput(ordinary, prepared)
  return { ordinary, prepared, regional }
}

function execution(material: SmartPatchInputMaterial): SmartPatchExecutionRequest {
  const { manifest } = material
  const entry = manifest.items[0]
  assert.equal(entry.family, 'anima')
  if (entry.family !== 'anima') {
    assert.fail('Original Anima fixture required')
  }
  const root = '/frozen-smart-outpaint-validation'
  return {
    family: 'anima',
    inference: structuredClone(entry.inference),
    internalResolution: { ...manifest.context.internalResolution },
    latentKeepMask: {
      ...manifest.files['latent-keep-mask.png'],
      path: `${root}/latent-keep-mask.png`,
    },
    mode: manifest.mode,
    modelSource: manifest.files['model-source.png']
      ? { ...manifest.files['model-source.png'], path: `${root}/model-source.png` }
      : null,
    output: { pngPath: `${root}/result.png`, stagingRoot: root },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  }
}

function clone(material: SmartPatchInputMaterial): SmartPatchInputMaterial {
  return {
    files: Object.fromEntries(
      Object.entries(material.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
    ),
    manifest: structuredClone(material.manifest),
  }
}

function replaceFile(material: SmartPatchInputMaterial, name: string, bytes: Buffer) {
  const role = name as keyof SmartPatchInputMaterial['manifest']['files']
  const descriptor = material.manifest.files[role]
  assert.ok(descriptor)
  material.files[name] = bytes
  material.manifest.files[role] = { ...descriptor, byteSize: bytes.length, sha256: digest(bytes) }
}

/** Pure projection collaborators are declared; this does not claim real ProjectService capture. */
function captured(material: SmartPatchInputMaterial) {
  const prepared = regionalInput(material)
  const ctx = material.manifest.context
  const base = createEmptyProjectDocumentV1({ title: 'Smart OUT prepared-source ownership' })
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
    name: 'Selected OUT target',
    opacity: 0.4,
    rasterSubLayers: [],
    visible: ctx.visible,
  }
  const document = parseProjectDocumentV1({
    ...base,
    documentId: ctx.documentId,
    documentRevision: ctx.documentRevision,
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
        name: 'Below source',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: ctx.bbox.x, y: ctx.bbox.y },
        visible: true,
      })),
    ],
    regionalGuidance: prepared.recipe.regions.map((region) => ({
      enabled: true,
      id: region.regionId,
      locked: false,
      mask: { asset: null, id: region.maskId, revision: region.maskRevision },
      name: 'Independent OUT region',
      overlayOpacity: 0,
      prompts: structuredClone(region.authoredPrompts),
    })),
  })
  const calls: string[] = []
  const unused = async (): Promise<never> => {
    throw new Error('A pure regional preparation must not execute another owner')
  }
  const capture: CapturedSmartPatchRegionalGenerationInput = {
    regional: {
      assets: [],
      async projectMask(id, target) {
        calls.push(id)
        assert.equal(this, capture.regional)
        assert.deepEqual(target, ctx.bbox)
        const owner = prepared.recipe.regions.find((region) => region.regionId === id)
        assert.ok(owner)
        return structuredClone(owner.coverage)
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
      stagingRoot: '/unused-regional-projection',
    },
    smartPatch: {
      composeSource: unused,
      context: structuredClone(ctx),
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
  return { calls, capture, item: mutableCopy(prepared.recipe.item), prepared }
}

test('OUT profile owns two signed world regions while preserving source KEEP and infilled RGB bytes', async () => {
  const { ordinary, prepared, regional } = await fixture()
  assert.equal(regional.manifest.mode, 'outpaint')
  assert.equal(regional.manifest.sourceAlpha, 'mixed')
  assert.equal(regional.manifest.context.mask.asset, null)
  assert.equal(regional.manifest.regional!.profile, ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE)
  assert.deepEqual(
    Object.keys(regional.files).sort(),
    [...Object.keys(ordinary.files), 'regional-0.alpha8', 'regional-1.alpha8'].sort(),
  )
  for (const role of [
    'source.png',
    'model-source.png',
    'latent-keep-mask.png',
    'final-contribution-mask.png',
  ]) {
    assert.ok(regional.files[role].equals(ordinary.files[role]), `OUT changed owned ${role}`)
    assert.notEqual(regional.files[role], ordinary.files[role])
  }
  assert.deepEqual(
    hydrateFrozenSmartPatchAnimaRegionalInput(regional.manifest, regional.files),
    prepared,
  )
  assert.equal(prepared.recipe.regions[1].negative.source, 'smart-patch')
  assert.deepEqual(
    prepared.recipe.regions[1].negative.prompt,
    prepared.recipe.globalPrompts.negative,
  )
  assert.equal(prepared.recipe.regions[1].authoredPrompts!.negative!.text, 'dormant {local|text}')
  assert.equal(regional.manifest.files['regional-2.alpha8'], undefined)
})

test('explicit OUT bind keeps the original request and INP profile cannot bind that OUT request', async () => {
  const { ordinary, prepared } = await fixture()
  const request = execution(ordinary)
  const bound = bindSmartPatchAnimaRegionalExecution(prepared, request)
  assert.equal(bound.execution.mode, 'outpaint')
  assert.deepEqual(bound.execution, request)
  assert.deepEqual(bound.execution.inference.sampling, request.inference.sampling)
  assert.throws(
    () =>
      bindSmartPatchAnimaRegionalExecution(
        { ...prepared, profile: ANIMA_SMART_PATCH_REGIONAL_PROFILE },
        request,
      ),
    { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' },
  )
})

test('legacy INP profile remains explicit and OUT profile refuses an opaque INP command', async () => {
  const ordinary = await literalPreparedSmartPatchInputMaterial('anima', 'inpaint')
  const prepared = regionalInput(ordinary, ANIMA_SMART_PATCH_REGIONAL_PROFILE)
  const material = await attachSmartPatchAnimaRegionalInput(ordinary, prepared)
  assert.equal(material.manifest.regional!.profile, 'invoke-anima-smart-regional-inpaint-v1')
  assert.equal(
    bindSmartPatchAnimaRegionalExecution(prepared, execution(ordinary)).execution.mode,
    'inpaint',
  )
  await assert.rejects(
    attachSmartPatchAnimaRegionalInput(ordinary, {
      ...prepared,
      profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    }),
  )
  assert.throws(
    () =>
      bindSmartPatchAnimaRegionalExecution(
        { ...prepared, profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE },
        execution(ordinary),
      ),
    { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' },
  )
})

test('prepare default and explicit legacy profile keep the exact former output shape and refuse OUT bind', async () => {
  const ordinary = await literalPreparedSmartPatchInputMaterial('anima', 'outpaint')
  const f = captured(ordinary)
  const implicit = await prepareSmartPatchAnimaRegionalInput({
    ...f,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
  })
  const explicit = await prepareSmartPatchAnimaRegionalInput({
    ...f,
    profile: ANIMA_SMART_PATCH_REGIONAL_PROFILE,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
  })
  assert.equal(implicit.profile, ANIMA_SMART_PATCH_REGIONAL_PROFILE)
  assert.deepEqual(implicit, explicit)
  assert.deepEqual(
    Object.keys(implicit).sort(),
    ['compiledPrompts', 'profile', 'promptInterpretation', 'recipe', 'schemaVersion'].sort(),
  )
  assert.throws(() => bindSmartPatchAnimaRegionalExecution(implicit, execution(ordinary)), {
    code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
  })
})

test('explicit OUT preparation compiles selected Smart negatives and projects every owned region', async () => {
  const ordinary = await literalPreparedSmartPatchInputMaterial('anima', 'outpaint')
  const f = captured(ordinary)
  const result = await prepareSmartPatchAnimaRegionalInput({
    ...f,
    profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
  })
  assert.deepEqual(result, f.prepared)
  assert.deepEqual(
    f.calls,
    f.prepared.recipe.regions.map((region) => region.regionId),
  )
  const bound = bindSmartPatchAnimaRegionalExecution(result, execution(ordinary))
  assert.equal(bound.profile, ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE)
})

for (const profile of [null, false, '', 'invoke-anima-smart-regional-v2']) {
  test(`unknown explicit profile ${String(profile)} refuses before any projection`, async () => {
    const f = captured(await literalPreparedSmartPatchInputMaterial('anima', 'outpaint'))
    await assert.rejects(
      prepareSmartPatchAnimaRegionalInput({
        ...f,
        profile: profile as SmartPatchAnimaRegionalProfile,
      }),
      { code: 'SMART_PATCH_REGIONAL_INPUT_INVALID' },
    )
    assert.deepEqual(f.calls, [])
    assert.throws(() => capturePreparedSmartPatchAnimaRegionalInput({ ...f.prepared, profile }))
  })
}

for (const mode of ['txt2img', 'img2img', 'inpaint'] as const) {
  test(`OUT profile does not broaden ${mode} through material or command binding`, async () => {
    const material = await literalPreparedSmartPatchInputMaterial('anima', mode)
    const prepared = regionalInput(material)
    assert.throws(() => bindSmartPatchAnimaRegionalExecution(prepared, execution(material)), {
      code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
    })
    await assert.rejects(attachSmartPatchAnimaRegionalInput(material, prepared))
  })
}

for (const sourceAlpha of ['opaque', 'transparent'] as const) {
  test(`OUT metadata refuses declared ${sourceAlpha} source even before pixel proof`, async () => {
    const { regional } = await fixture()
    regional.manifest.sourceAlpha = sourceAlpha
    assert.throws(() => parseFrozenSmartPatchInputV1(regional.manifest))
  })
}

test('matching source digest cannot pass an actually opaque world plane as OUT', async () => {
  const { regional } = await fixture()
  const { height, width } = regional.manifest.context.bbox
  replaceFile(
    regional,
    'source.png',
    literalSmartPatchColorPng(
      width,
      height,
      Array.from({ length: width * height }, () => [32, 64, 96, 255]).flat(),
      4,
    ),
  )
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
})

for (const role of ['regional-0.alpha8', 'model-source.png', 'latent-keep-mask.png'] as const) {
  test(`changed ${role} bytes refuse without reselecting source or ordinary execution`, async () => {
    const { regional } = await fixture()
    regional.files[role][regional.files[role].length - 1] ^= 1
    await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
  })
}

test('a matching digest cannot turn malformed infilled RGB into a verified model-source', async () => {
  const { regional } = await fixture()
  const bytes = Buffer.from(regional.files['model-source.png'])
  bytes[bytes.length - 1] ^= 1
  replaceFile(regional, 'model-source.png', bytes)
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
})

test('a valid RGBA PNG cannot replace the actual RGB infill role', async () => {
  const { regional } = await fixture()
  const { height, width } = regional.manifest.context.internalResolution
  replaceFile(
    regional,
    'model-source.png',
    literalSmartPatchColorPng(
      width,
      height,
      Array.from({ length: width * height }, () => [32, 64, 96, 255]).flat(),
      4,
    ),
  )
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
})

test('matching raw digest still refuses a wrong declared coverage or swapped ordered region', async () => {
  const { regional } = await fixture()
  const empty = clone(regional)
  replaceFile(empty, 'regional-0.alpha8', Buffer.alloc(empty.files['regional-0.alpha8'].length))
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(empty.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(empty.manifest, empty.files))
  const swapped = clone(regional)
  const [a, b] = swapped.manifest.regional!.recipe.regions
  swapped.manifest.regional!.recipe.regions = [b, a]
  assert.throws(() => parseFrozenSmartPatchInputV1(swapped.manifest))
})

test('caller mutation cannot alter attached source KEEP infill signed text or raw alpha', async () => {
  const { ordinary, prepared, regional } = await fixture()
  const expected = clone(regional)
  ordinary.files['model-source.png'].fill(0)
  ordinary.files['latent-keep-mask.png'].fill(255)
  prepared.recipe.regions[0].coverage.alpha.fill(0)
  prepared.recipe.globalPrompts.negative.text = 'later Smart exclusion'
  assert.deepEqual(regional, expected)
  const hydrated = hydrateFrozenSmartPatchAnimaRegionalInput(regional.manifest, regional.files)
  hydrated.recipe.regions[0].coverage.alpha.fill(0)
  hydrated.recipe.regions[1].negative.prompt.text = 'returned alias mutation'
  assert.deepEqual(regional, expected)
})

test('all OUT semantic preflight precedes projection even when a later region is invalid', async () => {
  const f = captured(await literalPreparedSmartPatchInputMaterial('anima', 'outpaint'))
  const id = f.prepared.recipe.regions[1].regionId
  for (const document of [f.capture.smartPatch.document, f.capture.regional.snapshot]) {
    const owner = document.regionalGuidance!.find((region) => region.id === id)!
    owner.prompts!.negative = prompt('{active|dynamic}')
    owner.prompts!.useGlobalNegativePrompt = false
  }
  await assert.rejects(
    prepareSmartPatchAnimaRegionalInput({
      ...f,
      profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    }),
    { code: 'SMART_PATCH_REGIONAL_INPUT_INVALID' },
  )
  assert.deepEqual(f.calls, [])
})

test('OUT bounds and concrete global prompt mismatch refuse before projection', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('anima', 'outpaint')
  const bounds = captured(material)
  const patch = bounds.capture.smartPatch.document.layers.find(
    (layer) => layer.kind === 'smart-patch',
  )!
  assert.equal(patch.kind, 'smart-patch')
  if (patch.kind !== 'smart-patch') {
    assert.fail('Smart fixture')
  }
  patch.internalResolution.width = 65
  bounds.capture.smartPatch.context.internalResolution.width = 65
  await assert.rejects(
    prepareSmartPatchAnimaRegionalInput({
      ...bounds,
      profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    }),
  )
  assert.deepEqual(bounds.calls, [])
  const concrete = captured(material)
  concrete.item.prompts.negative = 'different Smart exclusion'
  await assert.rejects(
    prepareSmartPatchAnimaRegionalInput({
      ...concrete,
      profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    }),
  )
  assert.deepEqual(concrete.calls, [])
})

test('OUT profile and all captures are owned before the first projection await', async () => {
  const f = captured(await literalPreparedSmartPatchInputMaterial('anima', 'outpaint'))
  const project = f.capture.regional.projectMask.bind(f.capture.regional)
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  let first = true
  f.capture.regional.projectMask = async (id, target) => {
    if (first) {
      first = false
      await hold
    }
    return project(id, target)
  }
  const input = {
    ...f,
    profile: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE as SmartPatchAnimaRegionalProfile,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
  }
  const pending = prepareSmartPatchAnimaRegionalInput(input)
  input.profile = ANIMA_SMART_PATCH_REGIONAL_PROFILE
  input.item.seed = 999
  f.capture.smartPatch.document.regionalGuidance = []
  f.capture.regional.snapshot.regionalGuidance = []
  f.capture.regional.projectMask = async () => {
    throw new Error('Late replacement must not run')
  }
  release()
  const result = await pending
  assert.deepEqual(result, f.prepared)
  assert.equal(result.profile, ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE)
  assert.equal(result.recipe.item.seed, 0)
  assert.equal(f.calls.length, 2)
})

test('explicit execution profile is captured once before projection callbacks', async () => {
  const f = captured(await literalPreparedSmartPatchInputMaterial('anima', 'outpaint'))
  let reads = 0
  const input = {
    ...f,
    get profile() {
      reads += 1
      return reads === 1
        ? ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE
        : ANIMA_SMART_PATCH_REGIONAL_PROFILE
    },
  }
  const result = await prepareSmartPatchAnimaRegionalInput(input)
  assert.equal(reads, 1)
  assert.equal(result.profile, ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE)
  assert.equal(f.calls.length, 2)
})

test('OUT bundle reload owns every raw and already-infilled byte without an infill collaborator', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-smart-regional-out-bundle-'))
  try {
    const { prepared, regional } = await fixture()
    const expected = clone(regional)
    const owner = new SmartPatchInputBundleRepository(root)
    const saved = await owner.publish(regional)
    const queued = buildFrozenQueuedSmartPatchV1(saved, 0)
    regional.files['model-source.png'].fill(0)
    regional.files['regional-0.alpha8'].fill(0)
    const loaded = await new SmartPatchInputBundleRepository(root).load(saved.id)
    assert.deepEqual({ files: loaded.files, manifest: loaded.manifest }, expected)
    assert.deepEqual(
      hydrateFrozenSmartPatchAnimaRegionalInput(loaded.manifest, loaded.files),
      prepared,
    )
    assert.equal(loaded.manifest.regional!.profile, ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE)
    assertQueuedSmartPatchBundle(parseFrozenQueuedSmartPatchV1(queued), loaded)
    const wrong = mutableCopy(queued)
    wrong.regional!.profile = ANIMA_SMART_PATCH_REGIONAL_PROFILE
    assert.throws(() => parseFrozenQueuedSmartPatchV1(wrong))
    await owner.discard(saved.id, saved.manifestSha256)
    await assert.rejects(owner.load(saved.id))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('SQLite restart and frozen OUT Retry copy old model-source and raw files independently', async () => {
  await withSmartPatchQueueFixture(
    'anima',
    async (f) => {
      f.material.manifest.items = f.material.manifest.items.slice(0, 1)
      const prepared = regionalInput(f.material)
      f.material = await attachSmartPatchAnimaRegionalInput(f.material, prepared)
      const [row] = await admitSmartPatch(f)
      const original = await f.queue.loadVerifiedSmartPatchInput(row.id)
      const canceled = await f.queue.cancel(row.id, row.statusSequence)
      const queue = new GenerationQueueRepository(f.database.db, f.root)
      await queue.recoverAfterRestart()
      const retry = await queue.retryPreparedSmartPatchTerminal(row.id, canceled.statusSequence, {
        assertCurrent: () => undefined,
        modelService: f.models,
      })
      const replay = await queue.loadVerifiedSmartPatchInput(retry.id)
      assert.notEqual(replay.payload.bundle.id, original.payload.bundle.id)
      assert.equal(replay.payload.regional!.profile, ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE)
      assert.deepEqual(replay.payload.item, original.payload.item)
      assert.deepEqual(replay.payload.regional, original.payload.regional)
      for (const role of Object.keys(original.bundle.files)) {
        assert.ok(
          replay.bundle.files[role].equals(original.bundle.files[role]),
          `Retry changed ${role}`,
        )
      }
      const source = path.join(
        f.root,
        'generation-queued-inputs',
        'smart-patch',
        original.payload.bundle.id,
        'model-source.png',
      )
      const bytes = await readFile(source)
      await writeFile(source, Buffer.alloc(bytes.length))
      await assert.rejects(queue.loadVerifiedSmartPatchInput(row.id))
      assert.ok(
        (await queue.loadVerifiedSmartPatchInput(retry.id)).bundle.files['model-source.png'].equals(
          bytes,
        ),
      )
    },
    {},
    'outpaint',
  )
})

test('unknown OUT metadata and non-JSON profiles never become a legacy or ordinary material', async () => {
  const { regional } = await fixture()
  const profile = structuredClone(regional.manifest.regional!)
  assert.throws(() =>
    captureFrozenSmartPatchAnimaRegionalInputV1({
      ...profile,
      profile: 'invoke-anima-smart-regional-outpaint-v2',
    }),
  )
  assert.throws(() => parseFrozenSmartPatchInputV1({ ...regional.manifest, regional: undefined }))
  const orphan = clone(regional)
  delete orphan.manifest.regional
  assert.throws(() => parseFrozenSmartPatchInputV1(orphan.manifest))
})
