/** Actual Anima image hooks plus transparent Main entropy observation and own numeric replay. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { animaDynamicImagePerPromptProfile as image } from './anima-dynamic-image-per-prompt-profile.mjs'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { assertNoobaiLoraStackDescription as assertStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertAnimaImageSeedReplayBaseline,
  assertAnimaImageSeedReplayConfiguration,
  assertAnimaImageSeedReplayFrozen,
  assertAnimaImageSeedReplayItem,
  assertAnimaImageSeedReplayPixels,
  assertAnimaImageSeedReplayResolvedPlan,
  expectedAnimaDynamicImageLoraStack,
  literalAnimaImageSeedReplayPlan,
  normalizeAnimaImageSeedReplayNativeInputs,
  normalizeAnimaImageSeedReplayReferenceInputs,
  resolveAnimaImageSeedReplayPlan,
  validateAnimaImageSeedReplayFixture,
} from './anima-image-seed-replay-qualification.mjs'
const planFor = (fixture) =>
  literalAnimaImageSeedReplayPlan(fixture.stage, fixture.mode, fixture.replaySeed ?? null)
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}
function assertEdited(draft, reference) {
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 3, seedBehavior: 'per-iteration' })
  for (const sign of ['positive', 'negative'])
    assert.deepEqual(draft[`${sign}Prompt`], { text: editedPrompts[sign], embeddingRefs: [] })
  const stack = structuredClone(expectedAnimaDynamicImageLoraStack(reference))
  stack[0].weight = -0.25
  assert.deepEqual(draft.loras, stack)
  assert.equal(draft.sampling.animaMethod, 'heun')
}
export const animaImageSeedReplayProfile = Object.freeze({
  ...image,
  profile: 'anima-image-seed-replay',
  entrySource: 'scripts/qualify-installed-anima-image-seed-replay.mjs',
  adapterSource: 'scripts/anima-image-seed-replay-profile.mjs',
  oracleSource: 'scripts/anima-image-seed-replay-qualification.mjs',
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
  validateFixture: validateAnimaImageSeedReplayFixture,
  assertFrozen: assertAnimaImageSeedReplayFrozen,
  assertConfiguration: assertAnimaImageSeedReplayConfiguration,
  assertBaseline: assertAnimaImageSeedReplayBaseline,
  normalizeNativeInputs: normalizeAnimaImageSeedReplayNativeInputs,
  normalizeExecutionInputs: normalizeAnimaImageSeedReplayNativeInputs,
  normalizeReferenceInputs: normalizeAnimaImageSeedReplayReferenceInputs,
  expectedBaselineStage: () => 'random',
  baselineMetadataDifferences: () => ['requestedSeedPolicy'],
  baselineSourceChanges: () => [],
  shouldCompareBaseline: () => true,
  beforeAdmission: seeds.beforeAdmission,
  afterAdmission: seeds.afterAdmission,
  restoreAdmissionObservation: seeds.restoreAdmissionObservation,
  authorSeed: seeds.authorSeed,
  resolveAdmissionPlan({ plan, admitted }) {
    // Full baseline validation already ran before public Generate in the shared driver.
    const resolved = resolveAnimaImageSeedReplayPlan(plan, admitted)
    return { plan: resolved, evidence: resolved.randomBaseSource }
  },
  provisionalOnly: () => false,
  completionTimeoutMs: () => 1_600_000,
  qualificationDeadlineSeconds: () => 1800,
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, {
      policy: plan.requestedSeedPolicy,
      value: fixture.stage === 'random' ? null : plan.fixedSeed,
    })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 4, seedBehavior: 'per-prompt' })
    for (const sign of ['positive', 'negative'])
      assert.deepEqual(draft[`${sign}Prompt`], {
        text: plan.sourcePrompts[sign],
        embeddingRefs: [],
      })
    assert.equal(draft.sampling.animaMethod, 'euler')
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 4)
    // prepareInput imports the actual source and establishes strength after this authoring hook.
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
  comparisonChanged: (fixture) =>
    image.comparisonChanged(fixture).filter((key) => !['seed.actual', 'seed.policy'].includes(key)),
  comparisonSame: (fixture) =>
    image.comparisonSame(fixture).filter((key) => !['seed.actual', 'seed.policy'].includes(key)),
  async assertComparison({ expect, dialog, generation, currentDraft, reference, fixture }) {
    assertEdited(currentDraft, reference)
    const item = generation?.expectedItem
    assertAnimaImageSeedReplayItem(item)
    assert.equal(item.stage, fixture.stage)
    assert.equal(item.mode, fixture.mode)
    if (fixture.stage === 'replay') assert.equal(item.baseSeed, fixture.replaySeed)
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
      'seed.policy': [item.requestedSeedPolicy, 'fixed'],
      'seed.behavior': ['per-prompt', 'per-iteration'],
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
  async afterCompletions({ report, fixture, plan, window }) {
    const decoded = []
    for (const generation of report.generations) {
      const bytes = await readFile(generation.outputPath)
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        generation.receipt.image_sha256,
      )
      const rgba = await window.evaluate(async (base64) => {
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
      decoded.push({ ...generation, rgba })
    }
    return {
      stage: fixture.stage,
      withinSeedContrasts: assertAnimaImageSeedReplayPixels(decoded, plan),
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      qualityClaim: false,
    }
  },
  summaryClaims({ fixture, plan, report }) {
    assertAnimaImageSeedReplayResolvedPlan(plan)
    const declared = validateAnimaImageSeedReplayFixture(fixture)
    assert.equal(plan.stage, declared.stage)
    assert.equal(plan.mode, declared.mode)
    if (fixture.stage === 'replay') assert.deepEqual(plan, declared)
    else {
      assert.equal(declared.baseSeed, null)
      assert.equal(declared.fixedSeed, null)
      assert.equal(plan.fixedSeed, null)
    }
    assert.equal(report.generations.length, 8)
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.accepted, true)
      if (fixture.stage === 'replay') {
        assert.equal(generation.baseline.reportPath, fixture.baseline.reportPath)
        assert.equal(generation.baseline.reportSha256, fixture.baseline.reportSha256)
        assert.equal(generation.baseline.beforeExplicitAdd, true)
        assert.deepEqual(generation.baseline.allowedMetadataDifferences, ['requestedSeedPolicy'])
        assert.equal(generation.baseline.actualPixelSha256, generation.baseline.expectedPixelSha256)
      }
    }
    return {
      mode: fixture.mode,
      installedAnimaImageSeedReplayInferenceClaim: true,
      randomClaim: fixture.stage === 'random',
      randomNumericReplayClaim: fixture.stage === 'replay',
      acceptedSavedReopenedClaim: true,
      ownFullInputNumericReplayClaim: fixture.stage === 'replay',
      compiledPromptPortableClaim: false,
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      cap32RefusalClaim: false,
      uint32WrapClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron public Random/Fixed/Generate -> transparent original Main crypto observation -> full raw/compiled arbitraryuint32 Euler image jobs -> installed worker -> Add/Save/reopen/all owning comparisons.',
    preconditions:
      'One existing worker0.14/Anima-Qwen3-Wan-Myth pool/common PNG. Euler256N3/two updates/CFG4/strength.5/Myth-.5, per-prompt four weighted pairs×two. OUTx64 exactLaMa/normalmixedalpha. No new copies/downloads/runtime.',
    limits:
      'Four healthy8-output stages32 accepted/four9-layerpackages/16 own same-input RGBA replays/16 within-pair seedcontrasts/two originalMain picks. No entropy substitution/distribution, forcedwrap/crash/Reuse/cap refusal/newnativefault, scalar/tensor/quality/Invokeparity/fullMVP/release claim.',
  },
})
