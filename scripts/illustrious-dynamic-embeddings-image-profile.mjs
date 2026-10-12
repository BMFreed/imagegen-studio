/** Compose exact signed authoring with genuine common-source image and Save hooks through DI. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { illustriousDynamicEmbeddingsProfile as embeddings } from './illustrious-dynamic-embeddings-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import { literalIllustriousDynamicImagePlan } from './illustrious-dynamic-image-qualification.mjs'
import { assertNoobaiLoraStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertIllustriousDynamicEmbeddingsImageBaseline,
  assertIllustriousDynamicEmbeddingsImageConfiguration,
  assertIllustriousDynamicEmbeddingsImageFrozen,
  assertIllustriousDynamicEmbeddingsImagePixels,
  effectiveIllustriousDynamicImageEmbeddingRefs,
  expectedIllustriousDynamicImageEmbeddingRef,
  literalIllustriousDynamicEmbeddingsImagePlan,
  normalizeIllustriousDynamicEmbeddingsImageNativeInputs,
  resolveIllustriousDynamicEmbeddingsImagePlan,
  validateIllustriousDynamicEmbeddingsImageFixture,
} from './illustrious-dynamic-embeddings-image-qualification.mjs'
const planFor = (fixture) =>
  literalIllustriousDynamicEmbeddingsImagePlan(fixture.stage, fixture.objective, fixture.mode)
const imageFixture = (fixture) => ({ ...fixture, stage: 'baseline', seedBehavior: 'per-iteration' })
function assertEdited(draft, reference, fixture) {
  image.assertEdited(draft, reference, imageFixture(fixture))
  embeddings.assertEdited(draft)
}
export const illustriousDynamicEmbeddingsImageProfile = Object.freeze({
  ...image,
  profile: 'illustrious-dynamic-embeddings-image',
  entrySource: 'scripts/qualify-installed-illustrious-dynamic-embeddings-image.mjs',
  adapterSource: 'scripts/illustrious-dynamic-embeddings-image-profile.mjs',
  oracleSource: 'scripts/illustrious-dynamic-embeddings-image-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...image.sourceDependencies,
      image.adapterSource,
      image.oracleSource,
      embeddings.adapterSource,
      embeddings.oracleSource,
    ]),
  ],
  validateFixture: validateIllustriousDynamicEmbeddingsImageFixture,
  assertBaseline: assertIllustriousDynamicEmbeddingsImageBaseline,
  assertFrozen: assertIllustriousDynamicEmbeddingsImageFrozen,
  assertConfiguration: assertIllustriousDynamicEmbeddingsImageConfiguration,
  normalizeNativeInputs: normalizeIllustriousDynamicEmbeddingsImageNativeInputs,
  normalizeExecutionInputs: normalizeIllustriousDynamicEmbeddingsImageNativeInputs,
  normalizeReferenceInputs: normalizeIllustriousDynamicEmbeddingsImageNativeInputs,
  expectedBaselineStage: () => 'baseline',
  shouldCompareBaseline: () => true,
  baselineMetadataDifferences: () => [],
  baselineSourceChanges: () => [],
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveIllustriousDynamicEmbeddingsImagePlan(plan, admitted),
  }),
  provisionalOnly: () => false,
  modelKey: (fixture) => planFor(fixture).modelKey,
  originalSourceKeys: (fixture) => [
    planFor(fixture).modelKey,
    'illustriousLora',
    'externalVaeNative',
    'embeddingTrained',
  ],
  sampling: (fixture) => image.sampling(imageFixture(fixture)),
  authorPrompts: embeddings.authorPrompts,
  assertEdited,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: plan.maxPrompts,
      seedBehavior: 'per-iteration',
    })
    const ref = expectedIllustriousDynamicImageEmbeddingRef(reference)
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [ref],
      })
    const ordinary = literalIllustriousDynamicImagePlan('baseline', fixture.objective, fixture.mode)
    const projected = structuredClone(draft)
    projected.dynamicPrompt.maxPrompts = 4
    for (const polarity of ['positive', 'negative'])
      projected[`${polarity}Prompt`] = { text: ordinary.sourcePrompts[polarity], embeddingRefs: [] }
    image.assertAuthored(projected, reference, imageFixture(fixture), ordinary)
  },
  async afterCompletions({ report, fixture, plan, window }) {
    const decoded = []
    for (const generation of report.generations) {
      const bytes = await readFile(generation.outputPath)
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        generation.receipt.image_sha256,
      )
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
      visibleSignedAxes: assertIllustriousDynamicEmbeddingsImagePixels(decoded, plan),
    }
  },
  comparisonChanged: (fixture) => image.comparisonChanged(imageFixture(fixture)),
  comparisonSame: (fixture) =>
    image
      .comparisonSame(imageFixture(fixture))
      .filter((key) => !['prompt.embeddings', 'negativePrompt.embeddings'].includes(key)),
  async assertComparison({ expect, dialog, generation, reference, currentDraft, fixture }) {
    assertEdited(currentDraft, reference, fixture)
    const item = generation?.expectedItem
    const refs = effectiveIllustriousDynamicImageEmbeddingRefs(item, reference)
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
      'seed.actual': ['0', '37'],
      'seed.policy': ['fixed', 'fixed'],
      'seed.behavior': ['per-iteration', 'per-prompt'],
      'prompt.text': [item.prompts.positive, currentDraft.positivePrompt.text],
      'negativePrompt.text': [item.prompts.negative, currentDraft.negativePrompt.text],
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
    for (const [polarity, key] of [
      ['positive', 'prompt.embeddings'],
      ['negative', 'negativePrompt.embeddings'],
    ]) {
      const active = refs[polarity].length > 0
      const status = active ? 'Removed' : 'Same'
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveCount(1)
      await expect(row).toHaveAttribute('data-status', status)
      const values = await row.locator('.comparison-values p').allTextContents()
      assert.equal(values.length, 2)
      assert.equal(values[1], 'None')
      if (active) {
        const ref = refs[polarity][0]
        assert.ok(values[0].includes(ref.token))
        assert.ok(values[0].includes(ref.resource.displayName))
        assert.ok(values[0].includes(ref.resource.versionName))
        assert.ok(values[0].includes(ref.resource.fileSha256))
      } else assert.equal(values[0], 'None')
      evidence[key] = { status, selected: active ? 'embeddingTrained' : null, values }
    }
    const row = dialog.locator('[data-setting="loras.stack"]')
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAttribute('data-status', 'Changed')
    const values = await row.locator('.comparison-values p').allTextContents()
    assert.equal(values.length, 2)
    const before = structuredClone(currentDraft.loras)
    before[0].weight = -0.5
    assertNoobaiLoraStackDescription(values[0], before)
    assertNoobaiLoraStackDescription(values[1], currentDraft.loras)
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
      objective: fixture.objective,
      mode: fixture.mode,
      installedDynamicEmbeddingImageInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      effectiveSignedEmbeddingSubsetsClaim: true,
      ownFullInputPrefixReplayClaim: fixture.stage === 'prefix',
      causalTensorDirectionClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Real owned exact-version CodeMirror completion on both signs -> Generate image preparation/frozen signed subsets -> installed worker -> Add/Save/reopen/every owning comparison.',
    preconditions:
      'Existing worker0.14/runtime/catalog, exact EPS/V checkpoints, trained IllustriousPhoto, DigitalArt−.5, native VAE FP32, common opaque256 source. IMG/normal mixed-alpha OUTx64 exactLaMa; Normal N3/two updates/CFG5/strength.5/Fixed0.',
    limits:
      'Eight sequential baseline4/prefix2 stages:24 accepted outputs/eight packages/eight same-input wholeRGBA prefix matches. Full weighted authored templates+refs remain; native/accepted use exact concrete signed subsets. No new trained mutation, broad formats/geometry, seed-policy matrix, cap32, Anima image, causal tensor direction, quality/fullMVP/release claim.',
  },
})
