/** Real common-source image batch UI/durable hooks with independent per-item expectations. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import { assertNoobaiLoraStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertIllustriousDynamicImageConfiguration,
  assertIllustriousDynamicImageFrozen,
  assertIllustriousDynamicImagePixels,
  assertIllustriousDynamicImageSavedPixels,
  expectedIllustriousDynamicImageLoraStack,
  expectedIllustriousDynamicImageBaselineSourceChanges,
  literalIllustriousDynamicImagePlan,
  normalizeIllustriousDynamicImageNativeInputs,
  normalizeIllustriousDynamicImageReferenceInputs,
  validateIllustriousDynamicImageFixture,
} from './illustrious-dynamic-image-qualification.mjs'
const planFor = (fixture) =>
  literalIllustriousDynamicImagePlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
    fixture.seedBehavior,
  )
const rgba = (decoded) => ({
  width: decoded.dimensions.width,
  height: decoded.dimensions.height,
  rgba: decoded.rgba,
})
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

// A visibility edit creates a revision and therefore a new process-authenticated image URL.
// Bind its stable asset identity without treating the revision/MAC as presentation state.
function stableLayerViews(layers, projectId) {
  const revisions = new Set()
  const views = layers.map((layer) => {
    const url = new URL(layer.imageUrl)
    assert.equal(url.protocol, 'igs-layer:')
    assert.equal(url.host, 'asset')
    assert.equal(url.username + url.password + url.search + url.hash, '')
    const match =
      /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.img$/.exec(
        url.pathname,
      )
    assert.ok(match, 'Visibility preparation requires the actual layer resource URL shape.')
    const [, tabId, revision, layerId, assetSha256] = match
    assert.equal(tabId, projectId)
    assert.equal(layerId, layer.id)
    revisions.add(revision)
    return { ...layer, imageUrl: { tabId, layerId, assetSha256 } }
  })
  assert.equal(revisions.size, 1)
  return { views, revision: [...revisions][0] }
}
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}

function assertEdited(draft, reference, fixture) {
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(draft.dynamicPrompt, {
    maxPrompts: 3,
    seedBehavior: fixture?.seedBehavior === 'per-prompt' ? 'per-iteration' : 'per-prompt',
  })
  for (const polarity of ['positive', 'negative'])
    assert.deepEqual(draft[`${polarity}Prompt`], {
      text: editedPrompts[polarity],
      embeddingRefs: [],
    })
  const expected = structuredClone(expectedIllustriousDynamicImageLoraStack(reference))
  expected[0].weight = -0.25
  assert.deepEqual(draft.loras, expected)
}

export const illustriousDynamicImageProfile = Object.freeze({
  ...illustriousDpmProfile,
  profile: 'illustrious-dynamic-image',
  entrySource: 'scripts/qualify-installed-illustrious-dynamic-image.mjs',
  adapterSource: 'scripts/illustrious-dynamic-image-profile.mjs',
  oracleSource: 'scripts/illustrious-dynamic-image-qualification.mjs',
  sourceDependencies: [
    ...illustriousDpmProfile.sourceDependencies,
    'scripts/illustrious-dpm-profile.mjs',
    'scripts/illustrious-dpm-qualification.mjs',
    'scripts/noobai-vpred-dpm-profile.mjs',
    'scripts/noobai-lora-stack-qualification.mjs',
  ],
  validateFixture: validateIllustriousDynamicImageFixture,
  assertFrozen: assertIllustriousDynamicImageFrozen,
  assertConfiguration: assertIllustriousDynamicImageConfiguration,
  normalizeNativeInputs: normalizeIllustriousDynamicImageNativeInputs,
  normalizeExecutionInputs: normalizeIllustriousDynamicImageNativeInputs,
  normalizeReferenceInputs: normalizeIllustriousDynamicImageReferenceInputs,
  shouldCompareBaseline: ({ fixture, expectedItem }) =>
    fixture.seedBehavior !== 'per-prompt' || expectedItem.promptPairIndex === 0,
  baselineMetadataDifferences: (fixture) =>
    fixture.seedBehavior === 'per-prompt' ? ['seedBehavior'] : [],
  baselineSourceChanges: expectedIllustriousDynamicImageBaselineSourceChanges,
  inferenceSteps: () => 3,
  observedSteps: () => 2,
  cfgScale: 5,
  modelKey: (fixture) => planFor(fixture).modelKey,
  originalSourceKeys: (fixture) => [
    planFor(fixture).modelKey,
    'illustriousLora',
    'externalVaeNative',
  ],
  requiresSourceImage: () => true,
  sampling(fixture) {
    const sampler = planFor(fixture).sampler
    return {
      label: 'Sampler',
      draftKey: 'sampler',
      value: sampler,
      code: sampler,
      editedValue: sampler,
      editedCode: sampler,
      scheduler: 'Normal',
    }
  },
  authorComponents: noobaiVpredDpmProfile.authorComponents,
  assertEdited,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: plan.maxPrompts,
      seedBehavior: plan.seedBehavior,
    })
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 5)
    assert.equal(draft.sampling.sampler, plan.sampler)
    assert.equal(draft.sampling.scheduler, 'Normal')
    const model = reference[plan.modelKey]
    for (const [field, expected] of Object.entries({
      localModelId: model.installed.resourceId,
      localVersionId: model.installed.versionId,
      fileSha256: model.sha256,
      predictionType: fixture.objective,
    }))
      assert.equal(draft.model[field], expected)
    const vae = reference.externalVaeNative
    assert.equal(draft.vae.localModelId, vae.installed.resourceId)
    assert.equal(draft.vae.localVersionId, vae.installed.versionId)
    assert.equal(draft.vae.fileSha256, vae.sha256)
    assert.equal(draft.vaePrecision, 'FP32')
    assert.equal(draft.cfgRescale ?? 0, 0)
    assert.deepEqual(draft.loras, expectedIllustriousDynamicImageLoraStack(reference))
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [],
      })
  },
  async afterCompletions({ report, fixture, plan, window }) {
    const decoded = []
    for (const generation of report.generations) {
      const bytes = await readFile(generation.outputPath)
      assert.equal(digest(bytes), generation.receipt.image_sha256)
      const pixels = await window.evaluate(async (base64) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        return Array.from(context.getImageData(0, 0, image.width, image.height).data)
      }, bytes.toString('base64'))
      decoded.push({ ...generation, rgba: pixels })
    }
    return {
      stage: fixture.stage,
      visibleDynamicAxes: assertIllustriousDynamicImagePixels(decoded, plan),
    }
  },
  async afterAcceptance({ window, expect, project, tab, sourceLayers, plan }) {
    const sourceIds = new Set(sourceLayers.map(({ id }) => id))
    assert.equal(sourceIds.size, 1)
    const before = structuredClone((await tab(project)).layers)
    const initial = stableLayerViews(before, project.id)
    const generated = before.filter(({ id }) => !sourceIds.has(id))
    assert.equal(generated.length, plan.expectedCompletions)
    assert.equal(before.length, generated.length + sourceIds.size)
    const initialGeneratedVisibleIds = generated
      .filter(({ visible }) => visible)
      .map(({ id }) => id)
    // Add preserves alternatives as hidden layers and shows only its selected anchor.
    assert.equal(initialGeneratedVisibleIds.length, 1)
    const shownLayerIds = []
    for (const layer of generated) {
      if (layer.visible) continue
      await window.getByRole('button', { name: `Show ${layer.name}`, exact: true }).click()
      await expect
        .poll(async () => (await tab(project)).layers.find(({ id }) => id === layer.id)?.visible)
        .toBe(true)
      shownLayerIds.push(layer.id)
    }
    const after = structuredClone((await tab(project)).layers)
    const final = stableLayerViews(after, project.id)
    assert.notEqual(final.revision, initial.revision)
    assert.deepEqual(
      final.views,
      initial.views.map((layer) => (sourceIds.has(layer.id) ? layer : { ...layer, visible: true })),
      'Visibility preparation must preserve layer order, geometry, source and every other view field.',
    )
    assert.ok(after.every(({ visible }) => visible))
    return {
      beforeExplicitSave: true,
      initialGeneratedVisibleIds,
      shownLayerIds,
      sourceLayerIds: [...sourceIds],
      before,
      after,
    }
  },
  async assertSaved(ctx) {
    assert.equal(ctx.generations.length, ctx.plan.expectedCompletions)
    const saved = ctx.savedPackage.saved
    assert.equal(saved.project.layers.length, ctx.generations.length + 1)
    const sourceBytes = await readFile(ctx.fixture.sourceImage.path)
    assert.equal(sourceBytes.length, ctx.fixture.sourceImage.byteSize)
    assert.equal(digest(sourceBytes), ctx.fixture.sourceImage.sha256)
    const source = await ctx.decodedImage(`data:image/png;base64,${sourceBytes.toString('base64')}`)
    assert.equal(source.dimensions.pixelSha256, ctx.fixture.sourceImage.pixelSha256)
    const contributions = []
    for (const layer of [...saved.project.layers].reverse()) {
      if (!layer.generationProvenance) continue
      const generation = ctx.generations.find(
        ({ queueItemId }) =>
          queueItemId === layer.generationProvenance.executionResultContext.queueItemId,
      )
      assert.ok(generation)
      assert.equal(layer.visible, true)
      assert.equal(layer.opacity, 1)
      assert.equal(layer.blendMode, 'normal')
      assert.deepEqual(layer.transform, {
        rotationDegrees: 0,
        scaleX: 1,
        scaleY: 1,
        x: ctx.plan.bbox.x,
        y: 0,
      })
      assert.deepEqual(layer.generationProvenance.layerSourceContext.bbox, ctx.plan.bbox)
      const output = await ctx.decodedImage(
        `data:image/png;base64,${(await saved.readMember(layer.asset.path)).toString('base64')}`,
      )
      const alpha = illustriousDpmProfile.assertOutput({ decoded: output, fixture: ctx.fixture })
      if (ctx.fixture.mode === 'outpaint') {
        assert.equal(
          layer.generationProvenance.executionResultContext.output.outputMode,
          'contribution',
        )
        assert.deepEqual(
          layer.generationProvenance.executionResultContext.output.contributionAlpha8,
          alpha,
        )
        for (const key of ['infillResource', 'keepMask', 'policy', 'sourceTarget'])
          assert.deepEqual(
            layer.generationProvenance.layerSourceContext.outpaint[key],
            generation.frozen.context.conditioning[key],
          )
      }
      contributions.push(rgba(output))
    }
    return assertIllustriousDynamicImageSavedPixels({
      source: rgba(source),
      contributions,
      preview: rgba(ctx.merged),
      mode: ctx.fixture.mode,
    })
  },
  comparisonChanged: (fixture) => [
    'seed.actual',
    'seed.behavior',
    'prompt.text',
    'negativePrompt.text',
    'loras.stack',
    ...(fixture.mode === 'outpaint' ? ['context.mode'] : []),
  ],
  comparisonSame: (fixture) => [
    'model.resource',
    'model.predictionType',
    'sampling.scheduler',
    'noiseProfile.baseSchedule',
    'noiseProfile.rescaleBetasZeroSnr',
    'noiseProfile.timestepSpacing',
    'vae.resource',
    'vaePrecision.value',
    'guidance.steps',
    'guidance.cfg',
    'denoisingStrength.value',
    'sampling.sampler',
    'sampling.invokeScheduler',
    'seed.policy',
    'prompt.embeddings',
    'negativePrompt.embeddings',
    ...(fixture.mode === 'img2img' ? ['context.mode'] : []),
  ],
  async assertComparison({ expect, dialog, generation, reference, currentDraft, fixture }) {
    const item = generation.expectedItem
    assertEdited(currentDraft, reference, fixture)
    assert.equal(currentDraft.sampling.sampler, item.sampler)
    assert.equal(currentDraft.sampling.scheduler, 'Normal')
    assert.equal(currentDraft.sampling.denoisingStrength, 0.5)
    const checks = {
      'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
      'sampling.sampler': [item.sampler, item.sampler],
      'sampling.scheduler': ['Normal', 'Normal'],
      'context.mode': [item.mode, 'img2img'],
      'guidance.steps': ['3', '3'],
      'guidance.cfg': ['5', '5'],
      'denoisingStrength.value': ['0.5', '0.5'],
      'seed.actual': [String(item.seed), '37'],
      'seed.policy': ['fixed', 'fixed'],
      'seed.behavior': [item.seedBehavior, currentDraft.dynamicPrompt.seedBehavior],
      'prompt.text': [item.prompts.positive, editedPrompts.positive],
      'negativePrompt.text': [item.prompts.negative, editedPrompts.negative],
      'prompt.embeddings': ['None', 'None'],
      'negativePrompt.embeddings': ['None', 'None'],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    const stack = expectedIllustriousDynamicImageLoraStack(reference)
    const after = structuredClone(stack)
    after[0].weight = -0.25
    const row = dialog.locator('[data-setting="loras.stack"]')
    await expect(row).toHaveAttribute('data-status', 'Changed')
    const values = await row.locator('.comparison-values p').allTextContents()
    assert.equal(values.length, 2)
    assertNoobaiLoraStackDescription(values[0], stack)
    assertNoobaiLoraStackDescription(values[1], after)
    evidence['loras.stack'] = { status: 'Changed', values }
    return evidence
  },
  summaryClaims({ fixture, plan, report }) {
    assert.deepEqual(plan, planFor(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    assert.ok(
      report.generations.every(({ accepted }) => accepted === (fixture.stage !== 'control')),
    )
    return {
      objective: fixture.objective,
      mode: fixture.mode,
      installedDynamicImageInferenceClaim: fixture.stage !== 'control',
      acceptedSavedReopenedClaim: fixture.stage !== 'control',
      provisionalMutationControl: fixture.stage === 'control',
      exactRawPreviewClaim: false,
      imageReuseClaim: false,
      installedPerPromptSeedClaim: fixture.seedBehavior === 'per-prompt',
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron common-source image batch Generate -> installed worker -> provisional candidates -> explicit batch Add/Save/readback/reopen and every owning comparison.',
    preconditions:
      'Exact EPS/V common-source checkpoints, one opaque256 image per objective, signed Digital Art−0.5, external native VAE FP32, Normal N3 CFG5 strength.5 Fixed0 with explicitly selected per-iteration or healthy per-prompt; OUT x64 exact LaMa/policy.',
    limits:
      'Four weighted positive/negative pairs with two iterations baseline, same-template maxPrompts1 prefix controls/restoration for per-iteration only. Healthy per-prompt has seeds0..7 and only first-pair0/1 same-input pixel references; cross-pair prompt effects are not isolated. Browser full-preview soft RGB allowance is not exact raw Pillow proof. No installed image Reuse/Random/wrap/cap32, quality, full MVP or release claim.',
  },
})
