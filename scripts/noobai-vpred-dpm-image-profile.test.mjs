/** Mechanical adapter checks; no installed renderer, native inference or durable evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import { noobaiVpredDpmImageProfile as profile } from './noobai-vpred-dpm-image-profile.mjs'
import {
  assertIllustriousDpmConfiguration,
  assertIllustriousDpmFrozen,
  literalIllustriousDpmPlan,
  normalizeIllustriousDpmNativeInputs,
  validateNoobaiVpredDpmImageFixture,
} from './illustrious-dpm-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/noobai-vpred-dpm-image-profile-mechanics',
)
const pairs = [
  ['dpmpp_2m', 'Normal', 'DPM++ 2M', 'DPM++ 2M', 'dpmpp_2m', 'dpmpp_2m', 0.75, 0.5],
  ['dpmpp_2m', 'Karras', 'DPM++ 2M', 'DPM++ 2M', 'dpmpp_2m_k', 'dpmpp_2m_k', 0.995, 0.9],
]
function fixture(pair = pairs[0], mode = 'outpaint', caseName = 'history', stage = 'baseline') {
  return {
    schemaVersion: 1,
    profile: 'noobai-vpred-dpm-image',
    objective: 'v_prediction',
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
  const plan = literalIllustriousDpmPlan(
    'baseline',
    pair[0],
    pair[1],
    mode,
    caseName,
    'v_prediction',
  )
  const reference = {
    appData: path.join(root, 'pool/data/imagegen-studio'),
    ...Object.fromEntries(
      ['illustrious', 'illustriousLora', 'externalVaeNative'].map((key, index) => [
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
    localModelId: reference.illustrious.installed.resourceId,
    localVersionId: reference.illustrious.installed.versionId,
    fileSha256: reference.illustrious.sha256,
    predictionType: 'v_prediction',
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

test('separate V image adapter retains exact V authoring, image/alpha oracle and valid later sampling edits', () => {
  assert.equal(profile.profile, 'noobai-vpred-dpm-image')
  assert.equal(profile.validateFixture, validateNoobaiVpredDpmImageFixture)
  assert.equal(profile.authorComponents, noobaiVpredDpmProfile.authorComponents)
  assert.equal(profile.assertFrozen, assertIllustriousDpmFrozen)
  assert.equal(profile.assertConfiguration, assertIllustriousDpmConfiguration)
  for (const key of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[key], normalizeIllustriousDpmNativeInputs)
  assert.equal(profile.cfgScale, 4)
  assert.ok(profile.sourceDependencies.includes('scripts/noobai-vpred-dpm-profile.mjs'))
  assert.ok(profile.sourceDependencies.includes('scripts/illustrious-dpm-profile.mjs'))
  for (const pair of pairs)
    for (const [mode, caseName] of [
      ['img2img', 'history'],
      ['outpaint', 'history'],
      ['img2img', 'neighbor'],
    ]) {
      const input = fixture(pair, mode, caseName)
      const plan = profile.validateFixture(input)
      assert.equal(profile.modelKey(input), 'illustrious')
      assert.deepEqual(profile.originalSourceKeys(input), [
        'illustrious',
        'illustriousLora',
        'externalVaeNative',
      ])
      assert.equal(profile.requiresSourceImage(input), true)
      assert.equal(profile.operation(input), `illustrious-${mode}`)
      assert.equal(profile.inferenceSteps(input), 4)
      assert.equal(profile.observedSteps(input), caseName === 'history' ? 3 : 2)
      assert.equal(plan.denoisingStrength, caseName === 'history' ? pair[6] : pair[7])
      assert.deepEqual(profile.sampling(input), {
        label: 'Sampler',
        draftKey: 'sampler',
        value: 'DPM++ 2M',
        code: 'DPM++ 2M',
        editedValue: 'DPM++ 2M',
        editedCode: 'DPM++ 2M',
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
      assert.equal(profile.comparisonChanged(input).includes('context.mode'), mode === 'outpaint')
      assert.equal(profile.comparisonSame(input).includes('context.mode'), mode === 'img2img')
      for (const key of [
        'sampling.sampler',
        'sampling.invokeScheduler',
        'guidance.steps',
        'guidance.cfg',
        'denoisingStrength.value',
      ]) {
        assert.equal(profile.comparisonChanged(input).includes(key), false)
        assert.equal(profile.comparisonSame(input).includes(key), true)
      }
    }
})

test('authored V image assertions preserve exact V version, signed LoRA, prompts and native VAE despite separate recipe', () => {
  for (const pair of pairs)
    for (const [mode, caseName] of [
      ['img2img', 'history'],
      ['outpaint', 'history'],
      ['img2img', 'neighbor'],
    ]) {
      const input = fixture(pair, mode, caseName)
      const { draft, reference, plan } = authored(pair, mode, caseName)
      profile.assertAuthored(draft, reference, input, plan)
      for (const change of [
        (v) => {
          v.model.predictionType = 'epsilon'
        },
        (v) => {
          v.model.localVersionId = 'another-version'
        },
        (v) => {
          v.seed.value = 37
        },
        (v) => {
          v.sampling.sampler = 'DPM++ SDE'
        },
        (v) => {
          v.sampling.scheduler = pair[1] === 'Normal' ? 'Karras' : 'Normal'
        },
        (v) => {
          v.vaePrecision = 'FP16'
        },
        (v) => {
          v.loras[0].weight = 0.5
        },
      ]) {
        const changed = structuredClone(draft)
        change(changed)
        assert.throws(() => profile.assertAuthored(changed, reference, input, plan))
      }
    }
})

for (const pair of pairs)
  for (const [mode, caseName] of [
    ['img2img', 'history'],
    ['outpaint', 'history'],
    ['img2img', 'neighbor'],
  ])
    test(`${pair[4]} ${mode}/${caseName}: image adapter imports pinned source and authors measured cutoff/bbox without changing layers`, async () => {
      const { ctx, calls, state } = inputCollaborators(fixture(pair, mode, caseName), pair)
      const before = structuredClone(state.layers)
      const result = await profile.prepareInput(ctx)
      assert.deepEqual(state.layers, before)
      assert.equal(
        result.generationDraft.sampling.denoisingStrength,
        caseName === 'history' ? pair[6] : pair[7],
      )
      assert.deepEqual(result.bbox, ctx.plan.bbox)
      assert.deepEqual(result.savedPackage, { path: 'current.igs', sha256: 'f'.repeat(64) })
      assert.equal(calls[0], 'import')
      assert.equal(calls[1], 'strength')
      assert.equal(calls.at(-1), 'save')
      assert.equal(calls.filter((value) => value === 'down').length, mode === 'outpaint' ? 64 : 0)
      assert.equal(calls.filter((value) => value === 'up').length, mode === 'outpaint' ? 1 : 0)
    })

test('owning image comparison keeps sampler/grid/strength and distinguishes accepted IMG Same from OUT Changed context', async () => {
  for (const pair of pairs)
    for (const [mode, caseName] of [
      ['img2img', 'history'],
      ['outpaint', 'history'],
      ['img2img', 'neighbor'],
    ]) {
      const item = literalIllustriousDpmPlan(
        'baseline',
        pair[0],
        pair[1],
        mode,
        caseName,
        'v_prediction',
      ).items[0]
      const rows = {
        'sampling.invokeScheduler': [pair[4], pair[4]],
        'sampling.sampler': ['DPM++ 2M', 'DPM++ 2M'],
        'sampling.scheduler': [pair[1], pair[1]],
        'context.mode': [mode, 'img2img'],
        'guidance.steps': ['4', '4'],
        'guidance.cfg': ['4', '4'],
        'denoisingStrength.value': [String(item.denoisingStrength), String(item.denoisingStrength)],
        'seed.actual': ['0', '37'],
      }
      const checked = []
      const dialog = {
        locator: (selector) => {
          const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
          assert.ok(Object.hasOwn(rows, key))
          return {
            key,
            locator: (child) => {
              assert.equal(child, '.comparison-values p')
              return { key, values: rows[key] }
            },
          }
        },
      }
      const expect = (row) => ({
        toHaveAttribute: async (name, status) => {
          assert.equal(name, 'data-status')
          assert.equal(status, rows[row.key][0] === rows[row.key][1] ? 'Same' : 'Changed')
          checked.push(row.key)
        },
        toHaveText: async (values) => assert.deepEqual(values, row.values),
      })
      const currentDraft = {
        seed: { value: 37 },
        sampling: {
          sampler: 'DPM++ 2M',
          scheduler: pair[1],
          denoisingStrength: item.denoisingStrength,
        },
      }
      const ctx = { expect, dialog, generation: { expectedItem: item }, currentDraft }
      const evidence = await profile.assertComparison(ctx)
      assert.deepEqual(checked.sort(), Object.keys(rows).sort())
      assert.deepEqual(evidence['context.mode'], {
        status: mode === 'img2img' ? 'Same' : 'Changed',
        values: rows['context.mode'],
      })
      assert.deepEqual(evidence['denoisingStrength.value'], {
        status: 'Same',
        values: rows['denoisingStrength.value'],
      })
      for (const change of [
        (v) => {
          v.sampling.sampler = 'DPM++ SDE'
        },
        (v) => {
          v.sampling.scheduler = pair[1] === 'Normal' ? 'Karras' : 'Normal'
        },
        (v) => {
          v.sampling.denoisingStrength = item.denoisingStrength / 2
        },
      ]) {
        const changed = structuredClone(currentDraft)
        change(changed)
        await assert.rejects(() => profile.assertComparison({ ...ctx, currentDraft: changed }))
      }
    }
})

test('image summary binds accepted/provisional state and does not claim numerical sensitivity or full MVP', () => {
  for (const pair of pairs)
    for (const mode of ['img2img', 'outpaint'])
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
