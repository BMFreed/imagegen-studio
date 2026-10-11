/** Actual adapter and pixel guards with explicit UI/decoded-input doubles; no Electron claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { authored } from './illustrious-dynamic-image-test-fixtures.mjs'
import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import { illustriousDynamicImageProfile as profile } from './illustrious-dynamic-image-profile.mjs'
import {
  assertIllustriousDynamicImageSavedPixels as savedPixels,
  validateIllustriousDynamicImageFixture,
  normalizeIllustriousDynamicImageNativeInputs,
} from './illustrious-dynamic-image-qualification.mjs'

test('finite image adapter keeps genuine durable hooks and requires each exact authored precondition', () => {
  assert.equal(profile.validateFixture, validateIllustriousDynamicImageFixture)
  for (const key of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[key], normalizeIllustriousDynamicImageNativeInputs)
  for (const key of ['prepareInput', 'assertTarget', 'assertOutput', 'extraInputFiles'])
    assert.equal(profile[key], illustriousDpmProfile[key])
  assert.equal(profile.authorComponents, noobaiVpredDpmProfile.authorComponents)
  assert.notEqual(profile.assertSaved, illustriousDpmProfile.assertSaved)
  for (const stage of ['baseline', 'control', 'restored'])
    for (const objective of ['epsilon', 'v_prediction'])
      for (const mode of ['img2img', 'outpaint']) {
        const { draft, reference, fixture, plan } = authored(stage, objective, mode)
        profile.assertAuthored(draft, reference, fixture, plan)
        assert.equal(profile.operation(fixture), `illustrious-${mode}`)
        assert.equal(profile.inferenceSteps(fixture), 3)
        assert.equal(profile.observedSteps(fixture), 2)
        assert.equal(profile.provisionalOnly(fixture), stage === 'control')
        assert.equal(profile.sampling(fixture).editedCode, plan.sampler)
        assert.deepEqual(profile.originalSourceKeys(fixture), [
          plan.modelKey,
          'illustriousLora',
          'externalVaeNative',
        ])
        for (const mutate of [
          (v) => {
            v.seed.value = 37
          },
          (v) => {
            v.dynamicPrompt.maxPrompts = 2
          },
          (v) => {
            v.dynamicPrompt.seedBehavior = 'per-prompt'
          },
          (v) => {
            v.positivePrompt.text = plan.items[0].prompts.positive
          },
          (v) => {
            v.negativePrompt.embeddingRefs = [{ token: '<unplanned>' }]
          },
          (v) => {
            v.model.predictionType = objective === 'epsilon' ? 'v_prediction' : 'epsilon'
          },
          (v) => {
            v.vaePrecision = 'FP16'
          },
          (v) => {
            v.loras[0].weight = -0.25
          },
        ]) {
          const changed = structuredClone(draft)
          mutate(changed)
          assert.throws(() => profile.assertAuthored(changed, reference, fixture, plan))
        }
      }
})

function comparison(objective, mode, itemIndex) {
  const { reference, fixture, plan, draft } = authored('baseline', objective, mode)
  const item = plan.items[itemIndex]
  draft.seed.value = 37
  draft.loras[0].weight = -0.25
  draft.dynamicPrompt = { maxPrompts: 3, seedBehavior: 'per-prompt' }
  draft.positivePrompt.text = 'a (green:1.1) glass bowl, later authoring edit'
  draft.negativePrompt.text = '(grainy:0.8), later authoring edit'
  const lora = draft.loras[0].resource
  const values = {
    'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
    'sampling.sampler': [item.sampler, item.sampler],
    'sampling.scheduler': ['Normal', 'Normal'],
    'context.mode': [mode, 'img2img'],
    'guidance.steps': ['3', '3'],
    'guidance.cfg': ['5', '5'],
    'denoisingStrength.value': ['0.5', '0.5'],
    'seed.actual': [String(item.seed), '37'],
    'seed.policy': ['fixed', 'fixed'],
    'seed.behavior': ['per-iteration', 'per-prompt'],
    'prompt.text': [item.prompts.positive, draft.positivePrompt.text],
    'negativePrompt.text': [item.prompts.negative, draft.negativePrompt.text],
    'prompt.embeddings': ['None', 'None'],
    'negativePrompt.embeddings': ['None', 'None'],
    'loras.stack': [
      `Enabled · ${lora.displayName} · ${lora.versionName}\nSHA-256 ${lora.fileSha256}\nWeight -0.5`,
      `Enabled · ${lora.displayName} · ${lora.versionName}\nSHA-256 ${lora.fileSha256}\nWeight -0.25`,
    ],
  }
  const rows = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      {
        key,
        values: value,
        status: value[0] === value[1] ? 'Same' : 'Changed',
      },
    ]),
  )
  const seen = []
  const dialog = {
    locator(selector) {
      const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
      assert.ok(rows[key])
      return {
        ...rows[key],
        locator(child) {
          assert.equal(child, '.comparison-values p')
          return { ...rows[key], allTextContents: async () => rows[key].values }
        },
      }
    },
  }
  const expect = (row) => ({
    toHaveAttribute: async (name, value) => {
      assert.equal(name, 'data-status')
      assert.equal(row.status, value)
      seen.push(row.key)
    },
    toHaveText: async (value) => assert.deepEqual(row.values, value),
  })
  return {
    rows,
    seen,
    ctx: {
      fixture,
      generation: { expectedItem: item },
      currentDraft: draft,
      reference,
      dialog,
      expect,
    },
  }
}

test('every concrete result compares its own weighted pair/seed with the later draft and frozen behavior', async () => {
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (let item = 0; item < 8; item++) {
        const { rows, seen, ctx } = comparison(objective, mode, item)
        const proof = await profile.assertComparison(ctx)
        assert.deepEqual(Object.keys(proof).sort(), Object.keys(rows).sort())
        assert.deepEqual(seen.sort(), Object.keys(rows).sort())
        assert.equal(proof['seed.behavior'].status, 'Changed')
        assert.equal(proof['context.mode'].status, mode === 'outpaint' ? 'Changed' : 'Same')
      }
  for (const mutate of [
    ({ rows }) => {
      rows['seed.actual'].values[0] = '37'
    },
    ({ rows }) => {
      rows['prompt.text'].values[0] = 'wrong pair'
    },
    ({ rows }) => {
      rows['negativePrompt.text'].values[0] = 'wrong polarity'
    },
    ({ rows }) => {
      rows['seed.behavior'].values[0] = 'per-prompt'
    },
    ({ rows }) => {
      rows['loras.stack'].values[0] = 'wrong saved source'
    },
    ({ ctx }) => {
      ctx.currentDraft.dynamicPrompt.maxPrompts = 1
    },
    ({ ctx }) => {
      ctx.currentDraft.sampling.denoisingStrength = 0.9
    },
  ]) {
    const input = comparison('epsilon', 'outpaint', 1)
    mutate(input)
    await assert.rejects(() => profile.assertComparison(input.ctx))
  }
})

function visibilityInput(count, sideEffect = () => {}) {
  const projectId = 'project-v1-' + 'a'.repeat(64)
  const layerId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  const source = {
    id: layerId(99),
    name: 'Imported source',
    visible: true,
    opacity: 1,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
  }
  const generated = Array.from({ length: count }, (_, index) => ({
    id: layerId(index),
    name: `Generated ${index + 1}`,
    visible: index === 0,
    opacity: 1,
    transform: { x: 64, y: 0, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
  }))
  const layers = [...generated, source]
  let revision = 0
  const resourceUrls = () => {
    for (const layer of layers)
      layer.imageUrl = `igs-layer://asset/${projectId}/${layerId(100 + revision)}/${layer.id}/${'b'.repeat(64)}/${String(revision).padStart(64, '0')}.img`
  }
  resourceUrls()
  const clicks = []
  const ctx = {
    project: { id: projectId },
    plan: { expectedCompletions: count },
    sourceLayers: [structuredClone(source)],
    tab: async (project) => {
      assert.equal(project.id, projectId)
      return { layers: structuredClone(layers) }
    },
    window: {
      getByRole(role, options) {
        assert.equal(role, 'button')
        assert.equal(options.exact, true)
        const layer = layers.find((item) => options.name === `Show ${item.name}`)
        assert.ok(layer && !layer.visible)
        return {
          click: async () => {
            clicks.push(layer.id)
            layer.visible = true
            revision++
            resourceUrls()
            sideEffect(layers)
          },
        }
      },
    },
    expect: {
      poll: (observe) => ({ toBe: async (value) => assert.equal(await observe(), value) }),
    },
  }
  return { ctx, layers, clicks, source, layerId }
}

test('full-stack preview preparation respects Add anchor-only visibility and explicitly shows hidden variants', async () => {
  for (const count of [2, 8]) {
    const { ctx, layers, clicks, source, layerId } = visibilityInput(count)
    const before = structuredClone(layers)
    const result = await profile.afterAcceptance(ctx)
    assert.deepEqual(result.before, before)
    assert.deepEqual(result.initialGeneratedVisibleIds, [layerId(0)])
    assert.deepEqual(
      result.shownLayerIds,
      Array.from({ length: count - 1 }, (_, i) => layerId(i + 1)),
    )
    assert.deepEqual(clicks, result.shownLayerIds)
    assert.deepEqual(result.sourceLayerIds, [source.id])
    assert.deepEqual(
      result.after.map(({ imageUrl, ...view }) => view),
      before.map(({ imageUrl, ...layer }) => ({ ...layer, visible: true })),
    )
    assert.deepEqual(layers.at(-1), source)
    for (let index = 0; index < before.length; index++)
      assert.notEqual(result.after[index].imageUrl, before[index].imageUrl)
    assert.equal(result.beforeExplicitSave, true)
  }
  for (const sideEffect of [
    (layers) => {
      layers[0].imageUrl = layers[0].imageUrl.replace('b'.repeat(64), 'c'.repeat(64))
    },
    (layers) => {
      layers[0].imageUrl = layers.at(-1).imageUrl
    },
    (layers) => {
      layers[0].imageUrl = layers[0].imageUrl.replace(
        'project-v1-' + 'a'.repeat(64),
        'project-v1-' + 'd'.repeat(64),
      )
    },
  ]) {
    const { ctx } = visibilityInput(2, sideEffect)
    await assert.rejects(() => profile.afterAcceptance(ctx))
  }
  for (const visible of [true, false]) {
    const { ctx, layers, clicks } = visibilityInput(2)
    for (const layer of layers.slice(0, 2)) layer.visible = visible
    await assert.rejects(() => profile.afterAcceptance(ctx))
    assert.deepEqual(clicks, [])
  }
  for (const sideEffect of [
    (layers) => {
      layers[1].opacity = 0.5
    },
    (layers) => {
      layers.at(-1).transform.x = 64
    },
    (layers) => {
      layers.reverse()
    },
  ]) {
    const { ctx } = visibilityInput(2, sideEffect)
    await assert.rejects(() => profile.afterAcceptance(ctx), /Visibility preparation/)
  }
})

function solid(width, color) {
  const rgba = Buffer.alloc(width * 256 * 4)
  for (let pixel = 0; pixel < width * 256; pixel++) rgba.set([...color, 255], pixel * 4)
  return { width, height: 256, rgba }
}
test('batch Save pixel guard checks all layers in order and cannot retain the bottom IMG preview', () => {
  const source = solid(256, [100, 100, 100])
  const lower = solid(256, [40, 80, 120])
  const upper = solid(256, [200, 160, 20])
  const input = { source, contributions: [lower, upper], preview: upper, mode: 'img2img' }
  assert.deepEqual(savedPixels(input), {
    width: 256,
    height: 256,
    allBrowserPixelsChecked: 65536,
    protectedPixels: 0,
    softPixels: 0,
    browserSoftRgbTolerance: 0,
    exactRawPillowClaim: false,
  })
  assert.throws(() => savedPixels({ ...input, preview: lower }), /composition RGB/)
  assert.throws(() => savedPixels({ ...input, contributions: [upper, lower] }), /composition RGB/)
  assert.equal(
    savedPixels({
      ...input,
      contributions: [lower, upper, lower, upper, lower, upper, lower, upper],
    }).allBrowserPixelsChecked,
    65536,
  )
  const alphaLost = structuredClone(upper)
  alphaLost.rgba[3] = 0
  assert.throws(() => savedPixels({ ...input, preview: alphaLost }), /preview alpha/)
})

test('browser OUT allowance is confined to soft RGB and cannot excuse protected/opaque or alpha defects', () => {
  const source = solid(256, [100, 100, 100])
  const lower = solid(256, [40, 40, 40])
  const upper = solid(256, [200, 200, 200])
  for (const image of [lower, upper])
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++)
        image.rgba[(y * 256 + x) * 4 + 3] = x < 153 ? 0 : x < 168 ? 128 : 255
  // Independent constant-color control: 50%40 over100 ->70; 50%200 over70 ->135.
  const preview = solid(320, [100, 100, 100])
  for (let y = 0; y < 256; y++)
    for (let x = 217; x < 320; x++) {
      const color = x < 232 ? 135 : 200
      preview.rgba.set([color, color, color, 255], (y * 320 + x) * 4)
    }
  const input = { source, contributions: [lower, upper], preview, mode: 'outpaint' }
  const result = savedPixels(input)
  assert.equal(result.allBrowserPixelsChecked, 81920)
  assert.equal(result.softPixels, 3840)
  assert.equal(result.browserSoftRgbTolerance, 2)
  assert.equal(result.exactRawPillowClaim, false)
  const within = structuredClone(preview)
  within.rgba[217 * 4] += 2
  savedPixels({ ...input, preview: within })
  for (const [at, change] of [
    [0, 1],
    [232 * 4, 1],
    [217 * 4, 3],
    [217 * 4 + 3, -1],
  ]) {
    const damaged = structuredClone(preview)
    damaged.rgba[at] += change
    assert.throws(() => savedPixels({ ...input, preview: damaged }))
  }
})
