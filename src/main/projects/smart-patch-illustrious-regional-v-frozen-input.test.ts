import {
  defaultIllustriousNoiseProfile,
  type IllustriousNoiseProfileV1,
} from '../../shared/projects/illustrious-noise-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type {
  FrozenSmartPatchIllustriousRegionalInputV1,
  SmartPatchIllustriousRegionalProfile,
  SmartPatchIllustriousRegionalResolvedPolicy,
} from './project-smart-patch-illustrious-regional-input.js'
import type { SmartPatchGenerationMode } from './project-smart-patch-preparation.js'
import type { CapturedSmartPatchRegionalGenerationInput } from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { encodeProjectMaskPng } from './project-mask.js'
import {
  bindSmartPatchIllustriousRegionalExecution,
  capturePreparedSmartPatchIllustriousRegionalInput,
  prepareSmartPatchIllustriousRegionalInput,
} from './project-smart-patch-illustrious-regional-input.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import {
  attachSmartPatchIllustriousRegionalInput,
  hydrateFrozenSmartPatchIllustriousRegionalInput,
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import { literalPreparedSmartPatchInputMaterial } from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

const MODES = ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const
const POLICIES: IllustriousNoiseProfileV1[] = [false, true].flatMap((rescaleBetasZeroSnr) =>
  (['leading', 'linspace', 'trailing'] as const).map((timestepSpacing) => ({
    ...defaultIllustriousNoiseProfile(),
    rescaleBetasZeroSnr,
    timestepSpacing,
  })),
)
const profile = (mode: SmartPatchGenerationMode): SmartPatchIllustriousRegionalProfile =>
  `invoke-illustrious-smart-regional-v-prediction-${mode}-v1`
const epsilonProfile = (mode: SmartPatchGenerationMode): SmartPatchIllustriousRegionalProfile =>
  `invoke-illustrious-smart-regional-${mode}-v1`
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string) => ({ embeddingRefs: [], text })

/** Literal source/KEEP pixels and a declared coverage collaborator; no CPU/ML qualification. */
async function ordinary(mode: SmartPatchGenerationMode, noiseProfile = POLICIES[0]) {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious', mode)
  material.manifest.context.sourceLayerIds = []
  const entry = material.manifest.items[0]
  if (entry.family !== 'illustrious') {
    assert.fail('Illustrious item required')
  }
  entry.inference.checkpoint.predictionType = 'v_prediction'
  entry.inference.sampling.noiseProfile = structuredClone(noiseProfile)
  return await parseSmartPatchInputMaterial(material.manifest, material.files)
}

function captureFor(material: SmartPatchInputMaterial) {
  const context = structuredClone(material.manifest.context)
  const unused = async (): Promise<never> => {
    throw new Error('Unused collaborator must not execute in a frozen-input test')
  }
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...context.bbox },
    coherenceSettings: { ...context.coherenceSettings },
    generationDraft: structuredClone(context.generationDraft),
    id: context.layerId,
    internalResolution: { ...context.internalResolution },
    kind: 'smart-patch',
    locked: false,
    mask: structuredClone(context.mask),
    maskSettings: { ...context.maskSettings },
    name: 'Selected Smart fixture',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  const regions: IgsRegionalGuidanceV1[] = [false, true].map((inherit) => {
    const id = randomUUID()
    const bytes = encodeProjectMaskPng(Uint8Array.of(255), 1, 1)
    return {
      enabled: true,
      id: randomUUID(),
      locked: false,
      mask: {
        asset: {
          bytes: bytes.length,
          height: 1,
          path: `assets/masks/${id}/${digest(bytes)}.png`,
          sha256: digest(bytes),
          width: 1,
        },
        bounds: { height: 1, width: 1, x: context.bbox.x, y: context.bbox.y },
        id,
        revision: 1,
      },
      name: 'Owned regional fixture',
      overlayOpacity: 0,
      prompts: {
        negative: prompt(inherit ? 'dormant {local|negative}' : '(local exclusion)1.5'),
        positive: inherit ? null : prompt('regional subject'),
        useGlobalNegativePrompt: inherit,
      },
    }
  })
  const document = parseProjectDocumentV1({
    ...createEmptyProjectDocumentV1({ title: 'V frozen regional fixture' }),
    documentId: context.documentId,
    documentRevision: context.documentRevision,
    generationDraft: {
      ...structuredClone(context.generationDraft),
      negativePrompt: prompt('Current Canvas must not be inherited'),
    },
    lastActualSeedSnapshot: context.lastActualSeedSnapshot,
    layers: [patch],
    regionalGuidance: regions,
  })
  const projections: string[] = []
  const capture: CapturedSmartPatchRegionalGenerationInput = {
    regional: {
      assets: [],
      projectMask: async (id, bounds) => {
        projections.push(id)
        return {
          alpha: Uint8Array.from({ length: bounds.width * bounds.height }, (_, i) =>
            i % 3 === projections.length % 3 ? 255 : i % 3 === 2 ? 127 : 0,
          ),
          bounds: { ...bounds },
          intersection: { ...bounds },
          kind: 'covered',
        }
      },
      readAsset: unused,
      snapshot: {
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        generationDraft: structuredClone(document.generationDraft),
        lastActualSeedSnapshot: document.lastActualSeedSnapshot,
        primaryBbox: document.primaryBbox,
        regionalGuidance: structuredClone(document.regionalGuidance),
      },
      stagingRoot: '/unused-v-regional-stage',
    },
    smartPatch: {
      composeSource: unused,
      context,
      document,
      execute: unused,
      executeAndCompose: unused,
      maskPngBytes: material.files['authored-mask.png'] ?? null,
      maskPngPath: null,
      prepareBatchInput: unused,
      prepareConditioning: unused,
      prepareContribution: unused,
      prepareInput: unused,
      prepareModelSource: unused,
    },
  }
  const entry = material.manifest.items[0]
  if (entry.family !== 'illustrious') {
    assert.fail('Illustrious item required')
  }
  const predictionType = entry.inference.checkpoint.predictionType
  if (predictionType !== 'epsilon' && predictionType !== 'v_prediction') {
    assert.fail('The literal exact-file policy must have a supported objective')
  }
  const resolvedPolicy: SmartPatchIllustriousRegionalResolvedPolicy = {
    modelSha256: entry.inference.checkpoint.sha256,
    noiseProfile: structuredClone(entry.inference.sampling.noiseProfile!),
    predictionType,
  }
  return {
    capture,
    item: { ...structuredClone(entry.item), iteration: 0, promptPairIndex: 0 },
    profile: profile(material.manifest.mode),
    projections,
    resolvedPolicy,
  }
}

