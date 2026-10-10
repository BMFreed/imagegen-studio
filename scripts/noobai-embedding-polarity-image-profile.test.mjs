/** Injected adapter checks; UI/catalog doubles do not prove Electron, native tensors or pixels. */
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { illustriousDpmProfile } from './illustrious-dpm-profile.mjs'
import { noobaiVpredDpmProfile } from './noobai-vpred-dpm-profile.mjs'
import { noobaiEmbeddingPolarityImageProfile as profile } from './noobai-embedding-polarity-image-profile.mjs'
import {
  assertNoobaiEmbeddingPolarityImageConfiguration,
  assertNoobaiEmbeddingPolarityImageFrozen,
  literalNoobaiEmbeddingPolarityImagePlan,
  normalizeNoobaiEmbeddingPolarityImageNativeInputs,
  validateNoobaiEmbeddingPolarityImageFixture,
} from './noobai-embedding-polarity-image-qualification.mjs'

const root = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/embedding-image-adapter-unit',
)
const cases = [
  ...['epsilon', 'v_prediction'].flatMap((objective) =>
    ['img2img', 'outpaint'].flatMap((mode) =>
      ['positive-zero', 'negative-zero'].map((caseName) => [objective, mode, caseName]),
    ),
  ),
  ['epsilon', 'img2img', 'ordinary'],
]
const token = '<illustriousphoto>'

function fixture([objective, mode, caseName] = cases[0], stage = 'baseline') {
  return {
    schemaVersion: 1,
    profile: 'noobai-embedding-polarity-image',
    objective,
    mode,
    case: caseName,
    stage,
    artifacts: path.join(root, `${objective}-${mode}-${caseName}-${stage}`),
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    sourceImage: {
      path: path.join(root, `${objective}-common-source.png`),
      sha256: 'c'.repeat(64),
      pixelSha256: 'd'.repeat(64),
      byteSize: 1024,
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
            reportPath: path.join(root, `${objective}-${mode}-${caseName}-healthy/report.json`),
            reportSha256: 'e'.repeat(64),
          },
        }),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference_embeddings.py',
            originalSha256: 'f'.repeat(64),
            mutatedSha256: '1'.repeat(64),
          },
        }
      : {}),
  }
}

function reference() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const data = { appData }
  for (const [key, id, size, sha256, type, modelId, versionId, fileId, objective] of [
    [
      'illustrious',
      700040,
      6938040794,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      'checkpoint',
      1147756,
      2679856,
      2566634,
      'v_prediction',
    ],
    [
      'illustriousEpsilon',
      700140,
      6938040416,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      'checkpoint',
      833294,
      1022833,
      928571,
      'epsilon',
    ],
    [
      'illustriousLora',
      700060,
      114437420,
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      'lora',
      700060,
      700061,
      700062,
    ],
    [
      'externalVaeNative',
      700080,
      167335542,
      'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      'vae',
      700070,
      700081,
      700082,
    ],
    [
      'embeddingTrained',
      700100,
      49736,
      '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
      'embedding',
      2360940,
      2655289,
      2542976,
    ],
    [
      'embeddingControl',
      700110,
      49552,
      'b736cd9c1f9ee07795c5917825baa95ae14bac6383bdddff5530dfefa4bece0d',
      'embedding',
      2360940,
      700111,
      700112,
    ],
  ]) {
    data[key] = {
      path: path.join(
        root,
        key,
        type === 'embedding' ? 'illustriousphoto.safetensors' : `${key}.safetensors`,
      ),
      byteSize: size,
      sha256,
      type,
      family: 'illustrious',
      name: type === 'embedding' ? 'IllustriousPhoto Embedding' : key,
      versionName:
        key === 'embeddingTrained'
          ? 'WAIv15 1152steps'
          : key === 'embeddingControl'
            ? 'Artificial zero control'
            : 'Exact version',
      origin:
        key === 'embeddingControl'
          ? {
              kind: 'artificial-zero-control',
              sourceEmbeddingSha256:
                '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
            }
          : { modelId, versionId, fileId },
      ...(objective ? { trainedObjective: objective } : {}),
      installed: {
        resourceId: type === 'embedding' ? 'embedding-resource' : `${key}-resource`,
        versionId: `${key}-version`,
        managedPath: path.join(appData, 'models', `qualified-${id}.safetensors`),
      },
    }
  }
  data.embeddingTrained.origin = {
    kind: 'civitai-trained',
    modelId: 2360940,
    versionId: 2655289,
    fileId: 2542976,
    url: 'https://civitai.com/api/download/models/2655289?fileId=2542976',
    creator: 'CautionMergeAhead',
    creditRequired: true,
  }
  return data
}

