/** Actual adapter mechanics with UI collaborators; no renderer/native/persistence evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { animaHeunImageProfile as image } from './anima-heun-image-profile.mjs'
import { animaImageMethodsProfile as profile } from './anima-image-methods-profile.mjs'
import {
  assertAnimaImageMethodsConfiguration,
  assertAnimaImageMethodsFrozen,
  literalAnimaImageMethodsPlan,
  normalizeAnimaImageMethodsNativeInputs,
  validateAnimaImageMethodsFixture,
} from './anima-image-methods-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/image-methods-profile-mechanics',
)
const methods = [
  ['dpmpp_2m_sde', 'DPM++ 2M SDE', 4],
  ['er_sde', 'ER-SDE', 5],
  ['lcm', 'LCM', 4],
]
const cases = [
  ['neighbor', 'img2img'],
  ['history', 'img2img'],
  ['history', 'outpaint'],
]
function fixture(stage = 'baseline', method = 'er_sde', mode = 'outpaint', caseName = 'history') {
  return {
    schemaVersion: 1,
    profile: 'anima-image-methods',
    stage,
    method,
    mode,
    case: caseName,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'entry-sources.json'), sha256: 'b'.repeat(64) },
    sourceImage: {
      path: path.join(root, 'source.png'),
      sha256: 'f'.repeat(64),
      byteSize: 1024,
      pixelSha256: '1'.repeat(64),
    },
    lamaSource: {
      path: path.join(root, 'source-lama.pt'),
      sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
      byteSize: 205669692,
    },
    artifacts: path.join(root, `output-${stage}-${method}-${mode}-${caseName}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${method}-${mode}-${caseName}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: method === 'er_sde' ? 'vendor/er_sde_scheduler.py' : 'anima_sampling.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}
function authoredDraft(method = 'er_sde', mode = 'outpaint', caseName = 'history') {
  const plan = literalAnimaImageMethodsPlan('baseline', method, mode, caseName)
  const reference = {
    anima: {
      sha256: 'a'.repeat(64),
      installed: { resourceId: 'anima-resource', versionId: 'anima-version' },
    },
    animaLora: {
      sha256: 'b'.repeat(64),
      installed: { resourceId: 'myth-resource', versionId: 'myth-version' },
    },
  }
  const document = createEmptyProjectDocumentV1({
    title: 'Three image methods',
    primaryBbox: plan.bbox,
  })
  const draft = document.generationDraft
  draft.model = {
    localModelId: 'anima-resource',
    localVersionId: 'anima-version',
    fileSha256: reference.anima.sha256,
  }
  draft.loras = [
    {
      enabled: true,
      weight: -0.5,
      resource: {
        localModelId: 'myth-resource',
        localVersionId: 'myth-version',
        fileSha256: reference.animaLora.sha256,
      },
    },
  ]
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.positivePrompt = { embeddingRefs: [], text: plan.sourcePrompts.positive }
  draft.negativePrompt = { embeddingRefs: [], text: plan.sourcePrompts.negative }
  draft.sampling = {
    ...draft.sampling,
    steps: method === 'er_sde' ? 5 : 4,
    cfgScale: 4,
    animaMethod: method,
  }
  return { draft, reference, plan }
}

/** Mechanical Playwright collaborator; import normalization and persistence remain untested here. */
function inputCollaborators(input) {
  const calls = [],
    plan = literalAnimaImageMethodsPlan(input.stage, input.method, input.mode, input.case)
  const { draft } = authoredDraft(input.method, input.mode, input.case)
  const state = {
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
    generationDraft: draft,
    layers: [
      { id: 'source-layer', transform: { x: 0, y: 0, rotationDegrees: 0, scaleX: 1, scaleY: 1 } },
    ],
  }
  const project = { id: 'project' }
  return {
    calls,
    state,
    ctx: {
      fixture: input,
      plan,
      project,
      importSource: async (actualProject, source) => {
        assert.equal(actualProject, project)
        assert.equal(source, input.sourceImage)
        calls.push('import')
        return {
          source,
          layerId: 'source-layer',
          layer: state.layers[0],
          savedPackage: { path: 'prior.igs', sha256: 'a'.repeat(64) },
        }
      },
      window: {
        getByRole(role, options) {
          assert.equal(role, 'button')
          assert.deepEqual(options, { name: 'Bounding Box tool', exact: true })
          return {
            click: async () => {
              calls.push('bbox-tool')
            },
          }
        },
        locator(selector) {
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
      tab: async (actualProject) => {
        assert.equal(actualProject, project)
        return structuredClone(state)
      },
      setInput: async (name, value) => {
        assert.equal(name, 'Denoising Strength')
        calls.push('strength')
        state.generationDraft.sampling.denoisingStrength = value
      },
      save: async (actualProject) => {
        assert.equal(actualProject, project)
        calls.push('save')
        return { path: 'current.igs', sha256: 'b'.repeat(64) }
      },
      api: async (method, id) => {
        assert.equal(method, 'getGenerationState')
        assert.equal(id, project.id)
        calls.push('outpaint-support')
        return { animaOutpaintSupported: true }
      },
    },
  }
}

test('one profile owns method-specific contracts and shares image pixel/Save/resource hooks', () => {
  assert.equal(profile.validateFixture, validateAnimaImageMethodsFixture)
  assert.equal(profile.assertFrozen, assertAnimaImageMethodsFrozen)
  assert.equal(profile.assertConfiguration, assertAnimaImageMethodsConfiguration)
  for (const name of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[name], normalizeAnimaImageMethodsNativeInputs)
  for (const name of [
    'assertTarget',
    'assertOutput',
    'assertSaved',
    'modelKey',
    'loraKey',
    'originalSourceKeys',
    'extraInputFiles',
    'operation',
    'provisionalOnly',
    'comparisonChanged',
    'comparisonSame',
    'expectedBaselineStage',
    'baselineMetadataDifferences',
  ])
    assert.equal(profile[name], image[name])
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/anima-heun-image-profile.mjs',
    'scripts/anima-heun-image-qualification.mjs',
    ...image.sourceDependencies,
  ])
  for (const [method, label, steps] of methods)
    for (const [caseName, mode] of cases)
      for (const stage of [
        'baseline',
        'control',
        ...(caseName === 'history' ? ['restored'] : []),
      ]) {
        const input = fixture(stage, method, mode, caseName)
        assert.deepEqual(profile.sampling(input), {
          label: 'Anima method',
          draftKey: 'animaMethod',
          value: label,
          code: method,
          editedValue: 'Euler',
          editedCode: 'euler',
        })
        assert.equal(profile.inferenceSteps(input), steps)
        assert.equal(
          profile.observedSteps(input),
          (caseName === 'neighbor' ? 2 : 3) + (method === 'er_sde' ? 1 : 0),
        )
        assert.equal(profile.provisionalOnly(input), stage === 'control')
      }
})

