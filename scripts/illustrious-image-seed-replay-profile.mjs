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
  imageSeedReplayBaselineSources,
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
    fixture.replaySeed ?? fixture.baseSeed ?? null,
  )
const imageFixture = (fixture) => ({ ...fixture, stage: 'baseline', seedBehavior: 'per-prompt' })
const editedPrompts = {
  positive: 'a (green:1.1) glass bowl, later authoring edit',
  negative: '(grainy:0.8), later authoring edit',
}
const recoveryStage = (fixture) => ['crash', 'reuse'].includes(fixture.stage)
const semanticLayerViews = (layers) =>
  layers.map(({ imageUrl: _image, thumbnailUrl: _thumbnail, ...layer }) => layer)

function assertCrashLayers({ layers, sourceLayers, plan, inputPrecondition }) {
  assert.equal(sourceLayers.length, 1)
  assert.equal(layers.length, 1)
  const source = sourceLayers[0]
  assert.equal(source.generationProvenance, undefined)
  assert.equal(source.visible, true)
  assert.equal(layers[0].id, source.id)
  assert.equal(source.id, inputPrecondition.layerId)
  assert.equal(layers[0].visible, true)
  for (const key of ['transform', 'opacity', 'blendMode'])
    assert.deepEqual(layers[0][key], source[key])
  assert.deepEqual(inputPrecondition.bbox, plan.bbox)
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
  expectedBaselineStage: (fixture) => (recoveryStage(fixture) ? 'replay' : 'random'),
  baselineMetadataDifferences: () => ['requestedSeedPolicy'],
  baselineSourceChanges: (fixture) =>
    recoveryStage(fixture) ? [...imageSeedReplayBaselineSources] : [],
  shouldCompareBaseline: () => true,
  beforeAdmission: seeds.beforeAdmission,
  afterAdmission: seeds.afterAdmission,
  restoreAdmissionObservation: seeds.restoreAdmissionObservation,
  async authorSeed(context) {
    // The shared driver's existing public Reuse button performs the single policy change later.
    // Never author the operational seed as a numeric Fixed value for Reuse.
    if (context.currentPlan.requestedSeedPolicy === 'reuse') return
    return await seeds.authorSeed(context)
  },
  resolveAdmissionPlan({ plan, admitted, baseline, fixture }) {
    if (fixture.stage !== 'random')
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
      value: ['random', 'reuse'].includes(fixture.stage) ? null : currentPlan.fixedSeed,
    })
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: currentPlan.maxPrompts,
      seedBehavior: 'per-prompt',
    })
    for (const polarity of ['positive', 'negative'])
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: currentPlan.sourcePrompts[polarity],
        embeddingRefs: [],
      })
    const canonical = structuredClone(draft)
    canonical.seed = { policy: 'fixed', value: 0 }
    if (fixture.stage === 'crash') {
      canonical.dynamicPrompt.maxPrompts = 4
      const exemplar = literalIllustriousDynamicImagePlan(
        'baseline',
        fixture.objective,
        fixture.mode,
        'per-prompt',
      )
      for (const polarity of ['positive', 'negative'])
        canonical[`${polarity}Prompt`].text = exemplar.sourcePrompts[polarity]
    }
    image.assertAuthored(
      canonical,
      reference,
      imageFixture(fixture),
      literalIllustriousDynamicImagePlan('baseline', fixture.objective, fixture.mode, 'per-prompt'),
    )
  },
  assertEdited: (draft, reference, fixture) =>
    image.assertEdited(draft, reference, imageFixture(fixture)),
  assertCrashLayers,
  async prepareRecoveredInput({
    window,
    expect,
    tab,
    project,
    fixture,
    plan,
    sourceLayers,
    crashSource,
  }) {
    assert.equal(fixture.stage, 'reuse')
    assert.equal(crashSource.stage, 'crash')
    assert.equal(crashSource.literalPlan.baseSeed, plan.baseSeed)
    const input = structuredClone(crashSource.inputPrecondition)
    assert.equal(sourceLayers.length, 1)
    assert.equal(input.layerId, sourceLayers[0].id)
    assert.deepEqual(input.bbox, plan.bbox)
    const current = await tab(project)
    assert.equal(current.layers.length, 2)
    assert.deepEqual(current.primaryBbox, plan.bbox)
    const source = current.layers.find(({ id }) => id === sourceLayers[0].id)
    assert.ok(source)
    assert.equal(source.visible, true)
    for (const key of ['transform', 'opacity', 'blendMode'])
      assert.deepEqual(source[key], sourceLayers[0][key])
    const recovered = current.layers.find(({ id }) => id !== source.id)
    assert.equal(recovered.visible, false)
    // igs-layer is a public Image protocol, intentionally without fetch API support.
    // Decode the current authenticated view exactly as ProjectCanvas loads raster layers.
    const pixels = await window.evaluate(async (imageUrl) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = imageUrl
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Recovered source image has no 2D decoding context.')
      context.drawImage(image, 0, 0)
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
      const sha = await crypto.subtle.digest('SHA-256', rgba)
      return {
        width: canvas.width,
        height: canvas.height,
        pixelSha256: Array.from(new Uint8Array(sha), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join(''),
      }
    }, source.imageUrl)
    assert.equal(pixels.width, 256)
    assert.equal(pixels.height, 256)
    assert.equal(pixels.pixelSha256, fixture.sourceImage.pixelSha256)
    await expect
      .poll(async () => (await tab(project)).generationDraft.sampling.denoisingStrength)
      .toBe(plan.denoisingStrength)
    return input
  },
  async afterAcceptance(ctx) {
    if (ctx.fixture.stage !== 'reuse') return await image.afterAcceptance(ctx)
    const { window, expect, project, tab, sourceLayers, plan, recoveredGeneration } = ctx
    assert.ok(recoveredGeneration)
    assert.equal(recoveredGeneration.expectedItem.stage, 'crash')
    const before = structuredClone((await tab(project)).layers)
    const source = before.find(({ id }) => id === sourceLayers[0].id)
    const recovered = before.find(({ id }) => id === recoveredGeneration.layerId)
    assert.ok(source && recovered)
    assert.equal(source.visible, true)
    assert.equal(recovered.visible, false)
    const generated = before.filter(({ id }) => id !== source.id && id !== recovered.id)
    assert.equal(generated.length, plan.expectedCompletions)
    assert.equal(before.length, 10)
    const initialGeneratedVisibleIds = generated
      .filter(({ visible }) => visible)
      .map(({ id }) => id)
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
    const generatedIds = new Set(generated.map(({ id }) => id))
    assert.deepEqual(
      semanticLayerViews(after),
      semanticLayerViews(
        before.map((layer) => (generatedIds.has(layer.id) ? { ...layer, visible: true } : layer)),
      ),
    )
    return {
      beforeExplicitSave: true,
      initialGeneratedVisibleIds,
      shownLayerIds,
      sourceLayerIds: [source.id],
      recoveredLayerId: recovered.id,
      recoveredLayerHidden: true,
      before,
      after,
    }
  },
  async assertSaved(ctx) {
    if (ctx.fixture.stage !== 'reuse') return await image.assertSaved(ctx)
    assert.equal(ctx.generations.length, 9)
    const saved = ctx.savedPackage.saved
    assert.equal(saved.project.layers.length, 10)
    const recovered = ctx.generations.filter(({ expectedItem }) => expectedItem.stage === 'crash')
    const fresh = ctx.generations.filter(({ expectedItem }) => expectedItem.stage === 'reuse')
    assert.equal(recovered.length, 1)
    assert.equal(fresh.length, 8)
    const layer = saved.project.layers.find(
      ({ generationProvenance }) =>
        generationProvenance?.executionResultContext.queueItemId === recovered[0].queueItemId,
    )
    assert.ok(layer)
    assert.equal(layer.visible, false)
    assertIllustriousImageSeedReplayConfiguration(
      layer.generationProvenance.generationConfiguration,
      recovered[0].expectedItem,
      ctx.reference,
    )
    const bytes = await saved.readMember(layer.asset.path)
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      recovered[0].receipt.image_sha256,
    )
    const pixels = await ctx.decodedImage(`data:image/png;base64,${bytes.toString('base64')}`)
    assert.equal(pixels.dimensions.pixelSha256, recovered[0].dimensions.pixelSha256)
    image.assertOutput({ decoded: pixels, fixture: ctx.fixture })
    // The unchanged composition oracle consumes the real package's visible subset; the hidden
    // recovered ninth result was independently verified above and contributes no preview pixels.
    const visiblePackage = {
      ...saved,
      project: {
        ...saved.project,
        layers: saved.project.layers.filter(({ id }) => id !== layer.id),
      },
    }
    const evidence = await image.assertSaved({
      ...ctx,
      generations: fresh,
      savedPackage: { ...ctx.savedPackage, saved: visiblePackage },
    })
    return {
      ...evidence,
      hiddenRecoveredLayerId: layer.id,
      recoveredQueueItemId: recovered[0].queueItemId,
      acceptedLayers: 9,
      totalLayers: 10,
    }
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
    assert.ok(item.stage === fixture.stage || (fixture.stage === 'reuse' && item.stage === 'crash'))
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
    assert.equal(report.generations.length, plan.expectedCompletions)
    assert.ok(report.generations.every(({ accepted }) => accepted === (fixture.stage !== 'crash')))
    assert.equal(plan.stage, fixture.stage)
    assert.equal(
      plan.baseSeed,
      fixture.stage !== 'random'
        ? (fixture.replaySeed ?? fixture.baseSeed)
        : report.seedAdmissionObservation.calls[0].seed,
    )
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.frozen.context.sampling.requestedSeedPolicy, plan.requestedSeedPolicy)
      assert.equal(generation.frozen.context.sampling.seed, plan.items[index].seed)
      if (fixture.stage !== 'crash') {
        assert.equal(
          generation.provenance.generationConfiguration.sampling.requestedSeedPolicy,
          plan.requestedSeedPolicy,
        )
        assert.equal(
          generation.provenance.generationConfiguration.sampling.actualSeed,
          plan.items[index].seed,
        )
      }
    }
    if (fixture.stage === 'crash') {
      assert.equal(report.outcome, 'crash-confirmed')
      assert.equal(report.crash.rows.length, 3)
      assert.deepEqual(
        report.crash.rows.map(({ status }) => status),
        ['completed', 'running', 'pending'],
      )
      assert.equal(report.crash.physicalExit.confirmed, true)
    }
    if (fixture.stage === 'reuse') {
      assert.equal(report.recovery.lastActualSeed, plan.baseSeed)
      assert.equal(report.recovery.recoveredLayerHidden, true)
      assert.equal(report.savedPackage.acceptedLayers, 9)
      assert.equal(report.savedPackage.sourceLayers, 1)
      assert.equal(report.savedPackage.totalLayers, 10)
      assert.equal(report.savedPackage.reopened, true)
    }
    return {
      objective: fixture.objective,
      mode: fixture.mode,
      installedDynamicImageInferenceClaim: true,
      acceptedSavedReopenedClaim: fixture.stage !== 'crash',
      installedPerPromptSeedClaim: true,
      randomClaim: fixture.stage === 'random',
      randomNumericReplayClaim: fixture.stage === 'replay',
      exactRawPreviewClaim: false,
      imageReuseClaim: fixture.stage === 'reuse',
      imageCrashRecoveryClaim: fixture.stage === 'reuse',
      uint32WrapClaim: false,
      max32InferenceClaim: false,
      fullMvpClaim: false,
    }
  },
  boundary: {
    actual:
      'Built Electron public Random switch/numeric Fixed input/Reuse action and original Main crypto pick; common-source image Generate -> installed worker -> provisional candidates -> scoped crash/Home Recover -> Add/Save/reopen/each owning comparison.',
    preconditions:
      'Exact EPS/V source checkpoints, opaque256 source image, signed Digital Art−0.5, external native VAE FP32, Normal N3 CFG5 strength.5; OUT x64 exact LaMa/policy. No RNG value replacement, download or runtime/model copy.',
    limits:
      'Random/replay retains four pairs×two iterations/per-prompt base+0..7; a recovery cut uses Fixed B first-pair×three admissions/one completion before crash, then Reuse B+0..7 with one hidden recovered layer. Four EPS/V×IMG/OUT scopes44admissions/36completions/8restart cancellations/36accepted/four final Save packages. No deliberate wrap/cap32/Anima, cross-pair prompt causality, trained quality, fullMVP or release claim.',
  },
})
