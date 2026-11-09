import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { compileAnimaPromptWeighting } from '../../shared/projects/anima-prompt-weighting.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  planGenerationBatch,
  type PlannedGenerationBatchItem,
} from '../../shared/projects/generation-batch-plan.js'
import { resolveProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'
import type {
  GenerationPrompt,
  PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'
import { resolveSmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type {
  CapturedSmartPatchRegionalGenerationInput,
  PreparedSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { ComposeTargetInput, ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { withProjectPathLock } from './project-path-lock.js'
import { compositionRasterLayers } from './project-raster-snapshot.js'
import { projectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  bindSmartPatchAnimaRegionalExecution,
  prepareSmartPatchAnimaRegionalInput,
  SmartPatchRegionalInputError,
} from './project-smart-patch-regional-input.js'
import { acceptedOutputPngFixture } from './test-fixtures/accepted-provenance.js'

const WORLD: IgsRectV1 = { height: 73, width: 107, x: -13, y: 5 }
const PROCESSING = { height: 64, width: 72 }
const MASK_BOUNDS = { height: 3, width: 4, x: -12, y: 6 }
const ALPHA = Uint8Array.from([255, 1, 127, 128, 0, 64, 254, 0, 1, 0, 2, 255])
type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T
function mutableCopy<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string, embeddingRefs: PromptEmbeddingRef[] = []): GenerationPrompt => ({
  embeddingRefs,
  text,
})

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function reference(family: 'anima' | 'illustrious' = 'anima') {
  return {
    baseModelFamily: family,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: `Authored ${family}`,
    fileSha256: (family === 'anima' ? 'a' : 'b').repeat(64),
    kind: 'checkpoint' as const,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: family === 'anima' ? null : ('epsilon' as const),
    versionName: 'Unresolved Main metadata',
  }
}

function region(overrides: Partial<IgsRegionalGuidanceV1> = {}): IgsRegionalGuidanceV1 {
  return {
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Independent regional owner',
    overlayOpacity: 0,
    prompts: {
      negative: prompt('dormant {local|dynamic}'),
      positive: prompt('a (regional subject:1.2)'),
      useGlobalNegativePrompt: true,
    },
    ...overrides,
  }
}

function authored(
  regions: IgsRegionalGuidanceV1[] = [
    region(),
    region({
      prompts: {
        negative: prompt('local exclusion'),
        positive: null,
        useGlobalNegativePrompt: false,
      },
    }),
  ],
) {
  const base = createEmptyProjectDocumentV1({
    primaryBbox: { height: 256, width: 256, x: 100, y: -100 },
    title: 'Selected Smart regional ownership',
  })
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...WORLD },
    coherenceSettings: { edgeSize: 8, minimumDenoise: 0.1, mode: 'Box Blur' },
    generationDraft: {
      ...structuredClone(base.generationDraft),
      model: reference(),
      negativePrompt: prompt('Smart exclusion'),
      positivePrompt: prompt('a (Smart subject:1.1)'),
      sampling: {
        animaMethod: 'heun',
        cfgScale: 4,
        denoisingStrength: 0.5,
        sampler: null,
        scheduler: null,
        steps: 3,
      },
      seed: { policy: 'fixed', value: 0 },
    },
    id: randomUUID(),
    internalResolution: { ...PROCESSING },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskSettings: { blur: 2, padding: 3 },
    name: 'Selected Smart target',
    opacity: 0.25,
    rasterSubLayers: [],
    visible: true,
  }
  const document = parseProjectDocumentV1({
    ...base,
    generationDraft: {
      ...base.generationDraft,
      model: reference('illustrious'),
      negativePrompt: prompt('Current Canvas exclusion'),
      positivePrompt: prompt('{Canvas day|Canvas night}'),
      seed: { policy: 'fixed', value: 123 },
    },
    lastActualSeedSnapshot: 99,
    layers: [patch],
    regionalGuidance: regions,
  })
  return { document, patch: document.layers[0] as IgsSmartPatchLayerV1 }
}

function concrete(patch: IgsSmartPatchLayerV1): PlannedGenerationBatchItem {
  return planGenerationBatch({
    baseSeed: 0,
    iterations: 1,
    maxJobs: 1,
    maxPrompts: 1,
    negativePrompt: patch.generationDraft.negativePrompt.text,
    positivePrompt: patch.generationDraft.positivePrompt.text,
    seedBehavior: 'per-prompt',
  }).items[0]
}

/** Only pure preparation collaborators: no composer, resource resolver or native worker. */
function captured(document: IgsProjectDocumentV1, patch: IgsSmartPatchLayerV1) {
  const calls: { id: string; target: IgsRectV1 }[] = []
  const unused = async (): Promise<never> => {
    throw new Error('No Smart execution in preparation')
  }
  const capture: CapturedSmartPatchRegionalGenerationInput = {
    regional: {
      assets: [],
      async projectMask(id, target) {
        calls.push({ id, target: structuredClone(target) })
        assert.equal(this, capture.regional, 'Projection receiver is bound before awaiting')
        return projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, target)
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
      stagingRoot: '/unused-regional-staging',
    },
    smartPatch: {
      composeSource: unused,
      context: {
        bbox: structuredClone(patch.boundingBox),
        coherenceSettings: resolveSmartPatchCoherenceSettings(patch.coherenceSettings),
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        generationDraft: structuredClone(patch.generationDraft),
        internalResolution: { ...patch.internalResolution },
        lastActualSeedSnapshot: document.lastActualSeedSnapshot,
        layerId: patch.id,
        locked: patch.locked,
        mask: structuredClone(patch.mask),
        maskSettings: resolveProjectMaskSettings(patch.maskSettings),
        projectKey: randomUUID(),
        sourceLayerIds: compositionRasterLayers(document, { beneathLayerId: patch.id }).map(
          (l) => l.id,
        ),
        visible: patch.visible,
      },
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
  return { calls, capture, item: mutableCopy(concrete(patch)) }
}

function fixture(regions?: IgsRegionalGuidanceV1[]) {
  const { document, patch } = authored(regions)
  return { document, patch, ...captured(document, patch) }
}

function code(expected: SmartPatchRegionalInputError['code']) {
  return (error: unknown) =>
    error instanceof SmartPatchRegionalInputError && error.code === expected
}

function execution(
  prepared: PreparedSmartPatchAnimaRegionalInput,
): Mutable<SmartPatchExecutionRequest> {
  const { recipe } = prepared
  const file = (name: string, sha256: string) => ({
    byteSize: 12,
    path: `/owned-preparation/${name}`,
    sha256,
  })
  const request: SmartPatchExecutionRequest = {
    family: 'anima',
    inference: {
      loras: [],
      model: {
        architecture: 'anima-base-1.0',
        checkpoint: file('anima.safetensors', recipe.modelSha256),
        qwen3Encoder: file('qwen.safetensors', 'c'.repeat(64)),
        vae: file('vae.safetensors', 'd'.repeat(64)),
      },
      prompts: {
        negative: compileAnimaPromptWeighting(recipe.globalPrompts.negative.text),
        positive: compileAnimaPromptWeighting(recipe.globalPrompts.positive.text),
      },
      sampling: compileAnimaFlowSamplingPlan({
        guidanceScale: recipe.sampling.cfgScale,
        height: recipe.internalResolution.height,
        mode: 'img2img',
        scheduler: recipe.sampling.animaMethod,
        seed: recipe.item.seed,
        steps: recipe.sampling.steps,
        strength: recipe.sampling.denoisingStrength,
        width: recipe.internalResolution.width,
      }),
    },
    internalResolution: { ...recipe.internalResolution },
    latentKeepMask: {
      ...file('keep.png', 'e'.repeat(64)),
      height: recipe.internalResolution.height / 8,
      width: recipe.internalResolution.width / 8,
    },
    mode: 'inpaint',
    modelSource: { ...file('model-source.png', 'f'.repeat(64)), ...recipe.internalResolution },
    output: { pngPath: '/owned-preparation/result.png', stagingRoot: '/owned-preparation' },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  }
  return mutableCopy(request)
}

test('selected Smart settings own globals, negative inheritance, model and raw world coverage', async () => {
  const f = fixture()
  const before = structuredClone({
    context: f.capture.smartPatch.context,
    document: f.document,
    item: f.item,
  })
  const result = await prepareSmartPatchAnimaRegionalInput(f)
  assert.deepEqual(Object.keys(result).sort(), [
    'compiledPrompts',
    'profile',
    'recipe',
    'schemaVersion',
  ])
  assert.equal(result.profile, ANIMA_SMART_PATCH_REGIONAL_PROFILE)
  assert.equal(result.recipe.kind, 'smart-patch-regional-recipe')
  assert.equal(result.recipe.family, 'anima')
  assert.deepEqual(result.recipe.bbox, WORLD)
  assert.deepEqual(result.recipe.internalResolution, PROCESSING)
  assert.equal(result.recipe.modelSha256, f.patch.generationDraft.model!.fileSha256)
  assert.notEqual(result.recipe.modelSha256, f.document.generationDraft.model!.fileSha256)
  assert.equal(result.recipe.item.seed, 0)
  assert.deepEqual(result.recipe.globalPrompts, {
    negative: f.patch.generationDraft.negativePrompt,
    positive: f.patch.generationDraft.positivePrompt,
  })
  assert.deepEqual(
    result.recipe.regions.map((r) => [r.regionId, r.negative.source, r.negative.prompt.text]),
    [
      [f.document.regionalGuidance![0].id, 'smart-patch', 'Smart exclusion'],
      [f.document.regionalGuidance![1].id, 'regional', 'local exclusion'],
    ],
  )
  assert.equal(result.recipe.regions[0].authoredPrompts!.negative!.text, 'dormant {local|dynamic}')
  assert.deepEqual(
    result.compiledPrompts.map((p) => [p.sourceId, p.polarity, p.text]),
    [
      [f.patch.id, 'positive', 'a (Smart subject:1.1)'],
      [f.patch.id, 'negative', 'Smart exclusion'],
      [f.document.regionalGuidance![0].id, 'positive', 'a (regional subject:1.2)'],
      [f.document.regionalGuidance![0].id, 'negative', 'Smart exclusion'],
      [f.document.regionalGuidance![1].id, 'negative', 'local exclusion'],
    ],
  )
  assert.deepEqual(
    result.compiledPrompts.map((p) => p.prompt),
    result.compiledPrompts.map((p) => compileAnimaPromptWeighting(p.text)),
  )
  const expected = projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, WORLD)
  for (const r of result.recipe.regions) {
    assert.deepEqual(r.coverage, expected)
  }
  assert.ok(result.recipe.regions[0].coverage.alpha.includes(127))
  assert.ok(result.recipe.regions[0].coverage.alpha.includes(128))
  assert.equal(result.recipe.regions[0].coverage.alpha.length, 107 * 73)
  assert.deepEqual(
    f.calls,
    f.document.regionalGuidance!.map((r) => ({ id: r.id, target: WORLD })),
  )
  assert.deepEqual(
    { context: f.capture.smartPatch.context, document: f.document, item: f.item },
    before,
  )
})

test('empty and absent regional positives preserve distinct signed records without deduplication', async () => {
  const f = fixture([
    region({
      prompts: { negative: prompt(''), positive: prompt(''), useGlobalNegativePrompt: true },
    }),
    region({
      prompts: { negative: prompt('local'), positive: null, useGlobalNegativePrompt: false },
    }),
    region(),
  ])
  const result = await prepareSmartPatchAnimaRegionalInput(f)
  assert.equal(result.recipe.regions[0].positive!.text, '')
  assert.equal(result.recipe.regions[1].positive, null)
  assert.deepEqual(
    result.compiledPrompts.map((p) => [p.polarity, p.text]),
    [
      ['positive', 'a (Smart subject:1.1)'],
      ['negative', 'Smart exclusion'],
      ['positive', ''],
      ['negative', 'Smart exclusion'],
      ['negative', 'local'],
      ['positive', 'a (regional subject:1.2)'],
      ['negative', 'Smart exclusion'],
    ],
  )
  assert.equal(
    new Set(
      result.compiledPrompts.filter((p) => p.text === 'Smart exclusion').map((p) => p.sourceId),
    ).size,
    3,
  )
})

test('zero enabled regions retain genuine Smart globals and no projection work', async () => {
  const f = fixture([region({ enabled: false })])
  const result = await prepareSmartPatchAnimaRegionalInput(f)
  assert.deepEqual(result.recipe.regions, [])
  assert.equal(result.compiledPrompts.length, 2)
  assert.deepEqual(f.calls, [])
  assert.deepEqual(
    bindSmartPatchAnimaRegionalExecution(result, execution(result)).recipe,
    result.recipe,
  )
})

test('disabled and dormant branches do not compile or consume unsupported content', async () => {
  const ref: PromptEmbeddingRef = {
    resource: { ...reference(), kind: 'embedding' },
    token: '<unused>',
  }
  const f = fixture([
    region({
      enabled: false,
      prompts: {
        negative: prompt('{bad}', [ref]),
        positive: prompt('{bad}', [ref]),
        useGlobalNegativePrompt: false,
      },
    }),
    region({
      prompts: {
        negative: prompt('{dormant}', [ref]),
        positive: prompt('active'),
        useGlobalNegativePrompt: true,
      },
    }),
  ])
  const result = await prepareSmartPatchAnimaRegionalInput(f)
  assert.equal(result.recipe.regions.length, 1)
  assert.deepEqual(result.recipe.regions[0].authoredPrompts!.negative, prompt('{dormant}', [ref]))
  assert.deepEqual(result.recipe.regions[0].negative.prompt, prompt('Smart exclusion'))
  assert.equal(f.calls.length, 1)
})

test('enabled regional references refuse before projection while disabled owners stay dormant', async () => {
  const id = randomUUID()
  const image = {
    asset: {
      bytes: 128,
      height: 64,
      path: `assets/regional-references/${id}/${'1'.repeat(64)}.png`,
      sha256: '1'.repeat(64),
      width: 64,
    },
    id,
    name: 'Unresolved regional reference',
    sourceFormat: 'PNG' as const,
    thumbnail: {
      bytes: 128,
      height: 64,
      path: `assets/regional-references/${id}/${'2'.repeat(64)}.webp`,
      sha256: '2'.repeat(64),
      width: 64,
    },
  }
  const bad = fixture([region(), region({ referenceImages: [image] })])
  await assert.rejects(
    prepareSmartPatchAnimaRegionalInput(bad),
    code('SMART_PATCH_REGIONAL_UNSUPPORTED'),
  )
  assert.deepEqual(bad.calls, [])
  const good = fixture([region(), region({ enabled: false, referenceImages: [image] })])
  assert.equal((await prepareSmartPatchAnimaRegionalInput(good)).recipe.regions.length, 1)
  assert.equal(good.calls.length, 1)
})

test('prepare captures its receiver and all metadata synchronously before projection awaits', async () => {
  const f = fixture()
  const original = structuredClone({ context: f.capture.smartPatch.context, item: f.item })
  const entered = deferred()
  const resume = deferred()
  const originalProject = f.capture.regional.projectMask
  let invocation = 0
  f.capture.regional.projectMask = async function (id, target) {
    assert.equal(this, f.capture.regional)
    invocation++
    if (invocation === 1) {
      entered.release()
      await resume.promise
    }
    const result = await originalProject.call(this, id, target)
    target.x = 1000
    return result
  }
  const preparing = prepareSmartPatchAnimaRegionalInput(f)
  await entered.promise
  f.item.seed = 456
  f.capture.smartPatch.context.generationDraft.negativePrompt.text = 'mutated'
  f.capture.smartPatch.document.layers = []
  f.capture.regional.snapshot.regionalGuidance = []
  f.capture.regional.projectMask = async () => {
    throw new Error('Late replacement must not run')
  }
  resume.release()
  const result = await preparing
  assert.equal(result.recipe.item.seed, original.item.seed)
  assert.deepEqual(
    result.recipe.globalPrompts.negative,
    original.context.generationDraft.negativePrompt,
  )
  assert.equal(result.recipe.regions.length, 2)
  assert.deepEqual(result.recipe.bbox, WORLD)
  assert.deepEqual(
    f.calls.map((c) => c.target),
    [WORLD, WORLD],
  )
})

test('projection scratch is owned immediately before a later projection mutates it', async () => {
  const f = fixture()
  const scratch = projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, WORLD)
  const first = structuredClone(scratch)
  let n = 0
  f.capture.regional.projectMask = async () => {
    if (n++ !== 0) {
      scratch.alpha.fill(255)
    }
    return scratch
  }
  const result = await prepareSmartPatchAnimaRegionalInput(f)
  assert.deepEqual(result.recipe.regions[0].coverage, first)
  assert.ok(result.recipe.regions[1].coverage.alpha.every((a) => a === 255))
  scratch.alpha.fill(0)
  assert.deepEqual(result.recipe.regions[0].coverage, first)
  assert.ok(result.recipe.regions[1].coverage.alpha.every((a) => a === 255))
})

test('a late projection failure yields no prepared output and preserves caller metadata', async () => {
  const f = fixture()
  const sentinel = new Error('second owned projection')
  const before = structuredClone(f.capture.smartPatch.document)
  let n = 0
  f.capture.regional.projectMask = async (_id, target) => {
    if (n++ !== 0) {
      throw sentinel
    }
    return projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, target)
  }
  await assert.rejects(prepareSmartPatchAnimaRegionalInput(f), (error) => error === sentinel)
  assert.equal(n, 2)
  assert.deepEqual(f.capture.smartPatch.document, before)
})

type Fixture = ReturnType<typeof fixture>
function changeSmart(f: Fixture, change: (patch: IgsSmartPatchLayerV1) => void) {
  const patch = f.capture.smartPatch.document.layers.find((l) => l.id === f.patch.id)
  assert.ok(patch?.kind === 'smart-patch')
  change(patch)
  Object.assign(f.capture.smartPatch.context, {
    bbox: structuredClone(patch.boundingBox),
    generationDraft: structuredClone(patch.generationDraft),
    internalResolution: { ...patch.internalResolution },
    mask: structuredClone(patch.mask),
  })
  f.item.prompts = {
    negative: patch.generationDraft.negativePrompt.text,
    positive: patch.generationDraft.positivePrompt.text,
  }
}
function changeRegion(f: Fixture, change: (r: IgsRegionalGuidanceV1) => void) {
  change(f.capture.smartPatch.document.regionalGuidance!.at(-1)!)
  f.capture.regional.snapshot.regionalGuidance = structuredClone(
    f.capture.smartPatch.document.regionalGuidance,
  )
}

const refusals: {
  code: SmartPatchRegionalInputError['code']
  mutate: (f: Fixture) => void
  name: string
}[] = [
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) =>
      changeRegion(f, (r) => {
        r.prompts!.negative = prompt('{a|b}')
      }),
    name: 'late regional dynamic input',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) =>
      changeRegion(f, (r) => {
        r.prompts!.negative = prompt('\uD800')
      }),
    name: 'late regional invalid Unicode',
  },
  {
    code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
    mutate: (f) =>
      changeRegion(f, (r) => {
        r.prompts!.negative = prompt('<ti>', [
          { resource: { ...reference(), kind: 'embedding' }, token: '<ti>' },
        ])
      }),
    name: 'late regional TI binding',
  },
  {
    code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
    mutate: (f) =>
      changeSmart(f, (p) => {
        p.generationDraft.model = reference('illustrious')
      }),
    name: 'non-Anima selected model',
  },
  {
    code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
    mutate: (f) =>
      changeSmart(f, (p) => {
        p.generationDraft.sampling.animaMethod = 'dpmpp_2m'
      }),
    name: 'unsupported native scheduler',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) =>
      changeSmart(f, (p) => {
        p.generationDraft.positivePrompt = prompt('{day|night}')
      }),
    name: 'global dynamic prompt',
  },
  {
    code: 'SMART_PATCH_REGIONAL_LIMIT',
    mutate: (f) =>
      changeSmart(f, (p) => {
        p.boundingBox = { ...WORLD, height: 2048, width: 2048 }
      }),
    name: 'world area overflow',
  },
  {
    code: 'SMART_PATCH_REGIONAL_LIMIT',
    mutate: (f) =>
      changeSmart(f, (p) => {
        p.internalResolution.width = 73
      }),
    name: 'processing divisibility',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.item.prompts.negative = 'wrong current-canvas negative'
    },
    name: 'concrete text mismatch',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.capture.smartPatch.context.documentRevision = randomUUID()
    },
    name: 'wrong context revision',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.capture.regional.snapshot.documentRevision = randomUUID()
    },
    name: 'wrong regional revision',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.capture.smartPatch.context.sourceLayerIds = [randomUUID()]
    },
    name: 'wrong below-only source set',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.capture.smartPatch.context.maskSettings.blur++
    },
    name: 'wrong mask settings context',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.capture.smartPatch.context.coherenceSettings.edgeSize++
    },
    name: 'wrong coherence context',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.item.iteration = -1
    },
    name: 'negative iteration',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.item.promptPairIndex = 0.5
    },
    name: 'fractional prompt index',
  },
  {
    code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    mutate: (f) => {
      f.item.seed = 0x1_00_00_00_00
    },
    name: 'seed overflow',
  },
  {
    code: 'SMART_PATCH_REGIONAL_LIMIT',
    mutate: (f) =>
      changeRegion(f, (r) => {
        r.prompts!.negative = prompt('x'.repeat(16 * 1024 + 1))
      }),
    name: 'late regional overlong text',
  },
]
for (const entry of refusals) {
  test(`complete signed preflight refuses ${entry.name} before any projection`, async () => {
    const f = fixture()
    entry.mutate(f)
    const before = structuredClone({ document: f.capture.smartPatch.document, item: f.item })
    await assert.rejects(prepareSmartPatchAnimaRegionalInput(f), code(entry.code))
    assert.deepEqual(f.calls, [])
    assert.deepEqual({ document: f.capture.smartPatch.document, item: f.item }, before)
  })
}

