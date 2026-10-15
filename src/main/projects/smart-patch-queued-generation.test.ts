import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'

import type { SmartPatchInputBundle } from './project-smart-patch-input-bundle.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import {
  reverifyFrozenSmartPatchInput,
  type SmartPatchExecutionModelResolver,
} from './project-smart-patch-execution.js'
import {
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import {
  assertQueuedSmartPatchBundle,
  buildFrozenQueuedSmartPatchV1,
  isSmartPatchQueueOperation,
  parseFrozenQueuedSmartPatchV1,
} from './smart-patch-queued-generation.js'
import {
  literalPreparedSmartPatchInputMaterial,
  literalSmartPatchColorPng,
  literalSmartPatchNumericPng,
} from './test-fixtures/smart-patch-input-material.js'

function asBundle(material: SmartPatchInputMaterial): SmartPatchInputBundle {
  return {
    ...material,
    id: randomUUID(),
    manifestSha256: createHash('sha256').update(JSON.stringify(material.manifest)).digest('hex'),
  }
}

function concreteItems(material: SmartPatchInputMaterial, count: number): void {
  const original = material.manifest.items[0]
  material.manifest.items = Array.from({ length: count }, (_, index) => {
    const entry = structuredClone(original)
    entry.item.seed = index === count - 1 ? 0xff_ff_ff_ff : index
    if (entry.family === 'anima') {
      entry.inference = {
        ...entry.inference,
        sampling: compileAnimaFlowSamplingPlan({
          guidanceScale: 4,
          height: 64,
          mode: material.manifest.mode === 'txt2img' ? 'txt2img' : 'img2img',
          scheduler: 'euler',
          seed: entry.item.seed,
          steps: 3,
          strength: material.manifest.mode === 'txt2img' ? null : 0.5,
          width: 64,
        }),
      }
    } else {
      entry.inference.sampling.seed = entry.item.seed
    }
    return entry
  })
}

/**
 * Trusted catalog qualification is the declared collaborator. The production family inference
 * builder, exact inference comparison and final real resolver calls remain the subject under test.
 * Literal paths identify no installed models; these tests neither open models nor run inference.
 */
function catalog(
  material: SmartPatchInputMaterial,
  onResolve: (call: number) => Promise<void> = async () => undefined,
): { count: () => number; models: SmartPatchExecutionModelResolver } {
  const entry = material.manifest.items[0]
  const reference = structuredClone(material.manifest.context.generationDraft.model!)
  let count = 0
  const unused = async (): Promise<never> => {
    throw new Error('An unselected resource must not be qualified')
  }
  const resolve = async () => {
    count++
    await onResolve(count)
  }
  const models: SmartPatchExecutionModelResolver = {
    assertNoUnboundGenerationEmbeddings: async () => undefined,
    resolveVerifiedAnimaGenerationLoraForPlan: unused,
    resolveVerifiedGenerationAnimaBundleForPlan: async () => {
      assert.equal(entry.family, 'anima')
      if (entry.family !== 'anima') {
        throw new Error('Wrong family')
      }
      await resolve()
      const component = (role: 'qwen3Encoder' | 'vae') => ({
        byteSize: entry.inference.model[role].byteSize,
        localModelId: '33333333-3333-4333-8333-333333333333',
        localVersionId: '44444444-4444-4444-8444-444444444444',
        managedPath: entry.inference.model[role].path,
        sha256: entry.inference.model[role].sha256,
      })
      return {
        architecture: 'anima-base-1.0',
        checkpoint: {
          byteSize: entry.inference.model.checkpoint.byteSize,
          managedPath: entry.inference.model.checkpoint.path,
          reference: structuredClone(reference),
        },
        qwen3Encoder: component('qwen3Encoder'),
        vae: component('vae'),
      }
    },
    resolveVerifiedGenerationCheckpointForPlan: async () => {
      assert.equal(entry.family, 'illustrious')
      if (entry.family !== 'illustrious') {
        throw new Error('Wrong family')
      }
      await resolve()
      return {
        managedPath: entry.inference.checkpoint.path,
        noiseProfile: structuredClone(entry.inference.sampling.noiseProfile),
        reference: {
          ...structuredClone(reference),
          predictionType: entry.inference.checkpoint.predictionType,
        },
      }
    },
    resolveVerifiedGenerationEmbeddingForPlan: unused,
    resolveVerifiedGenerationLoraForPlan: unused,
    resolveVerifiedGenerationVaeForPlan: unused,
  }
  return { count: () => count, models }
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    test(`queued ${family} ${mode} binds the exact item, independent world geometry and fixed roles`, async () => {
      const bundle = asBundle(await literalPreparedSmartPatchInputMaterial(family, mode))
      const payload = buildFrozenQueuedSmartPatchV1(bundle, 0)
      const reopened = parseFrozenQueuedSmartPatchV1(JSON.parse(JSON.stringify(payload)))
      assert.deepEqual(reopened, payload)
      assert.deepEqual(reopened.item, bundle.manifest.items[0])
      assert.deepEqual(reopened.files, bundle.manifest.files)
      assert.deepEqual(reopened.bundle, {
        id: bundle.id,
        itemIndex: 0,
        manifestSha256: bundle.manifestSha256,
      })
      assert.equal(reopened.kind, `${family}-smart-patch`)
      assert.equal(reopened.mode, mode)
      assert.equal(reopened.context.bbox.x, -9)
      assert.equal(reopened.context.bbox.width, 128)
      assert.equal(reopened.context.internalResolution.width, 64)
      assertQueuedSmartPatchBundle(reopened, bundle)
      reopened.context.bbox.x = 123
      assert.equal(bundle.manifest.context.bbox.x, -9, 'Queue metadata is a detached snapshot')
      assert.throws(() => assertQueuedSmartPatchBundle(reopened, bundle), /exact bundle item/)
      const json = JSON.stringify(payload)
      assert.ok(!json.includes('requestId') && !json.includes('pngPath'))
    })
  }

  test(`queued ${family} selection retains index31 and UINT32MAX without changing authored seed`, async () => {
    const material = await literalPreparedSmartPatchInputMaterial(family)
    concreteItems(material, 32)
    const bundle = asBundle(material)
    const payload = buildFrozenQueuedSmartPatchV1(bundle, 31)
    assert.equal(payload.bundle.itemIndex, 31)
    assert.equal(payload.item.item.seed, 0xff_ff_ff_ff)
    assert.equal(payload.context.generationDraft.seed.value, 0)
    assertQueuedSmartPatchBundle(payload, bundle)
    const differentValidItem = { ...payload, bundle: { ...payload.bundle, itemIndex: 0 } }
    assert.throws(
      () => assertQueuedSmartPatchBundle(parseFrozenQueuedSmartPatchV1(differentValidItem), bundle),
      /exact bundle item/,
    )
  })

  test(`frozen ${family} requalification uses bounded shared resource reads for32 concrete items`, async () => {
    const material = await literalPreparedSmartPatchInputMaterial(family)
    concreteItems(material, 32)
    const resources = catalog(material)
    await reverifyFrozenSmartPatchInput(material, resources.models)
    // Advisory EPS vs effective V is a separate exact resolver argument, still constant per batch.
    assert.equal(resources.count(), family === 'anima' ? 2 : 4)
  })
}