/** Independent literal refs feed the injected UI. They do not call the profile's oracle helper. */
function embeddingRef(data, key) {
  const source = data[key]
  return {
    token,
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: key === 'embeddingTrained' ? 2542976 : 700112,
      civitaiModelId: 2360940,
      civitaiVersionId: key === 'embeddingTrained' ? 2655289 : 700111,
      displayName: source.name,
      fileSha256: source.sha256,
      kind: 'embedding',
      localModelId: source.installed.resourceId,
      localVersionId: source.installed.versionId,
      predictionType: null,
      versionName: source.versionName,
    },
  }
}
function authored(entry) {
  const input = fixture(entry)
  const plan = literalNoobaiEmbeddingPolarityImagePlan('baseline', entry[0], entry[1], entry[2])
  const data = reference()
  const selected = data[entry[0] === 'epsilon' ? 'illustriousEpsilon' : 'illustrious']
  const draft = {
    seed: { policy: 'fixed', value: 0 },
    dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-iteration' },
    model: {
      localModelId: selected.installed.resourceId,
      localVersionId: selected.installed.versionId,
      fileSha256: selected.sha256,
      predictionType: entry[0],
    },
    vae: {
      localModelId: data.externalVaeNative.installed.resourceId,
      localVersionId: data.externalVaeNative.installed.versionId,
      fileSha256: data.externalVaeNative.sha256,
    },
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: [
      {
        enabled: true,
        weight: -0.5,
        resource: {
          localModelId: data.illustriousLora.installed.resourceId,
          localVersionId: data.illustriousLora.installed.versionId,
          fileSha256: data.illustriousLora.sha256,
        },
      },
    ],
    sampling: {
      steps: 3,
      cfgScale: 5,
      sampler: entry[0] === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      denoisingStrength: 0.5,
    },
  }
  for (const polarity of ['positive', 'negative']) {
    const key =
      entry[2] === 'ordinary'
        ? null
        : entry[2] === `${polarity}-zero`
          ? 'embeddingControl'
          : 'embeddingTrained'
    draft[`${polarity}Prompt`] = {
      text: plan.sourcePrompts[polarity],
      embeddingRefs: key === null ? [] : [embeddingRef(data, key)],
    }
  }
  return { input, plan, data, draft }
}

test('image polarity profile binds the separate oracle and existing exact-policy/image persistence hooks', () => {
  assert.equal(profile.validateFixture, validateNoobaiEmbeddingPolarityImageFixture)
  assert.equal(profile.assertFrozen, assertNoobaiEmbeddingPolarityImageFrozen)
  assert.equal(profile.assertConfiguration, assertNoobaiEmbeddingPolarityImageConfiguration)
  for (const key of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[key], normalizeNoobaiEmbeddingPolarityImageNativeInputs)
  assert.equal(profile.authorComponents, noobaiVpredDpmProfile.authorComponents)
  for (const key of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'assertSaved',
    'extraInputFiles',
  ])
    assert.equal(profile[key], illustriousDpmProfile[key])
  assert.equal(profile.cfgScale, 5)
  assert.ok(profile.sourceDependencies.includes('scripts/noobai-vpred-dpm-profile.mjs'))
  assert.ok(profile.sourceDependencies.includes('scripts/illustrious-dpm-profile.mjs'))
  for (const entry of cases) {
    const { input, plan } = authored(entry)
    assert.deepEqual(profile.validateFixture(input), plan)
    const modelKey = entry[0] === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
    const sampler = entry[0] === 'epsilon' ? 'Euler a' : 'Euler'
    assert.equal(profile.modelKey(input), modelKey)
    assert.deepEqual(profile.originalSourceKeys(input), [
      modelKey,
      'illustriousLora',
      'externalVaeNative',
      'embeddingTrained',
      'embeddingControl',
    ])
    assert.equal(profile.requiresSourceImage(input), true)
    assert.equal(profile.operation(input), `illustrious-${entry[1]}`)
    assert.equal(profile.inferenceSteps(input), 3)
    assert.equal(profile.observedSteps(input), 2)
    assert.deepEqual(profile.sampling(input), {
      label: 'Sampler',
      draftKey: 'sampler',
      value: sampler,
      code: sampler,
      editedValue: sampler,
      editedCode: sampler,
      scheduler: 'Normal',
    })
    if (entry[0] === 'epsilon') {
      assert.equal(profile.provisionalOnly(fixture(entry, 'control')), true)
      profile.validateFixture(fixture(entry, 'control'))
    } else assert.throws(() => profile.validateFixture(fixture(entry, 'control')))
    assert.equal(profile.provisionalOnly(input), false)
    assert.equal(profile.comparisonChanged(input).includes('context.mode'), entry[1] === 'outpaint')
    assert.equal(profile.comparisonSame(input).includes('context.mode'), entry[1] === 'img2img')
  }
})

