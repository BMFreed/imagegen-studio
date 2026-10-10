/** Finite EPS DPM registry adapter; import/Generate/acceptance/Save remain real runner boundaries. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { illustriousDynamicBatchProfile as resources } from './illustrious-dynamic-batch-profile.mjs'
import {
  assertIllustriousDpmConfiguration,
  assertIllustriousDpmFrozen,
  assertIllustriousDpmImageOutputPixels,
  assertIllustriousDpmImageSavedPixels,
  assertIllustriousDpmImageTargetPixels,
  illustriousDpmPair,
  literalIllustriousDpmPlan,
  normalizeIllustriousDpmNativeInputs,
  validateIllustriousDpmFixture,
} from './illustrious-dpm-qualification.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const rgba = (decoded) => ({
  width: decoded.dimensions.width,
  height: decoded.dimensions.height,
  rgba: decoded.rgba,
})
const planFor = (fixture) =>
  literalIllustriousDpmPlan(
    fixture.stage,
    fixture.algorithm,
    fixture.schedule,
    fixture.mode,
    fixture.case,
    fixture.objective,
  )
async function sourcePixels({ fixture, decodedImage }) {
  assert.notEqual(fixture.mode, 'txt2img')
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

export const illustriousDpmProfile = Object.freeze({
  profile: 'illustrious-dpm',
  entrySource: 'scripts/qualify-installed-illustrious-dpm.mjs',
  adapterSource: 'scripts/illustrious-dpm-profile.mjs',
  oracleSource: 'scripts/illustrious-dpm-qualification.mjs',
  sourceDependencies: [
    'scripts/illustrious-dynamic-batch-profile.mjs',
    'scripts/illustrious-dynamic-batch-qualification.mjs',
    'scripts/anima-heun-image-qualification.mjs',
  ],
  validateFixture: validateIllustriousDpmFixture,
  assertFrozen: assertIllustriousDpmFrozen,
  assertConfiguration: assertIllustriousDpmConfiguration,
  normalizeNativeInputs: normalizeIllustriousDpmNativeInputs,
  normalizeExecutionInputs: normalizeIllustriousDpmNativeInputs,
  normalizeReferenceInputs: normalizeIllustriousDpmNativeInputs,
  expectedBaselineStage: () => 'baseline',
  baselineMetadataDifferences: () => [],
  inferenceSteps: (fixture) => planFor(fixture).steps,
  observedSteps: (fixture) => planFor(fixture).observedSteps,
  provisionalOnly: (fixture) => fixture.stage === 'control',
  requiresSourceImage: (fixture) => fixture.mode !== 'txt2img',
  modelKey: () => 'illustriousEpsilon',
  loraKey: 'illustriousLora',
  originalSourceKeys: () => ['illustriousEpsilon', 'illustriousLora', 'externalVaeNative'],
  operation: (fixture) => `illustrious-${fixture.mode}`,
  cfgScale: 4,
  extraInputFiles: (fixture, reference) =>
    fixture.mode === 'outpaint'
      ? [
          { ...fixture.lamaSource },
          {
            ...fixture.lamaSource,
            path: path.join(reference.appData, 'inference-resources/big-lama.pt'),
          },
        ]
      : [],
  sampling: (fixture) => {
    const pair = illustriousDpmPair(fixture.algorithm, fixture.schedule)
    const edited = illustriousDpmPair(
      fixture.algorithm === 'dpmpp_2m' ? 'dpmpp_sde' : 'dpmpp_2m',
      fixture.schedule,
    )
    return {
      label: 'Sampler',
      draftKey: 'sampler',
      value: pair.sampler,
      code: pair.sampler,
      editedValue: edited.sampler,
      editedCode: edited.sampler,
      scheduler: fixture.schedule,
    }
  },
  authorComponents: resources.authorComponents,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-iteration' })
    assert.deepEqual(draft.positivePrompt, { embeddingRefs: [], text: plan.sourcePrompts.positive })
    assert.deepEqual(draft.negativePrompt, { embeddingRefs: [], text: plan.sourcePrompts.negative })
    assert.equal(draft.sampling.steps, plan.steps)
    assert.equal(draft.sampling.cfgScale, 4)
    assert.equal(draft.sampling.sampler, plan.sampler)
    assert.equal(draft.sampling.scheduler, fixture.schedule)
    const checkpoint = reference[plan.modelKey]
    assert.equal(draft.model.localModelId, checkpoint.installed.resourceId)
    assert.equal(draft.model.localVersionId, checkpoint.installed.versionId)
    assert.equal(draft.model.fileSha256, checkpoint.sha256)
    assert.equal(draft.model.predictionType, plan.objective)
    assert.equal(draft.vaePrecision, 'FP32')
    assert.equal(draft.vae.localModelId, reference.externalVaeNative.installed.resourceId)
    assert.equal(draft.vae.localVersionId, reference.externalVaeNative.installed.versionId)
    assert.equal(draft.vae.fileSha256, reference.externalVaeNative.sha256)
    assert.equal(draft.cfgRescale ?? 0, 0)
    assert.equal(draft.loras.length, 1)
    const lora = draft.loras[0]
    assert.equal(lora.enabled, true)
    assert.equal(lora.weight, -0.5)
    assert.equal(lora.resource.localModelId, reference.illustriousLora.installed.resourceId)
    assert.equal(lora.resource.localVersionId, reference.illustriousLora.installed.versionId)
    assert.equal(lora.resource.fileSha256, reference.illustriousLora.sha256)
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
    assert.notEqual(
      fixture.mode,
      'txt2img',
      'TXT must bypass image import through requiresSourceImage.',
    )
    const imported = await importSource(project, fixture.sourceImage)
    const before = await tab(project)
    assert.equal(before.layers.length, 1)
    assert.deepEqual(before.primaryBbox, { x: 0, y: 0, width: 256, height: 256 })
    assert.equal(before.layers[0].id, imported.layerId)
    await setInput('Denoising Strength', plan.denoisingStrength)
    if (fixture.mode === 'outpaint') {
      await window.getByRole('button', { name: 'Bounding Box tool', exact: true }).click()
      await window.locator('.canvas-area').focus()
      for (let index = 0; index < 64; index++) await window.keyboard.down('ArrowRight')
      await window.keyboard.up('ArrowRight')
    }
    await expect.poll(async () => (await tab(project)).primaryBbox).toEqual(plan.bbox)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(plan.denoisingStrength)
    const current = await tab(project)
    assert.equal(current.layers.length, 1)
    assert.equal(current.layers[0].id, imported.layerId)
    assert.deepEqual(current.layers[0].transform, before.layers[0].transform)
    if (fixture.mode === 'outpaint')
      assert.equal((await api('getGenerationState', project.id)).outpaintSupported, true)
    const saved = await save(project)
    return {
      ...imported,
      savedPackage: { path: saved.path, sha256: saved.sha256 },
      bbox: plan.bbox,
      generationDraft: structuredClone(current.generationDraft),
      sourceRect: { x: 0, y: 0, width: 256, height: 256 },
      controlled:
        'Only OS image chooser path; actual normalized import, bbox keyboard edit, strength and Save.',
    }
  },
  async assertTarget(ctx) {
    if (ctx.fixture.mode === 'txt2img') return { mode: 'txt2img', sourceRequired: false }
    const source = await sourcePixels(ctx)
    const evidence = assertIllustriousDpmImageTargetPixels({
      source,
      target: rgba(ctx.decoded),
      mode: ctx.fixture.mode,
    })
    if (ctx.fixture.mode === 'img2img')
      assert.equal(ctx.decoded.dimensions.pixelSha256, ctx.fixture.sourceImage.pixelSha256)
    return evidence
  },
  assertOutput({ decoded, fixture }) {
    return assertIllustriousDpmImageOutputPixels({
      image: rgba(decoded),
      mode: fixture.mode === 'txt2img' ? 'img2img' : fixture.mode,
    })
  },
  async assertSaved(ctx) {
    assert.equal(ctx.generations.length, 1)
    const generation = ctx.generations[0]
    const saved = ctx.savedPackage.saved
    assert.equal(saved.project.layers.length, ctx.fixture.mode === 'txt2img' ? 1 : 2)
    const layer = saved.project.layers.find(
      ({ generationProvenance }) =>
        generationProvenance?.executionResultContext.queueItemId === generation.queueItemId,
    )
    assert.ok(layer)
    assert.deepEqual(layer.transform, {
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: ctx.plan.bbox.x,
      y: 0,
    })
    const provenance = layer.generationProvenance
    assert.deepEqual(provenance.layerSourceContext.bbox, ctx.plan.bbox)
    const output = await ctx.decodedImage(
      `data:image/png;base64,${(await saved.readMember(layer.asset.path)).toString('base64')}`,
    )
    const alpha = assertIllustriousDpmImageOutputPixels({
      image: rgba(output),
      mode: ctx.fixture.mode === 'txt2img' ? 'img2img' : ctx.fixture.mode,
    })
    if (ctx.fixture.mode === 'txt2img') {
      assert.equal(ctx.merged.dimensions.width, 256)
      assert.equal(ctx.merged.dimensions.height, 256)
      assert.ok(
        Buffer.from(ctx.merged.rgba).equals(Buffer.from(output.rgba)),
        'Saved TXT preview must preserve every generated RGBA pixel.',
      )
      return { width: 256, height: 256, protectedPixels: 0 }
    }
    if (ctx.fixture.mode === 'outpaint') {
      assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
      assert.deepEqual(provenance.executionResultContext.output.contributionAlpha8, alpha)
      for (const key of ['infillResource', 'keepMask', 'policy', 'sourceTarget'])
        assert.deepEqual(
          provenance.layerSourceContext.outpaint[key],
          generation.frozen.context.conditioning[key],
        )
    }
    const source = await sourcePixels(ctx)
    return assertIllustriousDpmImageSavedPixels({
      source,
      contribution: rgba(output),
      preview: rgba(ctx.merged),
      mode: ctx.fixture.mode,
    })
  },
  comparisonChanged: (fixture) => [
    ...resources.comparisonChanged,
    ...(fixture.mode !== 'img2img' ? ['context.mode'] : []),
  ],
  comparisonSame: (fixture) => [
    ...resources.comparisonSame,
    'guidance.steps',
    'guidance.cfg',
    ...(fixture.mode === 'txt2img' ? [] : ['denoisingStrength.value']),
  ],
  async assertComparison({ expect, dialog, generation, currentDraft }) {
    const item = generation.expectedItem
    const edited = illustriousDpmPair(
      item.algorithm === 'dpmpp_2m' ? 'dpmpp_sde' : 'dpmpp_2m',
      item.schedule,
    )
    assert.equal(currentDraft.sampling.sampler, edited.sampler)
    assert.equal(currentDraft.sampling.scheduler, item.schedule)
    const checks = {
      'sampling.invokeScheduler': [item.invokeScheduler, edited.invokeScheduler],
      'sampling.sampler': [item.sampler, edited.sampler],
      'sampling.scheduler': [item.schedule, item.schedule],
      // Comparison composes the current Canvas after Add; every selected result is now opaque.
      'context.mode': [item.mode, 'img2img'],
      'guidance.steps': [String(item.steps), String(item.steps)],
      'guidance.cfg': ['4', '4'],
      'seed.actual': ['0', String(currentDraft.seed.value)],
    }
    if (item.mode !== 'txt2img') {
      assert.equal(currentDraft.sampling.denoisingStrength, item.denoisingStrength)
      checks['denoisingStrength.value'] = [
        String(item.denoisingStrength),
        String(item.denoisingStrength),
      ]
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const row = dialog.locator(`[data-setting="${key}"]`)
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    return evidence
  },
  summaryClaims: ({ fixture, report }) => {
    const provisional = fixture.stage === 'control'
    assert.equal(report.generations.length, 1)
    assert.ok(report.generations.every(({ accepted }) => accepted === !provisional))
    return {
      algorithm: fixture.algorithm,
      schedule: fixture.schedule,
      mode: fixture.mode,
      case: fixture.case,
      installedDpmInferenceClaim: !provisional,
      numericalSensitivityClaim: false,
      provisionalMutationControl: provisional,
      acceptedSavedReopenedClaim: !provisional,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron Generate and installed worker0.14 EPS DPM TXT/IMG/OUT; healthy explicit Add/Save/readback/reopen/owning comparison; controls remain provisional.',
    preconditions:
      'Existing exact official EPS NoobAI/commonpool runtime/catalog, Digital Art−0.5/external native VAE FP32, raw weighted red1.3/blurry0.7, CFG4/Fixed0, authored4. Opaque256 source only for image modes; OUT x64 plus exact LaMa/policy.',
    limits:
      'Four declared DPM pairs and finite history/neighbor strengths only; one ordinary alpha-outpaint geometry. Numerical sensitivity requires independent paired RED/GREEN/restored aggregate, visible OUT RGB change and unchanged alpha; no quality, broad solver parity, V/SDE zeroSNR, arbitrary inputs, fullMVP or release claim.',
  },
})
