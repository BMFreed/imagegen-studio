import type { PlannedGenerationBatchItem } from '../../shared/projects/generation-batch-plan.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'
import { resolveProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'
import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'
import { resolveSmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type {
  PreparedSmartPatchIllustriousRegionalInput,
  SmartPatchIllustriousRegionalProfile,
} from './project-smart-patch-illustrious-regional-input.js'
import type { CapturedSmartPatchRegionalGenerationInput } from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { projectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  bindSmartPatchIllustriousRegionalExecution,
  capturePreparedSmartPatchIllustriousRegionalInput,
  ILLUSTRIOUS_SMART_REGIONAL_MODES,
  prepareSmartPatchIllustriousRegionalInput,
} from './project-smart-patch-illustrious-regional-input.js'
import { SmartPatchRegionalInputError } from './project-smart-patch-regional-input.js'

const WORLD = { height: 73, width: 107, x: -13, y: 5 }
const PROCESSING = { height: 64, width: 72 }
const MASK_BOUNDS = { height: 2, width: 3, x: -12, y: 6 }
const ALPHA = Uint8Array.from([0, 1, 127, 128, 254, 255])
const PROFILES = Object.keys(
  ILLUSTRIOUS_SMART_REGIONAL_MODES,
) as SmartPatchIllustriousRegionalProfile[]
type Mutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Entry)[]
    ? Mutable<Entry>[]
    : T extends object
      ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
      : T
type IllustriousCommand = Extract<SmartPatchExecutionRequest, { family: 'illustrious' }>
const mutable = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>
const prompt = (text: string) => ({ embeddingRefs: [], text })
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const invalid = (error: unknown) =>
  error instanceof SmartPatchRegionalInputError &&
  error.code === 'SMART_PATCH_REGIONAL_INPUT_INVALID'

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function reference() {
  return {
    baseModelFamily: 'illustrious' as const,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Authored private Illustrious',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint' as const,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon' as const,
    versionName: 'Exact selected version',
  }
}

function authored() {
  const document = createEmptyProjectDocumentV1({
    primaryBbox: { height: 256, width: 256, x: 91, y: -83 },
    title: 'Private Illustrious Smart regional input',
  })
  const bytes = encodeProjectMaskPng(ALPHA, MASK_BOUNDS.width, MASK_BOUNDS.height)
  const mask = () => {
    const id = randomUUID()
    return {
      asset: {
        bytes: bytes.length,
        height: MASK_BOUNDS.height,
        path: `assets/masks/${id}/${digest(bytes)}.png`,
        sha256: digest(bytes),
        width: MASK_BOUNDS.width,
      },
      bounds: { ...MASK_BOUNDS },
      id,
      revision: 1,
    }
  }
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...WORLD },
    generationDraft: {
      ...structuredClone(document.generationDraft),
      model: reference(),
      negativePrompt: prompt('selected Smart exclusion'),
      positivePrompt: prompt('selected (Smart subject:1.1)'),
      sampling: {
        cfgScale: 4,
        denoisingStrength: 0.5,
        sampler: 'Euler',
        scheduler: 'Normal',
        steps: 3,
      },
      seed: { policy: 'fixed', value: 0 },
    },
    id: randomUUID(),
    internalResolution: { ...PROCESSING },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Selected Smart target',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  const region = (local: boolean): IgsRegionalGuidanceV1 => ({
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: mask(),
    name: 'Independent regional owner',
    overlayOpacity: 0,
    prompts: {
      negative: prompt(local ? 'local regional exclusion' : 'dormant {a|b}'),
      positive: local ? null : prompt('regional subject'),
      useGlobalNegativePrompt: !local,
    },
  })
  return {
    bytes,
    document: parseProjectDocumentV1({
      ...document,
      generationDraft: {
        ...document.generationDraft,
        model: { ...reference(), fileSha256: 'b'.repeat(64) },
        negativePrompt: prompt('Current Canvas exclusion'),
        positivePrompt: prompt('{Canvas day|Canvas night}'),
      },
      layers: [patch],
      regionalGuidance: [region(false), region(true)],
    }),
  }
}

function itemFor(patch: IgsSmartPatchLayerV1): PlannedGenerationBatchItem {
  return {
    iteration: 0,
    promptPairIndex: 0,
    prompts: {
      negative: patch.generationDraft.negativePrompt.text,
      positive: patch.generationDraft.positivePrompt.text,
    },
    seed: 0,
  }
}