test('authored assertions reject dropped/swapped/default signed refs and changed exact neighboring settings', () => {
  for (const entry of cases) {
    const { input, plan, data, draft } = authored(entry)
    profile.assertAuthored(draft, data, input, plan)
    for (const change of [
      (v) => {
        v.seed.value = 37
      },
      (v) => {
        v.model.predictionType = entry[0] === 'epsilon' ? 'v_prediction' : 'epsilon'
      },
      (v) => {
        v.model.localVersionId = 'another-version'
      },
      (v) => {
        v.sampling.steps = 4
      },
      (v) => {
        v.sampling.cfgScale = 4
      },
      (v) => {
        v.sampling.sampler = 'DPM++ SDE'
      },
      (v) => {
        v.sampling.scheduler = 'Karras'
      },
      (v) => {
        v.vaePrecision = 'FP16'
      },
      (v) => {
        v.loras[0].weight = 0.5
      },
      (v) => {
        v.positivePrompt.text += ', late edit'
      },
      ...(entry[2] === 'ordinary'
        ? [
            (v) => {
              v.negativePrompt.embeddingRefs = [embeddingRef(data, 'embeddingTrained')]
            },
          ]
        : [
            (v) => {
              v.positivePrompt.embeddingRefs = []
            },
            (v) => {
              ;[v.positivePrompt.embeddingRefs, v.negativePrompt.embeddingRefs] = [
                v.negativePrompt.embeddingRefs,
                v.positivePrompt.embeddingRefs,
              ]
            },
            (v) => {
              v.negativePrompt.embeddingRefs[0].resource.localVersionId = 'mutable-default'
            },
          ]),
    ]) {
      const changed = structuredClone(draft)
      change(changed)
      assert.throws(() => profile.assertAuthored(changed, data, input, plan))
    }
  }
})