test('own method and ER5 author checks precede common projection without modifying draft', () => {
  for (const [method] of methods)
    for (const [caseName, mode] of cases) {
      const { draft, reference, plan } = authoredDraft(method, mode, caseName)
      const original = structuredClone(draft)
      profile.assertAuthored(draft, reference, fixture('baseline', method, mode, caseName), plan)
      assert.deepEqual(draft, original)
      for (const edit of [
        (value) => {
          value.sampling.animaMethod = 'heun'
        },
        (value) => {
          value.sampling.steps = 3
        },
        (value) => {
          value.seed.policy = 'random'
        },
        (value) => {
          value.loras[0].weight = 0.5
        },
        (value) => {
          value.model.fileSha256 = 'f'.repeat(64)
        },
      ]) {
        const changed = structuredClone(draft)
        edit(changed)
        assert.throws(() =>
          profile.assertAuthored(
            changed,
            reference,
            fixture('baseline', method, mode, caseName),
            plan,
          ),
        )
      }
      const changedPlan = structuredClone(plan)
      changedPlan.observedSteps++
      assert.throws(() =>
        profile.assertAuthored(
          draft,
          reference,
          fixture('baseline', method, mode, caseName),
          changedPlan,
        ),
      )
    }
})

for (const [method] of methods)
  for (const [caseName, mode] of cases)
    test(`prepareInput ${method}/${caseName}/${mode} selects actual strength/bbox controls`, async () => {
      const { ctx, state, calls } = inputCollaborators(fixture('baseline', method, mode, caseName))
      const originalLayers = structuredClone(state.layers)
      const result = await profile.prepareInput(ctx)
      assert.deepEqual(state.layers, originalLayers)
      assert.equal(
        result.generationDraft.sampling.denoisingStrength,
        caseName === 'neighbor' ? 0.5 : 0.75,
      )
      assert.deepEqual(result.bbox, ctx.plan.bbox)
      assert.deepEqual(result.savedPackage, { path: 'current.igs', sha256: 'b'.repeat(64) })
      assert.equal(calls[0], 'import')
      assert.equal(calls[1], 'strength')
      assert.equal(calls.at(-1), 'save')
      assert.equal(calls.filter((value) => value === 'down').length, mode === 'outpaint' ? 64 : 0)
      assert.equal(calls.filter((value) => value === 'up').length, mode === 'outpaint' ? 1 : 0)
      assert.equal(
        calls.filter((value) => value === 'outpaint-support').length,
        mode === 'outpaint' ? 1 : 0,
      )
    })

