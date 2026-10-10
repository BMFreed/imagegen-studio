/** Actual adapter/pure guards with explicit locator/state doubles; not Electron/native evidence. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { authoredFirstLoraWeight } from './installed-dynamic-batch-driver.mjs'
import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { noobaiLoraStackImageProfile as profile } from './noobai-lora-stack-image-profile.mjs'
import {
  authoredStack,
  installedFixture,
  resource,
} from './noobai-lora-stack-image-test-fixtures.mjs'
import {
  literalNoobaiLoraStackImagePlan as planFor,
  normalizeNoobaiLoraStackImageNativeInputs,
  validateNoobaiLoraStackImageFixture,
} from './noobai-lora-stack-image-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/lora-image-adapter-unit')
const cases = ['epsilon', 'v_prediction'].flatMap((objective) =>
  ['img2img', 'outpaint'].flatMap((mode) =>
    ['ab', 'ba', 'b-zero', 'b-disabled'].map((choice) => [objective, mode, choice]),
  ),
)
function authored([objective, mode, choice] = cases[0], stage = 'baseline') {
  const reference = installedFixture()
  const plan = planFor(stage, objective, mode, choice)
  const fixture = {
    schemaVersion: 1,
    profile: 'noobai-lora-stack-image',
    objective,
    mode,
    case: choice,
    stage,
    artifacts: path.join(root, `${objective}-${mode}-${choice}-${stage}`),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    sourceImage: {
      path: path.join(root, 'source.png'),
      byteSize: 100,
      sha256: 'c'.repeat(64),
      pixelSha256: 'd'.repeat(64),
    },
    ...(mode === 'outpaint'
      ? {
          lamaSource: {
            path: path.join(root, 'lama.pt'),
            byteSize: 205669692,
            sha256: '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
          },
        }
      : {}),
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, 'baseline/report.json'),
            reportSha256: 'e'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference_lora.py',
            originalSha256: 'f'.repeat(64),
            mutatedSha256: '1'.repeat(64),
          },
        }
      : {}),
  }
  const draft = {
    seed: { policy: 'fixed', value: 0 },
    dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-iteration' },
    sampling: {
      steps: 3,
      cfgScale: 5,
      sampler: plan.sampler,
      scheduler: 'Normal',
      denoisingStrength: 0.5,
    },
    model: resource(reference, plan.modelKey),
    vae: resource(reference, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: authoredStack(reference, choice),
    positivePrompt: { text: plan.sourcePrompts.positive, embeddingRefs: [] },
    negativePrompt: { text: plan.sourcePrompts.negative, embeddingRefs: [] },
  }
  return { reference, fixture, plan, draft }
}

test('multiple-LoRA profile binds real durable image hooks and finite sixteen-case fixture coverage', () => {
  assert.equal(profile.validateFixture, validateNoobaiLoraStackImageFixture)
  for (const key of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[key], normalizeNoobaiLoraStackImageNativeInputs)
  for (const key of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'assertSaved',
    'extraInputFiles',
  ])
    assert.equal(profile[key], illustriousDpmProfile[key])
  assert.equal(profile.cfgScale, 5)
  for (const entry of cases) {
    const { fixture, plan } = authored(entry)
    assert.deepEqual(profile.validateFixture(fixture), plan)
    assert.equal(profile.inferenceSteps(fixture), 3)
    assert.equal(profile.observedSteps(fixture), 2)
    assert.equal(profile.operation(fixture), `illustrious-${entry[1]}`)
    assert.equal(profile.requiresSourceImage(fixture), true)
    assert.deepEqual(profile.originalSourceKeys(fixture), [
      plan.modelKey,
      'illustriousLora',
      'illustriousLoraSecond',
      'externalVaeNative',
    ])
    assert.equal(profile.provisionalOnly(fixture), false)
    if (entry[0] === 'epsilon' && ['ab', 'b-disabled'].includes(entry[2]))
      assert.equal(profile.provisionalOnly(authored(entry, 'control').fixture), true)
    assert.equal(profile.comparisonSame(fixture).includes('context.mode'), entry[1] === 'img2img')
  }
})

test('driver first-weight hook accepts real reversed B first while legacy profile remains −0.5', () => {
  assert.equal(authoredFirstLoraWeight(illustriousDpmProfile, {}), -0.5)
  for (const entry of cases) {
    const { fixture, draft } = authored(entry)
    assert.equal(authoredFirstLoraWeight(profile, fixture), draft.loras[0].weight)
  }
  for (const value of [NaN, Infinity, -Infinity, '0.75', undefined, null])
    assert.throws(() => authoredFirstLoraWeight({ authoredFirstLoraWeight: () => value }, {}))
})

test('authored guard rejects lost configured order, exchanged weights, disabled/zero conflation and neighboring edits', () => {
  for (const entry of cases) {
    const { fixture, reference, plan, draft } = authored(entry)
    profile.assertAuthored(draft, reference, fixture, plan)
    for (const mutate of [
      (v) => v.loras.reverse(),
      (v) => {
        v.loras[0].weight = 1
      },
      (v) => {
        v.loras[1].enabled = !v.loras[1].enabled
      },
      (v) => {
        v.loras = v.loras.filter(({ enabled }) => enabled)
      },
      (v) => {
        v.seed.value = 37
      },
      (v) => {
        v.model.predictionType = 'epsilon'
      },
      (v) => {
        v.sampling.sampler = 'DPM++ SDE'
      },
      (v) => {
        v.negativePrompt.embeddingRefs = [{ token: '<unexpected>' }]
      },
      (v) => {
        v.vaePrecision = 'FP16'
      },
    ]) {
      const changed = structuredClone(draft)
      mutate(changed)
      if (JSON.stringify(changed) !== JSON.stringify(draft))
        assert.throws(() => profile.assertAuthored(changed, reference, fixture, plan))
    }
  }
})

function edited(entry) {
  const input = authored(entry)
  input.draft.seed = { policy: 'fixed', value: 37 }
  input.draft.loras.find(
    ({ resource }) => resource.fileSha256 === input.reference.illustriousLora.sha256,
  ).weight = -0.25
  input.draft.positivePrompt.text = 'later positive'
  input.draft.negativePrompt.text = 'later negative'
  return input
}
function description(stack) {
  return stack
    .map(
      ({ enabled, resource, weight }) =>
        `${enabled ? 'Enabled' : 'Disabled'} · ${resource.displayName} · ${resource.versionName}\nSHA-256 ${resource.fileSha256}\nWeight ${weight}`,
    )
    .join('\n')
}
function comparison(entry) {
  const { fixture, reference, plan, draft } = edited(entry)
  const item = plan.items[0]
  const values = {
    'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
    'sampling.sampler': [item.sampler, item.sampler],
    'sampling.scheduler': ['Normal', 'Normal'],
    'context.mode': [item.mode, 'img2img'],
    'guidance.steps': ['3', '3'],
    'guidance.cfg': ['5', '5'],
    'denoisingStrength.value': ['0.5', '0.5'],
    'seed.actual': ['0', '37'],
    'prompt.embeddings': ['None', 'None'],
    'negativePrompt.embeddings': ['None', 'None'],
    'loras.stack': [description(authoredStack(reference, item.case)), description(draft.loras)],
  }
  const rows = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      {
        key,
        values: value,
        status: value[0] === value[1] ? 'Same' : 'Changed',
      },
    ]),
  )
  const seen = []
  const dialog = {
    locator: (selector) => {
      const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
      assert.ok(rows[key])
      return {
        ...rows[key],
        locator: (child) => {
          assert.equal(child, '.comparison-values p')
          return { ...rows[key], allTextContents: async () => rows[key].values }
        },
      }
    },
  }
  const expect = (row) => ({
    toHaveAttribute: async (name, value) => {
      assert.equal(name, 'data-status')
      assert.equal(row.status, value)
      seen.push(row.key)
    },
    toHaveText: async (value) => assert.deepEqual(row.values, value),
  })
  return {
    fixture,
    rows,
    seen,
    ctx: { expect, dialog, generation: { expectedItem: item }, reference, currentDraft: draft },
  }
}

test('owning comparison validates both ordered descriptions, zero/disabled labels, immutable settings and ordinary sidecars', async () => {
  for (const entry of cases) {
    const { ctx, rows, seen } = comparison(entry)
    const result = await profile.assertComparison(ctx)
    assert.deepEqual(Object.keys(result).sort(), Object.keys(rows).sort())
    assert.deepEqual(seen.sort(), Object.keys(rows).sort())
    assert.equal(result['loras.stack'].status, 'Changed')
    assert.equal(result['context.mode'].status, entry[1] === 'img2img' ? 'Same' : 'Changed')
  }
})

test('comparison refuses substituted saved B, wrong stack order or live B edits instead of passing Changed alone', async () => {
  for (const mutate of [
    ({ rows }) => {
      rows['loras.stack'].values[0] = 'wrong saved LoRA'
    },
    ({ ctx }) => {
      ctx.currentDraft.loras.reverse()
    },
    ({ ctx }) => {
      ctx.currentDraft.loras[1].weight = 0.125
    },
    ({ ctx }) => {
      ctx.currentDraft.sampling.denoisingStrength = 0.75
    },
    ({ rows }) => {
      rows['negativePrompt.embeddings'].values[1] = '<unexpected>'
    },
  ]) {
    const input = comparison(cases[0])
    mutate(input)
    await assert.rejects(() => profile.assertComparison(input.ctx))
  }
})

test('later-state guard requires exact A−.25/seed37 and two distinct current trained resources', () => {
  for (const entry of cases) {
    const { draft, reference } = edited(entry)
    profile.assertEdited(draft, reference)
    for (const mutate of [
      (v) => {
        v.seed.value = 0
      },
      (v) => {
        v.loras = v.loras.slice(0, 1)
      },
      (v) => {
        v.negativePrompt.embeddingRefs = [{ token: '<unexpected>' }]
      },
    ]) {
      const changed = structuredClone(draft)
      mutate(changed)
      assert.throws(() => profile.assertEdited(changed, reference))
    }
  }
})

/** Explicit locator/catalog double: validates actual authoring operations, not a real browser. */
test('actual adapter authors B zero/disabled and BA by Remove A/Add A with exact identity polling', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-lora-image-authoring-double-'))
  try {
    for (const [index, entry] of cases
      .filter((entry) => entry[0] === 'epsilon' && entry[1] === 'img2img')
      .entries()) {
      const { mkdir } = await import('node:fs/promises')
      const { fixture, reference, draft } = authored(entry)
      fixture.artifacts = path.join(temporary, String(index))
      await mkdir(fixture.artifacts)
      draft.loras = authoredStack(reference, 'ab').slice(0, 1)
      const calls = []
      let opened = false
      let picker = false
      const sources = [reference.illustriousLora, reference.illustriousLoraSecond]
      const source = reference.illustriousEpsilon
      const ztsnr = { kind: 'ztsnr', checked: 'false', getAttribute: async () => 'false' }
      const row = {
        kind: 'version-row',
        text: source.versionName,
        count: 1,
        locator: (selector) => {
          if (selector.startsWith('[aria-label="Prediction type'))
            return { text: 'Epsilon', innerText: async () => 'Epsilon' }
          assert.ok(selector.startsWith('[aria-label="Timestep spacing'))
          return { text: 'Leading', innerText: async () => 'Leading' }
        },
        getByRole: (role, { name }) => {
          assert.equal(role, 'switch')
          assert.equal(name, `ZTSNR for ${source.versionName}`)
          return ztsnr
        },
      }
      const manager = {
        visible: () => opened,
        locator: (selector) => {
          assert.equal(selector, '.version-row--project')
          return row
        },
        getByRole: (role, { name }) => {
          assert.equal(role, 'button')
          assert.equal(name, 'Close Model Manager')
          return {
            click: async () => {
              opened = false
              calls.push('close-manager')
            },
          }
        },
      }
      const window = {
        locator: (selector) => {
          if (selector === 'input[aria-label="VAE"]')
            return {
              isVisible: async () => true,
              scrollIntoViewIfNeeded: async () => {},
            }
          if (selector === '[aria-label="Add LoRA"]')
            return {
              click: async () => {
                picker = true
                calls.push('open-lora-picker')
              },
            }
          const name = /^input\[aria-label="(.+) weight"\]$/.exec(selector)?.[1]
          const selected = sources.find((source) => source.name === name)
          assert.ok(selected, selector)
          return {
            fill: async (value) => {
              calls.push(`weight:${name}:${value}`)
              draft.loras.find(
                ({ resource }) => resource.localVersionId === selected.installed.versionId,
              ).weight = Number(value)
            },
            press: async (key) => {
              assert.equal(key, 'Enter')
              calls.push(`commit:${name}`)
            },
          }
        },
        getByText: (name, { exact }) => {
          assert.equal(exact, true)
          const selected = sources.find((source) => source.name === name)
          assert.ok(selected)
          return {
            last: () => ({
              click: async () => {
                assert.equal(picker, true)
                picker = false
                assert.equal(
                  draft.loras.some(
                    ({ resource }) => resource.localVersionId === selected.installed.versionId,
                  ),
                  false,
                )
                const key =
                  selected === reference.illustriousLora
                    ? 'illustriousLora'
                    : 'illustriousLoraSecond'
                draft.loras.push({ enabled: true, resource: resource(reference, key), weight: 1 })
                calls.push(`add:${name}`)
              },
            }),
          }
        },
        getByRole: (role, { name, exact }) => {
          assert.equal(exact, true)
          if (role === 'dialog') {
            assert.equal(name, 'Model Manager')
            return manager
          }
          if (name === 'Manage Models')
            return {
              click: async () => {
                opened = true
                calls.push('open-manager')
              },
            }
          if (role === 'switch') {
            assert.equal(name, `Enable ${reference.illustriousLoraSecond.name}`)
            return {
              checked: 'true',
              click: async () => {
                draft.loras.find(
                  ({ resource }) =>
                    resource.localVersionId === reference.illustriousLoraSecond.installed.versionId,
                ).enabled = false
                calls.push('disable-b')
              },
            }
          }
          assert.equal(name, `Remove ${reference.illustriousLora.name}`)
          return {
            click: async () => {
              draft.loras = draft.loras.filter(
                ({ resource }) =>
                  resource.localVersionId !== reference.illustriousLora.installed.versionId,
              )
              calls.push('remove-a')
            },
          }
        },
        evaluate: async () => ({
          ok: true,
          value: [
            {
              id: source.installed.resourceId,
              versions: [
                {
                  id: source.installed.versionId,
                  sha256: source.sha256,
                  fileSizeBytes: source.byteSize,
                  predictionType: 'epsilon',
                  noiseProfile: {
                    effective: {
                      schemaVersion: 1,
                      baseSchedule: 'sdxl-scaled-linear-v1',
                      rescaleBetasZeroSnr: false,
                      timestepSpacing: 'leading',
                    },
                    rescaleBetasZeroSnrSource: 'override',
                    timestepSpacingSource: 'override',
                  },
                },
              ],
            },
          ],
        }),
        screenshot: async () => {
          calls.push('policy-screenshot')
        },
      }
      const expect = (value) => ({
        toBeEnabled: async () => {},
        toHaveCount: async (count) => assert.equal(value.count, count),
        toContainText: async (text) => assert.ok(value.text.includes(text)),
        toHaveAttribute: async (name, text) => {
          assert.equal(name, 'aria-checked')
          assert.equal(value.checked, text)
        },
        not: { toBeVisible: async () => assert.equal(value.visible(), false) },
      })
      expect.poll = (read) => ({
        toBe: async (value) => assert.equal(await read(), value),
        toEqual: async (value) => assert.deepEqual(await read(), value),
      })
      await profile.authorComponents({
        window,
        expect,
        tab: async () => ({ generationDraft: draft }),
        project: { id: 'explicit-ui-double' },
        reference,
        fixture,
        setSelect: async () => assert.fail('Already-FP32 VAE must not change.'),
      })
      assert.deepEqual(draft.loras, authoredStack(reference, entry[2]))
      assert.equal(calls.includes('disable-b'), entry[2] === 'b-disabled')
      assert.equal(calls.includes('remove-a'), entry[2] === 'ba')
      assert.equal(calls.includes(`add:${reference.illustriousLora.name}`), entry[2] === 'ba')
      assert.ok(
        calls.includes(
          `weight:${reference.illustriousLoraSecond.name}:${entry[2] === 'b-zero' ? 0 : 0.75}`,
        ),
      )
      assert.equal(calls.includes('open-manager'), true)
      assert.equal(calls.includes('close-manager'), true)
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
