import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type { SmartPatchGenerationMode } from './project-smart-patch-preparation.js'
import type {
  CapturedSmartPatchRegionalGenerationInput,
  SmartPatchAnimaRegionalProfile,
} from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import { reverifyFrozenSmartPatchInput } from './project-smart-patch-execution.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_LORA_IMG2IMG_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_LORA_INPAINT_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_LORA_OUTPAINT_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_LORA_TXT2IMG_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE,
  bindSmartPatchAnimaRegionalExecution,
  prepareSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import {
  attachSmartPatchAnimaRegionalInput,
  captureSmartPatchInputMaterial,
  hydrateFrozenSmartPatchAnimaRegionalInput,
  parseFrozenSmartPatchInputV1,
} from './smart-patch-frozen-input.js'
import { literalSmartPatchPreparedInput } from './test-fixtures/smart-patch-input-material.js'

const LEGACY = {
  img2img: ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE,
  inpaint: ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  outpaint: ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
  txt2img: ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE,
} as const satisfies Record<SmartPatchGenerationMode, SmartPatchAnimaRegionalProfile>
const LORA = {
  img2img: ANIMA_SMART_PATCH_REGIONAL_LORA_IMG2IMG_PROFILE,
  inpaint: ANIMA_SMART_PATCH_REGIONAL_LORA_INPAINT_PROFILE,
  outpaint: ANIMA_SMART_PATCH_REGIONAL_LORA_OUTPAINT_PROFILE,
  txt2img: ANIMA_SMART_PATCH_REGIONAL_LORA_TXT2IMG_PROFILE,
} as const satisfies Record<SmartPatchGenerationMode, SmartPatchAnimaRegionalProfile>
const MODES = ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const
type LoraRow = IgsProjectDocumentV1['generationDraft']['loras'][number]
type MutableFixture<T> = { -readonly [K in keyof T]: MutableFixture<T[K]> }
type AnimaRequest = MutableFixture<Extract<SmartPatchExecutionRequest, { family: 'anima' }>>

function stack(): LoraRow[] {
  return [-0.75, 0, 0.5].map((weight, index) => ({
    enabled: true,
    resource: {
      baseModelFamily: 'anima',
      civitaiFileId: null,
      civitaiModelId: null,
      civitaiVersionId: null,
      displayName: `Declared adapter ${index}`,
      fileSha256: String(index + 4).repeat(64),
      kind: 'lora',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Exact declared version',
    },
    weight,
  }))
}

