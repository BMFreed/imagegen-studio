/** Adapter contracts and mechanical UI collaborators only; no installed renderer/ML proof. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { animaDynamicBatchProfile as resources } from './anima-dynamic-batch-profile.mjs'
import { animaHeunImageProfile as profile } from './anima-heun-image-profile.mjs'
import {
  assertAnimaHeunImageConfiguration,
  assertAnimaHeunImageFrozen,
  literalAnimaHeunImageContributionAlpha,
  literalAnimaHeunImagePlan,
  normalizeAnimaHeunImageNativeInputs,
  validateAnimaHeunImageFixture,
} from './anima-heun-image-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/heun-image-profile-mechanics',
)
function fixture(stage = 'baseline', mode = 'outpaint') {
  return {
    schemaVersion: 1,
    profile: 'anima-heun-image',
    stage,
    mode,
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
    artifacts: path.join(root, `output-${stage}-${mode}`),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, `baseline-${mode}/report.json`),
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

test('Heun adapter binds independent oracle, exact model family resources and method', () => {
  assert.equal(profile.validateFixture, validateAnimaHeunImageFixture)
  assert.equal(profile.assertFrozen, assertAnimaHeunImageFrozen)
  assert.equal(profile.assertConfiguration, assertAnimaHeunImageConfiguration)
  for (const method of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[method], normalizeAnimaHeunImageNativeInputs)
  for (const method of ['modelKey', 'loraKey', 'originalSourceKeys'])
    assert.equal(profile[method], resources[method])
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/anima-dynamic-batch-profile.mjs',
    'scripts/anima-dynamic-batch-qualification.mjs',
  ])
  assert.deepEqual(profile.sampling(fixture()), {
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'Heun',
    code: 'heun',
    editedValue: 'Euler',
    editedCode: 'euler',
  })
  assert.deepEqual(
    profile.comparisonChanged(fixture('baseline', 'img2img')),
    resources.comparisonChanged,
  )
  assert.deepEqual(profile.comparisonChanged(fixture()), [
    ...resources.comparisonChanged,
    'context.mode',
  ])
  assert.deepEqual(profile.comparisonSame, [
    ...resources.comparisonSame,
    'guidance.steps',
    'guidance.cfg',
    'denoisingStrength.value',
  ])
  const reference = { appData: path.join(root, 'pool/data/imagegen-studio') }
  assert.deepEqual(profile.extraInputFiles(fixture(), reference), [
    fixture().lamaSource,
    {
      ...fixture().lamaSource,
      path: path.join(reference.appData, 'inference-resources/big-lama.pt'),
    },
  ])
})

test('authored4 is distinct from observed3; every control remains provisional in both modes', () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['baseline', 'control', 'restored']) {
      const input = fixture(stage, mode),
        plan = profile.validateFixture(input)
      assert.equal(plan.items.length, 1)
      assert.equal(plan.items[0].steps, 4)
      assert.equal(profile.inferenceSteps(input), 4)
      assert.equal(profile.observedSteps(input), 3)
      assert.equal(profile.provisionalOnly(input), stage === 'control')
      assert.equal(profile.operation(input), `anima-${mode}`)
      assert.equal(profile.expectedBaselineStage(input), 'baseline')
      assert.deepEqual(profile.baselineMetadataDifferences(input), [])
    }
})

function authoredDraft(mode = 'outpaint') {
  const plan = literalAnimaHeunImagePlan('baseline', mode)
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
  const document = createEmptyProjectDocumentV1({ title: 'Heun authored', primaryBbox: plan.bbox })
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
  draft.sampling = { ...draft.sampling, steps: 4, cfgScale: 4, animaMethod: 'heun' }
  return { draft, reference, plan }
}

test('authoring checks real draft shape and detect seed, weighting, method, step and resource changes', () => {
  const { draft, reference, plan } = authoredDraft()
  profile.assertAuthored(draft, reference, fixture(), plan)
  for (const mutate of [
    (value) => {
      value.sampling.steps = 3
    },
    (value) => {
      value.sampling.animaMethod = 'euler'
    },
    (value) => {
      value.seed.policy = 'random'
    },
    (value) => {
      value.seed.value = 37
    },
    (value) => {
      value.dynamicPrompt.maxPrompts = 3
    },
    (value) => {
      value.loras[0].weight = 0.5
    },
    (value) => {
      value.loras[0].enabled = false
    },
    (value) => {
      value.loras[0].resource.localVersionId = 'other-version'
    },
    (value) => {
      value.model.fileSha256 = 'f'.repeat(64)
    },
    (value) => {
      value.positivePrompt.text = 'unweighted red'
    },
    (value) => {
      value.negativePrompt.embeddingRefs = [{}]
    },
  ]) {
    const changed = structuredClone(draft)
    mutate(changed)
    assert.throws(() => profile.assertAuthored(changed, reference, fixture(), plan))
  }
})

/** A mechanical Playwright API collaborator; this does not emulate production Main/normalization. */
function inputCollaborators(input) {
  const calls = [],
    plan = literalAnimaHeunImagePlan(input.stage, input.mode)
  const { draft } = authoredDraft(input.mode)
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

for (const mode of ['img2img', 'outpaint'])
  test(`prepareInput ${mode} mechanically authors exact strength and bbox through supplied real-boundary methods`, async () => {
    const { ctx, calls, state } = inputCollaborators(fixture('baseline', mode))
    const sourceBefore = structuredClone(state.layers)
    const result = await profile.prepareInput(ctx)
    assert.deepEqual(state.layers, sourceBefore)
    assert.deepEqual(result.bbox, ctx.plan.bbox)
    assert.deepEqual(result.savedPackage, { path: 'current.igs', sha256: 'b'.repeat(64) })
    assert.equal(result.generationDraft.sampling.denoisingStrength, 0.5)
    assert.equal(calls[0], 'import')
    assert.equal(calls[1], 'strength')
    assert.equal(calls.at(-1), 'save')
    assert.equal(calls.filter((call) => call === 'down').length, mode === 'outpaint' ? 64 : 0)
    assert.equal(calls.filter((call) => call === 'up').length, mode === 'outpaint' ? 1 : 0)
    assert.equal(calls.filter((call) => call === 'bbox-tool').length, mode === 'outpaint' ? 1 : 0)
  })

test('output hook invokes complete independent alpha expectation for both modes', () => {
  for (const mode of ['img2img', 'outpaint']) {
    const rgba = Buffer.alloc(65536 * 4)
    const alpha =
      mode === 'outpaint' ? literalAnimaHeunImageContributionAlpha() : Buffer.alloc(65536, 255)
    for (let index = 0; index < 65536; index++) rgba[index * 4 + 3] = alpha[index]
    const decoded = { dimensions: { width: 256, height: 256 }, rgba }
    const identity = profile.assertOutput({ fixture: fixture('baseline', mode), decoded })
    assert.equal(identity.byteSize, 65536)
    rgba[3] ^= 1
    assert.throws(() => profile.assertOutput({ fixture: fixture('baseline', mode), decoded }))
  }
})

test('reports state only bounded healthy mode; provisional controls never claim acceptance or solver sensitivity', () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['baseline', 'restored', 'control']) {
      const provisional = stage === 'control'
      assert.deepEqual(
        profile.summaryClaims({
          fixture: fixture(stage, mode),
          report: { generations: [{ accepted: !provisional }] },
        }),
        {
          opaqueHeunImgInferenceClaim: !provisional && mode === 'img2img',
          mixedAlphaHeunOutInferenceClaim: !provisional && mode === 'outpaint',
          predictorMaskSensitivityClaim: false,
          provisionalMutationControl: provisional,
          fullMvpClaim: false,
        },
      )
      if (provisional) {
        assert.throws(() =>
          profile.summaryClaims({
            fixture: fixture(stage, mode),
            report: { generations: [{ accepted: true }] },
          }),
        )
        assert.throws(() =>
          profile.summaryClaims({ fixture: fixture(stage, mode), report: { generations: [] } }),
        )
      }
    }
})