async function fixture(mode: SmartPatchGenerationMode, noiseProfile = POLICIES[0]) {
  const material = await ordinary(mode, noiseProfile)
  const input = captureFor(material)
  const prepared = await prepareSmartPatchIllustriousRegionalInput(input)
  const regional = await attachSmartPatchIllustriousRegionalInput(material, prepared)
  return { input, material, prepared, regional }
}

function execution(material: SmartPatchInputMaterial): SmartPatchExecutionRequest {
  const entry = material.manifest.items[0]
  if (entry.family !== 'illustrious') {
    assert.fail('Illustrious item required')
  }
  const source = material.manifest.files['model-source.png']
  return {
    family: 'illustrious',
    inference: structuredClone(entry.inference),
    internalResolution: { ...material.manifest.context.internalResolution },
    latentKeepMask: {
      ...material.manifest.files['latent-keep-mask.png'],
      path: '/literal-v-stage/latent-keep-mask.png',
    },
    mode: material.manifest.mode,
    modelSource: source ? { ...source, path: '/literal-v-stage/model-source.png' } : null,
    output: { pngPath: '/literal-v-stage/result.png', stagingRoot: '/literal-v-stage' },
    protocolVersion: '1',
    requestId: randomUUID(),
    schemaVersion: 1,
    type: 'execute-smart-patch',
  }
}