/** Explicit UI double: exercise production adapter locators/state checks, not real CodeMirror. */
function authoringContext(entry, fault = null) {
  const { plan, data } = authored(entry)
  const draft = {
    positivePrompt: { text: '', embeddingRefs: [] },
    negativePrompt: { text: '', embeddingRefs: [] },
  }
  const calls = []
  const failures = []
  let focused = null
  const controls = {}
  function prompt(polarity) {
    return draft[`${polarity}Prompt`]
  }
  for (const polarity of ['positive', 'negative']) {
    controls[polarity] = {
      kind: 'control',
      polarity,
      listId: `${polarity}-completion`,
      fill: async (text) => {
        focused = polarity
        prompt(polarity).text = text
        prompt(polarity).embeddingRefs = prompt(polarity).embeddingRefs.filter(
          ({ token: literal }) => text.includes(literal),
        )
        calls.push(`${polarity}:fill`)
      },
      press: async (key) => {
        calls.push(`${polarity}:${key}`)
        if (key === 'Tab') focused = null
        else assert.equal(focused, polarity)
      },
      focus: async () => {
        focused = polarity
      },
      getAttribute: async (name) => {
        assert.equal(name, 'aria-controls')
        return controls[polarity].listId
      },
      locator: (selector) => {
        assert.ok(['.cm-prompt-embedding', '.cm-prompt-embedding-warning'].includes(selector))
        return { kind: 'decoration', polarity, warning: selector.endsWith('-warning') }
      },
    }
  }
  const expect = (target) => ({
    toHaveText: async (text) =>
      assert.equal(target.kind === 'control' ? prompt(target.polarity).text : token, text),
    toHaveAttribute: async (name, value) => {
      const actual = await target.getAttribute(name)
      if (value instanceof RegExp) assert.match(actual, value)
      else assert.equal(actual, value)
    },
    toHaveCount: async (count) => {
      const actual =
        target.kind === 'decoration'
          ? target.warning
            ? 0
            : prompt(target.polarity).embeddingRefs.length
          : 1
      assert.equal(actual, count)
    },
    toBeVisible: async () => assert.equal(focused, target.polarity),
    toBeFocused: async () => assert.equal(focused, target.polarity),
    not: { toBeFocused: async () => assert.notEqual(focused, target.polarity) },
  })
  expect.poll = (read) => ({
    toBe: async (value) => assert.equal(await read(), value),
    toEqual: async (value) => assert.deepEqual(await read(), value),
  })
  const ctx = {
    project: { id: 'project' },
    reference: data,
    currentPlan: plan,
    expect,
    tab: async () => ({ generationDraft: structuredClone(draft) }),
    recordAuthoringFailure: async (evidence) => failures.push(evidence),
    window: {
      getByRole: (role, options) => {
        assert.equal(role, 'textbox', 'Completion choices must be scoped to the focused list.')
        return controls[options.name === 'Positive prompt' ? 'positive' : 'negative']
      },
      getByText: (text, options) => {
        assert.equal(text, token)
        assert.equal(options.exact, true)
        return { token: text }
      },
      evaluate: async () => ({
        editors: Object.values(controls).map(({ polarity, listId }) => ({
          polarity,
          listId,
          focused: focused === polarity,
        })),
        lists: [],
      }),
      locator: (selector) => {
        const match = /^\[role="listbox"\]\[id="(positive|negative)-completion"\]$/.exec(selector)
        assert.ok(match, 'A literal focused-editor aria-controls ID is required.')
        const polarity = match[1]
        assert.equal(focused, polarity)
        const list = {
          kind: 'list',
          polarity,
          getByRole: (role) => {
            assert.equal(role, 'option')
            let chosen = null
            const option = {
              kind: 'option',
              polarity,
              filter: (options) => {
                if (options.has) assert.equal(options.has.token, token)
                else {
                  chosen = ['embeddingTrained', 'embeddingControl'].find(
                    (key) => options.hasText === `${data[key].name} · ${data[key].versionName}`,
                  )
                  assert.ok(
                    chosen,
                    'Both versions share a literal; choose the exact version label.',
                  )
                }
                return option
              },
              evaluate: async () =>
                fault === 'wrong-owner' ? 'other-completion' : controls[polarity].listId,
              click: async () => {
                assert.ok(chosen)
                calls.push(`${polarity}:choose:${chosen}`)
                prompt(polarity).embeddingRefs = [
                  embeddingRef(data, fault === 'wrong-version' ? 'embeddingTrained' : chosen),
                ]
              },
            }
            return option
          },
        }
        return list
      },
    },
  }
  return { ctx, draft, data, plan, calls, failures }
}

test('real adapter authoring scopes both crossed exact-version choices to each focused completion list', async () => {
  for (const entry of cases.filter((value) => value[2] !== 'ordinary')) {
    const { ctx, draft, data, plan, calls, failures } = authoringContext(entry)
    await profile.authorPrompts(ctx)
    for (const polarity of ['positive', 'negative']) {
      const selected = entry[2] === `${polarity}-zero` ? 'embeddingControl' : 'embeddingTrained'
      assert.deepEqual(draft[`${polarity}Prompt`], {
        text: plan.sourcePrompts[polarity],
        embeddingRefs: [embeddingRef(data, selected)],
      })
      assert.equal(calls.filter((call) => call === `${polarity}:choose:${selected}`).length, 1)
      assert.equal(calls.filter((call) => call === `${polarity}:Control+Space`).length, 1)
      assert.equal(calls.filter((call) => call === `${polarity}:Tab`).length, 2)
    }
    assert.deepEqual(failures, [])
  }
})