test('three complete region pairs admit eight streams and exact aggregate inherited text accounting', async () => {
  const f = fixture([region(), region(), region()])
  changeSmart(f, (p) => {
    p.generationDraft.positivePrompt = prompt('p'.repeat(16 * 1024))
    p.generationDraft.negativePrompt = prompt('n'.repeat(16 * 1024))
  })
  for (const r of f.capture.smartPatch.document.regionalGuidance!) {
    r.prompts!.positive = prompt('r'.repeat(16 * 1024))
  }
  f.capture.regional.snapshot.regionalGuidance = structuredClone(
    f.capture.smartPatch.document.regionalGuidance,
  )
  const result = await prepareSmartPatchAnimaRegionalInput(f)
  assert.equal(result.compiledPrompts.length, 8)
  assert.equal(
    result.compiledPrompts.reduce((sum, p) => sum + Buffer.byteLength(p.text), 0),
    128 * 1024,
  )
  assert.equal(f.calls.length, 3)
})

test('four enabled regions refuse before projection but arbitrarily many disabled owners are dormant', async () => {
  const bad = fixture([region(), region(), region(), region()])
  await assert.rejects(prepareSmartPatchAnimaRegionalInput(bad), code('SMART_PATCH_REGIONAL_LIMIT'))
  assert.deepEqual(bad.calls, [])
  const good = fixture([region(), ...Array.from({ length: 8 }, () => region({ enabled: false }))])
  assert.equal((await prepareSmartPatchAnimaRegionalInput(good)).recipe.regions.length, 1)
})