for (const mode of MODES) {
  for (const policy of POLICIES) {
    test(`V frozen ${mode} preserves independent ${policy.rescaleBetasZeroSnr}/${policy.timestepSpacing} policy`, async () => {
      const { input, material, prepared, regional } = await fixture(mode, policy)
      assert.equal(regional.manifest.context.generationDraft.model!.predictionType, 'epsilon')
      assert.equal(prepared.profile, profile(mode))
      assert.deepEqual(prepared.recipe.sampling.noiseProfile, policy)
      assert.deepEqual(
        input.projections,
        prepared.recipe.regions.map((r) => r.regionId),
      )
      assert.equal(prepared.recipe.regions[1].negative.source, 'smart-patch')
      assert.deepEqual(
        prepared.recipe.regions[1].negative.prompt,
        regional.manifest.context.generationDraft.negativePrompt,
      )
      const bound = bindSmartPatchIllustriousRegionalExecution(prepared, execution(material))
      assert.equal(bound.execution.inference.checkpoint.predictionType, 'v_prediction')
      assert.deepEqual(bound.execution.inference.sampling.noiseProfile, policy)
      assert.deepEqual(
        hydrateFrozenSmartPatchIllustriousRegionalInput(regional.manifest, regional.files),
        prepared,
      )
      for (const [name, bytes] of Object.entries(material.files)) {
        assert.ok(regional.files[name].equals(bytes), `Attachment changed source/KEEP ${name}`)
      }
    })
  }

  test(`V ${mode} refuses crossed EPS objective/profile and independent noise substitution`, async () => {
    const { material, prepared } = await fixture(mode, POLICIES[5])
    const original = execution(material)
    assert.equal(original.family, 'illustrious')
    if (original.family !== 'illustrious') {
      assert.fail('Illustrious command required')
    }
    const changes = [
      (r: typeof original) => {
        r.inference.checkpoint.predictionType = 'epsilon'
      },
      (r: typeof original) => {
        delete r.inference.sampling.noiseProfile
      },
      (r: typeof original) => {
        r.inference.sampling.noiseProfile!.rescaleBetasZeroSnr = false
      },
      (r: typeof original) => {
        r.inference.sampling.noiseProfile!.timestepSpacing = 'leading'
      },
    ]
    for (const change of changes) {
      const changed = structuredClone(original)
      change(changed)
      assert.throws(() => bindSmartPatchIllustriousRegionalExecution(prepared, changed), {
        code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
      })
    }
    const crossed = structuredClone(prepared)
    crossed.profile = epsilonProfile(mode)
    assert.throws(() => capturePreparedSmartPatchIllustriousRegionalInput(crossed))
    delete crossed.recipe.sampling.noiseProfile
    assert.doesNotThrow(() => capturePreparedSmartPatchIllustriousRegionalInput(crossed))
    assert.throws(() => bindSmartPatchIllustriousRegionalExecution(crossed, original))
    assert.doesNotThrow(() => bindSmartPatchIllustriousRegionalExecution(prepared, original))
  })

  test(`V ${mode} frozen metadata refuses lost/changed objective policy and mode before raw reads`, async () => {
    const { regional } = await fixture(mode, POLICIES[5])
    const original = structuredClone(regional.manifest)
    for (const change of [
      (m: typeof original) => {
        if (m.items[0].family === 'illustrious') {
          m.items[0].inference.checkpoint.predictionType = 'epsilon'
        }
      },
      (m: typeof original) => {
        if (m.items[0].family === 'illustrious') {
          delete m.items[0].inference.sampling.noiseProfile
        }
      },
      (m: typeof original) => {
        if (m.items[0].family === 'illustrious') {
          m.items[0].inference.sampling.noiseProfile!.timestepSpacing = 'leading'
        }
      },
      (m: typeof original) => {
        const recipe = (m.regional as FrozenSmartPatchIllustriousRegionalInputV1).recipe
        delete recipe.sampling.noiseProfile
      },
      (m: typeof original) => {
        m.regional!.profile = profile(mode === 'txt2img' ? 'img2img' : 'txt2img')
      },
    ]) {
      const changed = structuredClone(original)
      change(changed)
      assert.throws(() => parseFrozenSmartPatchInputV1(changed), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    }
    assert.deepEqual(parseFrozenSmartPatchInputV1(original), original)
  })

  test(`V ${mode} bundle reload keeps raw alpha/source files and advisory model hint separate`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'igs-v-smart-frozen-'))
    try {
      const { prepared, regional } = await fixture(mode, POLICIES[4])
      const saved = await new SmartPatchInputBundleRepository(root).publish(regional)
      regional.files['regional-0.alpha8'].fill(0)
      const loaded = await new SmartPatchInputBundleRepository(root).load(saved.id)
      const hydrated = hydrateFrozenSmartPatchIllustriousRegionalInput(
        loaded.manifest,
        loaded.files,
      )
      assert.deepEqual(hydrated, prepared)
      assert.equal(loaded.manifest.context.generationDraft.model!.predictionType, 'epsilon')
      assert.equal(loaded.manifest.items[0].family, 'illustrious')
      assert.ok(loaded.files['regional-0.alpha8'].some((v) => v !== 0))
      await new SmartPatchInputBundleRepository(root).discard(saved.id, saved.manifestSha256)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test(`V ${mode} SQLite restart/Retry requalifies exact policy then copies every independent file`, async () => {
    await withSmartPatchQueueFixture(
      'illustrious',
      async (f) => {
        const material = await ordinary(mode, POLICIES[5])
        const owner = f.material.manifest
        Object.assign(material.manifest.context, {
          documentId: owner.context.documentId,
          documentRevision: owner.context.documentRevision,
          projectKey: owner.context.projectKey,
        })
        material.manifest.context.generationDraft.model = structuredClone(
          owner.context.generationDraft.model,
        )
        const entry = material.manifest.items[0]
        const peer = owner.items[0]
        if (entry.family !== 'illustrious' || peer.family !== 'illustrious') {
          assert.fail('Illustrious items')
        }
        entry.inference.checkpoint = structuredClone(peer.inference.checkpoint)
        const resolve = f.models.resolveVerifiedGenerationCheckpointForPlan.bind(f.models)
        let changed = false
        f.models.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
          const value = await resolve(reference)
          return { ...value, noiseProfile: structuredClone(changed ? POLICIES[0] : POLICIES[5]) }
        }
        const input = captureFor(material)
        f.material = await attachSmartPatchIllustriousRegionalInput(
          material,
          await prepareSmartPatchIllustriousRegionalInput(input),
        )
        const [row] = await admitSmartPatch(f)
        const original = await f.queue.loadVerifiedSmartPatchInput(row.id)
        const canceled = await f.queue.cancel(row.id, row.statusSequence)
        const queue = new GenerationQueueRepository(f.database.db, f.root)
        await queue.recoverAfterRestart()
        changed = true
        await assert.rejects(
          queue.retryPreparedSmartPatchTerminal(row.id, canceled.statusSequence, {
            assertCurrent: () => undefined,
            modelService: f.models,
          }),
          { code: 'GENERATION_RESOURCE_CHANGED' },
        )
        assert.deepEqual(
          (await queue.loadVerifiedSmartPatchInput(row.id)).payload,
          original.payload,
        )
        changed = false
        const retry = await queue.retryPreparedSmartPatchTerminal(row.id, canceled.statusSequence, {
          assertCurrent: () => undefined,
          modelService: f.models,
        })
        const copied = await queue.loadVerifiedSmartPatchInput(retry.id)
        assert.notEqual(copied.payload.bundle.id, original.payload.bundle.id)
        assert.deepEqual(copied.payload.regional, original.payload.regional)
        assert.deepEqual(copied.payload.item, original.payload.item)
        for (const [name, bytes] of Object.entries(original.bundle.files)) {
          assert.ok(copied.bundle.files[name].equals(bytes), `Retry changed ${name}`)
        }
      },
      {},
      'img2img',
    )
  })
}

