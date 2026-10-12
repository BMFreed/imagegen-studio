/** Genuine Anima image hooks plus independently bound full-pair per-prompt numeric controls. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { animaDynamicImageProfile as image } from './anima-dynamic-image-profile.mjs'
import { assertNoobaiLoraStackDescription as assertStackDescription } from './noobai-lora-stack-qualification.mjs'
import {
  assertAnimaDynamicImagePerPromptBaseline,
  assertAnimaDynamicImagePerPromptConfiguration,
  assertAnimaDynamicImagePerPromptFrozen,
  assertAnimaDynamicImagePerPromptItem,
  assertAnimaDynamicImagePerPromptPixels,
  expectedAnimaDynamicImageLoraStack,
  literalAnimaDynamicImagePerPromptPlan,
  normalizeAnimaDynamicImagePerPromptNativeInputs,
  normalizeAnimaDynamicImagePerPromptReferenceInputs,
  resolveAnimaDynamicImagePerPromptPlan,
  validateAnimaDynamicImagePerPromptFixture,
} from './anima-dynamic-image-per-prompt-qualification.mjs'

const planFor = (fixture) => literalAnimaDynamicImagePerPromptPlan(fixture.stage, fixture.mode)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const opposite = (plan) => (plan.seedBehavior === 'per-iteration' ? 'per-prompt' : 'per-iteration')
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}
function assertEdited(draft, reference, fixture) {
  const plan = planFor(fixture)
  assert.deepEqual(draft.seed, { policy: 'fixed', value: 37 })
  assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 3, seedBehavior: opposite(plan) })
  for (const sign of ['positive', 'negative'])
    assert.deepEqual(draft[`${sign}Prompt`], { text: editedPrompts[sign], embeddingRefs: [] })
  const stack = structuredClone(expectedAnimaDynamicImageLoraStack(reference))
  stack[0].weight = -0.25
  assert.deepEqual(draft.loras, stack)
  assert.equal(draft.sampling.animaMethod, 'heun')
}

export const animaDynamicImagePerPromptProfile = Object.freeze({
  ...image,
  profile: 'anima-dynamic-image-per-prompt',
  entrySource: 'scripts/qualify-installed-anima-dynamic-image-per-prompt.mjs',
  adapterSource: 'scripts/anima-dynamic-image-per-prompt-profile.mjs',
  oracleSource: 'scripts/anima-dynamic-image-per-prompt-qualification.mjs',
  sourceDependencies: [
    ...new Set([...image.sourceDependencies, image.adapterSource, image.oracleSource]),
  ],
  validateFixture: validateAnimaDynamicImagePerPromptFixture,
  assertFrozen: assertAnimaDynamicImagePerPromptFrozen,
  assertConfiguration: assertAnimaDynamicImagePerPromptConfiguration,
  assertBaseline: assertAnimaDynamicImagePerPromptBaseline,
  normalizeNativeInputs: normalizeAnimaDynamicImagePerPromptNativeInputs,
  normalizeExecutionInputs: normalizeAnimaDynamicImagePerPromptReferenceInputs,
  normalizeReferenceInputs: normalizeAnimaDynamicImagePerPromptReferenceInputs,
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveAnimaDynamicImagePerPromptPlan(plan, admitted),
  }),
  expectedBaselineStage: () => 'numeric-control',
  shouldCompareBaseline: () => true,
  baselineMetadataDifferences: () => ['seedBehavior'],
  baselineSourceChanges: () => [],
  provisionalOnly: () => false,
  completionTimeoutMs: () => 1_600_000,
  qualificationDeadlineSeconds: (fixture) => (fixture.stage === 'numeric-control' ? 2700 : 1800),
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: 0 })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 4, seedBehavior: plan.seedBehavior })
    for (const sign of ['positive', 'negative'])
      assert.deepEqual(draft[`${sign}Prompt`], {
        text: plan.sourcePrompts[sign],
        embeddingRefs: [],
      })
    assert.equal(draft.sampling.animaMethod, 'euler')
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 4)
    // Source import/prepareInput applies and verifies strength after this actual authoring hook.
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
  async afterCompletions({ report, fixture, plan, window }) {
    const decoded = []
    for (const generation of report.generations) {
      const bytes = await readFile(generation.outputPath)
      assert.equal(digest(bytes), generation.receipt.image_sha256)
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
      withinSeedContrasts: assertAnimaDynamicImagePerPromptPixels(decoded, plan),
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      qualityClaim: false,
    }
  },
  async assertComparison({ expect, dialog, generation, currentDraft, reference, fixture }) {
    assertEdited(currentDraft, reference, fixture)
    const item = generation?.expectedItem
    assertAnimaDynamicImagePerPromptItem(item)
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
      if (fixture.stage === 'per-prompt') {
        assert.equal(generation.baseline.reportPath, fixture.baseline.reportPath)
        assert.equal(generation.baseline.reportSha256, fixture.baseline.reportSha256)
        assert.equal(generation.baseline.beforeExplicitAdd, true)
        assert.deepEqual(generation.baseline.allowedMetadataDifferences, ['seedBehavior'])
        assert.equal(generation.baseline.actualPixelSha256, generation.baseline.expectedPixelSha256)
      }
    }
    return {
      mode: fixture.mode,
      installedAnimaDynamicImagePerPromptInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      ownFullInputPerPromptReplayClaim: fixture.stage === 'per-prompt',
      compiledPromptPortableClaim: false,
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      cap32RefusalClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron common-source Generate -> full raw/compiled Euler seed0…7 jobs -> installed worker -> temporary candidates -> all explicit Add/Save/reopen/owning comparisons.',
    preconditions:
      'One existing worker0.14/Anima-Qwen3-Wan-Myth pool/source PNG. Euler256N3/two updates/CFG4/strength.5/Myth-.5/Fixed0; OUTx64 exactLaMa/normalmixedalpha. No copies/downloads/new runtime.',
    limits:
      'Four healthy32/8 stages:80 accepted outputs/fourpackages/16 own full-input controls.64 adjacent within-pair seed contrasts only; no crosspair/scalar/tensor/quality, cap refusal/Random/Reuse/wrap, broad methods/formats/geometry, Invokeparity/fullMVP/release claim.',
  },
})
