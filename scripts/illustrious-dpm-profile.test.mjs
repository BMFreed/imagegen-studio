/** Mechanical adapter checks; no installed renderer, native inference or durable evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { illustriousDynamicBatchProfile as resources } from './illustrious-dynamic-batch-profile.mjs'
import { illustriousDpmProfile as profile } from './illustrious-dpm-profile.mjs'
import {
  assertIllustriousDpmConfiguration,
  assertIllustriousDpmFrozen,
  literalIllustriousDpmPlan,
  normalizeIllustriousDpmNativeInputs,
  validateIllustriousDpmFixture,
} from './illustrious-dpm-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/illustrious-dpm-profile-mechanics',
)
const pairs = [
  ['dpmpp_2m', 'Normal', 'DPM++ 2M', 'DPM++ SDE', 'dpmpp_2m', 'dpmpp_sde'],
  ['dpmpp_2m', 'Karras', 'DPM++ 2M', 'DPM++ SDE', 'dpmpp_2m_k', 'dpmpp_sde_k'],
  ['dpmpp_sde', 'Normal', 'DPM++ SDE', 'DPM++ 2M', 'dpmpp_sde', 'dpmpp_2m'],
  ['dpmpp_sde', 'Karras', 'DPM++ SDE', 'DPM++ 2M', 'dpmpp_sde_k', 'dpmpp_2m_k'],
]
function fixture(pair = pairs[0], mode = 'outpaint', caseName = 'history', stage = 'baseline') {
  return {
    schemaVersion: 1,
    profile: 'illustrious-dpm',
    algorithm: pair[0],
    schedule: pair[1],
    mode,
    case: caseName,
    stage,
    artifacts: path.join(root, `${pair[0]}-${pair[1]}-${mode}-${caseName}-${stage}`),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    ...(mode === 'txt2img'
      ? {}
      : {
          sourceImage: {
            path: path.join(root, 'source.png'),
            sha256: 'c'.repeat(64),
            byteSize: 1024,
            pixelSha256: 'd'.repeat(64),
          },
        }),
    ...(mode === 'outpaint'
      ? {
          lamaSource: {
            path: path.join(root, 'lama.pt'),
            sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
            byteSize: 205669692,
          },
        }
      : {}),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(
              root,
              `baseline-${pair[0]}-${pair[1]}-${mode}-${caseName}/report.json`,
            ),
            reportSha256: 'e'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference.py',
            originalSha256: '1'.repeat(64),
            mutatedSha256: '2'.repeat(64),
          },
        }
      : {}),
  }
}
function authored(pair, mode = 'outpaint', caseName = 'history') {
  const plan = literalIllustriousDpmPlan('baseline', pair[0], pair[1], mode, caseName)
  const reference = {
    appData: path.join(root, 'pool/data/imagegen-studio'),
    ...Object.fromEntries(
      ['illustriousEpsilon', 'illustriousLora', 'externalVaeNative'].map((key, index) => [
        key,
        {
          sha256: String(index + 1).repeat(64),
          installed: { resourceId: `resource-${key}`, versionId: `version-${key}` },
        },
      ]),
    ),
  }
  const draft = createEmptyProjectDocumentV1({
    title: 'DPM authored',
    primaryBbox: plan.bbox,
  }).generationDraft
  draft.model = {
    localModelId: reference.illustriousEpsilon.installed.resourceId,
    localVersionId: reference.illustriousEpsilon.installed.versionId,
    fileSha256: reference.illustriousEpsilon.sha256,
    predictionType: 'epsilon',
  }
  draft.vae = {
    localModelId: reference.externalVaeNative.installed.resourceId,
    localVersionId: reference.externalVaeNative.installed.versionId,
    fileSha256: reference.externalVaeNative.sha256,
  }
  draft.vaePrecision = 'FP32'
  draft.loras = [
    {
      enabled: true,
      weight: -0.5,
      resource: {
        localModelId: reference.illustriousLora.installed.resourceId,
        localVersionId: reference.illustriousLora.installed.versionId,
        fileSha256: reference.illustriousLora.sha256,
      },
    },
  ]
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.positivePrompt = { embeddingRefs: [], text: plan.sourcePrompts.positive }
  draft.negativePrompt = { embeddingRefs: [], text: plan.sourcePrompts.negative }
  draft.sampling = {
    ...draft.sampling,
    steps: 4,
    cfgScale: 4,
    sampler: pair[2],
    scheduler: pair[1],
  }
  return { plan, draft, reference }
}
function inputCollaborators(input, pair) {
  const calls = []
  const { plan, draft } = authored(pair, input.mode, input.case)
  const project = { id: 'project' }
  const state = {
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
    generationDraft: draft,
    layers: [
      { id: 'source-layer', transform: { x: 0, y: 0, rotationDegrees: 0, scaleX: 1, scaleY: 1 } },
    ],
  }
  return {
    calls,
    state,
    ctx: {
      fixture: input,
      plan,
      project,
      importSource: async (actual, source) => {
        assert.equal(actual, project)
        assert.equal(source, input.sourceImage)
        calls.push('import')
        return { source, layerId: 'source-layer', layer: state.layers[0] }
      },
      tab: async (actual) => {
        assert.equal(actual, project)
        return structuredClone(state)
      },
      window: {
        getByRole: (role, options) => {
          assert.equal(role, 'button')
          assert.equal(options.name, 'Bounding Box tool')
          return {
            click: async () => {
              calls.push('bbox-tool')
            },
          }
        },
        locator: (selector) => {
          assert.equal(selector, '.canvas-area')
          return {
            focus: async () => {
              calls.push('focus')
            },
          }
        },
        keyboard: {
          down: async (key) => {
            assert.equal(key, 'ArrowRight')
            calls.push('down')
            state.primaryBbox.x++
          },
          up: async (key) => {
            assert.equal(key, 'ArrowRight')
            calls.push('up')
          },
        },
      },
      expect: {
        poll: (read) => ({
          toEqual: async (value) => {
            assert.deepEqual(await read(), value)
          },
          toBe: async (value) => {
            assert.equal(await read(), value)
          },
        }),
      },
      setInput: async (name, value) => {
        assert.equal(name, 'Denoising Strength')
        calls.push('strength')
        state.generationDraft.sampling.denoisingStrength = value
      },
      save: async (actual) => {
        assert.equal(actual, project)
        calls.push('save')
        return { path: 'current.igs', sha256: 'f'.repeat(64) }
      },
      api: async (method, id) => {
        assert.equal(method, 'getGenerationState')
        assert.equal(id, project.id)
        return { outpaintSupported: true }
      },
    },
  }
}

test('single adapter selects exact pairs/resources, mode-specific source/LaMa hooks and literal progress', () => {
  assert.equal(profile.validateFixture, validateIllustriousDpmFixture)
  assert.equal(profile.assertFrozen, assertIllustriousDpmFrozen)
  assert.equal(profile.assertConfiguration, assertIllustriousDpmConfiguration)
  for (const key of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[key], normalizeIllustriousDpmNativeInputs)
  assert.equal(profile.authorComponents, resources.authorComponents)
  assert.equal(profile.cfgScale, 4)
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/illustrious-dynamic-batch-profile.mjs',
    'scripts/illustrious-dynamic-batch-qualification.mjs',
    'scripts/anima-heun-image-qualification.mjs',
  ])
  for (const pair of pairs)
    for (const mode of ['txt2img', 'img2img', 'outpaint']) {
      const input = fixture(pair, mode)
      assert.equal(profile.requiresSourceImage(input), mode !== 'txt2img')
      assert.equal(profile.operation(input), `illustrious-${mode}`)
      assert.equal(profile.modelKey(input), 'illustriousEpsilon')
      assert.deepEqual(profile.originalSourceKeys(input), [
        'illustriousEpsilon',
        'illustriousLora',
        'externalVaeNative',
      ])
      assert.equal(profile.inferenceSteps(input), 4)
      assert.equal(
        profile.observedSteps(input),
        pair[0] === 'dpmpp_2m' ? (mode === 'txt2img' ? 4 : 3) : mode === 'txt2img' ? 7 : 5,
      )
      assert.deepEqual(profile.sampling(input), {
        label: 'Sampler',
        draftKey: 'sampler',
        value: pair[2],
        code: pair[2],
        editedValue: pair[3],
        editedCode: pair[3],
        scheduler: pair[1],
      })
      const reference = { appData: path.join(root, 'pool/data/imagegen-studio') }
      assert.deepEqual(
        profile.extraInputFiles(input, reference),
        mode === 'outpaint'
          ? [
              input.lamaSource,
              {
                ...input.lamaSource,
                path: path.join(reference.appData, 'inference-resources/big-lama.pt'),
              },
            ]
          : [],
      )
    }
})

test('authored checks retain all exact local bindings, epsilon, signed prompts and native defaults', () => {
  for (const pair of pairs) {
    const { draft, reference, plan } = authored(pair)
    const original = structuredClone(draft)
    profile.assertAuthored(draft, reference, fixture(pair), plan)
    assert.deepEqual(draft, original)
    for (const mutate of [
      (value) => {
        value.seed.policy = 'random'
      },
      (value) => {
        value.seed.value = 37
      },
      (value) => {
        value.model.predictionType = 'v_prediction'
      },
      (value) => {
        value.sampling.sampler = 'Euler'
      },
      (value) => {
        value.sampling.scheduler = pair[1] === 'Normal' ? 'Karras' : 'Normal'
      },
      (value) => {
        value.sampling.steps = 3
      },
      (value) => {
        value.sampling.cfgScale = 5
      },
      (value) => {
        value.vaePrecision = 'Auto'
      },
      (value) => {
        value.loras[0].weight = 0.5
      },
      (value) => {
        value.dynamicPrompt.maxPrompts = 4
      },
      (value) => {
        value.positivePrompt.text = '(red:1)'
      },
      (value) => {
        value.vae.fileSha256 = 'e'.repeat(64)
      },
    ]) {
      const changed = structuredClone(draft)
      mutate(changed)
      assert.throws(() => profile.assertAuthored(changed, reference, fixture(pair), plan))
    }
  }
})

for (const pair of pairs)
  for (const [mode, caseName] of [
    ['img2img', 'history'],
    ['img2img', 'neighbor'],
    ['outpaint', 'history'],
  ])
    test(`${pair[4]} ${mode}/${caseName}: preparation imports only pinned source and authors exact strength/bbox`, async () => {
      const { ctx, calls, state } = inputCollaborators(fixture(pair, mode, caseName), pair)
      const originalLayers = structuredClone(state.layers)
      const result = await profile.prepareInput(ctx)
      assert.deepEqual(state.layers, originalLayers)
      assert.equal(
        result.generationDraft.sampling.denoisingStrength,
        caseName === 'history' ? 0.75 : pair[0] === 'dpmpp_2m' ? 0.5 : 0.05,
      )
      assert.deepEqual(result.bbox, ctx.plan.bbox)
      assert.deepEqual(result.savedPackage, { path: 'current.igs', sha256: 'f'.repeat(64) })
      assert.equal(calls[0], 'import')
      assert.equal(calls[1], 'strength')
      assert.equal(calls.at(-1), 'save')
      assert.equal(calls.filter((value) => value === 'down').length, mode === 'outpaint' ? 64 : 0)
      assert.equal(calls.filter((value) => value === 'up').length, mode === 'outpaint' ? 1 : 0)
    })

test('comparison retains owning native scheduler and strength while later authoring changes sampler and actual seed', async () => {
  for (const pair of pairs)
    for (const mode of ['txt2img', 'img2img', 'outpaint']) {
      const item = literalIllustriousDpmPlan('baseline', pair[0], pair[1], mode, 'history').items[0]
      const rows = {
        'sampling.invokeScheduler': [pair[4], pair[5]],
        'sampling.sampler': [pair[2], pair[3]],
        'sampling.scheduler': [pair[1], pair[1]],
        'context.mode': [mode, 'img2img'],
        'guidance.steps': ['4', '4'],
        'guidance.cfg': ['4', '4'],
        'seed.actual': ['0', '37'],
        ...(mode === 'txt2img' ? {} : { 'denoisingStrength.value': ['0.75', '0.75'] }),
      }
      const dialog = {
        locator: (selector) => {
          const key = selector.match(/^\[data-setting="([^"]+)"\]$/)?.[1]
          assert.ok(Object.hasOwn(rows, key))
          return {
            key,
            locator: (inner) => {
              assert.equal(inner, '.comparison-values p')
              return { key, values: rows[key] }
            },
          }
        },
      }
      const expect = (locator) => ({
        toHaveAttribute: async (attribute, status) => {
          assert.equal(attribute, 'data-status')
          assert.equal(status, rows[locator.key][0] === rows[locator.key][1] ? 'Same' : 'Changed')
        },
        toHaveText: async (value) => {
          assert.deepEqual(value, locator.values)
        },
      })
      const currentDraft = {
        seed: { value: 37 },
        sampling: {
          sampler: pair[3],
          scheduler: pair[1],
          denoisingStrength: mode === 'txt2img' ? null : 0.75,
        },
      }
      const evidence = await profile.assertComparison({
        expect,
        dialog,
        generation: { expectedItem: item },
        currentDraft,
      })
      assert.deepEqual(evidence['sampling.invokeScheduler'], {
        status: 'Changed',
        values: rows['sampling.invokeScheduler'],
      })
      assert.deepEqual(evidence['sampling.scheduler'], {
        status: 'Same',
        values: rows['sampling.scheduler'],
      })
      if (mode !== 'txt2img')
        assert.deepEqual(evidence['denoisingStrength.value'], {
          status: 'Same',
          values: ['0.75', '0.75'],
        })
      await assert.rejects(() =>
        profile.assertComparison({
          expect,
          dialog,
          generation: { expectedItem: item },
          currentDraft: {
            ...currentDraft,
            sampling: { ...currentDraft.sampling, sampler: 'Euler' },
          },
        }),
      )
    }
})

test('source-free TXT target/output/Save hooks preserve generated bytes without image preconditions', async () => {
  const input = fixture(pairs[0], 'txt2img')
  const plan = literalIllustriousDpmPlan('baseline', pairs[0][0], pairs[0][1], 'txt2img', 'history')
  assert.deepEqual(await profile.assertTarget({ fixture: input }), {
    mode: 'txt2img',
    sourceRequired: false,
  })
  await assert.rejects(() => profile.prepareInput({ fixture: input }))
  const decoded = {
    dimensions: { width: 256, height: 256 },
    rgba: Buffer.alloc(256 * 256 * 4, 255),
  }
  profile.assertOutput({ decoded, fixture: input })
  const bad = { ...decoded, rgba: Buffer.from(decoded.rgba) }
  bad.rgba[3] = 0
  assert.throws(() => profile.assertOutput({ decoded: bad, fixture: input }))
  const layer = {
    asset: { path: 'assets/generated.png' },
    transform: { x: 0, y: 0, rotationDegrees: 0, scaleX: 1, scaleY: 1 },
    generationProvenance: {
      layerSourceContext: { bbox: plan.bbox },
      executionResultContext: { queueItemId: 'queue' },
    },
  }
  const ctx = {
    fixture: input,
    plan,
    generations: [{ queueItemId: 'queue' }],
    merged: decoded,
    savedPackage: {
      saved: {
        project: { layers: [layer] },
        readMember: async () => Buffer.from('actual packaged bytes'),
      },
    },
    decodedImage: async () => decoded,
  }
  assert.deepEqual(await profile.assertSaved(ctx), { width: 256, height: 256, protectedPixels: 0 })
  const corrupted = { ...decoded, rgba: Buffer.from(decoded.rgba) }
  corrupted.rgba[0] = 1
  await assert.rejects(() => profile.assertSaved({ ...ctx, merged: corrupted }))
})

test('control summary requires one provisional result and never claims numerical sensitivity or acceptance', () => {
  for (const pair of pairs)
    for (const mode of ['txt2img', 'img2img', 'outpaint'])
      for (const stage of ['baseline', 'control', 'restored']) {
        const input = fixture(pair, mode, 'history', stage)
        const provisional = stage === 'control'
        assert.equal(profile.provisionalOnly(input), provisional)
        const summary = profile.summaryClaims({
          fixture: input,
          report: { generations: [{ accepted: !provisional }] },
        })
        assert.equal(summary.installedDpmInferenceClaim, !provisional)
        assert.equal(summary.acceptedSavedReopenedClaim, !provisional)
        assert.equal(summary.provisionalMutationControl, provisional)
        assert.equal(summary.numericalSensitivityClaim, false)
        assert.equal(summary.fullMvpClaim, false)
        assert.throws(() => profile.summaryClaims({ fixture: input, report: { generations: [] } }))
        assert.throws(() =>
          profile.summaryClaims({
            fixture: input,
            report: { generations: [{ accepted: provisional }] },
          }),
        )
      }
})