test('owning comparison preserves authored4/5 and strength while detecting method/mode edits', async () => {
  for (const [method, label, steps] of methods)
    for (const [caseName, mode] of cases) {
      const strength = caseName === 'neighbor' ? 0.5 : 0.75
      const rows = {
        'sampling.animaMethod': [label, 'Euler'],
        'context.mode': [mode, 'img2img'],
        'guidance.steps': [String(steps), String(steps)],
        'guidance.cfg': ['4', '4'],
        'denoisingStrength.value': [String(strength), String(strength)],
        'seed.actual': ['0', '37'],
      }
      const dialog = {
        locator(selector) {
          const key = selector.match(/^\[data-setting="([^"]+)"\]$/)?.[1]
          assert.ok(Object.hasOwn(rows, key))
          return {
            key,
            locator(inner) {
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
        toHaveText: async (values) => {
          assert.deepEqual(values, locator.values)
        },
      })
      const generation = {
        expectedItem: literalAnimaImageMethodsPlan('baseline', method, mode, caseName).items[0],
      }
      const currentDraft = {
        seed: { value: 37 },
        sampling: { animaMethod: 'euler', denoisingStrength: strength, steps },
      }
      const evidence = await profile.assertComparison({ expect, dialog, generation, currentDraft })
      assert.equal(evidence['context.mode'].status, mode === 'outpaint' ? 'Changed' : 'Same')
      assert.deepEqual(evidence['guidance.steps'], {
        status: 'Same',
        values: [String(steps), String(steps)],
      })
      await assert.rejects(() =>
        profile.assertComparison({
          expect,
          dialog,
          generation,
          currentDraft: {
            ...currentDraft,
            sampling: { ...currentDraft.sampling, denoisingStrength: 1 },
          },
        }),
      )
    }
})

test('individual reports require provisional controls to retain zero accepted outputs', () => {
  for (const [method] of methods)
    for (const [caseName, mode] of cases)
      for (const stage of [
        'baseline',
        'control',
        ...(caseName === 'history' ? ['restored'] : []),
      ]) {
        const provisional = stage === 'control'
        assert.deepEqual(
          profile.summaryClaims({
            fixture: fixture(stage, method, mode, caseName),
            report: { generations: [{ accepted: !provisional }] },
          }),
          {
            method,
            opaqueImgInferenceClaim: !provisional && mode === 'img2img',
            mixedAlphaOutInferenceClaim: !provisional && mode === 'outpaint',
            neighborOnly: caseName === 'neighbor',
            methodMutationSensitivityClaim: false,
            provisionalMutationControl: provisional,
            fullMvpClaim: false,
          },
        )
        if (provisional) {
          assert.throws(() =>
            profile.summaryClaims({
              fixture: fixture(stage, method, mode, caseName),
              report: { generations: [{ accepted: true }] },
            }),
          )
          assert.throws(() =>
            profile.summaryClaims({
              fixture: fixture(stage, method, mode, caseName),
              report: { generations: [] },
            }),
          )
        }
      }
})