for (const owner of [
  'document',
  'smart-layer',
  'smart-mask',
  'regional-source',
  'regional-mask',
] as const) {
  test(`source and mask collision with ${owner} refuses before projection`, async () => {
    const f = fixture()
    const doc = f.capture.smartPatch.document
    const reserved =
      owner === 'document'
        ? doc.documentId
        : owner === 'smart-layer'
          ? f.patch.id
          : owner === 'smart-mask'
            ? f.patch.mask.id
            : owner === 'regional-source'
              ? doc.regionalGuidance![0].id
              : doc.regionalGuidance![0].mask.id
    changeRegion(f, (r) => {
      r.id = reserved
    })
    await assert.rejects(
      prepareSmartPatchAnimaRegionalInput(f),
      code('SMART_PATCH_REGIONAL_INPUT_INVALID'),
    )
    assert.deepEqual(f.calls, [])
  })
}

test('bind owns the unchanged old command and keeps source KEEP and output solely there', async () => {
  const prepared = await prepareSmartPatchAnimaRegionalInput(fixture())
  const request = execution(prepared)
  const before = structuredClone(request)
  const bound = bindSmartPatchAnimaRegionalExecution(prepared, request)
  assert.deepEqual(bound.execution, before)
  assert.deepEqual(Object.keys(bound).sort(), [
    'compiledPrompts',
    'execution',
    'profile',
    'recipe',
    'schemaVersion',
  ])
  assert.ok(
    !('modelSource' in bound.recipe) &&
      !('latentKeepMask' in bound.recipe) &&
      !('output' in bound.recipe),
  )
  prepared.recipe.regions[0].coverage.alpha.fill(0)
  prepared.recipe.globalPrompts.negative.text = 'mutated'
  request.latentKeepMask.sha256 = '0'.repeat(64)
  request.modelSource!.path = '/another-owner/source.png'
  request.output.pngPath = '/another-owner/result.png'
  assert.deepEqual(bound.execution, before)
  assert.ok(bound.recipe.regions[0].coverage.alpha.includes(128))
  assert.equal(bound.recipe.globalPrompts.negative.text, 'Smart exclusion')
})

