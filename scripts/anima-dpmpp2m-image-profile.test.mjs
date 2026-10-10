/** Actual profile methods with mechanical UI collaborators; no renderer/native/durable evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { animaHeunImageProfile as image } from './anima-heun-image-profile.mjs'
import { animaDpmpp2mImageProfile as profile } from './anima-dpmpp2m-image-profile.mjs'
import {
  assertAnimaDpmpp2mImageConfiguration,
  assertAnimaDpmpp2mImageFrozen,
  literalAnimaDpmpp2mImagePlan,
  normalizeAnimaDpmpp2mImageNativeInputs,
  validateAnimaDpmpp2mImageFixture,
} from './anima-dpmpp2m-image-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/dpmpp2m-image-profile-mechanics',
)
function fixture(stage = 'baseline', mode = 'outpaint', caseName = 'history') {
  return {
    schemaVersion: 1,
    profile: 'anima-dpmpp2m-image',
    stage,
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
    artifacts: path.join(root, `output-${stage}-${mode}-${caseName}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${mode}-${caseName}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'anima_sampling.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}
function authoredDraft(mode = 'outpaint', caseName = 'history') {
  const plan = literalAnimaDpmpp2mImagePlan('baseline', mode, caseName)
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
    title: 'DPM++ 2M authored',
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
  draft.sampling = { ...draft.sampling, steps: 4, cfgScale: 4, animaMethod: 'dpmpp_2m' }
  return { draft, reference, plan }
}
/** A mechanical Playwright API collaborator; this does not emulate production Main/normalization. */
function inputCollaborators(input) {
  const calls = [],
    plan = literalAnimaDpmpp2mImagePlan(input.stage, input.mode, input.case)
  const { draft } = authoredDraft(input.mode, input.case)
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
          assert.equal(options.name, 'Bounding Box tool')
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
        return { animaOutpaintSupported: true }
      },
    },
  }
}
const cases = [
  ['neighbor', 'img2img'],
  ['history', 'img2img'],
  ['history', 'outpaint'],
]

test('DPM profile overrides method-specific contracts and retains common pixel/import/resource hooks', () => {
  assert.equal(profile.validateFixture, validateAnimaDpmpp2mImageFixture)
  assert.equal(profile.assertFrozen, assertAnimaDpmpp2mImageFrozen)
  assert.equal(profile.assertConfiguration, assertAnimaDpmpp2mImageConfiguration)
  for (const name of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[name], normalizeAnimaDpmpp2mImageNativeInputs)
  for (const name of [
    'assertTarget',
    'assertOutput',
    'assertSaved',
    'modelKey',
    'loraKey',
    'originalSourceKeys',
    'extraInputFiles',
    'operation',
    'inferenceSteps',
    'provisionalOnly',
    'comparisonChanged',
    'comparisonSame',
  ])
    assert.equal(profile[name], image[name])
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/anima-heun-image-profile.mjs',
    'scripts/anima-heun-image-qualification.mjs',
    ...image.sourceDependencies,
  ])
  assert.deepEqual(profile.sampling(fixture()), {
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'DPM++ 2M',
    code: 'dpmpp_2m',
    editedValue: 'Euler',
    editedCode: 'euler',
  })
  for (const [caseName, mode] of cases)
    for (const stage of ['baseline', 'control', ...(caseName === 'history' ? ['restored'] : [])]) {
      const input = fixture(stage, mode, caseName)
      assert.equal(profile.inferenceSteps(input), 4)
      assert.equal(profile.observedSteps(input), caseName === 'neighbor' ? 2 : 3)
      assert.equal(profile.provisionalOnly(input), stage === 'control')
    }
})

test('own authored method checks run before common draft projection without modifying the actual draft', () => {
  for (const [caseName, mode] of cases) {
    const { draft, reference, plan } = authoredDraft(mode, caseName)
    const original = structuredClone(draft)
    profile.assertAuthored(draft, reference, fixture('baseline', mode, caseName), plan)
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
        profile.assertAuthored(changed, reference, fixture('baseline', mode, caseName), plan),
      )
    }
  }
})

for (const [caseName, mode] of cases)
  test(`prepareInput ${caseName}/${mode} authors exact case strength through real-boundary adapters`, async () => {
    const { ctx, state, calls } = inputCollaborators(fixture('baseline', mode, caseName))
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
  })

test('comparison hook distinguishes .5/.75 and owning DPM method while sharing read-only runner guarantees', async () => {
  for (const [caseName, mode] of cases) {
    const strength = caseName === 'neighbor' ? 0.5 : 0.75
    const rows = {
      'sampling.animaMethod': ['DPM++ 2M', 'Euler'],
      'context.mode': [mode, 'img2img'],
      'guidance.steps': ['4', '4'],
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
      expectedItem: literalAnimaDpmpp2mImagePlan('baseline', mode, caseName).items[0],
    }
    const currentDraft = {
      seed: { value: 37 },
      sampling: { animaMethod: 'euler', denoisingStrength: strength },
    }
    const evidence = await profile.assertComparison({ expect, dialog, generation, currentDraft })
    assert.equal(evidence['context.mode'].status, mode === 'outpaint' ? 'Changed' : 'Same')
    assert.deepEqual(evidence['denoisingStrength.value'], {
      status: 'Same',
      values: rows['denoisingStrength.value'],
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

test('per-report claims never invent solver-history sensitivity or accept provisional controls', () => {
  for (const [caseName, mode] of cases)
    for (const stage of ['baseline', 'control', ...(caseName === 'history' ? ['restored'] : [])]) {
      const provisional = stage === 'control'
      assert.deepEqual(
        profile.summaryClaims({
          fixture: fixture(stage, mode, caseName),
          report: { generations: [{ accepted: !provisional }] },
        }),
        {
          opaqueDpmpp2mImgInferenceClaim: !provisional && mode === 'img2img',
          mixedAlphaDpmpp2mOutInferenceClaim: !provisional && mode === 'outpaint',
          neighborFirstOrderOnly: caseName === 'neighbor',
          historySensitivityClaim: false,
          provisionalMutationControl: provisional,
          fullMvpClaim: false,
        },
      )
      if (provisional) {
        assert.throws(() =>
          profile.summaryClaims({
            fixture: fixture(stage, mode, caseName),
            report: { generations: [{ accepted: true }] },
          }),
        )
        assert.throws(() =>
          profile.summaryClaims({
            fixture: fixture(stage, mode, caseName),
            report: { generations: [] },
          }),
        )
      }
    }
})
