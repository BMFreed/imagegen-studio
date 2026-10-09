/** Real profile mechanics with lightweight adapters; these are not installed UI/ML evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { generationBatchCapProfile as profile } from './generation-batch-cap-profile.mjs'
import {
  assertBatchCapConfiguration,
  assertBatchCapFrozen,
  literalBatchCapPlan,
  normalizeBatchCapExecutionInputs,
  normalizeBatchCapNativeInputs,
  validateBatchCapFixture,
} from './generation-batch-cap-qualification.mjs'
import { generationSeedBoundaryProfile as familyChoices } from './generation-seed-boundary-profile.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/cap-profile-mechanics')
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'

function fixture(objective = 'epsilon', stage = 'boundary') {
  return {
    schemaVersion: 1,
    profile: 'generation-batch-cap',
    objective,
    stage,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, 'output'),
    ...(stage === 'prefix'
      ? { baseline: { reportPath: path.join(root, 'healthy.json'), reportSha256: 'c'.repeat(64) } }
      : {}),
  }
}

function expect(target) {
  return {
    async toHaveCount(value) {
      assert.equal(target.count, value)
    },
    async toHaveText(value) {
      assert.equal(await target.innerText(), value)
    },
    async toContainText(value) {
      assert.ok((await target.innerText()).includes(value))
    },
    async toBeVisible() {
      assert.equal(target.visible, true)
    },
    async toBeHidden() {
      assert.equal(target.visible, false)
    },
    async toBeEnabled() {
      assert.equal(target.enabled, true)
    },
  }
}
expect.poll = (read) => ({
  async toEqual(value) {
    assert.deepEqual(await read(), value)
  },
})

const textNode = (text) => ({
  async innerText() {
    return text
  },
})

test('cap profile binds the independent oracle and the existing exact family/resource adapters', () => {
  assert.equal(profile.validateFixture, validateBatchCapFixture)
  assert.equal(profile.assertFrozen, assertBatchCapFrozen)
  assert.equal(profile.assertConfiguration, assertBatchCapConfiguration)
  assert.equal(profile.normalizeNativeInputs, normalizeBatchCapNativeInputs)
  assert.equal(profile.normalizeExecutionInputs, normalizeBatchCapExecutionInputs)
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/generation-seed-boundary-profile.mjs',
    'scripts/generation-seed-boundary-qualification.mjs',
    ...familyChoices.sourceDependencies,
  ])
  for (const method of [
    'modelKey',
    'loraKey',
    'originalSourceKeys',
    'operation',
    'cfgScale',
    'sampling',
    'authorComponents',
    'authorSeed',
    'assertAuthored',
    'comparisonChanged',
    'comparisonSame',
    'assertComparison',
  ])
    assert.equal(profile[method], familyChoices[method])
  for (const objective of ['anima', 'epsilon', 'v_prediction']) {
    for (const stage of ['boundary', 'prefix']) {
      const input = fixture(objective, stage)
      const plan = profile.validateFixture(input)
      assert.equal(plan.items.length, stage === 'boundary' ? 32 : 6)
      assert.deepEqual(
        plan.boundaryBaselineIndices,
        stage === 'prefix' ? [0, 1, 10, 11, 20, 21] : null,
      )
      assert.equal(profile.completionTimeoutMs(input), 1_600_000)
      assert.equal(profile.expectedBaselineStage(input), 'boundary')
      assert.deepEqual(
        profile.baselineMetadataDifferences(input),
        stage === 'prefix' ? ['seedBehavior'] : [],
      )
      assert.equal(profile.comparisonChanged(input).includes('seed.actual'), false)
    }
  }
  assert.equal(profile.beforeAdmission, undefined, 'Fixed0 does not install a Random observer.')
  assert.equal(
    profile.resolveAdmissionPlan,
    undefined,
    'The full literal plan is known before admission.',
  )
})

test('prefix reference matching omits only behavior while retaining Fixed policy and every native input', () => {
  const frozen = {
    kind: 'illustrious-txt2img',
    context: {
      documentId: 'boundary-document',
      documentRevision: 9,
      sampling: { seed: 3, requestedSeedPolicy: 'fixed', seedBehavior: 'per-iteration' },
    },
    workerJob: { sampling: { seed: 3 }, prompt: red, file: { sha256: 'd'.repeat(64) } },
  }
  const original = structuredClone(frozen)
  const prefix = fixture('epsilon', 'prefix')
  const projected = profile.normalizeReferenceInputs(frozen, {
    fixture: prefix,
    plan: profile.validateFixture(prefix),
  })
  assert.deepEqual(projected.context.sampling, { seed: 3, requestedSeedPolicy: 'fixed' })
  assert.deepEqual(projected.workerJob, frozen.workerJob)
  assert.deepEqual(frozen, original)
  const boundary = fixture()
  assert.deepEqual(
    profile.normalizeReferenceInputs(frozen, {
      fixture: boundary,
      plan: profile.validateFixture(boundary),
    }).context.sampling,
    frozen.context.sampling,
  )
  assert.throws(() =>
    profile.normalizeReferenceInputs(
      {
        ...frozen,
        context: {
          ...frozen.context,
          sampling: { ...frozen.context.sampling, requestedSeedPolicy: 'random' },
        },
      },
      { fixture: prefix, plan: profile.validateFixture(prefix) },
    ),
  )
})

function previewAdapter(rows, { truncated = false, summaryCount = rows.length } = {}) {
  const summary = `${summaryCount} concrete prompt ${summaryCount === 1 ? 'pair' : 'pairs'}\n${summaryCount} jobs · 1 iteration · limit 32`
  const articles = {
    count: rows.length,
    nth(index) {
      const row = rows[index]
      return {
        locator(selector) {
          const values = {
            '.pair-number': String(index + 1),
            '.pair-positive': row[0],
            '.pair-negative': row[1],
          }
          assert.ok(Object.hasOwn(values, selector))
          return textNode(values[selector])
        },
      }
    },
  }
  return {
    async innerText() {
      return truncated
        ? `Showing the first ${rows.length} prompt pairs. Later alternatives are omitted.`
        : ''
    },
    getByRole(role, options) {
      assert.equal(role, 'region')
      assert.deepEqual(options, { name: 'Expanded prompt pairs', exact: true })
      return {
        locator(selector) {
          assert.equal(selector, 'article')
          return articles
        },
      }
    },
    getByText(text, options) {
      assert.equal(text, 'Preview truncated at the configured maximum')
      assert.deepEqual(options, { exact: true })
      return { count: truncated ? 1 : 0 }
    },
    locator(selector) {
      assert.equal(selector, '.preview-summary')
      return textNode(summary)
    },
  }
}

async function checkPreview(stage, rows, options = {}, purpose = 'authored') {
  const plan = literalBatchCapPlan(stage, 'epsilon')
  return await profile.assertPreview({
    expect,
    dialog: previewAdapter(rows, options),
    plan,
    purpose,
    maxPrompts: purpose === 'refusal' ? 1 : plan.maxPrompts,
    seedBehavior: plan.seedBehavior,
    observationIndex: 2,
    async screenshot(filename) {
      return { path: filename }
    },
  })
}

test('actual preview adapter checks one iteration and authored pair order separately from 32/6 admissions', async () => {
  const boundary = await checkPreview('boundary', [
    [red, blurry],
    [red, noisy],
    [blue, blurry],
    [blue, noisy],
  ])
  assert.equal(boundary.oneIteration, true)
  assert.equal(boundary.observedPairs.length, 4)
  assert.equal(boundary.truncated, false)
  assert.deepEqual(boundary.screenshot, { path: 'dynamic-preview-authored-2.png' })
  const prefix = await checkPreview(
    'prefix',
    [
      [red, blurry],
      [red, noisy],
      [blue, blurry],
    ],
    { truncated: true },
  )
  assert.equal(prefix.observedPairs.length, 3)
  assert.equal(prefix.truncated, true)
  const refused = await checkPreview('boundary', [[red, blurry]], { truncated: true }, 'refusal')
  assert.equal(refused.observedPairs.length, 1)
  assert.ok(refused.observedSummary.includes('1 jobs · 1 iteration · limit 32'))
  assert.equal(await profile.assertPreview({ purpose: 'edited' }), undefined)
})

test('preview checks reject wrong pair order, missing truncation and an inflated iteration count', async () => {
  await assert.rejects(
    checkPreview('boundary', [
      [blue, blurry],
      [red, noisy],
      [red, blurry],
      [blue, noisy],
    ]),
  )
  await assert.rejects(
    checkPreview('prefix', [
      [red, blurry],
      [red, noisy],
      [blue, blurry],
    ]),
  )
  await assert.rejects(
    checkPreview(
      'prefix',
      [
        [red, blurry],
        [red, noisy],
        [blue, blurry],
      ],
      { truncated: true, summaryCount: 6 },
    ),
  )
  await assert.rejects(
    checkPreview(
      'boundary',
      [
        [red, blurry],
        [red, noisy],
        [blue, blurry],
        [blue, noisy],
      ],
      { truncated: true },
    ),
  )
})

test('actual queued notice adapter requires only the selected-prefix warning', async () => {
  const message = 'Max prompts limited the concrete prompts in this batch.'
  function context(stage, count, visible = true) {
    return {
      expect,
      plan: literalBatchCapPlan(stage, 'epsilon'),
      window: {
        getByText(text, options) {
          assert.equal(text, message)
          assert.deepEqual(options, { exact: true })
          return { count, visible, ...textNode(message) }
        },
      },
    }
  }
  assert.deepEqual(await profile.assertQueuedNotice(context('boundary', 0)), {
    truncated: false,
    observedNotice: null,
  })
  assert.deepEqual(await profile.assertQueuedNotice(context('prefix', 1)), {
    truncated: true,
    observedNotice: message,
  })
  await assert.rejects(profile.assertQueuedNotice(context('prefix', 0)))
  await assert.rejects(profile.assertQueuedNotice(context('prefix', 1, false)))
  await assert.rejects(profile.assertQueuedNotice(context('boundary', 1)))
})

function refusalAdapter({
  reviewCount = 32,
  errorCode = 'BATCH_TOO_LARGE',
  alterAfter = false,
} = {}) {
  const events = []
  const draft = {
    seed: { policy: 'fixed', value: 37 },
    dynamicPrompt: { maxPrompts: 3, seedBehavior: 'per-prompt' },
    positivePrompt: { text: 'later edit' },
    negativePrompt: { text: 'later edit' },
    loras: [{ weight: -0.25 }],
    sampling: { sampler: 'dpmpp_2m' },
  }
  const state = {
    phase: 'idle',
    error: { code: errorCode },
    runningJobId: null,
    jobs: [],
  }
  const dialog = {
    visible: false,
    async innerText() {
      return `${reviewCount} temporary results will be replaced.`
    },
    getByRole(role, options) {
      assert.equal(role, 'button')
      assert.equal(options.exact, true)
      return {
        async click() {
          events.push(options.name)
          if (options.name === 'Discard and Generate') error.visible = true
          else {
            assert.equal(options.name, 'Keep results')
            dialog.visible = false
          }
        },
      }
    },
    locator(selector) {
      assert.equal(selector, '.dialog-error')
      return error
    },
  }
  const error = {
    visible: false,
    ...textNode('The planned jobs exceed the supplied batch admission limit.'),
  }
  const context = {
    expect,
    fixture: fixture(),
    plan: literalBatchCapPlan('boundary', 'epsilon'),
    project: { id: 'mechanical-project' },
    report: {},
    window: {
      getByRole(role, options) {
        assert.equal(options.exact, true)
        if (role === 'textbox')
          return {
            async fill(value) {
              assert.ok(['Positive prompt', 'Negative prompt'].includes(options.name))
              draft[options.name === 'Positive prompt' ? 'positivePrompt' : 'negativePrompt'].text =
                value
              events.push(options.name)
            },
          }
        if (role === 'dialog') {
          assert.equal(options.name, 'Replace temporary generation results')
          return dialog
        }
        assert.equal(role, 'button')
        assert.equal(options.name, 'Generate')
        return {
          enabled: true,
          async click() {
            events.push('Generate')
            dialog.visible = true
          },
        }
      },
    },
    async api(method, id) {
      assert.equal(method, 'getGenerationState')
      assert.equal(id, 'mechanical-project')
      assert.equal(error.visible, true, 'Observe typed state after the actual UI error signal.')
      events.push(method)
      return structuredClone(state)
    },
    async tab() {
      return { generationDraft: structuredClone(draft) }
    },
    async setInput(label, value) {
      events.push([label, value])
      if (label === 'Generation seed') draft.seed.value = value
      else {
        assert.equal(label, 'Images per click')
        assert.equal(value, 33)
      }
    },
    async setDynamic(project, maximum, behavior, options) {
      assert.equal(project.id, 'mechanical-project')
      assert.equal(maximum, 1)
      assert.equal(options.purpose, 'refusal')
      assert.equal(options.currentPlan.iterations, 33)
      draft.dynamicPrompt = { maxPrompts: maximum, seedBehavior: behavior }
      events.push('setDynamic')
    },
    async save() {
      events.push('Save')
    },
    async runtimeUsers() {
      events.push('physical-runtime-idle')
      return []
    },
    async captureAdmissionEffects(project, label) {
      assert.equal(project.id, 'mechanical-project')
      events.push(label)
      const candidates = Array.from({ length: 32 }, (_, index) => ({
        candidateId: `candidate-${index}`,
      }))
      return {
        effects: {
          tab: { generationDraft: structuredClone(draft), layers: [] },
          results: { candidates, lastActualSeed: 7 },
          tableRows: {
            generation_queue_item: [
              {
                id: 'old-real-row',
                state: label === 'after-ui-refusal' && alterAfter ? 'canceled' : 'completed',
              },
            ],
          },
          portable: { sha256: 'opaque-saved-package' },
          privateTrees: [{ sha256: 'opaque-staging-proof' }],
        },
        proof: { path: label, projectCandidateCount: 32, layerCount: 0 },
      }
    },
    assertAdmissionEffectsUnchanged(before, after) {
      events.push('assertAdmissionEffectsUnchanged')
      assert.deepEqual(after.effects, before.effects)
    },
    async screenshot(filename) {
      events.push('screenshot')
      return { path: filename }
    },
    async checkpoint() {
      events.push(['checkpoint', structuredClone(context.report)])
    },
  }
  return { context, events, state, draft }
}

test('actual refusal hook snapshots after authored Save and checks confirmed33 against preserved32', async () => {
  const { context, events, draft } = refusalAdapter()
  const evidence = await profile.afterCompletions(context)
  assert.equal(evidence, context.report.refusal33)
  assert.equal(evidence.unchanged, true)
  assert.deepEqual(evidence.uiRequest.generationDraft.seed, { policy: 'fixed', value: 0 })
  assert.deepEqual(evidence.uiRequest.generationDraft.loras, [{ weight: -0.25 }])
  assert.deepEqual(evidence.uiRequest.generationDraft.sampling, { sampler: 'dpmpp_2m' })
  assert.deepEqual(draft.dynamicPrompt, { maxPrompts: 1, seedBehavior: 'per-iteration' })
  assert.equal(evidence.ui.reviewCount, 32)
  assert.equal(evidence.reviewedCandidateIds.length, 32)
  assert.equal(evidence.ui.mainStateObservation.value.error.code, 'BATCH_TOO_LARGE')
  assert.match(evidence.ui.mainStateObservation.provenance, /not its Generate response/)
  assert.ok(events.indexOf('Save') < events.indexOf('before-ui-refusal'))
  assert.ok(events.indexOf('before-ui-refusal') < events.indexOf('Generate'))
  assert.ok(events.indexOf('Discard and Generate') < events.indexOf('getGenerationState'))
  assert.ok(events.indexOf('after-ui-refusal') < events.indexOf('assertAdmissionEffectsUnchanged'))
  assert.equal(events.at(-1), 'Keep results')
  assert.equal(events.filter((event) => event === 'Generate').length, 1)
  assert.ok(
    events.some(
      (event) =>
        Array.isArray(event) &&
        event[0] === 'checkpoint' &&
        event[1].refusal33?.after &&
        !event[1].refusal33.unchanged,
    ),
  )
})

test('refusal hook rejects a wrong reviewed count before confirming a destructive action', async () => {
  const { context, events } = refusalAdapter({ reviewCount: 31 })
  await assert.rejects(profile.afterCompletions(context))
  assert.equal(context.report.refusal33.ui.reviewCount, 31)
  assert.equal(events.includes('Discard and Generate'), false)
})

test('refusal hook retains the observed UI/code witness before rejecting a different failure', async () => {
  const { context, events } = refusalAdapter({ errorCode: 'RUNTIME_NOT_READY' })
  await assert.rejects(profile.afterCompletions(context))
  assert.equal(
    context.report.refusal33.ui.mainStateObservation.value.error.code,
    'RUNTIME_NOT_READY',
  )
  assert.equal(context.report.refusal33.unchanged, false)
  assert.equal(events.includes('after-ui-refusal'), false)
  assert.ok(
    events.some(
      (event) =>
        Array.isArray(event) &&
        event[0] === 'checkpoint' &&
        event[1].refusal33?.ui.mainStateObservation,
    ),
  )
})

test('refusal hook rejects prior durable-state changes and retains both raw proof references', async () => {
  const { context, events } = refusalAdapter({ alterAfter: true })
  await assert.rejects(profile.afterCompletions(context))
  assert.equal(context.report.refusal33.before.path, 'before-ui-refusal')
  assert.equal(context.report.refusal33.after.path, 'after-ui-refusal')
  assert.equal(context.report.refusal33.unchanged, false)
  assert.equal(events.includes('Keep results'), false)
})

test('selected-prefix control does not run the32-candidate refusal hook', async () => {
  assert.equal(await profile.afterCompletions({ fixture: fixture('epsilon', 'prefix') }), undefined)
})

test('summary distinguishes cap32, bounded prefix and preserved-result refusal without claiming a release', () => {
  assert.throws(() => profile.summaryClaims({ fixture: fixture(), report: {} }))
  assert.deepEqual(
    profile.summaryClaims({ fixture: fixture(), report: { refusal33: { unchanged: true } } }),
    {
      max32InferenceClaim: true,
      boundedTruncationClaim: false,
      preservedResultsOn33RefusalClaim: true,
      fullMvpClaim: false,
    },
  )
  assert.deepEqual(profile.summaryClaims({ fixture: fixture('epsilon', 'prefix'), report: {} }), {
    max32InferenceClaim: false,
    boundedTruncationClaim: true,
    preservedResultsOn33RefusalClaim: false,
    fullMvpClaim: false,
  })
})
