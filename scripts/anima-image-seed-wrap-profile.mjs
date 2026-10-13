/** Genuine Anima image hooks with independent standalone MAX/0 controls and public PP wrap. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { animaDynamicImageProfile as image } from './anima-dynamic-image-profile.mjs'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { assertNoobaiLoraStackDescription as assertStackDescription } from './noobai-lora-stack-qualification.mjs'
import { expectedAnimaDynamicImageLoraStack } from './anima-dynamic-image-qualification.mjs'
import {
  assertAnimaImageSeedWrapConfiguration,
  assertAnimaImageSeedWrapControl,
  assertAnimaImageSeedWrapControlBindings,
  assertAnimaImageSeedWrapFrozen,
  assertAnimaImageSeedWrapItem,
  assertAnimaImageSeedWrapMatches,
  literalAnimaImageSeedWrapPlan,
  normalizeAnimaImageSeedWrapInputs,
  resolveAnimaImageSeedWrapPlan,
  validateAnimaImageSeedWrapFixture,
} from './anima-image-seed-wrap-qualification.mjs'

const controlsByFixture = new WeakMap()
const planFor = (fixture) => literalAnimaImageSeedWrapPlan(fixture.stage, fixture.mode)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const metadata = (entry) => ({
  dev: entry.dev,
  ino: entry.ino,
  mode: entry.mode,
  size: entry.size,
  mtimeMs: entry.mtimeMs,
  ctimeMs: entry.ctimeMs,
})
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
/** Numeric0's extra report gets the same bounded canonical SHA-pinned read as the driver. */
export async function readAnimaImageSeedWrapControl(descriptor) {
  const before = await lstat(descriptor.reportPath)
  assert.ok(before.isFile() && !before.isSymbolicLink())
  assert.equal(await realpath(descriptor.reportPath), descriptor.reportPath)
  assert.ok(before.size > 0 && before.size <= 32 * 1024 * 1024)
  const bytes = await readFile(descriptor.reportPath)
  assert.equal(
    digest(bytes),
    descriptor.reportSha256,
    'Numeric0 report SHA must match its frozen descriptor.',
  )
  assert.deepEqual(metadata(await lstat(descriptor.reportPath)), metadata(before))
  return JSON.parse(bytes.toString('utf8'))
}
/** Source/bundle binding is complete and exact: there are no historical harness exceptions. */
export function prepareAnimaImageSeedWrapControls({
  baseline,
  zeroReport,
  fixture,
  plan,
  reference,
}) {
  assert.equal(fixture.stage, 'wrap')
  assert.deepEqual(plan, validateAnimaImageSeedWrapFixture(fixture))
  const max = assertAnimaImageSeedWrapControl(baseline, fixture, 'control-max', reference)
  const zero = assertAnimaImageSeedWrapControl(zeroReport, fixture, 'control-zero', reference)
  assertAnimaImageSeedWrapControlBindings(baseline, zeroReport)
  assert.notEqual(max.queueItemId, zero.queueItemId)
  controlsByFixture.set(fixture, [
    { descriptor: fixture.baseline, generation: max },
    { descriptor: fixture.zeroControl, generation: zero },
  ])
}
export const animaImageSeedWrapProfile = Object.freeze({
  ...image,
  profile: 'anima-image-seed-wrap',
  entrySource: 'scripts/qualify-installed-anima-image-seed-wrap.mjs',
  adapterSource: 'scripts/anima-image-seed-wrap-profile.mjs',
  oracleSource: 'scripts/anima-image-seed-wrap-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...image.sourceDependencies,
      image.adapterSource,
      image.oracleSource,
      seeds.adapterSource,
      seeds.oracleSource,
      ...seeds.sourceDependencies,
      'scripts/noobai-lora-stack-qualification.mjs',
    ]),
  ],
  validateFixture: validateAnimaImageSeedWrapFixture,
  assertFrozen: assertAnimaImageSeedWrapFrozen,
  assertConfiguration: assertAnimaImageSeedWrapConfiguration,
  normalizeNativeInputs: normalizeAnimaImageSeedWrapInputs,
  normalizeExecutionInputs: normalizeAnimaImageSeedWrapInputs,
  normalizeReferenceInputs: normalizeAnimaImageSeedWrapInputs,
  expectedBaselineStage: () => 'control-max',
  baselineMetadataDifferences: () => [],
  baselineSourceChanges: () => [],
  shouldCompareBaseline: ({ expectedItem }) => expectedItem.seed === 4294967295,
  authorSeed: seeds.authorSeed,
  beforeAdmission: seeds.beforeAdmission,
  afterAdmission: seeds.afterAdmission,
  restoreAdmissionObservation: seeds.restoreAdmissionObservation,
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveAnimaImageSeedWrapPlan(plan, admitted),
  }),
  provisionalOnly: () => false,
  completionTimeoutMs: () => 1_600_000,
  qualificationDeadlineSeconds: () => 1800,
  async assertBaseline({ baseline, fixture, plan, reference }) {
    const zeroReport = await readAnimaImageSeedWrapControl(fixture.zeroControl)
    prepareAnimaImageSeedWrapControls({ baseline, zeroReport, fixture, plan, reference })
  },
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: plan.fixedSeed })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-prompt' })
    for (const sign of ['positive', 'negative'])
      assert.deepEqual(draft[`${sign}Prompt`], {
        text: plan.sourcePrompts[sign],
        embeddingRefs: [],
      })
    assert.equal(draft.sampling.animaMethod, 'euler')
    assert.equal(draft.sampling.steps, 3)
    assert.equal(draft.sampling.cfgScale, 4)
    // The unchanged source prepareInput hook establishes and verifies strength after authoring.
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
    assertEdited(currentDraft, reference)
    const item = generation?.expectedItem
    assertAnimaImageSeedWrapItem(item)
    assert.equal(item.stage, fixture.stage)
    assert.equal(item.mode, fixture.mode)
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
  async afterCompletions({ report, fixture, plan }) {
    assert.deepEqual(plan, planFor(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    for (const [index, generation] of report.generations.entries()) {
      assert.equal(digest(await readFile(generation.outputPath)), generation.receipt.image_sha256)
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.accepted, false)
    }
    if (fixture.stage !== 'wrap') return { stage: fixture.stage, standaloneNumericControl: true }
    const controls = controlsByFixture.get(fixture)
    assert.ok(
      controls,
      'Both validated current-source control reports must precede native admission.',
    )
    const matches = assertAnimaImageSeedWrapMatches(report.generations, plan, controls)
    return { stage: 'wrap', standaloneNumericControls: matches, wholeRgbaMatches: matches.length }
  },
  summaryClaims({ fixture, plan, report }) {
    assert.deepEqual(plan, validateAnimaImageSeedWrapFixture(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    assert.equal(report.savedPackage?.acceptedLayers, plan.expectedCompletions)
    assert.equal(report.savedPackage?.sourceLayers, 1)
    assert.equal(report.savedPackage?.totalLayers, plan.expectedCompletions + 1)
    assert.equal(report.savedPackage?.lastActualSeedSnapshot, plan.items.at(-1).seed)
    assert.equal(report.savedPackage?.reopened, true)
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.accepted, true)
      const sampling = generation.provenance.generationConfiguration.sampling
      assert.equal(sampling.actualSeed, plan.items[index].seed)
      assert.equal(sampling.requestedSeedPolicy, 'fixed')
      assert.equal(sampling.seedBehavior, 'per-prompt')
      if (fixture.stage === 'wrap')
        assert.deepEqual(
          generation.baseline,
          report.afterCompletions.standaloneNumericControls[index].control,
          'Each accepted completion retains its own numeric-control binding.',
        )
    }
    return {
      mode: fixture.mode,
      installedAnimaImageSeedWrapInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      installedPerPromptSeedClaim: true,
      uint32WrapClaim: fixture.stage === 'wrap',
      standaloneNumericControlClaim: fixture.stage !== 'wrap',
      imageReuseClaim: false,
      randomClaim: false,
      cap32RefusalClaim: false,
      compiledPromptPortableClaim: false,
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      qualityClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron public FixedMAX/0 one-pair PP Generate -> complete raw/compiled Euler inputs -> installed worker -> temporary image candidates -> explicit Add/Save/reopen/every owning comparison.',
    preconditions:
      'One existing worker0.14/Anima-Qwen3-Wan-Myth pool/common sourcePNG. Euler256N3/two updates/CFG4/strength.5/Myth-.5. OUTx64 exactLaMa/normalmixedalpha; standalone controls retain every executed input.',
    limits:
      'IMG/OUT each standaloneMAX1 + standalone0one + wrap[MAX,0]two =8 accepted completions/six packages/four own same-input wholeRGBA comparisons. No cross-pair1/2 wrap, new entropy/crash/Reuse/cap-refusal/nativefault, scalar/tensor/quality/Invokeparity/fullMVP/release claim.',
  },
})
