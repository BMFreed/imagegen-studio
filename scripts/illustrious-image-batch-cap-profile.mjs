/** Reuse genuine image preparation/Add/Save and shared confirmed cap refusal through DI. */
import assert from 'node:assert/strict'
import {
  generationBatchCapProfile as cap,
  assertBatchCapConfirmedRefusal,
} from './generation-batch-cap-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import { illustriousImageSeedWrapProfile as wrap } from './illustrious-image-seed-wrap-profile.mjs'
import { literalIllustriousDynamicImagePlan } from './illustrious-dynamic-image-qualification.mjs'
import {
  assertIllustriousImageBatchCapBaseline,
  assertIllustriousImageBatchCapConfiguration,
  assertIllustriousImageBatchCapFrozen,
  literalIllustriousImageBatchCapPlan,
  normalizeIllustriousImageBatchCapExecutionInputs,
  normalizeIllustriousImageBatchCapNativeInputs,
  resolveIllustriousImageBatchCapPlan,
  validateIllustriousImageBatchCapFixture,
} from './illustrious-image-batch-cap-qualification.mjs'
const planFor = (fixture) =>
  literalIllustriousImageBatchCapPlan(fixture.stage, fixture.objective, fixture.mode)
const imageFixture = (fixture) => ({
  ...fixture,
  stage: 'baseline',
  seedBehavior: planFor(fixture).seedBehavior,
})
export const illustriousImageBatchCapProfile = Object.freeze({
  ...image,
  profile: 'illustrious-image-batch-cap',
  entrySource: 'scripts/qualify-installed-illustrious-image-batch-cap.mjs',
  adapterSource: 'scripts/illustrious-image-batch-cap-profile.mjs',
  oracleSource: 'scripts/illustrious-image-batch-cap-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...wrap.sourceDependencies,
      wrap.entrySource,
      wrap.adapterSource,
      wrap.oracleSource,
      cap.entrySource,
      cap.adapterSource,
      cap.oracleSource,
    ]),
  ],
  validateFixture: validateIllustriousImageBatchCapFixture,
  assertBaseline: assertIllustriousImageBatchCapBaseline,
  assertFrozen: assertIllustriousImageBatchCapFrozen,
  assertConfiguration: assertIllustriousImageBatchCapConfiguration,
  normalizeNativeInputs: normalizeIllustriousImageBatchCapNativeInputs,
  normalizeExecutionInputs: normalizeIllustriousImageBatchCapExecutionInputs,
  normalizeReferenceInputs: (frozen, { fixture, plan }) =>
    fixture.stage === 'prefix'
      ? normalizeIllustriousImageBatchCapExecutionInputs(frozen, plan)
      : normalizeIllustriousImageBatchCapNativeInputs(frozen),
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveIllustriousImageBatchCapPlan(plan, admitted),
  }),
  expectedBaselineStage: () => 'boundary',
  baselineMetadataDifferences: (fixture) => (fixture.stage === 'prefix' ? ['seedBehavior'] : []),
  baselineSourceChanges: () => [],
  shouldCompareBaseline: () => true,
  completionTimeoutMs: () => 1_600_000,
  qualificationDeadlineSeconds: (fixture) => (fixture.stage === 'boundary' ? 2700 : 1800),
  modelKey: (fixture) => planFor(fixture).modelKey,
  originalSourceKeys: (fixture) => [
    planFor(fixture).modelKey,
    'illustriousLora',
    'externalVaeNative',
  ],
  sampling: (fixture) => image.sampling(imageFixture(fixture)),
  provisionalOnly: () => false,
  authorSeed: cap.authorSeed,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: plan.maxPrompts,
      seedBehavior: plan.seedBehavior,
    })
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [],
      })
    const canonical = structuredClone(draft)
    canonical.dynamicPrompt.maxPrompts = 4
    image.assertAuthored(
      canonical,
      reference,
      imageFixture(fixture),
      literalIllustriousDynamicImagePlan(
        'baseline',
        fixture.objective,
        fixture.mode,
        plan.seedBehavior,
      ),
    )
  },
  assertEdited: (draft, reference, fixture) =>
    image.assertEdited(draft, reference, imageFixture(fixture)),
  assertComparison: (context) =>
    image.assertComparison({ ...context, fixture: imageFixture(context.fixture) }),
  comparisonChanged: (fixture) => image.comparisonChanged(imageFixture(fixture)),
  comparisonSame: (fixture) => image.comparisonSame(imageFixture(fixture)),
  assertPreview: cap.assertPreview,
  assertQueuedNotice: cap.assertQueuedNotice,
  afterCompletions: (context) => assertBatchCapConfirmedRefusal(context, 1),
  summaryClaims({ fixture, plan, report }) {
    assert.deepEqual(plan, planFor(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    assert.ok(report.generations.every(({ accepted }) => accepted === true))
    for (const [index, generation] of report.generations.entries())
      assert.deepEqual(generation.expectedItem, plan.items[index])
    if (fixture.stage === 'boundary') {
      assert.equal(report.refusal33?.unchanged, true)
      assert.equal(report.refusal33.before.projectCandidateCount, 32)
      assert.equal(report.refusal33.before.layerCount, 1)
      assert.equal(report.refusal33.after.projectCandidateCount, 32)
      assert.equal(report.refusal33.after.layerCount, 1)
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
      objective: fixture.objective,
      mode: fixture.mode,
      installedDynamicImageInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      max32InferenceClaim: fixture.stage === 'boundary',
      boundedTruncationClaim: fixture.stage === 'prefix',
      preservedResultsOn33RefusalClaim: fixture.stage === 'boundary',
      installedPerPromptSeedClaim: fixture.stage === 'prefix',
      exactRawPreviewClaim: false,
      imageReuseClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron image preview/Generate -> installed worker ->32 or6 temporary candidates; confirmed33-job refusal preserves32 plus imported source; explicit Add/Save/reopen/every owning comparison.',
    preconditions:
      'Existing worker0.14 exact EPS/V common-source IMG/normal mixed-alpha OUT256×256, Normal N3/two updates/CFG5/rescale0/strength.5/DigitalArt−.5/externalFP32VAE. OUTx64 exactLaMa/policy; no new environment/model copy/download or product cap change.',
    limits:
      'Eight sequential stages: four scopes boundary4pairs×8 Fixed0/per-iteration32 plus first3pairs×2 Fixed0/per-prompt6 =152 accepted outputs/eightpackages,24 same-input prefix matches,four confirmed33refusals/0newjobs. No broader caps/truncation/method-policy/Anima image/quality/fullMVP/release claim.',
  },
})