test('queue operation guard admits only the two exact Smart Patch literals', () => {
  assert.equal(isSmartPatchQueueOperation('anima-smart-patch'), true)
  assert.equal(isSmartPatchQueueOperation('illustrious-smart-patch'), true)
  for (const value of [null, {}, 'anima-outpaint', 'smart-patch', 'illustrious-img2img']) {
    assert.equal(isSmartPatchQueueOperation(value), false)
  }
})

test('queued world dimensions can be below eight and off the model grid', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious', 'txt2img')
  material.manifest.context.bbox.width = 3
  material.manifest.context.bbox.height = 1
  for (const [name, bytes] of [
    [
      'source.png',
      literalSmartPatchColorPng(3, 1, [32, 64, 96, 0, 32, 64, 96, 0, 32, 64, 96, 0], 4),
    ],
    ['final-contribution-mask.png', literalSmartPatchNumericPng([255, 255, 255], 3, 1)],
  ] as const) {
    material.files[name] = bytes
    material.manifest.files[name] = {
      byteSize: bytes.length,
      height: 1,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: 3,
    }
  }
  const verified = await parseSmartPatchInputMaterial(material.manifest, material.files)
  const bundle = asBundle(verified)
  const payload = buildFrozenQueuedSmartPatchV1(bundle, 0)
  assert.equal(payload.context.bbox.width, 3)
  assert.equal(payload.context.bbox.height, 1)
  assert.equal(payload.context.internalResolution.width, 64)
  assertQueuedSmartPatchBundle(payload, bundle)
})