test('ordinary neighbor authors no literal, opens no embedding picker and has no effective sidecars', async () => {
  const { ctx, draft, plan, calls, failures } = authoringContext(['epsilon', 'img2img', 'ordinary'])
  await profile.authorPrompts(ctx)
  for (const polarity of ['positive', 'negative']) {
    assert.deepEqual(draft[`${polarity}Prompt`], {
      text: plan.sourcePrompts[polarity],
      embeddingRefs: [],
    })
    assert.equal(draft[`${polarity}Prompt`].text.includes(token), false)
  }
  assert.equal(
    calls.some((call) => call.includes('choose') || call.includes('Control+Space')),
    false,
  )
  assert.deepEqual(failures, [])
})

test('authoring refuses another editor list or wrong exact version and records its phase/state without hiding the error', async () => {
  for (const fault of ['wrong-owner', 'wrong-version']) {
    const { ctx, failures, calls } = authoringContext(cases[0], fault)
    await assert.rejects(() => profile.authorPrompts(ctx))
    assert.equal(failures.length, 1)
    assert.equal(failures[0].polarity, 'positive')
    assert.equal(failures[0].key, 'embeddingControl')
    assert.match(failures[0].error, /AssertionError/)
    assert.ok(failures[0].dom.editors.length > 0)
    assert.ok(failures[0].main.positivePrompt)
    assert.equal(
      calls.some((call) => call.startsWith('negative:')),
      false,
    )
    if (fault === 'wrong-owner')
      assert.equal(
        calls.some((call) => call.includes(':choose:')),
        false,
      )
  }
})

function editedDraft(entry) {
  const { draft } = authored(entry)
  draft.seed = { policy: 'fixed', value: 37 }
  draft.positivePrompt = { text: 'later positive', embeddingRefs: [] }
  draft.negativePrompt = { text: 'later negative', embeddingRefs: [] }
  return draft
}

test('later-state checks require signed refs and literals to disappear while preserving fixed37', () => {
  const current = editedDraft(cases[0])
  profile.assertEdited(current)
  for (const change of [
    (v) => {
      v.seed.value = 0
    },
    (v) => {
      v.positivePrompt.text += token
    },
    (v) => {
      v.negativePrompt.text += 'igs_ti_private_0'
    },
    (v) => {
      v.positivePrompt.embeddingRefs = [embeddingRef(reference(), 'embeddingControl')]
    },
  ]) {
    const changed = structuredClone(current)
    change(changed)
    assert.throws(() => profile.assertEdited(changed))
  }
})

function comparisonContext(entry) {
  const { plan, data } = authored(entry)
  const item = plan.items[0]
  const ordinary = entry[2] === 'ordinary'
  const rows = Object.fromEntries(
    Object.entries({
      'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
      'sampling.sampler': [
        entry[0] === 'epsilon' ? 'Euler a' : 'Euler',
        entry[0] === 'epsilon' ? 'Euler a' : 'Euler',
      ],
      'sampling.scheduler': ['Normal', 'Normal'],
      'context.mode': [entry[1], 'img2img'],
      'guidance.steps': ['3', '3'],
      'guidance.cfg': ['5', '5'],
      'denoisingStrength.value': ['0.5', '0.5'],
      'seed.actual': ['0', '37'],
    }).map(([key, values]) => [
      key,
      { key, status: values[0] === values[1] ? 'Same' : 'Changed', values },
    ]),
  )
  for (const polarity of ['positive', 'negative']) {
    const key = polarity === 'positive' ? 'prompt.embeddings' : 'negativePrompt.embeddings'
    const selected = ordinary
      ? null
      : entry[2] === `${polarity}-zero`
        ? 'embeddingControl'
        : 'embeddingTrained'
    const ref = selected === null ? null : embeddingRef(data, selected)
    rows[key] = {
      key,
      status: ordinary ? 'Same' : 'Removed',
      values:
        ref === null
          ? ['None', 'None']
          : [`${token} · ${ref.resource.versionName} · SHA-256 ${ref.resource.fileSha256}`, 'None'],
    }
  }
  const seen = []
  const dialog = {
    locator: (selector) => {
      const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
      assert.ok(Object.hasOwn(rows, key))
      return {
        ...rows[key],
        getAttribute: async () => rows[key].status,
        locator: (child) => {
          assert.equal(child, '.comparison-values p')
          return { ...rows[key], nth: (index) => ({ ...rows[key], text: rows[key].values[index] }) }
        },
      }
    },
  }
  const expect = (row) => ({
    toHaveCount: async (count) => assert.equal(count, 1),
    toHaveAttribute: async (name, status) => {
      assert.equal(name, 'data-status')
      assert.equal(status, row.status)
      seen.push(row.key)
    },
    toHaveText: async (values) => assert.deepEqual(values, row.text ?? row.values),
    toContainText: async (text) => assert.ok(row.text.includes(text)),
  })
  return {
    rows,
    seen,
    ctx: {
      expect,
      dialog,
      generation: { expectedItem: item },
      reference: data,
      currentDraft: editedDraft(entry),
    },
  }
}

