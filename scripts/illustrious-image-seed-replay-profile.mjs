/** Source-informed finite image Random/replay adapter; native/durable boundaries remain real. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import {
  literalIllustriousDynamicImagePlan,
  expectedIllustriousDynamicImageLoraStack,
} from './illustrious-dynamic-image-qualification.mjs'
import { assertNoobaiLoraStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertIllustriousImageSeedReplayBaseline,
  assertIllustriousImageSeedReplayConfiguration,
  assertIllustriousImageSeedReplayFrozen,
  assertIllustriousImageSeedReplayPixels,
  literalIllustriousImageSeedReplayPlan,
  normalizeIllustriousImageSeedReplayNativeInputs,
  normalizeIllustriousImageSeedReplayReferenceInputs,
  resolveIllustriousImageSeedReplayPlan,
  validateIllustriousImageSeedReplayFixture,
} from './illustrious-image-seed-replay-qualification.mjs'

const planFor = (fixture) =>
  literalIllustriousImageSeedReplayPlan(
    fixture.stage,
    fixture.objective,
    fixture.mode,
    fixture.replaySeed ?? null,
  )
const imageFixture = (fixture) => ({ ...fixture, stage: 'baseline', seedBehavior: 'per-prompt' })
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}

export const illustriousImageSeedReplayProfile = Object.freeze({
  ...image,
  profile: 'illustrious-image-seed-replay',
  entrySource: 'scripts/qualify-installed-illustrious-image-seed-replay.mjs',
  adapterSource: 'scripts/illustrious-image-seed-replay-profile.mjs',
  oracleSource: 'scripts/illustrious-image-seed-replay-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...image.sourceDependencies,
      image.adapterSource,
      image.oracleSource,
      seeds.adapterSource,
      seeds.oracleSource,
      ...seeds.sourceDependencies,
    ]),
  ],
  validateFixture: validateIllustriousImageSeedReplayFixture,
  assertBaseline: assertIllustriousImageSeedReplayBaseline,
  assertFrozen: assertIllustriousImageSeedReplayFrozen,
  assertConfiguration: assertIllustriousImageSeedReplayConfiguration,
  normalizeNativeInputs: normalizeIllustriousImageSeedReplayNativeInputs,
  normalizeExecutionInputs: normalizeIllustriousImageSeedReplayNativeInputs,
  normalizeReferenceInputs: normalizeIllustriousImageSeedReplayReferenceInputs,
  expectedBaselineStage: () => 'random',
  baselineMetadataDifferences: () => ['requestedSeedPolicy'],
  baselineSourceChanges: () => [],
  shouldCompareBaseline: () => true,
  beforeAdmission: seeds.beforeAdmission,
  afterAdmission: seeds.afterAdmission,
  restoreAdmissionObservation: seeds.restoreAdmissionObservation,
  authorSeed: seeds.authorSeed,
  resolveAdmissionPlan({ plan, admitted, baseline, fixture }) {
    if (fixture.stage === 'replay')
      assertIllustriousImageSeedReplayBaseline({ baseline, fixture, plan })
    const resolved = resolveIllustriousImageSeedReplayPlan(plan, admitted)
    return { plan: resolved, evidence: resolved.randomBaseSource }
  },
  modelKey: (fixture) => planFor(fixture).modelKey,
  originalSourceKeys: (fixture) => [
    planFor(fixture).modelKey,
    'illustriousLora',
    'externalVaeNative',
  ],
  sampling: (fixture) => image.sampling(imageFixture(fixture)),
  provisionalOnly: () => false,
  assertAuthored(draft, reference, fixture, currentPlan) {
    assert.deepEqual(currentPlan, planFor(fixture))
    assert.deepEqual(draft.seed, {
      policy: currentPlan.requestedSeedPolicy,
      value: fixture.stage === 'random' ? null : currentPlan.fixedSeed,
    })
    const canonical = structuredClone(draft)
    canonical.seed = { policy: 'fixed', value: 0 }
    image.assertAuthored(
      canonical,
      reference,
      imageFixture(fixture),
      literalIllustriousDynamicImagePlan('baseline', fixture.objective, fixture.mode, 'per-prompt'),
    )
  },
  assertEdited: (draft, reference, fixture) =>
    image.assertEdited(draft, reference, imageFixture(fixture)),
  async afterCompletions({ report, fixture, plan, window }) {
    const decoded = []
    for (const generation of report.generations) {
      const bytes = await readFile(generation.outputPath)
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        generation.receipt.image_sha256,
      )
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
      withinPairSeedContrasts: assertIllustriousImageSeedReplayPixels(decoded, plan),
    }
  },
  comparisonChanged: (fixture) => [
    ...image
      .comparisonChanged(fixture)
      .filter((key) => !['seed.actual', 'seed.policy'].includes(key)),
  ],
  comparisonSame: (fixture) =>
    image.comparisonSame(fixture).filter((key) => !['seed.actual', 'seed.policy'].includes(key)),
  async assertComparison({ expect, dialog, generation, reference, currentDraft, fixture }) {
    const item = generation.expectedItem
    assert.equal(item.stage, fixture.stage)
    image.assertEdited(currentDraft, reference, imageFixture(fixture))
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
      'seed.policy': [item.requestedSeedPolicy, 'fixed'],
      'seed.behavior': ['per-prompt', 'per-iteration'],
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
    assert.equal(report.generations.length, 8)
    assert.ok(report.generations.every(({ accepted }) => accepted === true))
    assert.equal(plan.stage, fixture.stage)
    assert.equal(
      plan.baseSeed,
      fixture.stage === 'replay'
        ? fixture.replaySeed
        : report.seedAdmissionObservation.calls[0].seed,
    )
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.frozen.context.sampling.requestedSeedPolicy, plan.requestedSeedPolicy)
      assert.equal(generation.frozen.context.sampling.seed, plan.items[index].seed)
      assert.equal(
        generation.provenance.generationConfiguration.sampling.requestedSeedPolicy,
        plan.requestedSeedPolicy,
      )
      assert.equal(
        generation.provenance.generationConfiguration.sampling.actualSeed,
        plan.items[index].seed,
      )
    }
    return {
      objective: fixture.objective,
      mode: fixture.mode,
      installedDynamicImageInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      installedPerPromptSeedClaim: true,
      randomClaim: fixture.stage === 'random',
      randomNumericReplayClaim: fixture.stage === 'replay',
      exactRawPreviewClaim: false,
      imageReuseClaim: false,
      uint32WrapClaim: false,
      max32InferenceClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron public Random switch/numeric Fixed input and original Main crypto pick; common-source image Generate -> installed worker -> provisional candidates -> Add/Save/reopen/each owning comparison.',
    preconditions:
      'Exact EPS/V source checkpoints, opaque256 source image, signed Digital Art−0.5, external native VAE FP32, Normal N3 CFG5 strength.5; OUT x64 exact LaMa/policy. No RNG value replacement, download or runtime/model copy.',
    limits:
      'Four weighted positive/negative pairs×two iterations, per-prompt actual base+offsets0..7; eight Random/replay scopes64jobs/eight Save packages. Same-prompt seed contrasts and wholeRGBA replay only; no cross-pair prompt causality, image Reuse/crash/wrap/cap32/Anima, trained quality, fullMVP or release claim.',
  },
})