const bindingRefusals: {
  mutate: (request: Mutable<SmartPatchExecutionRequest>) => void
  name: string
}[] = [
  {
    mutate: (r) => {
      r.mode = 'img2img'
    },
    name: 'mode',
  },
  {
    mutate: (r) => {
      assert.equal(r.family, 'anima')
      if (r.family === 'anima') {
        r.inference.model.checkpoint.sha256 = '0'.repeat(64)
      }
    },
    name: 'checkpoint',
  },
  {
    mutate: (r) => {
      if (r.family === 'anima') {
        r.inference.prompts.positive = mutableCopy(compileAnimaPromptWeighting('other target'))
      }
    },
    name: 'compiled positive',
  },
  {
    mutate: (r) => {
      if (r.family === 'anima') {
        r.inference.prompts.negative = mutableCopy(
          compileAnimaPromptWeighting('Current Canvas exclusion'),
        )
      }
    },
    name: 'compiled negative',
  },
  {
    mutate: (r) => {
      r.internalResolution.width = 80
    },
    name: 'processing geometry',
  },
  {
    mutate: (r) => {
      r.modelSource = null
    },
    name: 'missing model source',
  },
  {
    mutate: (r) => {
      r.latentKeepMask.width++
    },
    name: 'wrong KEEP dimensions',
  },
  {
    mutate: (r) => {
      r.output.pngPath = 'relative-result.png'
    },
    name: 'malformed output path',
  },
]
for (const entry of bindingRefusals) {
  test(`binding refuses a mismatched original execution ${entry.name}`, async () => {
    const prepared = await prepareSmartPatchAnimaRegionalInput(fixture())
    const request = execution(prepared)
    entry.mutate(request)
    assert.throws(() => bindSmartPatchAnimaRegionalExecution(prepared, request))
  })
}