test('owning comparison checks exact signed version/SHA removal, ordinary None, IMG Same and OUT Changed', async () => {
  for (const entry of cases) {
    const { ctx, seen, rows } = comparisonContext(entry)
    const result = await profile.assertComparison(ctx)
    assert.deepEqual(seen.sort(), Object.keys(rows).sort())
    assert.equal(result['context.mode'].status, entry[1] === 'img2img' ? 'Same' : 'Changed')
    for (const key of ['prompt.embeddings', 'negativePrompt.embeddings'])
      assert.equal(result[key].status, entry[2] === 'ordinary' ? 'Same' : 'Removed')
    for (const key of [
      'sampling.sampler',
      'sampling.invokeScheduler',
      'denoisingStrength.value',
      'guidance.steps',
      'guidance.cfg',
    ])
      assert.equal(result[key].status, 'Same')
  }
})

test('comparison refuses substituted saved signed version, hidden current sidecar and changed sampler/strength', async () => {
  for (const change of [
    ({ rows }) => {
      rows['prompt.embeddings'].values[0] = 'wrong saved version'
    },
    ({ ctx }) => {
      ctx.currentDraft.negativePrompt.embeddingRefs = [
        embeddingRef(ctx.reference, 'embeddingTrained'),
      ]
    },
    ({ ctx }) => {
      ctx.currentDraft.sampling.sampler = 'DPM++ 2M'
    },
    ({ ctx }) => {
      ctx.currentDraft.sampling.denoisingStrength = 0
    },
  ]) {
    const input = comparisonContext(cases[0])
    change(input)
    await assert.rejects(() => profile.assertComparison(input.ctx))
  }
})

test('adapter summary binds acceptance and never equates crossed pixel inequality with directional qualification', () => {
  for (const entry of cases)
    for (const stage of entry[0] === 'v_prediction'
      ? ['baseline']
      : entry[2] === 'ordinary'
        ? ['baseline', 'control']
        : ['baseline', 'control', 'restored']) {
      const input = fixture(entry, stage)
      const control = stage === 'control'
      const summary = profile.summaryClaims({
        fixture: input,
        report: { generations: [{ accepted: !control }] },
      })
      assert.equal(summary.installedEmbeddingImageInferenceClaim, !control)
      assert.equal(summary.acceptedSavedReopenedClaim, !control)
      assert.equal(summary.provisionalMutationControl, control)
      assert.equal(summary.directionalSensitivityClaim, false)
      assert.equal(summary.fullMvpClaim, false)
      assert.throws(() => profile.summaryClaims({ fixture: input, report: { generations: [] } }))
      assert.throws(() =>
        profile.summaryClaims({ fixture: input, report: { generations: [{ accepted: control }] } }),
      )
    }
  for (const entry of cases.filter(([objective]) => objective === 'v_prediction'))
    for (const stage of ['control', 'restored'])
      assert.throws(() =>
        profile.summaryClaims({
          fixture: fixture(entry, stage),
          report: { generations: [{ accepted: stage === 'restored' }] },
        }),
      )
})