test('queue metadata refuses unknown fields, pointer substitutions, bounds and family drift', async () => {
  const bundle = asBundle(await literalPreparedSmartPatchInputMaterial())
  const valid = buildFrozenQueuedSmartPatchV1(bundle, 0)
  const mutations = [
    (value: typeof valid) => Object.assign(value, { transientPath: '/scratch/model-result.png' }),
    (value: typeof valid) => Object.assign(value.bundle, { outputPath: '/scratch/result.png' }),
    (value: typeof valid) => {
      value.bundle.id = '../outside'
    },
    (value: typeof valid) => {
      value.bundle.manifestSha256 = 'A'.repeat(64)
    },
    (value: typeof valid) => {
      value.bundle.itemIndex = -1
    },
    (value: typeof valid) => {
      value.bundle.itemIndex = 32
    },
    (value: typeof valid) => {
      value.bundle.itemIndex = 0.5
    },
    (value: typeof valid) => {
      value.kind = 'anima-smart-patch'
    },
    (value: typeof valid) => {
      value.mode = 'outpaint'
    },
    (value: typeof valid) => {
      value.sourceAlpha = 'transparent'
    },
    (value: typeof valid) => {
      value.files['latent-keep-mask.png'].width++
    },
    (value: typeof valid) => {
      value.item.item.seed++
    },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(valid)
    mutate(changed)
    assert.throws(() => parseFrozenQueuedSmartPatchV1(changed), { code: 'QUEUE_INPUT_INVALID' })
  }
  assert.deepEqual(parseFrozenQueuedSmartPatchV1(valid), valid)
  for (const index of [-1, 1, 32, 0.5, Number.NaN]) {
    assert.throws(() => buildFrozenQueuedSmartPatchV1(bundle, index), {
      code: 'QUEUE_INPUT_INVALID',
    })
  }
  assert.throws(() => parseFrozenQueuedSmartPatchV1(JSON.stringify(valid)), {
    code: 'QUEUE_INPUT_INVALID',
  })
})

test('self-consistent metadata still cannot substitute another valid frozen seed or bundle owner', async () => {
  const bundle = asBundle(await literalPreparedSmartPatchInputMaterial())
  const payload = buildFrozenQueuedSmartPatchV1(bundle, 0)
  assert.equal(payload.item.family, 'illustrious')
  if (payload.item.family !== 'illustrious') {
    throw new Error('Wrong family')
  }
  payload.item.item.seed = 9
  payload.item.inference.sampling.seed = 9
  const selfConsistent = parseFrozenQueuedSmartPatchV1(payload)
  assert.equal(selfConsistent.item.item.seed, 9)
  assert.throws(() => assertQueuedSmartPatchBundle(selfConsistent, bundle), /exact bundle item/)
  const valid = buildFrozenQueuedSmartPatchV1(bundle, 0)
  assert.throws(
    () => assertQueuedSmartPatchBundle(valid, { ...bundle, id: randomUUID() }),
    /exact bundle item/,
  )
  assert.throws(
    () => assertQueuedSmartPatchBundle(valid, { ...bundle, manifestSha256: 'f'.repeat(64) }),
    /exact bundle item/,
  )
  assertQueuedSmartPatchBundle(valid, bundle)
})

test('locked or hidden private material never becomes an admissible queue item', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  for (const state of [
    { locked: true, visible: true },
    { locked: false, visible: false },
  ]) {
    const manifest = structuredClone(material.manifest)
    Object.assign(manifest.context, state)
    assert.deepEqual(parseFrozenSmartPatchInputV1(manifest).context.locked, state.locked)
    assert.throws(
      () => buildFrozenQueuedSmartPatchV1(asBundle({ ...material, manifest }), 0),
      /unlocked visible target/,
    )
  }
  const eligible = asBundle(material)
  assertQueuedSmartPatchBundle(buildFrozenQueuedSmartPatchV1(eligible, 0), eligible)
})