for (const field of ['seed', 'scheduler', 'steps', 'guidanceScale', 'strength'] as const) {
  test(`binding compares the complete legitimate original sampling plan: ${field}`, async () => {
    const prepared = await prepareSmartPatchAnimaRegionalInput(fixture())
    const request = execution(prepared)
    assert.equal(request.family, 'anima')
    if (request.family !== 'anima') {
      throw new Error('Anima fixture')
    }
    request.inference.sampling = mutableCopy(
      compileAnimaFlowSamplingPlan({
        guidanceScale: field === 'guidanceScale' ? 5 : 4,
        height: PROCESSING.height,
        mode: 'img2img',
        scheduler: field === 'scheduler' ? 'euler' : 'heun',
        seed: field === 'seed' ? 1 : 0,
        steps: field === 'steps' ? 4 : 3,
        strength: field === 'strength' ? 0.75 : 0.5,
        width: PROCESSING.width,
      }),
    )
    assert.throws(
      () => bindSmartPatchAnimaRegionalExecution(prepared, request),
      code('SMART_PATCH_REGIONAL_INPUT_INVALID'),
    )
  })
}

for (const field of [
  'source',
  'polarity',
  'text',
  'compiled',
  'order',
  'inherited',
  'coverage',
  'extra',
] as const) {
  test(`binding revalidates prepared signed ${field} instead of trusting a mutable DTO`, async () => {
    const prepared = structuredClone(await prepareSmartPatchAnimaRegionalInput(fixture()))
    const request = execution(prepared)
    const mutable = prepared.compiledPrompts as {
      polarity: 'negative' | 'positive'
      prompt: unknown
      sourceId: string
      text: string
    }[]
    if (field === 'source') {
      mutable[2].sourceId = prepared.recipe.layerId
    }
    if (field === 'polarity') {
      mutable[2].polarity = 'negative'
    }
    if (field === 'text') {
      mutable[2].text = 'other authored text'
    }
    if (field === 'compiled') {
      mutable[2].prompt = compileAnimaPromptWeighting('other authored text')
    }
    if (field === 'order') {
      mutable.reverse()
    }
    if (field === 'inherited') {
      prepared.recipe.regions[0].negative.prompt = prompt('Current Canvas exclusion')
    }
    if (field === 'coverage') {
      prepared.recipe.regions[0].coverage.alpha = new Uint8Array(1)
    }
    if (field === 'extra') {
      Object.assign(prepared.recipe, { executionOverride: {} })
    }
    assert.throws(
      () => bindSmartPatchAnimaRegionalExecution(prepared, request),
      code('SMART_PATCH_REGIONAL_INPUT_INVALID'),
    )
  })
}

