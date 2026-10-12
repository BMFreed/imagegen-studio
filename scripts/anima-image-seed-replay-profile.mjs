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
  animaImageSeedReplayBaselineSources,
  expectedAnimaDynamicImageLoraStack,
  literalAnimaImageSeedReplayPlan,
  normalizeAnimaImageSeedReplayNativeInputs,
  normalizeAnimaImageSeedReplayReferenceInputs,
  resolveAnimaImageSeedReplayPlan,
  validateAnimaImageSeedReplayFixture,
} from './anima-image-seed-replay-qualification.mjs'
const planFor = (fixture) =>
  literalAnimaImageSeedReplayPlan(
    fixture.stage,
    fixture.mode,
    fixture.replaySeed ?? fixture.baseSeed ?? null,
  )
const recoveryStage = (fixture) => ['crash', 'reuse'].includes(fixture.stage)
const semanticLayers = (layers) =>
  layers.map(({ imageUrl: _image, thumbnailUrl: _thumbnail, ...layer }) => layer)
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
function assertCrashLayers({ layers, sourceLayers, plan, inputPrecondition }) {
  assert.equal(sourceLayers.length, 1)
  assert.equal(layers.length, 1)
  const source = sourceLayers[0]
  assert.equal(source.kind, 'raster')
  assert.equal(source.generationProvenance, undefined)
  assert.equal(source.id, inputPrecondition.layerId)
  assert.equal(source.visible, true)
  const view = layers[0]
  // The UI DTO exposes pixel dimensions/URL; portable raster metadata owns asset/kind/ICC.
  for (const key of ['id', 'name', 'locked', 'visible', 'transform', 'opacity', 'blendMode'])
    assert.deepEqual(view[key], source[key])
  assert.equal(view.width, source.asset.width)
  assert.equal(view.height, source.asset.height)
  assert.deepEqual(inputPrecondition.bbox, plan.bbox)
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
  expectedBaselineStage: (fixture) => (recoveryStage(fixture) ? 'replay' : 'random'),
  baselineMetadataDifferences: () => ['requestedSeedPolicy'],
  baselineSourceChanges: (fixture) =>
    recoveryStage(fixture) ? [...animaImageSeedReplayBaselineSources] : [],
  shouldCompareBaseline: () => true,
  beforeAdmission: seeds.beforeAdmission,
  afterAdmission: seeds.afterAdmission,
  restoreAdmissionObservation: seeds.restoreAdmissionObservation,
  async authorSeed(context) {
    // The shared driver alone invokes the genuine public Reuse button after other authoring.
    if (context.currentPlan.requestedSeedPolicy === 'reuse') return
    return await seeds.authorSeed(context)
  },
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
    assert.deepEqual(draft.dynamicPrompt, {
      maxPrompts: plan.maxPrompts,
      seedBehavior: 'per-prompt',
    })
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
      const hash = await crypto.subtle.digest(
        'SHA-256',
        context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data,
      )
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        pixelSha256: Array.from(new Uint8Array(hash), (byte) =>
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
    assert.equal(recoveredGeneration?.expectedItem.stage, 'crash')
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
    const after = structuredClone((await tab(project)).layers),
      ids = new Set(generated.map(({ id }) => id))
    assert.deepEqual(
      semanticLayers(after),
      semanticLayers(
        before.map((layer) => (ids.has(layer.id) ? { ...layer, visible: true } : layer)),
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
    assert.equal(layer.generationProvenance.kind, `anima-${ctx.fixture.mode}`)
    assertAnimaImageSeedReplayConfiguration(
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
  comparisonChanged: (fixture) =>
    image.comparisonChanged(fixture).filter((key) => !['seed.actual', 'seed.policy'].includes(key)),
  comparisonSame: (fixture) =>
    image.comparisonSame(fixture).filter((key) => !['seed.actual', 'seed.policy'].includes(key)),
  async assertComparison({ expect, dialog, generation, currentDraft, reference, fixture }) {
    assertEdited(currentDraft, reference)
    const item = generation?.expectedItem
    assertAnimaImageSeedReplayItem(item)
    assert.ok(item.stage === fixture.stage || (fixture.stage === 'reuse' && item.stage === 'crash'))
    assert.equal(item.mode, fixture.mode)
    if (fixture.stage === 'replay') assert.equal(item.baseSeed, fixture.replaySeed)
    if (recoveryStage(fixture)) assert.equal(item.baseSeed, fixture.baseSeed)
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
    if (fixture.stage !== 'random') assert.deepEqual(plan, declared)
    else {
      assert.equal(declared.baseSeed, null)
      assert.equal(declared.fixedSeed, null)
      assert.equal(plan.fixedSeed, null)
    }
    assert.equal(report.generations.length, plan.expectedCompletions)
    for (const [index, generation] of report.generations.entries()) {
      assert.deepEqual(generation.expectedItem, plan.items[index])
      assert.equal(generation.accepted, fixture.stage !== 'crash')
      if (fixture.stage !== 'random') {
        assert.equal(generation.baseline.reportPath, fixture.baseline.reportPath)
        assert.equal(generation.baseline.reportSha256, fixture.baseline.reportSha256)
        assert.equal(generation.baseline.beforeExplicitAdd, true)
        assert.deepEqual(generation.baseline.allowedMetadataDifferences, ['requestedSeedPolicy'])
        assert.equal(generation.baseline.actualPixelSha256, generation.baseline.expectedPixelSha256)
      }
    }
    if (fixture.stage === 'crash') {
      assert.equal(report.outcome, 'crash-confirmed')
      assert.deepEqual(
        report.crash.rows.map(({ status }) => status),
        ['completed', 'running', 'pending'],
      )
      assert.equal(report.crash.physicalExit.confirmed, true)
      assert.equal(report.crash.savedSnapshot, null)
    }
    if (fixture.stage === 'reuse') {
      assert.equal(report.recovery.lastActualSeed, plan.baseSeed)
      assert.equal(report.recovery.recoveredLayerHidden, true)
      assert.equal(report.recovery.portableSnapshot, null)
      assert.equal(report.savedPackage.acceptedLayers, 9)
      assert.equal(report.savedPackage.sourceLayers, 1)
      assert.equal(report.savedPackage.totalLayers, 10)
      assert.equal(report.savedPackage.lastActualSeedSnapshot, plan.items.at(-1).seed)
      assert.equal(report.savedPackage.reopened, true)
    }
    return {
      mode: fixture.mode,
      installedAnimaImageSeedReplayInferenceClaim: true,
      randomClaim: fixture.stage === 'random',
      randomNumericReplayClaim: fixture.stage === 'replay',
      acceptedSavedReopenedClaim: fixture.stage !== 'crash',
      ownFullInputNumericReplayClaim: ['replay', 'reuse'].includes(fixture.stage),
      compiledPromptPortableClaim: false,
      scalarWeightCausalityClaim: false,
      tensorDirectionClaim: false,
      cap32RefusalClaim: false,
      uint32WrapClaim: false,
      fullMvpClaim: false,
      ...(recoveryStage(fixture) ? { crashRecoveredReuseClaim: fixture.stage === 'reuse' } : {}),
    }
  },
  boundary: {
    actual:
      'Built Electron public Random/Fixed/Generate -> transparent original Main crypto observation -> full raw/compiled arbitraryuint32 Euler image jobs -> installed worker -> Add/Save/reopen/all owning comparisons.',
    preconditions:
      'One existing worker0.14/Anima-Qwen3-Wan-Myth pool/common PNG. Euler256N3/two updates/CFG4/strength.5/Myth-.5, per-prompt four weighted pairs×two. OUTx64 exactLaMa/normalmixedalpha. No new copies/downloads/runtime.',
    limits:
      'Declared finite Random/Fixed or Fixed first-pair3 crash/local HomeRecover/hidden Add/publicReuse8 image stages. Previous Random32/4/16 counts remain historical. No entropy substitution/distribution, manifest-first recovery/snapshot fallback/deliberatewrap/cap refusal/newnativefault, scalar/tensor/quality/Invokeparity/fullMVP/release claim.',
  },
})
