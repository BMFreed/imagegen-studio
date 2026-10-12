/** Euler dynamic IMG/OUT adapter: genuine image hooks plus independently frozen batch recipes. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { animaHeunImageProfile as image } from './anima-heun-image-profile.mjs'
import { illustriousDynamicImageProfile as imageBatch } from './illustrious-dynamic-image-profile.mjs'
// This description assertion is family-independent: ordered exact resource identities and weights.
import { assertNoobaiLoraStackDescription as assertStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertAnimaDynamicImageBaseline,
  assertAnimaDynamicImageConfiguration,
  assertAnimaDynamicImageFrozen,
  assertAnimaDynamicImagePixels,
  assertAnimaDynamicImageSavedPixels,
  expectedAnimaDynamicImageLoraStack,
  literalAnimaDynamicImagePlan,
  normalizeAnimaDynamicImageNativeInputs,
  resolveAnimaDynamicImagePlan,
  validateAnimaDynamicImageFixture,
} from './anima-dynamic-image-qualification.mjs'

const planFor = (fixture) => literalAnimaDynamicImagePlan(fixture.stage, fixture.mode)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const rgba = (decoded) => ({
  width: decoded.dimensions.width,
  height: decoded.dimensions.height,
  rgba: decoded.rgba,
})
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}
function assertEdited(draft, reference) {
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 3, seedBehavior: 'per-prompt' })
  for (const polarity of ['positive', 'negative'])
    assert.deepEqual(draft[`${polarity}Prompt`], {
      text: editedPrompts[polarity],
      embeddingRefs: [],
    })
  const stack = structuredClone(expectedAnimaDynamicImageLoraStack(reference))
  stack[0].weight = -0.25
  assert.deepEqual(draft.loras, stack)
  assert.equal(draft.sampling.animaMethod, 'heun')
}
export const animaDynamicImageProfile = Object.freeze({
  ...image,
  profile: 'anima-dynamic-image',
  entrySource: 'scripts/qualify-installed-anima-dynamic-image.mjs',
  adapterSource: 'scripts/anima-dynamic-image-profile.mjs',
  oracleSource: 'scripts/anima-dynamic-image-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...image.sourceDependencies,
      image.adapterSource,
      image.oracleSource,
      ...imageBatch.sourceDependencies,
      imageBatch.adapterSource,
      imageBatch.oracleSource,
      'scripts/anima-regression-qualification.mjs',
      'scripts/noobai-lora-stack-qualification.mjs',
    ]),
  ],
  validateFixture: validateAnimaDynamicImageFixture,
  assertFrozen: assertAnimaDynamicImageFrozen,
  assertConfiguration: assertAnimaDynamicImageConfiguration,
  assertBaseline: assertAnimaDynamicImageBaseline,
  normalizeNativeInputs: normalizeAnimaDynamicImageNativeInputs,
  normalizeExecutionInputs: normalizeAnimaDynamicImageNativeInputs,
  normalizeReferenceInputs: normalizeAnimaDynamicImageNativeInputs,
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveAnimaDynamicImagePlan(plan, admitted),
  }),
  requiresSourceImage: () => true,
  inferenceSteps: () => 3,
  observedSteps: () => 2,
  provisionalOnly: () => false,
  expectedBaselineStage: () => 'baseline',
  shouldCompareBaseline: () => true,
  baselineMetadataDifferences: () => [],
  baselineSourceChanges: () => [],
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
  sampling: () => ({
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'Euler',
    code: 'euler',
    editedValue: 'Heun',
    editedCode: 'heun',
  }),
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: plan.maxPrompts,
      seedBehavior: 'per-iteration',
    })
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [],
      })
    assert.equal(draft.sampling.animaMethod, 'euler')
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 4)
    // The genuine image prepareInput hook sets strength after authoring, then checks its Main value.
    assert.equal(draft.vae, null)
    assert.equal(draft.cfgRescale ?? 0, 0)
    assert.equal(draft.vaePrecision ?? 'Auto', 'Auto')
    assert.equal(draft.clipSkip, undefined)
    assert.equal(draft.model.baseModelFamily, 'anima')
    assert.equal(draft.model.localModelId, reference.anima.installed.resourceId)
    assert.equal(draft.model.localVersionId, reference.anima.installed.versionId)
    assert.equal(draft.model.fileSha256, reference.anima.sha256)
    assert.equal(draft.model.predictionType, null)
    assert.deepEqual(draft.loras, expectedAnimaDynamicImageLoraStack(reference))
  },
  assertEdited,
  // Visibility/asset capability URLs and Add's anchor policy do not depend on model family.
  afterAcceptance: imageBatch.afterAcceptance,
  async afterCompletions({ report, fixture, plan, window }) {
    const decoded = []
    for (const generation of report.generations) {
      const bytes = await readFile(generation.outputPath)
      assert.equal(digest(bytes), generation.receipt.image_sha256)
      const pixels = await window.evaluate(async (base64) => {
        const img = new Image()
        img.src = `data:image/png;base64,${base64}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const context = canvas.getContext('2d')
        context.drawImage(img, 0, 0)
        return Array.from(context.getImageData(0, 0, img.width, img.height).data)
      }, bytes.toString('base64'))
      decoded.push({ ...generation, rgba: pixels })
    }
    return {
      stage: fixture.stage,
      visibleDynamicAxes: assertAnimaDynamicImagePixels(decoded, plan),
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
      assert.equal(layer.generationProvenance.kind, `anima-${ctx.fixture.mode}`)
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
      const alpha = image.assertOutput({ decoded: output, fixture: ctx.fixture })
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
    return assertAnimaDynamicImageSavedPixels({
      source: rgba(source),
      contributions,
      preview: rgba(ctx.merged),
      mode: ctx.fixture.mode,
    })
  },
  comparisonChanged: (fixture) => [
    'sampling.animaMethod',
    'seed.actual',
    'seed.behavior',
    'prompt.text',
    'negativePrompt.text',
    'loras.stack',
    ...(fixture.mode === 'outpaint' ? ['context.mode'] : []),
  ],
  comparisonSame: (fixture) => [
    'model.resource',
    'anima.architecture',
    'anima.checkpointByteSize',
    'anima.qwen3Encoder',
    'anima.vae',
    'guidance.steps',
    'guidance.cfg',
    'denoisingStrength.value',
    'seed.policy',
    'prompt.embeddings',
    'negativePrompt.embeddings',
    ...(fixture.mode === 'img2img' ? ['context.mode'] : []),
  ],
  async assertComparison({ expect, dialog, generation, currentDraft, reference }) {
    assertEdited(currentDraft, reference)
    const item = generation?.expectedItem
    assert.ok(item && item.animaMethod === 'euler' && (item.seed === 0 || item.seed === 1))
    const full = literalAnimaDynamicImagePlan('baseline', item.mode)
    assert.deepEqual(
      item,
      full.items.find(
        (entry) =>
          entry.promptPairIndex === item.promptPairIndex && entry.iteration === item.iteration,
      ),
    )
    assert.equal(currentDraft.sampling.steps, 3)
    assert.equal(currentDraft.sampling.cfgScale, 4)
    assert.equal(currentDraft.sampling.denoisingStrength, 0.5)
    const checks = {
      'sampling.animaMethod': ['Euler', 'Heun'],
      'context.mode': [item.mode, 'img2img'],
      'guidance.steps': ['3', '3'],
      'guidance.cfg': ['4', '4'],
      'denoisingStrength.value': ['0.5', '0.5'],
      'seed.actual': [String(item.seed), '37'],
      'seed.policy': ['fixed', 'fixed'],
      'seed.behavior': ['per-iteration', 'per-prompt'],
      'prompt.text': [item.prompts.positive, editedPrompts.positive],
      'negativePrompt.text': [item.prompts.negative, editedPrompts.negative],
      'prompt.embeddings': ['None', 'None'],
      'negativePrompt.embeddings': ['None', 'None'],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const status = values[0] === values[1] ? 'Same' : 'Changed'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveCount(1)
      await expect(row).toHaveAttribute('data-status', status)
      await expect(row.locator('.comparison-values p')).toHaveText(values)
      evidence[key] = { status, values }
    }
    const row = dialog.locator('[data-setting="loras.stack"]')
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAttribute('data-status', 'Changed')
    const values = await row.locator('.comparison-values p').allTextContents()
    assert.equal(values.length, 2)
    assertStackDescription(values[0], expectedAnimaDynamicImageLoraStack(reference))
    assertStackDescription(values[1], currentDraft.loras)
    evidence['loras.stack'] = { status: 'Changed', values }
    return evidence
  },
  summaryClaims({ fixture, plan, report }) {
    assert.deepEqual(plan, planFor(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.accepted, true)
      if (fixture.stage === 'prefix') {
        assert.equal(generation.baseline.reportPath, fixture.baseline.reportPath)
        assert.equal(generation.baseline.reportSha256, fixture.baseline.reportSha256)
        assert.equal(generation.baseline.beforeExplicitAdd, true)
        assert.deepEqual(generation.baseline.allowedMetadataDifferences, [])
        assert.equal(generation.baseline.actualPixelSha256, generation.baseline.expectedPixelSha256)
      }
    }
    return {
      mode: fixture.mode,
      installedAnimaDynamicImageInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      ownFullInputPrefixReplayClaim: fixture.stage === 'prefix',
      compiledPromptPortableClaim: false,
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron common-source image Generate -> exact frozen raw/compiled Euler jobs -> installed worker -> temporary candidates -> Add/Save/reopen/every owning comparison.',
    preconditions:
      'Existing worker0.14/Anima-Qwen3-Wan-Myth catalog, one pinned Heun source PNG reused directly, Euler N3/two updates/CFG4/strength.5/Myth-.5/Fixed0. OUTx64 exactLaMa/mixedalpha, no copy/download/new runtime.',
    limits:
      'Four healthy baseline8/prefix2 stages:20 accepted outputs/fourpackages/four own same-input wholeRGBA controls,34 finite jointinput/seedcontrasts. No notice verification, new trained mutation, cap32/Random/Reuse/wrap, broad methods/formats/geometry, scalar/tensor causality, quality/Invokeparity/fullMVP/release claim.',
  },
})