test('resolved V policy is detached once before the first regional await', async () => {
  const material = await ordinary('inpaint', POLICIES[5])
  const input = captureFor(material)
  const expected = structuredClone(input.resolvedPolicy)
  let reads = 0
  Object.defineProperty(input, 'resolvedPolicy', {
    get() {
      reads += 1
      return expected
    },
  })
  const project = input.capture.regional.projectMask
  input.capture.regional.projectMask = async (...args) => {
    expected.noiseProfile.rescaleBetasZeroSnr = false
    expected.noiseProfile.timestepSpacing = 'leading'
    expected.predictionType = 'epsilon'
    return await project(...args)
  }
  const prepared = await prepareSmartPatchIllustriousRegionalInput(input)
  assert.equal(reads, 1)
  assert.deepEqual(prepared.recipe.sampling.noiseProfile, POLICIES[5])
})

for (const invalidPolicy of [
  'missing',
  'wrong sha',
  'wrong objective',
  'malformed',
  'extra field',
] as const) {
  test(`V private input rejects ${invalidPolicy} resolved policy before any projection`, async () => {
    const input = captureFor(await ordinary('inpaint'))
    if (invalidPolicy === 'missing') {
      delete (input as { resolvedPolicy?: unknown }).resolvedPolicy
    }
    if (invalidPolicy === 'wrong sha') {
      input.resolvedPolicy.modelSha256 = 'f'.repeat(64)
    }
    if (invalidPolicy === 'wrong objective') {
      input.resolvedPolicy.predictionType = 'epsilon'
    }
    if (invalidPolicy === 'malformed') {
      Object.assign(input.resolvedPolicy.noiseProfile, { timestepSpacing: 'unknown' })
    }
    if (invalidPolicy === 'extra field') {
      Object.assign(input.resolvedPolicy, { inferredFromName: true })
    }
    await assert.rejects(prepareSmartPatchIllustriousRegionalInput(input), {
      code: 'SMART_PATCH_REGIONAL_INPUT_INVALID',
    })
    assert.deepEqual(input.projections, [])
  })
}

test('actual EPS can override stale V hint without changing old default-only recipe shape', async () => {
  const material = await ordinary('txt2img')
  material.manifest.context.generationDraft.model!.predictionType = 'v_prediction'
  const entry = material.manifest.items[0]
  if (entry.family !== 'illustrious') {
    assert.fail('Illustrious item')
  }
  entry.inference.checkpoint.predictionType = 'epsilon'
  const input = captureFor(material)
  input.profile = epsilonProfile('txt2img')
  const prepared = await prepareSmartPatchIllustriousRegionalInput(input)
  assert.equal(Object.hasOwn(prepared.recipe.sampling, 'noiseProfile'), false)
  const attached = await attachSmartPatchIllustriousRegionalInput(material, prepared)
  assert.equal(attached.manifest.context.generationDraft.model!.predictionType, 'v_prediction')
  assert.doesNotThrow(() =>
    bindSmartPatchIllustriousRegionalExecution(prepared, execution(material)),
  )
  input.resolvedPolicy.noiseProfile = structuredClone(POLICIES[5])
  await assert.rejects(prepareSmartPatchIllustriousRegionalInput(input))
})