test('late compiler refusal completes before the first regional projection', async () => {
  const f = fixture()
  changeRegion(f, (r) => {
    r.prompts!.negative = prompt('(invalid:NaN)')
  })
  await assert.rejects(prepareSmartPatchAnimaRegionalInput(f), /invalid explicit attention weight/u)
  assert.deepEqual(f.calls, [])
})

for (const kind of ['bounds', 'length', 'classification', 'intersection'] as const) {
  test(`projected world ${kind} is verified before a prepared result is returned`, async () => {
    const f = fixture()
    f.capture.regional.projectMask = async () => {
      const value = projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, WORLD)
      if (kind === 'bounds') {
        value.bounds.x++
      }
      if (kind === 'length') {
        value.alpha = new Uint8Array(1)
      }
      if (kind === 'classification') {
        value.kind = 'outside'
        value.intersection = null
      }
      if (kind === 'intersection') {
        value.intersection = { ...WORLD, x: WORLD.x - 1 }
      }
      return value
    }
    await assert.rejects(
      prepareSmartPatchAnimaRegionalInput(f),
      code('SMART_PATCH_REGIONAL_INPUT_INVALID'),
    )
  })
}

type ServiceFixture = Awaited<ReturnType<typeof serviceFixture>>

function raster(bytes: Buffer, name: string): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: bytes.readUInt32BE(20),
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: bytes.readUInt32BE(16),
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: WORLD.x, y: WORLD.y },
    visible: true,
  }
}
async function serviceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-regional-input-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const pausedSave = { enabled: false, entered: deferred(), resume: deferred() }
  const service = new ProjectService({
    autosaveOptions: {
      afterSaveCommit: async () => {
        if (pausedSave.enabled) {
          pausedSave.entered.release()
          await pausedSave.resume.promise
        }
      },
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    },
    dataRoot: root,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow,
  })
  const dispose = async () => {
    try {
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
    } finally {
      await database.close()
      await rm(root, { force: true, recursive: true })
    }
  }
  try {
    const tab = await service.create({
      height: 256,
      title: 'Genuine Smart regional lease',
      width: 256,
    })
    const id = tab.id
    const co = () => service.getOpenDocumentForAcceptance(id)!
    const made = authored()
    const belowPng = await acceptedOutputPngFixture(4, 3)
    const abovePng = await acceptedOutputPngFixture(8, 8)
    const targetPng = await acceptedOutputPngFixture(WORLD.width, WORLD.height)
    const below = raster(belowPng, 'Below-only source')
    const above = raster(abovePng, 'Above target control')
    const sources = new Map<string, Buffer>([
      [above.asset.path, abovePng],
      [below.asset.path, belowPng],
    ])
    const painted = (maskId: string, samples: Uint8Array, bounds = MASK_BOUNDS) => {
      const bytes = encodeProjectMaskPng(samples, bounds.width, bounds.height)
      const asset = {
        bytes: bytes.length,
        height: bounds.height,
        path: `assets/masks/${maskId}/${digest(bytes)}.png`,
        sha256: digest(bytes),
        width: bounds.width,
      }
      sources.set(asset.path, bytes)
      return { asset, bounds: { ...bounds }, id: maskId, revision: 1 }
    }
    made.patch.mask = painted(
      made.patch.mask.id,
      Uint8Array.from(ALPHA, (a) => (a === 127 ? 255 : a)),
    )
    for (const r of made.document.regionalGuidance!) {
      r.mask = painted(r.mask.id, ALPHA)
    }
    const document = parseProjectDocumentV1({
      ...made.document,
      documentId: co().document.documentId,
      documentRevision: co().document.documentRevision,
      layers: [above, made.patch, below],
    })
    await co().applyDocument(
      document,
      Object.fromEntries([...sources].map(([p, bytes]) => [p, { bytes }])),
    )
    await service.save(id)
    const savedPath = co().filePath
    await service.close(id)
    assert.equal((await service.open(id)).kind, 'opened')
    assert.deepEqual((await readIgsPackage(savedPath)).project, co().document)
    return {
      above,
      below,
      co,
      database,
      dispose,
      id,
      patchId: made.patch.id,
      pausedSave,
      root,
      savedPath,
      service,
      shadow,
      sources,
      targetPng,
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
async function withService(work: (f: ServiceFixture) => Promise<void>) {
  const f = await serviceFixture()
  try {
    await work(f)
  } finally {
    await f.dispose()
  }
}

async function durable(f: ServiceFixture) {
  const schema = await sql<{
    name: string
    type: string
  }>`select type, name, tbl_name, sql from sqlite_master order by type, name`.execute(f.database.db)
  const tables: Record<string, unknown[]> = {}
  for (const entry of schema.rows.filter((r) => r.type === 'table')) {
    const result = await sql`select * from ${sql.table(entry.name)}`.execute(f.database.db)
    tables[entry.name] = result.rows.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    )
  }
  return {
    document: f.co().document,
    epoch: f.co().documentEpoch,
    file: await readFile(f.savedPath),
    history: f.service
      .getOpenTabs()
      .map((t) => ({ canRedo: t.canRedo, canUndo: t.canUndo, dirty: t.dirty })),
    schema: schema.rows,
    tables,
  }
}

function composer(
  f: ServiceFixture,
  observed: ComposeTargetInput[],
): Pick<ProjectWorkerClient, 'composeTarget'> {
  return {
    composeTarget: async (input) => {
      observed.push(structuredClone(input))
      await writeFile(input.targetPngPath, f.targetPng)
      return {
        composite: {
          byteSize: f.targetPng.length,
          colorSpace: 'srgb',
          height: WORLD.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.targetPngPath,
          sha256: digest(f.targetPng),
          width: WORLD.width,
        },
        mode: 'img2img',
        rect: { ...input.bbox },
      }
    },
  }
}

test('actual Save reopen and coherent Service callback retain Smart ownership and durable state', async () => {
  await withService(async (f) => {
    await f.service.flushAutosave(f.id)
    const before = await durable(f)
    const observed: ComposeTargetInput[] = []
    let afterLease: CapturedSmartPatchRegionalGenerationInput | undefined
    await f.service.withCapturedSmartPatchRegionalGenerationInput(
      f.id,
      f.patchId,
      async (capture) => {
        afterLease = capture
        const original = f.co().document
        assert.equal(capture.smartPatch.context.documentId, original.documentId)
        assert.equal(capture.smartPatch.context.documentRevision, original.documentRevision)
        assert.equal(capture.regional.snapshot.documentRevision, original.documentRevision)
        assert.deepEqual(capture.smartPatch.document, original)
        assert.deepEqual(capture.regional.snapshot.primaryBbox, original.primaryBbox)
        assert.deepEqual(capture.regional.snapshot.generationDraft, original.generationDraft)
        assert.notDeepEqual(capture.smartPatch.context.generationDraft, original.generationDraft)
        assert.deepEqual(capture.smartPatch.context.sourceLayerIds, [f.below.id])
        const patch = original.layers.find((l) => l.id === f.patchId)
        assert.ok(patch?.kind === 'smart-patch')
        const prepared = await prepareSmartPatchAnimaRegionalInput({
          capture,
          item: concrete(patch),
        })
        assert.deepEqual(prepared.recipe.bbox, WORLD)
        assert.equal(prepared.recipe.regions[0].negative.prompt.text, 'Smart exclusion')
        assert.deepEqual(
          prepared.recipe.regions[0].coverage,
          projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, WORLD),
        )
        assert.equal(digest(capture.smartPatch.maskPngBytes!), patch.mask.asset!.sha256)
        const source = await capture.smartPatch.composeSource(composer(f, observed))
        assert.equal(source.sourceAlpha, 'opaque')
        assert.deepEqual(source.context.sourceLayerIds, [f.below.id])
        assert.equal(observed.length, 1)
        assert.deepEqual(observed[0].bbox, WORLD)
        assert.equal(observed[0].layers.length, 1)
        assert.equal(observed[0].layers[0].sha256, f.below.asset.sha256)
        assert.notEqual(observed[0].layers[0].sha256, f.above.asset.sha256)
        assert.equal(digest(await readFile(observed[0].layers[0].path)), f.below.asset.sha256)
        assert.deepEqual(
          bindSmartPatchAnimaRegionalExecution(prepared, execution(prepared)).recipe,
          prepared.recipe,
        )
      },
    )
    assert.deepEqual(await durable(f), before)
    assert.ok(afterLease)
    await assert.rejects(
      afterLease.regional.projectMask(before.document.regionalGuidance![0].id, WORLD),
      /closed/u,
    )
    await assert.rejects(afterLease.smartPatch.composeSource(composer(f, observed)), /closed/u)
  })
})

