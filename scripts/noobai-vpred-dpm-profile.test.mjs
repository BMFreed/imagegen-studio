/** Injected adapter checks; fake UI/catalog do not prove Electron, policy persistence or ML. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { literalIllustriousDpmPlan } from './illustrious-dpm-qualification.mjs'
import { noobaiVpredDpmProfile as profile } from './noobai-vpred-dpm-profile.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/noobai-vpred-dpm-profile')
const cases = [
  ['v_prediction', 'Normal', 'illustrious', 'dpmpp_2m'],
  ['v_prediction', 'Karras', 'illustrious', 'dpmpp_2m_k'],
  ['epsilon', 'Normal', 'illustriousEpsilon', 'dpmpp_2m'],
]
function fixture(entry, stage = 'baseline') {
  return {
    schemaVersion: 1,
    profile: 'noobai-vpred-dpm',
    objective: entry[0],
    algorithm: 'dpmpp_2m',
    schedule: entry[1],
    mode: 'txt2img',
    case: 'history',
    stage,
    artifacts: path.join(root, `${entry[0]}-${entry[1]}-${stage}`),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    ...(stage === 'baseline'
      ? {}
      : {
          baseline: {
            reportPath: path.join(root, 'baseline/report.json'),
            reportSha256: 'c'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference.py',
            originalSha256: 'd'.repeat(64),
            mutatedSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}
function authored(entry) {
  const plan = literalIllustriousDpmPlan(
    'baseline',
    'dpmpp_2m',
    entry[1],
    'txt2img',
    'history',
    entry[0],
  )
  const reference = Object.fromEntries(
    ['illustrious', 'illustriousEpsilon', 'illustriousLora', 'externalVaeNative'].map(
      (key, index) => [
        key,
        {
          sha256: String(index + 1).repeat(64),
          byteSize: 1024 + index,
          name: `Exact ${key}`,
          versionName: `Exact ${key} version`,
          installed: { resourceId: randomUUID(), versionId: randomUUID() },
        },
      ],
    ),
  )
  const draft = createEmptyProjectDocumentV1({
    title: 'Injected V adapter',
    primaryBbox: plan.bbox,
  }).generationDraft
  const model = reference[entry[2]]
  draft.model = {
    localModelId: model.installed.resourceId,
    localVersionId: model.installed.versionId,
    fileSha256: model.sha256,
    predictionType: entry[0],
  }
  const vae = reference.externalVaeNative
  draft.vae = {
    localModelId: vae.installed.resourceId,
    localVersionId: vae.installed.versionId,
    fileSha256: vae.sha256,
  }
  draft.vaePrecision = 'FP32'
  const lora = reference.illustriousLora
  draft.loras = [
    {
      enabled: true,
      weight: -0.5,
      resource: {
        localModelId: lora.installed.resourceId,
        localVersionId: lora.installed.versionId,
        fileSha256: lora.sha256,
      },
    },
  ]
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
  draft.positivePrompt = {
    embeddingRefs: [],
    text: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
  }
  draft.negativePrompt = { embeddingRefs: [], text: '(blurry:0.7), low quality' }
  draft.sampling = {
    ...draft.sampling,
    steps: 4,
    cfgScale: 4,
    sampler: 'DPM++ 2M',
    scheduler: entry[1],
  }
  return { reference, draft, plan }
}

test('V adapter routes exact checkpoint and finite TXT stages while retaining valid current DPM2M pair', () => {
  for (const entry of cases)
    for (const stage of entry[0] === 'v_prediction'
      ? ['baseline', 'control', 'restored']
      : ['baseline', 'control']) {
      const value = fixture(entry, stage)
      const plan = profile.validateFixture(value)
      assert.equal(plan.objective, entry[0])
      assert.equal(profile.modelKey(value), entry[2])
      assert.deepEqual(profile.originalSourceKeys(value), [
        entry[2],
        'illustriousLora',
        'externalVaeNative',
      ])
      assert.equal(profile.requiresSourceImage(value), false)
      assert.equal(profile.operation(value), 'illustrious-txt2img')
      assert.deepEqual(profile.extraInputFiles(value, {}), [])
      assert.equal(profile.inferenceSteps(value), 4)
      assert.equal(profile.observedSteps(value), 4)
      assert.equal(profile.provisionalOnly(value), stage === 'control')
      assert.deepEqual(profile.sampling(value), {
        label: 'Sampler',
        draftKey: 'sampler',
        value: 'DPM++ 2M',
        code: 'DPM++ 2M',
        editedValue: 'DPM++ 2M',
        editedCode: 'DPM++ 2M',
        scheduler: entry[1],
      })
      assert.equal(profile.cfgScale, 4)
      assert.deepEqual(profile.comparisonChanged(value), [
        'seed.actual',
        'prompt.text',
        'negativePrompt.text',
        'loras.stack',
        'context.mode',
      ])
      assert.deepEqual(profile.comparisonSame(value), [
        'model.resource',
        'model.predictionType',
        'sampling.scheduler',
        'noiseProfile.baseSchedule',
        'noiseProfile.rescaleBetasZeroSnr',
        'noiseProfile.timestepSpacing',
        'vae.resource',
        'vaePrecision.value',
        'guidance.steps',
        'guidance.cfg',
        'sampling.sampler',
        'sampling.invokeScheduler',
      ])
    }
})

test('authored adapter assertions distinguish exact V/EPS version, prediction, signed LoRA and external VAE', () => {
  for (const entry of cases) {
    const { draft, reference, plan } = authored(entry)
    profile.assertAuthored(draft, reference, fixture(entry), plan)
    for (const change of [
      (v) => {
        v.model.localVersionId =
          reference[
            entry[2] === 'illustrious' ? 'illustriousEpsilon' : 'illustrious'
          ].installed.versionId
      },
      (v) => {
        v.model.predictionType = entry[0] === 'v_prediction' ? 'epsilon' : 'v_prediction'
      },
      (v) => {
        v.sampling.scheduler = entry[1] === 'Normal' ? 'Karras' : 'Normal'
      },
      (v) => {
        v.seed.value = 37
      },
      (v) => {
        v.loras[0].weight = 0.5
      },
      (v) => {
        v.vaePrecision = 'FP16'
      },
      (v) => {
        v.vae.fileSha256 = 'f'.repeat(64)
      },
    ]) {
      const changed = structuredClone(draft)
      change(changed)
      assert.throws(() => profile.assertAuthored(changed, reference, fixture(entry), plan))
    }
  }
})

test('comparison adapter checks native key/mode/seed and refuses unexpected sampler changes', async () => {
  for (const entry of cases) {
    const { draft, plan } = authored(entry)
    draft.seed = { policy: 'fixed', value: 37 }
    const values = {
      'sampling.invokeScheduler': [entry[3], entry[3]],
      'sampling.sampler': ['DPM++ 2M', 'DPM++ 2M'],
      'sampling.scheduler': [entry[1], entry[1]],
      'context.mode': ['txt2img', 'img2img'],
      'guidance.steps': ['4', '4'],
      'guidance.cfg': ['4', '4'],
      'seed.actual': ['0', '37'],
    }
    const observed = []
    const dialog = {
      locator: (selector) => {
        const match = /^\[data-setting="(.+)"\]$/.exec(selector)
        assert.ok(match)
        assert.ok(Object.hasOwn(values, match[1]))
        const key = match[1]
        return {
          key,
          values: values[key],
          locator: (child) => {
            assert.equal(child, '.comparison-values p')
            return { key, values: values[key] }
          },
        }
      },
    }
    const expect = (row) => ({
      toHaveAttribute: async (name, status) => {
        assert.equal(name, 'data-status')
        assert.equal(status, row.values[0] === row.values[1] ? 'Same' : 'Changed')
        observed.push(row.key)
      },
      toHaveText: async (actual) => assert.deepEqual(actual, row.values),
    })
    const evidence = await profile.assertComparison({
      expect,
      dialog,
      generation: { expectedItem: plan.items[0] },
      currentDraft: draft,
    })
    assert.deepEqual(observed.sort(), Object.keys(values).sort())
    assert.deepEqual(
      evidence,
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          { status: value[0] === value[1] ? 'Same' : 'Changed', values: value },
        ]),
      ),
    )
    draft.sampling.sampler = 'DPM++ SDE'
    await assert.rejects(
      profile.assertComparison({
        expect,
        dialog,
        generation: { expectedItem: plan.items[0] },
        currentDraft: draft,
      }),
    )
  }
})

/** UI/catalog are explicit injected doubles; the adapter's proof serializer and checks stay real. */
function managerContext(entry, directory) {
  const { reference, draft } = authored(entry)
  const source = reference[entry[2]]
  const ui = {
    prediction: entry[0] === 'v_prediction' ? 'V-prediction' : 'Epsilon',
    ztsnr: String(entry[0] === 'v_prediction'),
    spacing: 'Leading',
  }
  const version = {
    id: source.installed.versionId,
    sha256: source.sha256,
    fileSizeBytes: source.byteSize,
    predictionType: entry[0],
    noiseProfile: {
      effective: {
        schemaVersion: 1,
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: entry[0] === 'v_prediction',
        timestepSpacing: 'leading',
      },
      rescaleBetasZeroSnrSource: 'override',
      timestepSpacingSource: 'override',
    },
  }
  const calls = []
  let visible = false
  const prediction = { kind: 'prediction', innerText: async () => ui.prediction }
  const spacing = { kind: 'spacing', innerText: async () => ui.spacing }
  const ztsnr = {
    kind: 'ztsnr',
    getAttribute: async (name) => {
      assert.equal(name, 'aria-checked')
      return ui.ztsnr
    },
  }
  const row = {
    kind: 'row',
    locator: (selector) => {
      if (selector === `[aria-label="Prediction type for ${source.versionName}"]`) return prediction
      assert.equal(selector, `[aria-label="Timestep spacing for ${source.versionName}"]`)
      return spacing
    },
    getByRole: (role, options) => {
      assert.equal(role, 'switch')
      assert.equal(options.name, `ZTSNR for ${source.versionName}`)
      return ztsnr
    },
  }
  const manager = {
    kind: 'manager',
    locator: (selector) => {
      assert.equal(selector, '.version-row--project')
      return row
    },
    getByRole: (role, options) => {
      assert.equal(role, 'button')
      assert.equal(options.name, 'Close Model Manager')
      return {
        click: async () => {
          calls.push('close')
          visible = false
        },
      }
    },
  }
  const input = {
    isVisible: async () => true,
    scrollIntoViewIfNeeded: async () => calls.push('vae-scroll'),
  }
  const expect = (target) => ({
    toBeEnabled: async () => assert.equal(target, input),
    toHaveCount: async (value) => {
      assert.equal(target, row)
      assert.equal(value, 1)
    },
    toContainText: async (text) =>
      assert.ok((target === row ? source.versionName : await target.innerText()).includes(text)),
    toHaveAttribute: async (name, value) => assert.equal(await target.getAttribute(name), value),
    not: {
      toBeVisible: async () => {
        assert.equal(target, manager)
        assert.equal(visible, false)
      },
    },
  })
  expect.poll = (read) => ({ toBe: async (value) => assert.equal(await read(), value) })
  const ctx = {
    fixture: { ...fixture(entry), artifacts: directory },
    project: { id: randomUUID() },
    reference,
    tab: async () => ({ generationDraft: structuredClone(draft) }),
    expect,
    setSelect: async () => assert.fail('The already selected exact FP32 VAE needs no edits.'),
    window: {
      locator: (selector) => {
        assert.equal(selector, 'input[aria-label="VAE"]')
        return input
      },
      getByRole: (role, options) => {
        if (role === 'button') {
          assert.equal(options.name, 'Manage Models')
          return {
            click: async () => {
              calls.push('open')
              visible = true
            },
          }
        }
        assert.equal(role, 'dialog')
        assert.equal(options.name, 'Model Manager')
        return manager
      },
      evaluate: async () => {
        calls.push('readonly-catalog')
        return {
          ok: true,
          value: [{ id: source.installed.resourceId, versions: [structuredClone(version)] }],
        }
      },
      screenshot: async (options) => {
        assert.equal(options.path, path.join(directory, 'model-manager-profile.png'))
        calls.push('screenshot')
      },
    },
  }
  return { ctx, calls, draft, version, ui, source }
}

