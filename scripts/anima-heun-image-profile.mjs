/** Narrow Heun IMG/OUT adapter; actual UI, native execution and durable Save belong to the runner. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { animaDynamicBatchProfile as resources } from './anima-dynamic-batch-profile.mjs'
import {
  assertAnimaHeunImageConfiguration,
  assertAnimaHeunImageFrozen,
  assertAnimaHeunImageOutputPixels,
  assertAnimaHeunImageSavedPixels,
  assertAnimaHeunImageTargetPixels,
  normalizeAnimaHeunImageNativeInputs,
  validateAnimaHeunImageFixture,
} from './anima-heun-image-qualification.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const rgba = (decoded) => ({
  width: decoded.dimensions.width,
  height: decoded.dimensions.height,
  rgba: decoded.rgba,
})
async function sourcePixels({ fixture, decodedImage }) {
  const bytes = await readFile(fixture.sourceImage.path)
  assert.equal(bytes.length, fixture.sourceImage.byteSize)
  assert.equal(digest(bytes), fixture.sourceImage.sha256)
  const decoded = await decodedImage(`data:image/png;base64,${bytes.toString('base64')}`)
  assert.equal(decoded.dimensions.width, 256)
  assert.equal(decoded.dimensions.height, 256)
  assert.equal(decoded.dimensions.opaquePixels, 65536)
  assert.equal(decoded.dimensions.pixelSha256, fixture.sourceImage.pixelSha256)
  return rgba(decoded)
}

export const animaHeunImageProfile = Object.freeze({
  profile: 'anima-heun-image',
  entrySource: 'scripts/qualify-installed-anima-heun-image.mjs',
  adapterSource: 'scripts/anima-heun-image-profile.mjs',
  oracleSource: 'scripts/anima-heun-image-qualification.mjs',
  sourceDependencies: [
    'scripts/anima-dynamic-batch-profile.mjs',
    'scripts/anima-dynamic-batch-qualification.mjs',
  ],
  validateFixture: validateAnimaHeunImageFixture,
  assertFrozen: assertAnimaHeunImageFrozen,
  assertConfiguration: assertAnimaHeunImageConfiguration,
  normalizeNativeInputs: normalizeAnimaHeunImageNativeInputs,
  normalizeExecutionInputs: normalizeAnimaHeunImageNativeInputs,
  normalizeReferenceInputs: normalizeAnimaHeunImageNativeInputs,
  expectedBaselineStage: () => 'baseline',
  baselineMetadataDifferences: () => [],
  inferenceSteps: () => 4,
  observedSteps: () => 3,
  provisionalOnly: (fixture) => fixture.stage === 'control',
  modelKey: resources.modelKey,
  loraKey: resources.loraKey,
  originalSourceKeys: resources.originalSourceKeys,
  operation: (fixture) => `anima-${fixture.mode}`,
  cfgScale: 4,
  extraInputFiles: (fixture, reference) => [
    { ...fixture.lamaSource },
    {
      ...fixture.lamaSource,
      path: path.join(reference.appData, 'inference-resources/big-lama.pt'),
    },
  ],
  sampling: () => ({
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'Heun',
    code: 'heun',
    editedValue: 'Euler',
    editedCode: 'euler',
  }),
  assertAuthored(draft, reference, _fixture, plan) {
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-iteration' })
    assert.deepEqual(draft.positivePrompt, { embeddingRefs: [], text: plan.sourcePrompts.positive })
    assert.deepEqual(draft.negativePrompt, { embeddingRefs: [], text: plan.sourcePrompts.negative })
    assert.equal(draft.sampling.steps, 4)
    assert.equal(draft.sampling.cfgScale, 4)
    assert.equal(draft.sampling.animaMethod, 'heun')
    assert.equal(draft.model.localModelId, reference.anima.installed.resourceId)
    assert.equal(draft.model.localVersionId, reference.anima.installed.versionId)
    assert.equal(draft.model.fileSha256, reference.anima.sha256)
    assert.equal(draft.loras.length, 1)
    const lora = draft.loras[0]
    assert.equal(lora.enabled, true)
    assert.equal(lora.weight, -0.5)
    assert.equal(lora.resource.localModelId, reference.animaLora.installed.resourceId)
    assert.equal(lora.resource.localVersionId, reference.animaLora.installed.versionId)
    assert.equal(lora.resource.fileSha256, reference.animaLora.sha256)
  },
  async prepareInput({
    fixture,
    plan,
    importSource,
    project,
    window,
    expect,
    tab,
    setInput,
    save,
    api,
  }) {
    const imported = await importSource(project, fixture.sourceImage)
    const before = await tab(project)
    assert.equal(before.layers.length, 1)
    assert.deepEqual(before.primaryBbox, { x: 0, y: 0, width: 256, height: 256 })
    assert.equal(before.layers[0].id, imported.layerId)
    await setInput('Denoising Strength', 0.5)
    if (fixture.mode === 'outpaint') {
      await window.getByRole('button', { name: 'Bounding Box tool', exact: true }).click()
      await window.locator('.canvas-area').focus()
      for (let index = 0; index < 64; index++) await window.keyboard.down('ArrowRight')
      await window.keyboard.up('ArrowRight')
    }
    await expect.poll(async () => (await tab(project)).primaryBbox).toEqual(plan.bbox)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(0.5)
    const current = await tab(project)
    assert.equal(current.layers.length, 1)
    assert.equal(current.layers[0].id, imported.layerId)
    assert.deepEqual(current.layers[0].transform, before.layers[0].transform)
    if (fixture.mode === 'outpaint')
      assert.equal((await api('getGenerationState', project.id)).animaOutpaintSupported, true)
    const saved = await save(project)
    return {
      ...imported,
      savedPackage: { path: saved.path, sha256: saved.sha256 },
      bbox: plan.bbox,
      generationDraft: structuredClone(current.generationDraft),
      sourceRect: { x: 0, y: 0, width: 256, height: 256 },
      controlled:
        'Only OS image chooser path; import normalization, source layer, bbox keyboard edit and Save use the actual application.',
    }
  },
  async assertTarget(ctx) {
    const source = await sourcePixels(ctx)
    const target = rgba(ctx.decoded)
    const evidence = assertAnimaHeunImageTargetPixels({ source, target, mode: ctx.fixture.mode })
    if (ctx.fixture.mode === 'img2img')
      assert.equal(ctx.decoded.dimensions.pixelSha256, ctx.fixture.sourceImage.pixelSha256)
    return evidence
  },
  assertOutput({ decoded, fixture }) {
    return assertAnimaHeunImageOutputPixels({ image: rgba(decoded), mode: fixture.mode })
  },
  async assertSaved(ctx) {
    const source = await sourcePixels(ctx)
    assert.equal(ctx.generations.length, 1)
    const generation = ctx.generations[0]
    const saved = ctx.savedPackage.saved
    assert.equal(saved.project.layers.length, 2)
    const layer = saved.project.layers.find(
      ({ generationProvenance }) =>
        generationProvenance?.executionResultContext.queueItemId === generation.queueItemId,
    )
    assert.ok(layer)
    const provenance = layer.generationProvenance
    assert.deepEqual(layer.transform, {
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: ctx.plan.bbox.x,
      y: 0,
    })
    assert.deepEqual(provenance.layerSourceContext.bbox, ctx.plan.bbox)
    const output = await ctx.decodedImage(
      `data:image/png;base64,${(await saved.readMember(layer.asset.path)).toString('base64')}`,
    )
    const alpha = assertAnimaHeunImageOutputPixels({ image: rgba(output), mode: ctx.fixture.mode })
    if (ctx.fixture.mode === 'outpaint') {
      assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
      assert.deepEqual(provenance.executionResultContext.output.contributionAlpha8, alpha)
      for (const key of ['infillResource', 'keepMask', 'policy', 'sourceTarget'])
        assert.deepEqual(
          provenance.layerSourceContext.outpaint[key],
          generation.frozen.context.conditioning[key],
        )
    }
    return assertAnimaHeunImageSavedPixels({
      source,
      contribution: rgba(output),
      preview: rgba(ctx.merged),
      mode: ctx.fixture.mode,
    })
  },
  comparisonChanged: (fixture) => [
    ...resources.comparisonChanged,
    ...(fixture.mode === 'outpaint' ? ['context.mode'] : []),
  ],
  comparisonSame: [
    ...resources.comparisonSame,
    'guidance.steps',
    'guidance.cfg',
    'denoisingStrength.value',
  ],
  async assertComparison({ expect, dialog, generation, currentDraft }) {
    const checks = {
      'sampling.animaMethod': ['Heun', 'Euler'],
      'context.mode': [generation.expectedItem.mode, 'img2img'],
      'guidance.steps': ['4', '4'],
      'guidance.cfg': ['4', '4'],
      'denoisingStrength.value': ['0.5', '0.5'],
      'seed.actual': ['0', String(currentDraft.seed.value)],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const row = dialog.locator(`[data-setting="${key}"]`)
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    assert.equal(generation.expectedItem.animaMethod, 'heun')
    assert.equal(currentDraft.sampling.animaMethod, 'euler')
    return evidence
  },
  summaryClaims: ({ fixture, report }) => {
    const provisional = fixture.stage === 'control'
    if (provisional) {
      assert.equal(report.generations.length, 1)
      assert.ok(report.generations.every(({ accepted }) => accepted === false))
    }
    return {
      opaqueHeunImgInferenceClaim: !provisional && fixture.mode === 'img2img',
      mixedAlphaHeunOutInferenceClaim: !provisional && fixture.mode === 'outpaint',
      predictorMaskSensitivityClaim: false,
      provisionalMutationControl: provisional,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron Project import/Generate, installed worker0.14 Heun IMG/OUT; healthy cases explicit Add/Save/readback/reopen and owning comparison. Controls remain provisional.',
    preconditions:
      'One exact existing Linux/NVIDIA runtime/catalog, pinned opaque RGBA256 source and Anima/Qwen3/VAE/Myth files; OUT uses exact LaMa. Fixed0, authored4/observed3, strength0.5, CFG4, Myth−0.5, red1.3/blurry0.7.',
    limits:
      'One opaque IMG and one mixed-alpha OUT geometry only. Full Heun parity, other methods/strengths/seeds/formats/resolutions, dynamic batches, subjective image quality and release/full MVP remain unqualified. Predictor-mask sensitivity requires separate paired IMG GREEN/OUT visible RED/restored aggregate evidence.',
  },
})