test('serialized queue metadata has its own 128KiB bound before nested qualification', async () => {
  const bundle = asBundle(await literalPreparedSmartPatchInputMaterial())
  const valid = buildFrozenQueuedSmartPatchV1(bundle, 0)
  assert.throws(
    () => parseFrozenQueuedSmartPatchV1({ ...valid, unused: 'x'.repeat(128 * 1024) }),
    /byte limit/,
  )
  assert.deepEqual(parseFrozenQueuedSmartPatchV1(valid), valid)
})

test('resource requalification rejects changed effective prediction and same-SHA noise policy', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  for (const policy of ['prediction', 'noise'] as const) {
    const resources = catalog(material)
    const original = resources.models.resolveVerifiedGenerationCheckpointForPlan
    resources.models.resolveVerifiedGenerationCheckpointForPlan = async (...args) => {
      const value = await original(...args)
      return policy === 'prediction'
        ? { ...value, reference: { ...value.reference, predictionType: 'epsilon' } }
        : {
            ...value,
            noiseProfile: { ...defaultIllustriousNoiseProfile(), timestepSpacing: 'trailing' },
          }
    }
    await assert.rejects(reverifyFrozenSmartPatchInput(material, resources.models), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
  }
  await reverifyFrozenSmartPatchInput(material, catalog(material).models)
})

test('final real resource check rejects a late same-SHA policy change after the inference comparison', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  const resources = catalog(material)
  const original = resources.models.resolveVerifiedGenerationCheckpointForPlan
  resources.models.resolveVerifiedGenerationCheckpointForPlan = async (...args) => {
    const value = await original(...args)
    return resources.count() > 2
      ? {
          ...value,
          noiseProfile: { ...defaultIllustriousNoiseProfile(), rescaleBetasZeroSnr: true },
        }
      : value
  }
  await assert.rejects(reverifyFrozenSmartPatchInput(material, resources.models), {
    code: 'GENERATION_RESOURCE_CHANGED',
  })
  assert.equal(
    resources.count(),
    3,
    'The actual final resolver ran rather than returning memoized metadata',
  )
  await reverifyFrozenSmartPatchInput(material, catalog(material).models)
})

test('Anima requalification detects changed encoder identity without replacing the frozen bundle', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('anima')
  const resources = catalog(material)
  const original = resources.models.resolveVerifiedGenerationAnimaBundleForPlan
  resources.models.resolveVerifiedGenerationAnimaBundleForPlan = async (...args) => {
    const value = await original(...args)
    return { ...value, qwen3Encoder: { ...value.qwen3Encoder, sha256: 'd'.repeat(64) } }
  }
  await assert.rejects(reverifyFrozenSmartPatchInput(material, resources.models), {
    code: 'GENERATION_RESOURCE_CHANGED',
  })
  await reverifyFrozenSmartPatchInput(material, catalog(material).models)
})

test('a later frozen item mismatch refuses the complete metadata qualification', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  concreteItems(material, 2)
  material.manifest.items[1].item.seed = 9
  await assert.rejects(reverifyFrozenSmartPatchInput(material, catalog(material).models), {
    code: 'GENERATION_RESOURCE_CHANGED',
  })
  material.manifest.items[1].item.seed = 0xff_ff_ff_ff
  await reverifyFrozenSmartPatchInput(material, catalog(material).models)
})

test('requalification snapshots mutable item values and resolver methods before its first await', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  const resources = catalog(material)
  let calls = 0
  const original = resources.models.resolveVerifiedGenerationCheckpointForPlan
  resources.models.resolveVerifiedGenerationCheckpointForPlan = async (...args) => {
    calls++
    return await original(...args)
  }
  const pending = reverifyFrozenSmartPatchInput(material, resources.models)
  material.manifest.items[0].item.seed = 123
  material.manifest.context.generationDraft.sampling.cfgScale = 12
  resources.models.resolveVerifiedGenerationCheckpointForPlan = async () => {
    throw new Error('Late method replacement')
  }
  await pending
  assert.equal(calls, 4, 'All initial/final calls retain the originally captured method')
})