test('historical coherent leases survive callback edit Save and close without reselecting inputs', async () => {
  await withService(async (f) => {
    const observed: ComposeTargetInput[] = []
    const original = structuredClone(f.co().document)
    await f.service.withCapturedSmartPatchRegionalGenerationInput(
      f.id,
      f.patchId,
      async (capture) => {
        const patch = original.layers.find((l) => l.id === f.patchId)
        assert.ok(patch?.kind === 'smart-patch')
        const item = concrete(patch)
        const before = await prepareSmartPatchAnimaRegionalInput({ capture, item })
        await f
          .co()
          .applyDocument({ ...original, regionalGuidance: [], title: 'New live document title' })
        await f.service.save(f.id)
        await f.service.close(f.id)
        const after = await prepareSmartPatchAnimaRegionalInput({ capture, item })
        assert.deepEqual(after, before)
        assert.deepEqual(capture.smartPatch.document, original)
        assert.deepEqual(capture.regional.snapshot.regionalGuidance, original.regionalGuidance)
        assert.equal(
          (await capture.smartPatch.composeSource(composer(f, observed))).sourceAlpha,
          'opaque',
        )
        assert.deepEqual(observed[0].bbox, WORLD)
      },
    )
    assert.deepEqual(f.service.getOpenTabs(), [])
  })
})

