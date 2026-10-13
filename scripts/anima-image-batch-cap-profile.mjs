/** Genuine Anima image hooks composed with finite preview/notice/confirmed-refusal checks. */
import assert from 'node:assert/strict'
import { animaDynamicImageProfile as image } from './anima-dynamic-image-profile.mjs'
import {
  generationBatchCapProfile as cap,
  assertBatchCapConfirmedRefusal,
} from './generation-batch-cap-profile.mjs'
import { assertNoobaiLoraStackDescription as assertStackDescription } from './noobai-lora-stack-qualification.mjs'
import { expectedAnimaDynamicImageLoraStack } from './anima-dynamic-image-qualification.mjs'
import {
  assertAnimaImageBatchCapBaseline,
  assertAnimaImageBatchCapConfiguration,
  assertAnimaImageBatchCapFrozen,
  assertAnimaImageBatchCapItem,
  literalAnimaImageBatchCapPlan,
  normalizeAnimaImageBatchCapExecutionInputs,
  normalizeAnimaImageBatchCapNativeInputs,
  resolveAnimaImageBatchCapPlan,
  validateAnimaImageBatchCapFixture,
} from './anima-image-batch-cap-qualification.mjs'

const planFor = (fixture) => literalAnimaImageBatchCapPlan(fixture.stage, fixture.mode)
const opposite = (plan) => (plan.seedBehavior === 'per-iteration' ? 'per-prompt' : 'per-iteration')
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}
function assertEdited(draft, reference, fixture) {
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 3, seedBehavior: opposite(planFor(fixture)) })
  for (const sign of ['positive', 'negative'])
    assert.deepEqual(draft[`${sign}Prompt`], { text: editedPrompts[sign], embeddingRefs: [] })
  const stack = structuredClone(expectedAnimaDynamicImageLoraStack(reference))
  stack[0].weight = -0.25
  assert.deepEqual(draft.loras, stack)
  assert.equal(draft.sampling.animaMethod, 'heun')
}
export const animaImageBatchCapProfile = Object.freeze({
  ...image,
  profile: 'anima-image-batch-cap',
  entrySource: 'scripts/qualify-installed-anima-image-batch-cap.mjs',
  adapterSource: 'scripts/anima-image-batch-cap-profile.mjs',
  oracleSource: 'scripts/anima-image-batch-cap-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...image.sourceDependencies,
      image.adapterSource,
      image.oracleSource,
      ...cap.sourceDependencies,
      cap.adapterSource,
      cap.oracleSource,
      'scripts/noobai-lora-stack-qualification.mjs',
    ]),
  ],
  validateFixture: validateAnimaImageBatchCapFixture,
  assertBaseline: assertAnimaImageBatchCapBaseline,
  assertFrozen: assertAnimaImageBatchCapFrozen,
  assertConfiguration: assertAnimaImageBatchCapConfiguration,
  normalizeNativeInputs: normalizeAnimaImageBatchCapNativeInputs,
  normalizeExecutionInputs: normalizeAnimaImageBatchCapExecutionInputs,
  normalizeReferenceInputs: (frozen, { fixture, plan }) =>
    fixture.stage === 'prefix'
      ? normalizeAnimaImageBatchCapExecutionInputs(frozen, plan)
      : normalizeAnimaImageBatchCapNativeInputs(frozen),
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveAnimaImageBatchCapPlan(plan, admitted),
  }),
  expectedBaselineStage: () => 'boundary',
  baselineMetadataDifferences: (fixture) => (fixture.stage === 'prefix' ? ['seedBehavior'] : []),
  baselineSourceChanges: () => [],
  shouldCompareBaseline: () => true,
  completionTimeoutMs: () => 1_600_000,
  qualificationDeadlineSeconds: (fixture) => (fixture.stage === 'boundary' ? 2700 : 1800),
  provisionalOnly: () => false,
  authorSeed: cap.authorSeed,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: plan.maxPrompts,
      seedBehavior: plan.seedBehavior,
    })
    for (const sign of ['positive', 'negative'])
      assert.deepEqual(draft[`${sign}Prompt`], {
        text: plan.sourcePrompts[sign],
        embeddingRefs: [],
      })
    assert.equal(draft.sampling.animaMethod, 'euler')
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 4)
    // The existing image prepareInput establishes/verifies strength after ordinary authoring.
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
  comparisonChanged: (fixture) => image.comparisonChanged(fixture),
  comparisonSame: (fixture) => image.comparisonSame(fixture),
  async assertComparison({ expect, dialog, generation, currentDraft, reference, fixture }) {
    assertEdited(currentDraft, reference, fixture)
    const item = generation?.expectedItem
    assertAnimaImageBatchCapItem(item)
    assert.deepEqual(
      item,
      planFor(fixture).items.find(
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
      'seed.behavior': [item.seedBehavior, opposite(planFor(fixture))],
      'prompt.text': [item.prompts.positive, editedPrompts.positive],
      'negativePrompt.text': [item.prompts.negative, editedPrompts.negative],
      'prompt.embeddings': ['None', 'None'],
      'negativePrompt.embeddings': ['None', 'None'],
    }
    const evidence = {}
    for (const [key, values] of Object.entries(checks)) {
      const status = values[0] === values[1] ? 'Same' : 'Changed',
        row = dialog.locator(`[data-setting="${key}"]`)
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
  assertPreview: cap.assertPreview,
  assertQueuedNotice: cap.assertQueuedNotice,
  afterCompletions: (context) => assertBatchCapConfirmedRefusal(context, 1),
  summaryClaims({ fixture, plan, report }) {
    assert.deepEqual(plan, validateAnimaImageBatchCapFixture(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    assert.equal(report.savedPackage?.acceptedLayers, plan.expectedCompletions)
    assert.equal(report.savedPackage?.sourceLayers, 1)
    assert.equal(report.savedPackage?.totalLayers, plan.expectedCompletions + 1)
    assert.equal(report.savedPackage?.reopened, true)
    assert.equal(report.savedPackage?.lastActualSeedSnapshot, fixture.stage === 'boundary' ? 7 : 5)
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.accepted, true)
      const sampling = generation.provenance.generationConfiguration.sampling
      assert.equal(sampling.actualSeed, plan.items[index].seed)
      assert.equal(sampling.requestedSeedPolicy, 'fixed')
      assert.equal(sampling.seedBehavior, plan.seedBehavior)
    }
    if (fixture.stage === 'boundary') {
      assert.equal(report.refusal33?.unchanged, true)
      for (const phase of ['before', 'after']) {
        assert.equal(report.refusal33[phase].projectCandidateCount, 32)
        assert.equal(report.refusal33[phase].layerCount, 1)
      }
      assert.equal(report.refusal33.ui?.reviewCount, 32)
      assert.equal(report.refusal33.ui?.mainStateObservation?.value?.error?.code, 'BATCH_TOO_LARGE')
    } else {
      for (const generation of report.generations) {
        assert.equal(generation.baseline.reportPath, fixture.baseline.reportPath)
        assert.equal(generation.baseline.reportSha256, fixture.baseline.reportSha256)
        assert.deepEqual(generation.baseline.allowedMetadataDifferences, ['seedBehavior'])
        assert.equal(generation.baseline.beforeExplicitAdd, true)
        assert.equal(generation.baseline.expectedPixelSha256, generation.baseline.actualPixelSha256)
      }
    }
    return {
      mode: fixture.mode,
      installedAnimaImageBatchCapInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      max32InferenceClaim: fixture.stage === 'boundary',
      boundedTruncationClaim: fixture.stage === 'prefix',
      preservedResultsOn33RefusalClaim: fixture.stage === 'boundary',
      installedPerPromptSeedClaim: fixture.stage === 'prefix',
      exactRawPreviewClaim: false,
      compiledPromptPortableClaim: false,
      imageReuseClaim: false,
      randomClaim: false,
      uint32WrapClaim: false,
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      qualityClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron image preview/Generate -> installed worker ->32 or6 temporary candidates; genuine confirmed33 refusal preserves32 plus imported source; public Add/Save/reopen/every owning comparison.',
    preconditions:
      'One worker0.14/Anima-Qwen3-Wan-Myth pool/common PNG, Euler256N3/two updates/CFG4/rescale0/strength.5/Myth-.5/Auto VAE; OUTx64 exactLaMa/normalmixedalpha. No new runtime/model copy/download or product cap change.',
    limits:
      'Four serial IMG/OUT stages: boundary4pairs×8 PI32 plus first3pairs×2 PP6 =76 accepted outputs/four packages/12 own same-input prefix matches/two confirmed33 refusals with0newjobs. Only these exact weighted alternatives/seeds0…7/resources; no broader cap/truncation/method-policy/newinstalledmutation/quality/Invokeparity/fullMVP/release claim.',
  },
})
