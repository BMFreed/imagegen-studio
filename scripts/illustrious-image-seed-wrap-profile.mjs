/** Finite numeric MAX/0 image controls and public per-prompt uint32 wrap adapter. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import { illustriousImageSeedReplayProfile as replay } from './illustrious-image-seed-replay-profile.mjs'
import { literalIllustriousDynamicImagePlan } from './illustrious-dynamic-image-qualification.mjs'
import {
  assertIllustriousImageSeedWrapConfiguration,
  assertIllustriousImageSeedWrapControl,
  assertIllustriousImageSeedWrapControlBindings,
  assertIllustriousImageSeedWrapFrozen,
  assertIllustriousImageSeedWrapMatches,
  literalIllustriousImageSeedWrapPlan,
  normalizeIllustriousImageSeedWrapInputs,
  resolveIllustriousImageSeedWrapPlan,
  validateIllustriousImageSeedWrapFixture,
} from './illustrious-image-seed-wrap-qualification.mjs'

const controlsByFixture = new WeakMap()
const imageFixture = (fixture) => ({ ...fixture, stage: 'baseline', seedBehavior: 'per-prompt' })
const planFor = (fixture) =>
  literalIllustriousImageSeedWrapPlan(fixture.stage, fixture.objective, fixture.mode)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const metadata = (entry) => ({
  dev: entry.dev,
  ino: entry.ino,
  mode: entry.mode,
  size: entry.size,
  mtimeMs: entry.mtimeMs,
  ctimeMs: entry.ctimeMs,
})

/** An additional control report gets the same bounded, canonical, SHA-pinned read as the driver. */
export async function readIllustriousImageSeedWrapControl(descriptor) {
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

/** Pure prelaunch control guard also provides a focused report-boundary test entry point. */
export function prepareIllustriousImageSeedWrapControls({
  baseline,
  zeroReport,
  fixture,
  plan,
  reference,
}) {
  assert.equal(fixture.stage, 'wrap')
  assert.deepEqual(plan, validateIllustriousImageSeedWrapFixture(fixture))
  const max = assertIllustriousImageSeedWrapControl(baseline, fixture, 'control-max', reference)
  const zero = assertIllustriousImageSeedWrapControl(zeroReport, fixture, 'control-zero', reference)
  assertIllustriousImageSeedWrapControlBindings(baseline, zeroReport)
  assert.notEqual(max.queueItemId, zero.queueItemId)
  controlsByFixture.set(fixture, [
    { descriptor: fixture.baseline, generation: max },
    { descriptor: fixture.zeroControl, generation: zero },
  ])
}

export const illustriousImageSeedWrapProfile = Object.freeze({
  ...image,
  profile: 'illustrious-image-seed-wrap',
  entrySource: 'scripts/qualify-installed-illustrious-image-seed-wrap.mjs',
  adapterSource: 'scripts/illustrious-image-seed-wrap-profile.mjs',
  oracleSource: 'scripts/illustrious-image-seed-wrap-qualification.mjs',
  sourceDependencies: [
    ...new Set([
      ...replay.sourceDependencies,
      replay.entrySource,
      replay.adapterSource,
      replay.oracleSource,
    ]),
  ],
  validateFixture: validateIllustriousImageSeedWrapFixture,
  assertFrozen: assertIllustriousImageSeedWrapFrozen,
  assertConfiguration: assertIllustriousImageSeedWrapConfiguration,
  normalizeNativeInputs: normalizeIllustriousImageSeedWrapInputs,
  normalizeExecutionInputs: normalizeIllustriousImageSeedWrapInputs,
  normalizeReferenceInputs: normalizeIllustriousImageSeedWrapInputs,
  expectedBaselineStage: () => 'control-max',
  baselineMetadataDifferences: () => [],
  baselineSourceChanges: () => [],
  shouldCompareBaseline: ({ expectedItem }) => expectedItem.seed === 4294967295,
  authorSeed: seeds.authorSeed,
  beforeAdmission: seeds.beforeAdmission,
  afterAdmission: seeds.afterAdmission,
  restoreAdmissionObservation: seeds.restoreAdmissionObservation,
  resolveAdmissionPlan: ({ plan, admitted }) => ({
    plan: resolveIllustriousImageSeedWrapPlan(plan, admitted),
  }),
  modelKey: (fixture) => planFor(fixture).modelKey,
  originalSourceKeys: (fixture) => [
    planFor(fixture).modelKey,
    'illustriousLora',
    'externalVaeNative',
  ],
  sampling: (fixture) => image.sampling(imageFixture(fixture)),
  provisionalOnly: () => false,
  async assertBaseline({ baseline, fixture, plan, reference }) {
    const zeroReport = await readIllustriousImageSeedWrapControl(fixture.zeroControl)
    prepareIllustriousImageSeedWrapControls({ baseline, zeroReport, fixture, plan, reference })
  },
  assertAuthored(draft, reference, fixture, plan) {
    assert.deepEqual(plan, planFor(fixture))
    assert.deepEqual(draft.seed, { policy: 'fixed', value: plan.fixedSeed })
    assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-prompt' })
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [],
      })
    const canonical = structuredClone(draft)
    const exemplar = literalIllustriousDynamicImagePlan(
      'baseline',
      fixture.objective,
      fixture.mode,
      'per-prompt',
    )
    canonical.seed.value = 0
    canonical.dynamicPrompt.maxPrompts = 4
    for (const polarity of ['positive', 'negative'])
      canonical[`${polarity}Prompt`].text = exemplar.sourcePrompts[polarity]
    image.assertAuthored(canonical, reference, imageFixture(fixture), exemplar)
  },
  assertEdited: (draft, reference, fixture) =>
    image.assertEdited(draft, reference, imageFixture(fixture)),
  assertComparison: (context) =>
    image.assertComparison({ ...context, fixture: imageFixture(context.fixture) }),
  comparisonChanged: (fixture) => image.comparisonChanged(imageFixture(fixture)),
  comparisonSame: (fixture) => image.comparisonSame(imageFixture(fixture)),
  async afterCompletions({ report, fixture, plan }) {
    assert.equal(report.generations.length, plan.expectedCompletions)
    for (const generation of report.generations) {
      assert.equal(digest(await readFile(generation.outputPath)), generation.receipt.image_sha256)
      assert.deepEqual(generation.expectedItem, plan.items[report.generations.indexOf(generation)])
    }
    if (fixture.stage !== 'wrap') return { stage: fixture.stage, standaloneNumericControl: true }
    const controls = controlsByFixture.get(fixture)
    assert.ok(
      controls,
      'Both validated current-source control reports must precede native admission.',
    )
    const matches = assertIllustriousImageSeedWrapMatches(report.generations, plan, controls)
    return { stage: 'wrap', standaloneNumericControls: matches, wholeRgbaMatches: matches.length }
  },
  summaryClaims({ fixture, plan, report }) {
    assert.deepEqual(plan, planFor(fixture))
    assert.equal(report.generations.length, plan.expectedCompletions)
    assert.ok(report.generations.every(({ accepted }) => accepted === true))
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(
        generation.provenance.generationConfiguration.sampling.actualSeed,
        plan.items[index].seed,
      )
      assert.equal(
        generation.provenance.generationConfiguration.sampling.requestedSeedPolicy,
        'fixed',
      )
      if (fixture.stage === 'wrap') {
        assert.deepEqual(
          generation.baseline,
          report.afterCompletions.standaloneNumericControls[index].control,
          'Each accepted completion retains its own numeric-control binding.',
        )
      }
    }
    return {
      objective: fixture.objective,
      mode: fixture.mode,
      installedDynamicImageInferenceClaim: true,
      acceptedSavedReopenedClaim: true,
      installedPerPromptSeedClaim: true,
      uint32WrapClaim: fixture.stage === 'wrap',
      standaloneNumericControlClaim: fixture.stage !== 'wrap',
      imageReuseClaim: false,
      randomClaim: false,
      max32InferenceClaim: false,
      exactRawPreviewClaim: false,
      crossPairOffsetClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron numeric Fixed MAX/0 and per-prompt one-pair×two Generate -> installed worker -> provisional image candidates -> explicit Add/Save/reopen/each owning comparison.',
    preconditions:
      'Exact EPS/V checkpoints, common opaque256 source, signed DigitalArt−0.5, external native VAE FP32, Normal N3 CFG5 strength.5; OUT x64 exact LaMa/policy. Same executed inputs for both standalone numeric controls.',
    limits:
      'Four EPS/V×IMG/normal mixed-alpha OUT scopes: standaloneMAX1 + standalone0one + wrap[MAX,0]two =16 accepted completions/12packages. No native cross-pair1/2, cap32, Anima image, quality, fullMVP or release claim.',
  },
})