test('injected Model Manager adapter confirms exact V/EPS tuple, saves compact proof and preserves draft', async () => {
  for (const entry of cases) {
    const directory = await mkdtemp(path.join(tmpdir(), 'igs-vpred-profile-proof-'))
    try {
      const { ctx, calls, draft, source, version } = managerContext(entry, directory)
      const before = structuredClone(draft)
      await profile.authorComponents(ctx)
      assert.deepEqual(calls, ['vae-scroll', 'open', 'readonly-catalog', 'screenshot', 'close'])
      const proof = JSON.parse(
        await readFile(path.join(directory, 'model-manager-profile.json'), 'utf8'),
      )
      assert.deepEqual(proof, {
        resourceId: source.installed.resourceId,
        versionId: source.installed.versionId,
        sha256: source.sha256,
        byteSize: source.byteSize,
        predictionType: entry[0],
        noiseProfile: version.noiseProfile,
        ui: {
          prediction: entry[0] === 'v_prediction' ? 'V-prediction' : 'Epsilon',
          ztsnr: String(entry[0] === 'v_prediction'),
          spacing: 'Leading',
        },
        boundary:
          'Actual Model Manager confirms existing exact-file policy; no library edit or installation.',
      })
      assert.deepEqual(draft, before)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

test('injected Model Manager adapter refuses wrong exact-version/profile/UI data before proof publication', async () => {
  for (const change of [
    ({ version }) => {
      version.id = randomUUID()
    },
    ({ version }) => {
      version.sha256 = 'f'.repeat(64)
    },
    ({ version }) => {
      version.fileSizeBytes++
    },
    ({ version }) => {
      version.predictionType = 'epsilon'
    },
    ({ version }) => {
      version.noiseProfile.effective.rescaleBetasZeroSnr = false
    },
    ({ version }) => {
      version.noiseProfile.effective.timestepSpacing = 'trailing'
    },
    ({ version }) => {
      version.noiseProfile.rescaleBetasZeroSnrSource = 'assumed'
    },
    ({ ui }) => {
      ui.prediction = 'Epsilon'
    },
    ({ ui }) => {
      ui.ztsnr = 'false'
    },
    ({ ui }) => {
      ui.spacing = 'Trailing'
    },
  ]) {
    const directory = await mkdtemp(path.join(tmpdir(), 'igs-vpred-profile-refusal-'))
    try {
      const input = managerContext(cases[0], directory)
      change(input)
      await assert.rejects(profile.authorComponents(input.ctx))
      assert.equal(input.calls.includes('screenshot'), false)
      await assert.rejects(readFile(path.join(directory, 'model-manager-profile.json')), {
        code: 'ENOENT',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})