/** Literal pixels and pure captured leases; no resource or native inference substitution. */
function fixture(mode: SmartPatchGenerationMode, rows = stack()) {
  const { executions, prepared } = literalSmartPatchPreparedInput('anima', mode)
  const request = executions[0].request as MutableFixture<SmartPatchExecutionRequest>
  if (request.family !== 'anima') {
    assert.fail('Original Anima fixture required')
  }
  prepared.context.sourceLayerIds = []
  prepared.context.generationDraft.loras = structuredClone(rows)
  request.inference.loras = rows
    .filter((entry) => entry.enabled)
    .map((entry, index) => ({
      byteSize: 20 + index,
      path: `/declared-managed/lora-${index}.safetensors`,
      sha256: entry.resource.fileSha256,
      weight: entry.weight,
    }))
  const ctx = prepared.context
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: structuredClone(ctx.bbox),
    coherenceSettings: structuredClone(ctx.coherenceSettings),
    generationDraft: structuredClone(ctx.generationDraft),
    id: ctx.layerId,
    internalResolution: structuredClone(ctx.internalResolution),
    kind: 'smart-patch',
    locked: ctx.locked,
    mask: structuredClone(ctx.mask),
    maskSettings: structuredClone(ctx.maskSettings),
    name: 'Captured regional target',
    opacity: 1,
    rasterSubLayers: [],
    visible: ctx.visible,
  }
  const document = parseProjectDocumentV1({
    ...createEmptyProjectDocumentV1({ title: 'Declared Smart adapter controls' }),
    documentId: ctx.documentId,
    documentRevision: ctx.documentRevision,
    lastActualSeedSnapshot: ctx.lastActualSeedSnapshot,
    layers: [patch],
    regionalGuidance: [
      {
        enabled: true,
        id: randomUUID(),
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: 'Independent regional mask',
        overlayOpacity: 0,
        prompts: {
          negative: { embeddingRefs: [], text: 'dormant local exclusion' },
          positive: { embeddingRefs: [], text: '(regional subject)1.25' },
          useGlobalNegativePrompt: true,
        },
      },
    ],
  })
  let projections = 0
  const unused = async (): Promise<never> => {
    throw new Error('Private regional preparation must not use this collaborator')
  }
  const capture: CapturedSmartPatchRegionalGenerationInput = {
    regional: {
      assets: [],
      async projectMask(_id, target) {
        projections += 1
        return {
          alpha: Uint8Array.from({ length: target.width * target.height }, (_, i) =>
            i % 2 === 0 ? 255 : 0,
          ),
          bounds: { ...target },
          intersection: { ...target },
          kind: 'covered',
        }
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
      context: structuredClone(ctx),
      document,
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
  const item = { ...structuredClone(executions[0].item), iteration: 0, promptPairIndex: 0 }
  const prepare = (profile: SmartPatchAnimaRegionalProfile = LORA[mode]) =>
    prepareSmartPatchAnimaRegionalInput({
      capture,
      item,
      profile,
      promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    })
  const ordinary = () => captureSmartPatchInputMaterial(prepared, executions)
  const regional = async (profile: SmartPatchAnimaRegionalProfile = LORA[mode]) =>
    attachSmartPatchAnimaRegionalInput(await ordinary(), await prepare(profile))
  return {
    capture,
    item,
    ordinary,
    prepare,
    prepared,
    projections: () => projections,
    regional,
    request,
  }
}

function animaEntry(material: SmartPatchInputMaterial) {
  const entry = material.manifest.items[0]
  if (entry.family !== 'anima') {
    assert.fail('Original Anima item required')
  }
  return entry as MutableFixture<typeof entry>
}

/**
 * Declared exact resolver responses test reverify ownership, not on-disk ModelService
 * qualification.
 */
function resolver(material: SmartPatchInputMaterial) {
  const entry = animaEntry(material)
  const model = entry.inference.model
  const rows = material.manifest.context.generationDraft.loras.filter((row) => row.enabled)
  const resolved = entry.inference.loras.map((lora, index) => ({
    byteSize: lora.byteSize,
    managedPath: lora.path,
    reference: structuredClone(rows[index].resource),
  }))
  const calls: string[] = []
  const unused = async (): Promise<never> => {
    throw new Error('Unselected resource must not resolve')
  }
  const models: SmartPatchExecutionModelResolver = {
    assertNoUnboundGenerationEmbeddings: async () => undefined,
    async resolveVerifiedAnimaGenerationLoraForPlan(saved) {
      calls.push(saved.fileSha256)
      const index = rows.findIndex((row) => row.resource.localModelId === saved.localModelId)
      assert.notEqual(index, -1)
      // This controlled resolver can return a changed SHA; the real frozen reverify owner must
      // reject that result. Its repeated lookup may therefore receive the returned reference.
      assert.deepEqual(
        { ...saved, fileSha256: rows[index].resource.fileSha256 },
        rows[index].resource,
      )
      return structuredClone(resolved[index])
    },
    async resolveVerifiedGenerationAnimaBundleForPlan(saved) {
      assert.deepEqual(saved, material.manifest.context.generationDraft.model)
      const component = (value: AnimaRequest['inference']['model']['vae']) => ({
        byteSize: value.byteSize,
        localModelId: value.path,
        localVersionId: 'declared-version',
        managedPath: value.path,
        sha256: value.sha256,
      })
      return {
        architecture: model.architecture,
        checkpoint: {
          byteSize: model.checkpoint.byteSize,
          managedPath: model.checkpoint.path,
          reference: structuredClone(saved),
        },
        qwen3Encoder: component(model.qwen3Encoder),
        vae: component(model.vae),
      }
    },
    resolveVerifiedGenerationCheckpointForPlan: unused,
    resolveVerifiedGenerationEmbeddingForPlan: unused,
    resolveVerifiedGenerationLoraForPlan: unused,
    resolveVerifiedGenerationVaeForPlan: unused,
  }
  return { calls, models, resolved }
}

for (const mode of MODES) {
  test(`Anima regional LoRA ${mode} freezes signed and enabled-zero stack in the original job`, async () => {
    const f = fixture(mode)
    const input = await f.prepare()
    const bound = bindSmartPatchAnimaRegionalExecution(input, f.request)
    assert.deepEqual(bound.execution.inference.loras, f.request.inference.loras)
    const material = await f.regional()
    assert.equal(material.manifest.regional!.profile, LORA[mode])
    assert.deepEqual(
      material.manifest.context.generationDraft.loras,
      f.prepared.context.generationDraft.loras,
    )
    assert.deepEqual(animaEntry(material).inference.loras, f.request.inference.loras)
    assert.equal(animaEntry(material).inference.loras[1].weight, 0)
    assert.equal(material.manifest.mode, mode)
    assert.equal(Object.hasOwn(input.recipe, 'loras'), false)
    assert.equal(Object.hasOwn(material.manifest.regional!.recipe, 'loras'), false)
    assert.deepEqual(
      hydrateFrozenSmartPatchAnimaRegionalInput(material.manifest, material.files),
      input,
    )
    assert.deepEqual(input.recipe.regions[0].negative.prompt, input.recipe.globalPrompts.negative)
    assert.equal(input.recipe.regions[0].negative.source, 'smart-patch')
  })

  test(`Anima regional LoRA ${mode} enabled-zero-only stack requires the LoRA profile and exact resolver`, async () => {
    const f = fixture(mode, [stack()[1]])
    await assert.rejects(f.prepare(LEGACY[mode]), { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' })
    const material = await f.regional()
    assert.equal(material.manifest.regional!.profile, LORA[mode])
    assert.equal(animaEntry(material).inference.loras.length, 1)
    assert.equal(animaEntry(material).inference.loras[0].weight, 0)
    const r = resolver(material)
    await reverifyFrozenSmartPatchInput(material, r.models)
    assert.ok(r.calls.length > 0)
    r.models.resolveVerifiedAnimaGenerationLoraForPlan = async () => {
      throw Object.assign(new Error('Declared zero-weight adapter unavailable'), {
        code: 'MODEL_VERSION_UNAVAILABLE',
      })
    }
    await assert.rejects(reverifyFrozenSmartPatchInput(material, r.models), {
      code: 'MODEL_VERSION_UNAVAILABLE',
    })
  })

  test(`Anima regional LoRA ${mode} refuses the legacy enabled-stack policy before projection`, async () => {
    const f = fixture(mode)
    await assert.rejects(f.prepare(LEGACY[mode]), { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' })
    assert.equal(f.projections(), 0)
    const input = await f.prepare()
    assert.throws(
      () => bindSmartPatchAnimaRegionalExecution({ ...input, profile: LEGACY[mode] }, f.request),
      { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' },
    )
    const material = await f.regional()
    material.manifest.regional!.profile = LEGACY[mode]
    assert.throws(() => parseFrozenSmartPatchInputV1(material.manifest), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
  })

  for (const rows of [[], stack().map((row) => ({ ...row, enabled: false }))]) {
    test(`Anima regional ${mode} ${rows.length === 0 ? 'empty' : 'disabled-only'} stack retains legacy profile`, async () => {
      const f = fixture(mode, rows)
      await assert.rejects(f.prepare(), { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' })
      assert.equal(f.projections(), 0)
      const input = await f.prepare(LEGACY[mode])
      assert.equal(input.profile, LEGACY[mode])
      assert.doesNotThrow(() => bindSmartPatchAnimaRegionalExecution(input, f.request))
      assert.throws(
        () => bindSmartPatchAnimaRegionalExecution({ ...input, profile: LORA[mode] }, f.request),
        { code: 'SMART_PATCH_REGIONAL_UNSUPPORTED' },
      )
      const material = await f.regional(LEGACY[mode])
      assert.equal(animaEntry(material).inference.loras.length, 0)
      const r = resolver(material)
      await reverifyFrozenSmartPatchInput(material, r.models)
      assert.deepEqual(r.calls, [])
      material.manifest.regional!.profile = LORA[mode]
      assert.throws(() => parseFrozenSmartPatchInputV1(material.manifest), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    })
  }

  for (const other of MODES.filter((value) => value !== mode)) {
    test(`Anima regional LoRA ${mode} cannot borrow ${other} profile`, async () => {
      const f = fixture(mode)
      const prepared = await f.prepare(LORA[other])
      assert.throws(() => bindSmartPatchAnimaRegionalExecution(prepared, f.request), {
        code: 'SMART_PATCH_REGIONAL_UNSUPPORTED',
      })
      await assert.rejects(attachSmartPatchAnimaRegionalInput(await f.ordinary(), prepared), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    })
  }

  test(`Anima regional LoRA ${mode} whole-bundle validation binds order, weight, SHA and resource roles`, async () => {
    const original = await fixture(mode).regional()
    const mutations: [string, (material: SmartPatchInputMaterial) => void][] = [
      ['ordered stack', (m) => animaEntry(m).inference.loras.reverse()],
      [
        'signed weight',
        (m) => {
          animaEntry(m).inference.loras[0].weight *= -1
        },
      ],
      [
        'enabled-zero weight',
        (m) => {
          animaEntry(m).inference.loras[1].weight = 0.25
        },
      ],
      [
        'exact SHA',
        (m) => {
          animaEntry(m).inference.loras[0].sha256 = 'f'.repeat(64)
        },
      ],
      [
        'missing enabled-zero',
        (m) => {
          animaEntry(m).inference.loras.splice(1, 1)
        },
      ],
      [
        'extra resource',
        (m) => {
          animaEntry(m).inference.loras.push({ ...animaEntry(m).inference.loras[0] })
        },
      ],
      [
        'duplicate path',
        (m) => {
          animaEntry(m).inference.loras[1].path = animaEntry(m).inference.loras[0].path
        },
      ],
      [
        'base role collision',
        (m) => {
          animaEntry(m).inference.loras[0].path = animaEntry(m).inference.model.qwen3Encoder.path
        },
      ],
      [
        'authored enabled policy',
        (m) => {
          m.manifest.context.generationDraft.loras[1].enabled = false
        },
      ],
    ]
    for (const [label, mutate] of mutations) {
      const changed = { files: original.files, manifest: structuredClone(original.manifest) }
      mutate(changed)
      assert.throws(
        () => parseFrozenSmartPatchInputV1(changed.manifest),
        {
          code: 'SMART_PATCH_INPUT_INVALID',
        },
        label,
      )
      assert.deepEqual(parseFrozenSmartPatchInputV1(original.manifest), original.manifest)
    }
  })

  test(`Anima regional LoRA ${mode} uses original Smart resource reverify including enabled zero`, async () => {
    const material = await fixture(mode).regional()
    const r = resolver(material)
    await reverifyFrozenSmartPatchInput(material, r.models)
    assert.ok(r.calls.includes(animaEntry(material).inference.loras[1].sha256))
    for (const key of ['byteSize', 'managedPath', 'reference'] as const) {
      const changed = resolver(material)
      if (key === 'byteSize') {
        changed.resolved[1].byteSize += 1
      }
      if (key === 'managedPath') {
        changed.resolved[1].managedPath += '.replaced'
      }
      if (key === 'reference') {
        changed.resolved[1].reference.fileSha256 = 'f'.repeat(64)
      }
      await assert.rejects(reverifyFrozenSmartPatchInput(material, changed.models), {
        code: 'GENERATION_RESOURCE_CHANGED',
      })
      await reverifyFrozenSmartPatchInput(material, r.models)
    }
    const missing = resolver(material)
    missing.models.resolveVerifiedAnimaGenerationLoraForPlan = async (saved) => {
      if (saved.fileSha256 === animaEntry(material).inference.loras[1].sha256) {
        throw Object.assign(new Error('Declared enabled-zero resource unavailable'), {
          code: 'MODEL_VERSION_UNAVAILABLE',
        })
      }
      return r.models.resolveVerifiedAnimaGenerationLoraForPlan(saved)
    }
    await assert.rejects(reverifyFrozenSmartPatchInput(material, missing.models), {
      code: 'MODEL_VERSION_UNAVAILABLE',
    })
  })

  test(`Anima regional LoRA ${mode} repository reload retains original ordered stack and raw planes`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'igs-smart-regional-lora-'))
    try {
      const f = fixture(mode)
      const material = await f.regional()
      const saved = await new SmartPatchInputBundleRepository(root).publish(material)
      f.capture.smartPatch.context.generationDraft.loras.reverse()
      f.request.inference.loras[0].weight = 9
      const loaded = await new SmartPatchInputBundleRepository(root).load(saved.id)
      assert.deepEqual(loaded.manifest, material.manifest)
      for (const [role, bytes] of Object.entries(material.files)) {
        assert.ok(loaded.files[role].equals(bytes), role)
      }
      hydrateFrozenSmartPatchAnimaRegionalInput(loaded.manifest, loaded.files)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

test('Anima regional LoRA captures selected stack policy and reads requested profile once before projection', async () => {
  const f = fixture('inpaint')
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let projected!: () => void
  const entered = new Promise<void>((resolve) => {
    projected = resolve
  })
  const originalProject = f.capture.regional.projectMask.bind(f.capture.regional)
  f.capture.regional.projectMask = async (id, target) => {
    projected()
    await held
    return originalProject(id, target)
  }
  let profileReads = 0
  const pending = prepareSmartPatchAnimaRegionalInput({
    capture: f.capture,
    item: f.item,
    get profile() {
      profileReads += 1
      return profileReads === 1 ? LORA.inpaint : LEGACY.inpaint
    },
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
  })
  await entered
  f.capture.smartPatch.context.generationDraft.loras[0].enabled = false
  const patch = f.capture.smartPatch.document.layers[0] as IgsSmartPatchLayerV1
  patch.generationDraft.loras[0].enabled = false
  patch.generationDraft.loras[1].resource.fileSha256 = 'f'.repeat(64)
  patch.generationDraft.negativePrompt.text = 'later changed negative'
  release()
  const prepared = await pending
  assert.equal(profileReads, 1)
  assert.equal(prepared.profile, LORA.inpaint)
  assert.equal(prepared.recipe.globalPrompts.negative.text, 'blur')
  assert.doesNotThrow(() => bindSmartPatchAnimaRegionalExecution(prepared, f.request))
  // The private binder binds presence only; the complete authored order belongs to validateEntry.
  const changedCommand = structuredClone(f.request)
  changedCommand.inference.loras.reverse()
  assert.doesNotThrow(() => bindSmartPatchAnimaRegionalExecution(prepared, changedCommand))
})

test('Anima regional default remains the original no-LoRA INP profile', async () => {
  const f = fixture('inpaint', [])
  const prepared = await prepareSmartPatchAnimaRegionalInput({
    capture: f.capture,
    item: f.item,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
  })
  assert.equal(prepared.profile, LEGACY.inpaint)
})