function fixture(profile = PROFILES[0]) {
  const { document } = authored()
  const patch = document.layers[0] as IgsSmartPatchLayerV1
  const calls: string[] = []
  const unused = async (): Promise<never> => {
    throw new Error('Unexpected execution in metadata test')
  }
  const capture: Mutable<CapturedSmartPatchRegionalGenerationInput> = {
    regional: {
      assets: [],
      async projectMask(id, target) {
        assert.equal(this, capture.regional)
        calls.push(id)
        return projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, target)
      },
      readAsset: unused,
      snapshot: mutable({
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
      context: mutable({
        bbox: patch.boundingBox,
        coherenceSettings: resolveSmartPatchCoherenceSettings(patch.coherenceSettings),
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        generationDraft: patch.generationDraft,
        internalResolution: patch.internalResolution,
        lastActualSeedSnapshot: document.lastActualSeedSnapshot,
        layerId: patch.id,
        locked: patch.locked,
        mask: patch.mask,
        maskSettings: resolveProjectMaskSettings(patch.maskSettings),
        projectKey: randomUUID(),
        sourceLayerIds: [],
        visible: patch.visible,
      }),
      document: mutable(document),
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
  return { calls, capture, item: mutable(itemFor(patch)), profile }
}

function command(
  prepared: PreparedSmartPatchIllustriousRegionalInput,
): Mutable<IllustriousCommand> {
  const { recipe } = prepared
  const file = (name: string) => ({
    byteSize: 12,
    path: `/owned-test/${name}`,
    sha256: 'c'.repeat(64),
  })
  const mode = ILLUSTRIOUS_SMART_REGIONAL_MODES[prepared.profile]
  return mutable({
    family: 'illustrious',
    inference: {
      checkpoint: {
        path: '/owned-test/checkpoint.safetensors',
        predictionType: 'epsilon',
        sha256: recipe.modelSha256,
      },
      prompts: recipe.item.prompts,
      sampling: {
        cfgScale: recipe.sampling.cfgScale,
        noiseProfile: defaultIllustriousNoiseProfile(),
        scheduler: 'euler',
        seed: recipe.item.seed,
        steps: recipe.sampling.steps,
        ...(mode === 'txt2img' ? {} : { denoisingStrength: recipe.sampling.denoisingStrength }),
      },
    },
    internalResolution: recipe.internalResolution,
    latentKeepMask: {
      ...file('keep.png'),
      height: recipe.internalResolution.height / 8,
      width: recipe.internalResolution.width / 8,
    },
    mode,
    modelSource:
      mode === 'txt2img' ? null : { ...file('source.png'), ...recipe.internalResolution },
    output: { pngPath: '/owned-test/result.png', stagingRoot: '/owned-test' },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  })
}

for (const profile of PROFILES) {
  test(`${profile}: prepare/capture/bind retain the original Smart command and independent WORLD regions`, async () => {
    const f = fixture(profile)
    const before = structuredClone({
      context: f.capture.smartPatch.context,
      document: f.capture.smartPatch.document,
      item: f.item,
    })
    const result = await prepareSmartPatchIllustriousRegionalInput(f)
    assert.equal(result.profile, profile)
    assert.equal(result.recipe.family, 'illustrious')
    assert.deepEqual(result.recipe.bbox, WORLD)
    assert.deepEqual(result.recipe.internalResolution, PROCESSING)
    assert.equal(result.recipe.modelSha256, 'a'.repeat(64))
    assert.equal(result.recipe.item.seed, 0)
    assert.deepEqual(
      result.recipe.regions.map((r) => [r.negative.source, r.negative.prompt.text]),
      [
        ['smart-patch', 'selected Smart exclusion'],
        ['regional', 'local regional exclusion'],
      ],
    )
    assert.equal(result.recipe.regions[0].authoredPrompts!.negative!.text, 'dormant {a|b}')
    assert.deepEqual(
      result.recipe.regions[0].coverage,
      projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, WORLD),
    )
    assert.notEqual(result.recipe.regions[0].maskId, result.recipe.smartMask.maskId)
    assert.deepEqual(capturePreparedSmartPatchIllustriousRegionalInput(result), result)
    const original = command(result)
    const bound = bindSmartPatchIllustriousRegionalExecution(result, original)
    assert.deepEqual(bound.execution, original)
    assert.notEqual(bound.execution, original)
    assert.equal(bound.execution.mode, ILLUSTRIOUS_SMART_REGIONAL_MODES[profile])
    assert.equal(bound.execution.modelSource === null, bound.execution.mode === 'txt2img')
    assert.equal(f.calls.length, 2)
    assert.deepEqual(
      {
        context: f.capture.smartPatch.context,
        document: f.capture.smartPatch.document,
        item: f.item,
      },
      before,
    )
    original.inference.prompts.negative = 'late command edit'
    result.recipe.regions[0].coverage.alpha.fill(0)
    assert.equal(bound.execution.inference.prompts.negative, 'selected Smart exclusion')
    assert.ok(bound.recipe.regions[0].coverage.alpha.includes(127))
  })
}

test('metadata snapshots detach before projected-mask awaits and ignore late collaborator replacement', async () => {
  const f = fixture()
  const entered = deferred()
  const resume = deferred()
  const original = f.capture.regional.projectMask
  let count = 0
  f.capture.regional.projectMask = async function (id, target) {
    if (++count === 1) {
      entered.release()
      await resume.promise
    }
    return original.call(this, id, target)
  }
  const pending = prepareSmartPatchIllustriousRegionalInput(f)
  await entered.promise
  f.item.seed = 999
  f.capture.smartPatch.context.generationDraft.negativePrompt.text = 'later Smart edit'
  f.capture.smartPatch.document.layers = []
  f.capture.regional.snapshot.regionalGuidance = []
  f.capture.regional.projectMask = async () => {
    throw new Error('Late replacement ran')
  }
  resume.release()
  const result = await pending
  assert.equal(result.recipe.item.seed, 0)
  assert.equal(result.recipe.globalPrompts.negative.text, 'selected Smart exclusion')
  assert.equal(result.recipe.regions.length, 2)
  assert.deepEqual(result.recipe.bbox, WORLD)
})

const draftRefusals: Record<
  string,
  (draft: Mutable<IgsSmartPatchLayerV1['generationDraft']>) => void
> = {
  'active TI': (d) => {
    d.negativePrompt.embeddingRefs = [
      { resource: { ...reference(), kind: 'embedding' }, token: '<token>' },
    ]
  },
  'CFG rescale': (d) => {
    d.cfgRescale = 0.1
  },
  'clip skip': (d) => {
    d.clipSkip = 1
  },
  'dynamic positive': (d) => {
    d.positivePrompt.text = '{a|b}'
  },
  'enabled LoRA': (d) => {
    d.loras = [{ enabled: true, resource: { ...reference(), kind: 'lora' }, weight: 0 }]
  },
  'external VAE': (d) => {
    d.vae = { ...reference(), kind: 'vae' }
  },
  sampler: (d) => {
    d.sampling.sampler = 'Euler a'
  },
  scheduler: (d) => {
    d.sampling.scheduler = 'Karras'
  },
  'text budget': (d) => {
    d.positivePrompt.text = 'a'.repeat(16 * 1024 + 1)
  },
  'VAE precision': (d) => {
    d.vaePrecision = 'FP16'
  },
  'wrong objective': (d) => {
    d.model!.predictionType = 'v_prediction'
  },
}
for (const [name, change] of Object.entries(draftRefusals)) {
  test(`unsupported ${name} refuses before regional pixel projection`, async () => {
    const f = fixture()
    const patch = f.capture.smartPatch.document.layers[0]
    assert.equal(patch.kind, 'smart-patch')
    if (patch.kind !== 'smart-patch') {
      throw new Error('fixture target')
    }
    change(patch.generationDraft)
    f.capture.smartPatch.context.generationDraft = mutable(patch.generationDraft)
    f.item.prompts = {
      negative: patch.generationDraft.negativePrompt.text,
      positive: patch.generationDraft.positivePrompt.text,
    }
    await assert.rejects(prepareSmartPatchIllustriousRegionalInput(f), invalid)
    assert.deepEqual(f.calls, [])
  })
}

test('enabled references refuse before projection; disabled authored references remain inert', async () => {
  const imageId = randomUUID()
  const image = {
    asset: {
      bytes: 128,
      height: 64,
      path: `assets/regional-references/${imageId}/${'1'.repeat(64)}.png`,
      sha256: '1'.repeat(64),
      width: 64,
    },
    id: imageId,
    name: 'Authored reference without an inference consumer',
    sourceFormat: 'PNG' as const,
    thumbnail: {
      bytes: 128,
      height: 64,
      path: `assets/regional-references/${imageId}/${'2'.repeat(64)}.webp`,
      sha256: '2'.repeat(64),
      width: 64,
    },
  }
  for (const enabled of [true, false]) {
    const f = fixture()
    const region = f.capture.smartPatch.document.regionalGuidance![1]
    region.referenceImages = [image]
    region.enabled = enabled
    f.capture.regional.snapshot.regionalGuidance = mutable(
      f.capture.smartPatch.document.regionalGuidance,
    )
    if (enabled) {
      await assert.rejects(prepareSmartPatchIllustriousRegionalInput(f), invalid)
      assert.deepEqual(f.calls, [])
    } else {
      const prepared = await prepareSmartPatchIllustriousRegionalInput(f)
      assert.equal(prepared.recipe.regions.length, 1)
      assert.equal(f.calls.length, 1)
    }
  }
})

test('zero enabled regions retains genuine Smart globals without reading regional pixels', async () => {
  const f = fixture()
  for (const region of f.capture.smartPatch.document.regionalGuidance!) {
    region.enabled = false
  }
  f.capture.regional.snapshot.regionalGuidance = mutable(
    f.capture.smartPatch.document.regionalGuidance,
  )
  const prepared = await prepareSmartPatchIllustriousRegionalInput(f)
  assert.deepEqual(prepared.recipe.regions, [])
  assert.deepEqual(f.calls, [])
  assert.equal(prepared.recipe.globalPrompts.negative.text, 'selected Smart exclusion')
  assert.deepEqual(
    bindSmartPatchIllustriousRegionalExecution(prepared, command(prepared)).recipe,
    prepared.recipe,
  )
  assert.throws(
    () => capturePreparedSmartPatchIllustriousRegionalInput({ ...prepared, profile: 'unknown' }),
    invalid,
  )
})

for (const owner of [
  'context revision',
  'regional revision',
  'regional contents',
  'selected settings',
] as const) {
  test(`incoherent ${owner} refuses before regional pixels`, async () => {
    const f = fixture()
    if (owner === 'context revision') {
      f.capture.smartPatch.context.documentRevision = randomUUID()
    }
    if (owner === 'regional revision') {
      f.capture.regional.snapshot.documentRevision = randomUUID()
    }
    if (owner === 'regional contents') {
      f.capture.regional.snapshot.regionalGuidance = []
    }
    if (owner === 'selected settings') {
      f.capture.smartPatch.context.generationDraft.negativePrompt.text = 'foreign capture'
    }
    await assert.rejects(prepareSmartPatchIllustriousRegionalInput(f), invalid)
    assert.deepEqual(f.calls, [])
  })
}

const commandRefusals: Record<string, (request: Mutable<IllustriousCommand>) => void> = {
  CFG: (r) => {
    r.inference.sampling.cfgScale = 5
  },
  LoRA: (r) => {
    r.inference.loras = [
      { byteSize: 12, path: '/owned-test/lora', sha256: 'd'.repeat(64), weight: 0 },
    ]
  },
  'missing noise profile': (r) => {
    delete r.inference.sampling.noiseProfile
  },
  mode: (r) => {
    r.mode = r.mode === 'inpaint' ? 'outpaint' : 'inpaint'
  },
  'model SHA': (r) => {
    r.inference.checkpoint.sha256 = 'b'.repeat(64)
  },
  'noise spacing': (r) => {
    r.inference.sampling.noiseProfile!.timestepSpacing = 'linspace'
  },
  'noise ZTSNR': (r) => {
    r.inference.sampling.noiseProfile!.rescaleBetasZeroSnr = true
  },
  objective: (r) => {
    r.inference.checkpoint.predictionType = 'v_prediction'
  },
  precision: (r) => {
    r.inference.vaePrecision = 'FP32'
  },
  prompts: (r) => {
    r.inference.prompts.negative = 'Current Canvas exclusion'
  },
  rescale: (r) => {
    r.inference.sampling.cfgRescale = 0.1
  },
  scheduler: (r) => {
    r.inference.sampling.scheduler = 'euler_a'
  },
  seed: (r) => {
    r.inference.sampling.seed = 1
  },
  steps: (r) => {
    r.inference.sampling.steps = 4
  },
  strength: (r) => {
    r.inference.sampling.denoisingStrength = 0.75
  },
  TI: (r) => {
    r.inference.embeddings = {
      negative: [],
      positive: [
        { byteSize: 12, path: '/owned-test/embedding', sha256: 'd'.repeat(64), token: '<token>' },
      ],
    }
  },
  VAE: (r) => {
    r.inference.vae = { byteSize: 12, path: '/owned-test/vae', sha256: 'd'.repeat(64) }
  },
}
for (const [name, change] of Object.entries(commandRefusals)) {
  test(`binding refuses a valid original command with changed ${name}`, async () => {
    const result = await prepareSmartPatchIllustriousRegionalInput(
      fixture('invoke-illustrious-smart-regional-inpaint-v1'),
    )
    const request = command(result)
    change(request)
    assert.throws(() => bindSmartPatchIllustriousRegionalExecution(result, request), invalid)
  })
}

test('recapture verifies inherited/local authored prompts, coverage and unique owners', async () => {
  const result = await prepareSmartPatchIllustriousRegionalInput(fixture())
  const changes: ((p: PreparedSmartPatchIllustriousRegionalInput) => void)[] = [
    (p) => {
      p.recipe.regions[0].negative.prompt.text = 'Current Canvas exclusion'
    },
    (p) => {
      p.recipe.regions[1].negative.prompt.text = 'different local'
    },
    (p) => {
      p.recipe.regions[0].positive = null
    },
    (p) => {
      p.recipe.regions[0].maskId = p.recipe.smartMask.maskId
    },
    (p) => {
      p.recipe.regions[0].coverage.alpha = new Uint8Array(1)
    },
    (p) => {
      p.recipe.regions[0].maskRevision = 0
    },
    (p) => {
      p.recipe.item.promptPairIndex = 1
    },
  ]
  for (const change of changes) {
    const candidate = structuredClone(result)
    change(candidate)
    assert.throws(() => capturePreparedSmartPatchIllustriousRegionalInput(candidate), invalid)
  }
})

test('genuine ProjectService Save/reopen lease prepares all profiles and survives later document edits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-illustrious-smart-regional-input-'))
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
      height: 256,
      title: 'Genuine private Illustrious lease',
      width: 256,
    })
    const coordinator = () => service.getOpenDocumentForAcceptance(tab.id)!
    const authoredInput = authored()
    const document = parseProjectDocumentV1({
      ...authoredInput.document,
      documentId: coordinator().document.documentId,
      documentRevision: coordinator().document.documentRevision,
    })
    const assets = Object.fromEntries(
      document.regionalGuidance!.map((r) => [r.mask.asset!.path, { bytes: authoredInput.bytes }]),
    )
    await coordinator().applyDocument(document, assets)
    await service.save(tab.id)
    await service.close(tab.id)
    assert.equal((await service.open(tab.id)).kind, 'opened')
    const original = structuredClone(coordinator().document)
    const patch = original.layers[0] as IgsSmartPatchLayerV1
    let retained: CapturedSmartPatchRegionalGenerationInput | undefined
    await service.withCapturedSmartPatchRegionalGenerationInput(
      tab.id,
      patch.id,
      async (capture) => {
        retained = capture
        assert.equal(capture.smartPatch.context.documentRevision, original.documentRevision)
        assert.equal(capture.regional.snapshot.documentRevision, original.documentRevision)
        const prepared = []
        for (const profile of PROFILES) {
          const value = await prepareSmartPatchIllustriousRegionalInput({
            capture,
            item: itemFor(patch),
            profile,
          })
          assert.equal(value.recipe.regions[0].negative.prompt.text, 'selected Smart exclusion')
          assert.deepEqual(
            value.recipe.regions[0].coverage,
            projectRegionalGuidanceCoverage({ alpha: ALPHA, bounds: MASK_BOUNDS }, WORLD),
          )
          assert.deepEqual(
            bindSmartPatchIllustriousRegionalExecution(value, command(value)).recipe,
            value.recipe,
          )
          prepared.push(value)
        }
        await coordinator().applyDocument({
          ...original,
          regionalGuidance: [],
          title: 'Later authoring',
        })
        await service.save(tab.id)
        for (const [i, profile] of PROFILES.entries()) {
          assert.deepEqual(
            await prepareSmartPatchIllustriousRegionalInput({
              capture,
              item: itemFor(patch),
              profile,
            }),
            prepared[i],
          )
        }
      },
    )
    assert.ok(retained)
    await assert.rejects(
      retained.regional.projectMask(original.regionalGuidance![0].id, WORLD),
      /closed/u,
    )
    assert.equal(coordinator().document.title, 'Later authoring')
    assert.deepEqual(coordinator().document.regionalGuidance, [])
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})