test('pending Smart regional and below-only buffers detach synchronously before acquisition awaits', async () => {
  await withService(async (f) => {
    const document = structuredClone(f.co().document)
    const r = document.regionalGuidance![0]
    const pendingAlpha = Uint8Array.from(ALPHA, (a) => (a === 127 ? 17 : a))
    const bytes = encodeProjectMaskPng(pendingAlpha, MASK_BOUNDS.width, MASK_BOUNDS.height)
    r.mask = {
      asset: {
        bytes: bytes.length,
        height: MASK_BOUNDS.height,
        path: `assets/masks/${r.mask.id}/${digest(bytes)}.png`,
        sha256: digest(bytes),
        width: MASK_BOUNDS.width,
      },
      bounds: { ...MASK_BOUNDS },
      id: r.mask.id,
      revision: r.mask.revision + 1,
    }
    await f.co().applyDocument(document, { [r.mask.asset.path]: { bytes } })
    const coordinator = f.co()
    const originalRead = coordinator.getCurrentAssetSource
    const borrowed = new Map([...f.sources].map(([p, buffer]) => [p, Buffer.from(buffer)]))
    borrowed.set(r.mask.asset.path, Buffer.from(bytes))
    const readPaths: string[] = []
    coordinator.getCurrentAssetSource = function (asset) {
      assert.equal(this, coordinator)
      readPaths.push(asset.path)
      const buffer = borrowed.get(asset.path)
      assert.ok(buffer)
      return { bytes: buffer }
    }
    let entered = false
    const observed: ComposeTargetInput[] = []
    const acquiring = f.service.withCapturedSmartPatchRegionalGenerationInput(
      f.id,
      f.patchId,
      async (capture) => {
        entered = true
        const actual = await capture.regional.projectMask(r.id, WORLD)
        assert.deepEqual(
          actual,
          projectRegionalGuidanceCoverage({ alpha: pendingAlpha, bounds: MASK_BOUNDS }, WORLD),
        )
        const patch = document.layers.find((l) => l.id === f.patchId)
        assert.ok(patch?.kind === 'smart-patch')
        assert.equal(digest(capture.smartPatch.maskPngBytes!), patch.mask.asset!.sha256)
        assert.equal(
          (await prepareSmartPatchAnimaRegionalInput({ capture, item: concrete(patch) })).recipe
            .regions[0].maskRevision,
          r.mask.revision,
        )
        await capture.smartPatch.composeSource(composer(f, observed))
        assert.equal(digest(await readFile(observed[0].layers[0].path)), f.below.asset.sha256)
      },
    )
    try {
      const patch = document.layers.find((l) => l.id === f.patchId)
      assert.ok(patch?.kind === 'smart-patch')
      assert.ok(
        readPaths.includes(r.mask.asset.path),
        'Regional pending source read before first await',
      )
      assert.ok(
        readPaths.includes(patch.mask.asset!.path),
        'Smart pending source read before first await',
      )
      assert.ok(
        readPaths.includes(f.below.asset.path),
        'Below-only pending source read before first await',
      )
      assert.ok(!readPaths.includes(f.above.asset.path), 'Above source never enters Smart snapshot')
      for (const buffer of borrowed.values()) {
        buffer.fill(0)
      }
      coordinator.getCurrentAssetSource = () => {
        throw new Error('Late source lookup must not occur')
      }
      await acquiring
    } finally {
      coordinator.getCurrentAssetSource = originalRead
    }
    assert.equal(entered, true)
    assert.notEqual(
      (await readIgsPackage(f.savedPath)).project.documentRevision,
      f.co().document.documentRevision,
    )
  })
})

test('coherent acquisition refuses an unsafe package symlink without entering either callback', async () => {
  await withService(async (f) => {
    const original = `${f.savedPath}.held`
    await rename(f.savedPath, original)
    await symlink(original, f.savedPath)
    let used = false
    try {
      await assert.rejects(
        f.service.withCapturedSmartPatchRegionalGenerationInput(f.id, f.patchId, async () => {
          used = true
        }),
        (error) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'EDIT_CONFLICT',
      )
      assert.equal(used, false)
    } finally {
      await unlink(f.savedPath)
      await rename(original, f.savedPath)
    }
    await f.service.withCapturedSmartPatchRegionalGenerationInput(f.id, f.patchId, async () => {
      used = true
    })
    assert.equal(used, true)
  })
})

test('coherent acquisition refuses an already active same-content Save before any lease use', async () => {
  await withService(async (f) => {
    const original = structuredClone(f.co().document)
    f.pausedSave.enabled = true
    const saving = f.service.save(f.id)
    await f.pausedSave.entered.promise
    let used = false
    try {
      await assert.rejects(
        f.service.withCapturedSmartPatchRegionalGenerationInput(f.id, f.patchId, async () => {
          used = true
        }),
        (error) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'EDIT_CONFLICT',
      )
      assert.equal(used, false)
    } finally {
      f.pausedSave.resume.release()
      await saving
    }
    assert.deepEqual(f.co().document, original)
    await f.service.withCapturedSmartPatchRegionalGenerationInput(f.id, f.patchId, async () => {
      used = true
    })
    assert.equal(used, true)
  })
})

for (const change of ['edit', 'save', 'replace'] as const) {
  test(`coherent acquisition rejects a concurrent ${change} before entering callback`, async () => {
    await withService(async (f) => {
      const entered = deferred()
      const resume = deferred()
      const hold = withProjectPathLock(f.savedPath, async () => {
        entered.release()
        await resume.promise
      })
      await entered.promise
      let used = false
      const acquiring = f.service.withCapturedSmartPatchRegionalGenerationInput(
        f.id,
        f.patchId,
        async () => {
          used = true
        },
      )
      // Observe rejection immediately so a deliberately raced refusal cannot be unhandled.
      const refusal = assert.rejects(
        acquiring,
        (error) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'EDIT_CONFLICT',
      )
      let saving: Promise<unknown> | undefined
      try {
        if (change === 'edit') {
          await f.co().applyDocument({ ...f.co().document, title: 'Acquisition edit' })
        }
        if (change === 'save') {
          saving = f.service.save(f.id)
        }
        if (change === 'replace') {
          const saved = await readIgsPackage(f.savedPath)
          await saveIgsPackage(f.savedPath, {
            assets: Object.fromEntries([...f.sources].map(([p, bytes]) => [p, { bytes }])),
            preview: {
              merged: await saved.readMember('preview/merged.png'),
              rect: saved.manifest.preview.rect,
              status: saved.manifest.preview.status,
              thumbnail: await saved.readMember('preview/thumbnail.webp'),
            },
            project: saved.project,
          })
        }
      } finally {
        resume.release()
        await hold
      }
      await refusal
      await saving
      assert.equal(used, false)
      await f.service.withCapturedSmartPatchRegionalGenerationInput(
        f.id,
        f.patchId,
        async (capture) => {
          assert.equal(
            capture.smartPatch.context.documentRevision,
            f.co().document.documentRevision,
          )
        },
      )
    })
  })
}
