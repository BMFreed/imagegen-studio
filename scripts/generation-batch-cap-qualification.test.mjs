import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildAnimaWorkerRequest } from '../src/shared/projects/anima-worker-request.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { planGenerationBatch } from '../src/shared/projects/generation-batch-plan.ts'
import { GENERATION_BATCH_JOB_LIMIT } from '../src/shared/projects/generation-batch-policy.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.ts'
import { prepareAnimaGeneration } from '../src/main/projects/anima-generation-preparation.ts'
import { buildFrozenQueuedAnimaGenerationV1 } from '../src/main/projects/anima-queued-generation.ts'
import { parseFrozenGenerationPayloadV1 } from '../src/main/projects/generation-queue.ts'
import { withIllustriousTxt2ImgRequest } from '../src/main/projects/illustrious-txt2img-job.ts'
import { prepareNormalTxt2Img } from '../src/main/projects/project-generation-preparation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { ANIMA_BATCH_READY } from '../src/main/projects/test-fixtures/anima-batch.ts'

import {
  assertBatchCapConfiguration,
  assertBatchCapFrozen,
  assertBatchCapPlan,
  literalBatchCapPlan,
  normalizeBatchCapExecutionInputs,
  normalizeBatchCapNativeInputs,
  validateBatchCapFixture,
} from './generation-batch-cap-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'
const objectives = ['anima', 'epsilon', 'v_prediction']
const digest = (value) => createHash('sha256').update(value).digest('hex')
const ready = {
  ...ANIMA_BATCH_READY,
  workerVersion: '0.14.0',
  capabilities: [
    ...ANIMA_BATCH_READY.capabilities,
    'illustrious-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
  ],
}

function wrapper(objective = 'epsilon', stage = 'boundary') {
  return {
    schemaVersion: 1,
    profile: 'generation-batch-cap',
    objective,
    stage,
    referenceFixture: { path: path.join(root, 'shared/reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'runs/entry/sources.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `runs/batch-cap/${objective}-${stage}`),
    ...(stage === 'prefix'
      ? {
          baseline: {
            reportPath: path.join(root, `runs/boundary-${objective}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }
      : {}),
  }
}

/** Literal descriptors; resolver doubles do not qualify installed files or model compatibility. */
function installedFixture() {
  const appData = path.join(root, 'shared/data/imagegen-studio')
  const resources = {
    illustrious: [
      'illustrious',
      'checkpoint',
      700040,
      6938040794,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      [1147756, 2679856, 2566634],
      'v_prediction',
    ],
    illustriousEpsilon: [
      'illustrious',
      'checkpoint',
      700140,
      6938040416,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      [833294, 1022833, 928571],
      'epsilon',
    ],
    illustriousLora: [
      'illustrious',
      'lora',
      700060,
      114437420,
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      [700060, 700061, 700062],
    ],
    externalVaeNative: [
      'illustrious',
      'vae',
      700080,
      167335542,
      'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      [700070, 700081, 700082],
    ],
    anima: [
      'anima',
      'checkpoint',
      700030,
      4182275752,
      '0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941',
      [1147756, 3120487, 3000817],
    ],
    animaLora: [
      'anima',
      'lora',
      700050,
      138663759,
      'cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f',
      [599757, 3084665, 2964030],
    ],
    encoder: [
      'anima',
      'qwen3_encoder',
      700010,
      1192135096,
      'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
    ],
    vae: [
      'anima',
      'vae',
      700020,
      253806246,
      'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(resources).map(
        ([key, [family, type, managedId, byteSize, sha256, ids, trainedObjective]]) => [
          key,
          {
            family,
            type,
            byteSize,
            sha256,
            name: `Fixture ${key}`,
            versionName: 'Qualified fixture version',
            ...(trainedObjective ? { trainedObjective } : {}),
            ...(ids ? { origin: { modelId: ids[0], versionId: ids[1], fileId: ids[2] } } : {}),
            installed: {
              resourceId: randomUUID(),
              versionId: randomUUID(),
              managedPath: path.join(appData, 'models', `qualified-${managedId}.safetensors`),
            },
          },
        ],
      ),
    ),
  }
}

function reference(fixture, key) {
  const source = fixture[key]
  return {
    baseModelFamily: source.family,
    civitaiModelId: source.origin.modelId,
    civitaiVersionId: source.origin.versionId,
    civitaiFileId: source.origin.fileId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: source.trainedObjective ?? null,
    versionName: source.versionName,
  }
}

function file(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

function descriptor(fixture, key) {
  return {
    byteSize: fixture[key].byteSize,
    managedPath: fixture[key].installed.managedPath,
    reference: reference(fixture, key),
  }
}

function component(fixture, key) {
  const source = fixture[key]
  return {
    byteSize: source.byteSize,
    managedPath: source.installed.managedPath,
    sha256: source.sha256,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
  }
}

function fileTarget(target) {
  return {
    byteSize: target.byteSize,
    height: target.height,
    width: target.width,
    iccSha256: target.iccSha256,
    sha256: target.sha256,
  }
}

/**
 * Actual preparation, planner, both native request builders, strict frozen parser and provenance.
 * Exact-model resolution and candidate pixels are controlled; there is no ML or durable admission.
 */
async function productionRecords(plan, fixture) {
  const isAnima = plan.objective === 'anima'
  const document = createEmptyProjectDocumentV1({
    title: 'Batch cap',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
  })
  const draft = document.generationDraft
  const loraKey = isAnima ? 'animaLora' : 'illustriousLora'
  draft.model = reference(fixture, plan.modelKey)
  draft.loras = [{ enabled: true, resource: reference(fixture, loraKey), weight: -0.5 }]
  draft.positivePrompt.text = plan.sourcePrompts.positive
  draft.negativePrompt.text = plan.sourcePrompts.negative
  draft.seed = { policy: 'fixed', value: 0 }
  draft.dynamicPrompt = { maxPrompts: plan.maxPrompts, seedBehavior: plan.seedBehavior }
  draft.sampling = {
    steps: 3,
    cfgScale: isAnima ? 4 : 5,
    denoisingStrength: null,
    sampler: plan.objective === 'epsilon' ? 'Euler a' : 'Euler',
    scheduler: 'Normal',
    ...(isAnima ? { animaMethod: 'euler' } : {}),
  }
  draft.cfgRescale = 0
  draft.vaePrecision = isAnima ? 'Auto' : 'FP32'
  if (!isAnima) draft.vae = reference(fixture, 'externalVaeNative')
  const bytes = await transparentTargetPngFixture(256, 256)
  const target = {
    bbox: document.primaryBbox,
    composite: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      width: 256,
      height: 256,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: digest(bytes),
    },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: draft,
    lastActualSeedSnapshot: null,
    mode: 'txt2img',
  }
  const noiseProfile = {
    schemaVersion: 1,
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: plan.objective === 'v_prediction',
    timestepSpacing: 'leading',
  }
  const modelService = isAnima
    ? {
        resolveVerifiedGenerationAnimaBundleForPlan: async () => ({
          architecture: 'anima-base-1.0',
          checkpoint: descriptor(fixture, 'anima'),
          qwen3Encoder: component(fixture, 'encoder'),
          vae: component(fixture, 'vae'),
        }),
        resolveVerifiedAnimaGenerationLoraForPlan: async () => descriptor(fixture, 'animaLora'),
      }
    : {
        assertNoUnboundGenerationEmbeddings: async () => {},
        resolveVerifiedGenerationCheckpointForPlan: async () => ({
          ...descriptor(fixture, plan.modelKey),
          noiseProfile,
        }),
        resolveVerifiedGenerationVaeForPlan: async () => descriptor(fixture, 'externalVaeNative'),
        resolveVerifiedGenerationLoraForPlan: async () => descriptor(fixture, 'illustriousLora'),
        resolveVerifiedGenerationEmbeddingForPlan: async () =>
          assert.fail('No embeddings authored.'),
      }
  const prepared = await (isAnima ? prepareAnimaGeneration : prepareNormalTxt2Img)({
    target,
    modelService,
    randomUint32: () => assert.fail('Fixed0 must not choose Random.'),
  })
  const batch = isAnima
    ? prepareAnimaGenerationBatch({ prepared, iterations: plan.iterations })
    : planGenerationBatch({
        baseSeed: prepared.context.sampling.seed,
        iterations: plan.iterations,
        maxJobs: GENERATION_BATCH_JOB_LIMIT,
        maxPrompts: plan.maxPrompts,
        positivePrompt: plan.sourcePrompts.positive,
        negativePrompt: plan.sourcePrompts.negative,
        seedBehavior: plan.seedBehavior,
      })
  const frozenRecords = []
  const scratch = await mkdtemp(path.join(tmpdir(), 'igs-cap-oracle-'))
  try {
    for (const item of batch.items) {
      if (isAnima) {
        const context = prepared.context
        const request = buildAnimaWorkerRequest(
          {
            bbox: context.bbox,
            requestId: randomUUID(),
            mode: 'txt2img',
            model: {
              architecture: 'anima-base-1.0',
              checkpoint: file(fixture, 'anima'),
              qwen3Encoder: file(fixture, 'encoder'),
              vae: file(fixture, 'vae'),
            },
            loras: [{ ...file(fixture, 'animaLora'), weight: -0.5 }],
            prompts: item.prompts,
            sampling: {
              guidanceScale: 4,
              scheduler: 'euler',
              seed: item.seed,
              steps: 3,
              strength: null,
            },
            target: { ...fileTarget(context.target), path: path.join(scratch, 'target.png') },
            output: {
              pngPath: path.join(scratch, `${item.promptPairIndex}-${item.iteration}.png`),
              stagingRoot: scratch,
            },
          },
          ready,
        )
        frozenRecords.push(buildFrozenQueuedAnimaGenerationV1({ context, item, request }))
      } else {
        const context = structuredClone(prepared.context)
        context.prompts = structuredClone(item.prompts)
        context.sampling.seed = item.seed
        context.sampling.seedBehavior = plan.seedBehavior
        await withIllustriousTxt2ImgRequest({
          modelService,
          prepared: { context, targetPngBytes: prepared.targetPngBytes },
          ready,
          scratchBasePath: scratch,
          use: async (request) => {
            const { output: _output, target: nativeTarget, ...job } = request.job
            frozenRecords.push(
              parseFrozenGenerationPayloadV1(
                JSON.stringify({
                  schemaVersion: 1,
                  originRequestId: request.requestId,
                  kind: 'illustrious-txt2img',
                  context,
                  workerJob: { ...job, target: fileTarget(nativeTarget) },
                }),
              ),
            )
          },
        })
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  const output = await acceptedOutputPngFixture(256, 256)
  const projectPath = path.join(tmpdir(), 'batch-cap-oracle.igs')
  const configurations = frozenRecords.map((frozen) => {
    const id = randomUUID(),
      frozenPayloadJson = JSON.stringify(frozen),
      context = frozen.context
    return provenanceFromVerifiedRasterCandidate({
      candidate: {
        actualSeed: context.sampling.seed,
        assetPath: path.join(tmpdir(), 'batch-cap-oracle.png'),
        bbox: context.bbox,
        candidateId: id,
        completedAt: '2026-10-09T12:00:00.000Z',
        completionOrder: 1,
        documentId: context.documentId,
        documentRevision: context.documentRevision,
        frozenPayloadJson,
        frozenPayloadSha256: digest(frozenPayloadJson),
        image: {
          byteSize: output.length,
          width: 256,
          height: 256,
          sha256: digest(output),
          iccSha256: IGS_SRGB_ICC_SHA256,
        },
        localProjectKey: localProjectRecoveryKey(projectPath),
        projectPath,
        queueItemId: id,
        stagingSessionId: randomUUID(),
      },
      imagePngBytes: output,
      acceptedAt: '2026-10-09T12:01:00.000Z',
    }).generationConfiguration
  })
  return { ...batch, frozenRecords, configurations, prepared }
}

// Boundary: literal oracle vs real preparation/planner/native DTO/provenance, not an ML run.
// Invariant: exact32 and explicit 3-of4 prefix retain pair order, policy and independently known seeds.
// Neighbor: per-prompt prefix uses the same native inputs at six handwritten boundary positions.
// Mutations: alter expected table or captured seeds, policy, behavior, prompt weight, exact resource.
for (const objective of objectives) {
  test(`${objective}: literal32 and six-prefix plans match production native/provenance boundaries`, async () => {
    const fixture = installedFixture()
    for (const stage of ['boundary', 'prefix']) {
      const plan = validateBatchCapFixture(wrapper(objective, stage))
      assertBatchCapPlan(plan)
      assert.equal(plan.items.length, stage === 'boundary' ? 32 : 6)
      assert.equal(plan.expectedAdmissions, plan.items.length)
      assert.equal(plan.expectedCanceled, 0)
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        stage === 'boundary'
          ? [
              0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4,
              5, 6, 7,
            ]
          : [0, 1, 2, 3, 4, 5],
      )
      assert.deepEqual(
        plan.items.filter(({ iteration }) => iteration === 0).map(({ prompts }) => prompts),
        stage === 'boundary'
          ? [
              { positive: red, negative: blurry },
              { positive: red, negative: noisy },
              { positive: blue, negative: blurry },
              { positive: blue, negative: noisy },
            ]
          : [
              { positive: red, negative: blurry },
              { positive: red, negative: noisy },
              { positive: blue, negative: blurry },
            ],
      )
      const actual = await productionRecords(plan, fixture)
      assert.equal(actual.truncated, stage === 'prefix')
      assert.deepEqual(
        actual.items.map(({ promptPairIndex, iteration, seed, prompts }) => ({
          promptPairIndex,
          iteration,
          seed,
          prompts,
        })),
        plan.items.map(({ promptPairIndex, iteration, seed, prompts }) => ({
          promptPairIndex,
          iteration,
          seed,
          prompts,
        })),
      )
      // Check every original boundary iteration0..7 before legacy expectation projection to0.
      if (stage === 'boundary')
        assert.deepEqual(
          actual.items.slice(0, 8).map(({ iteration }) => iteration),
          [0, 1, 2, 3, 4, 5, 6, 7],
        )
      for (const [index, frozen] of actual.frozenRecords.entries()) {
        assertBatchCapFrozen(frozen, plan.items[index], fixture)
        assertBatchCapConfiguration(actual.configurations[index], plan.items[index], fixture)
      }
      assert.ok(Object.isFrozen(plan.items[0].prompts))
      assert.ok(Object.isFrozen(plan.items))
      assert.ok(Object.isFrozen(plan))
      assert.throws(() => {
        plan.items[0].seed = 99
      }, TypeError)
    }
  })

  test(`${objective}: six prefix inputs match only literal boundary positions, omitting behavior only`, async () => {
    const fixture = installedFixture()
    const boundary = await productionRecords(literalBatchCapPlan('boundary', objective), fixture)
    const plan = literalBatchCapPlan('prefix', objective)
    const prefix = await productionRecords(plan, fixture)
    assert.deepEqual(plan.boundaryBaselineIndices, [0, 1, 10, 11, 20, 21])
    for (const [index, baselineIndex] of [0, 1, 10, 11, 20, 21].entries()) {
      const original = boundary.frozenRecords[baselineIndex],
        current = prefix.frozenRecords[index]
      assert.notDeepEqual(
        normalizeBatchCapNativeInputs(original),
        normalizeBatchCapNativeInputs(current),
      )
      assert.deepEqual(
        normalizeBatchCapExecutionInputs(original, plan),
        normalizeBatchCapExecutionInputs(current, plan),
      )
      const native = normalizeBatchCapNativeInputs(current)
      delete native.context.sampling.seedBehavior
      assert.deepEqual(normalizeBatchCapExecutionInputs(current, plan), native)
      assert.equal(current.context.sampling.seedBehavior, 'per-prompt')
      const changed = structuredClone(current)
      changed.workerJob.loras[0].weight = 0
      assert.notDeepEqual(
        normalizeBatchCapExecutionInputs(original, plan),
        normalizeBatchCapExecutionInputs(changed, plan),
      )
    }
    const wrongPolicy = structuredClone(prefix.frozenRecords[0])
    wrongPolicy.context.sampling.requestedSeedPolicy = 'random'
    assert.throws(() => normalizeBatchCapExecutionInputs(wrongPolicy, plan))
    for (const behavior of [undefined, 'unknown']) {
      const changed = structuredClone(prefix.frozenRecords[0])
      changed.context.sampling.seedBehavior = behavior
      assert.throws(() => normalizeBatchCapExecutionInputs(changed, plan))
    }
    assert.throws(
      () =>
        normalizeBatchCapExecutionInputs(
          prefix.frozenRecords[0],
          literalBatchCapPlan('boundary', objective),
        ),
      /Only the declared prefix/,
    )
  })

  test(`${objective}: real captured native/portable records expose semantic corruption`, async () => {
    const fixture = installedFixture(),
      plan = literalBatchCapPlan('prefix', objective)
    const actual = await productionRecords(plan, fixture),
      expected = plan.items[5]
    const good = actual.frozenRecords[5]
    for (const edit of [
      (value) => {
        value.context.sampling.seed = 0
      },
      (value) => {
        value.workerJob.sampling.seed = 0
      },
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'reuse'
      },
      (value) => {
        value.context.sampling.seedBehavior = 'per-iteration'
      },
      (value) => {
        value.context.prompts.negative = noisy
      },
      (value) => {
        value.workerJob.loras[0].weight = 0
      },
      (value) => {
        value.workerJob.target.sha256 = 'f'.repeat(64)
      },
      ...(objective === 'anima'
        ? [
            (value) => {
              value.workerJob.sampling.stepSeed = 0
            },
            (value) => {
              value.workerJob.prompts.negative.spans[0].weight = 1
            },
            (value) => {
              value.workerJob.model.qwen3Encoder.sha256 = 'e'.repeat(64)
            },
          ]
        : [
            (value) => {
              value.workerJob.checkpoint.predictionType =
                objective === 'epsilon' ? 'v_prediction' : 'epsilon'
            },
            (value) => {
              value.workerJob.vaePrecision = 'Auto'
            },
          ]),
    ]) {
      const changed = structuredClone(good)
      edit(changed)
      assert.throws(() => assertBatchCapFrozen(changed, expected, fixture))
    }
    for (const edit of [
      (value) => {
        value.sampling.actualSeed = 0
      },
      (value) => {
        value.sampling.requestedSeedPolicy = 'random'
      },
      (value) => {
        value.sampling.seedBehavior = 'per-iteration'
      },
      (value) => {
        value.model.fileSha256 = 'e'.repeat(64)
      },
      (value) => {
        value.negativePrompt.text = noisy
      },
      (value) => {
        value.loras[0].weight = 0
      },
    ]) {
      const changed = structuredClone(actual.configurations[5])
      edit(changed)
      assert.throws(() => assertBatchCapConfiguration(changed, expected, fixture))
    }
    assertBatchCapFrozen(good, expected, fixture)
    assertBatchCapConfiguration(actual.configurations[5], expected, fixture)
  })
}

test('full expected plans reject changed row count/order/iteration/seed/prefix and do not weaken legacy projection', () => {
  for (const objective of objectives)
    for (const stage of ['boundary', 'prefix']) {
      const good = literalBatchCapPlan(stage, objective)
      for (const edit of [
        (value) => {
          value.items.pop()
        },
        (value) => {
          value.items.reverse()
        },
        (value) => {
          value.items[0].seed = 99
        },
        (value) => {
          value.items[0].iteration = 99
        },
        (value) => {
          value.items[0].promptPairIndex = 99
        },
        (value) => {
          value.truncated = !value.truncated
        },
        (value) => {
          value.expectedAdmissions = 31
        },
        (value) => {
          value.maxPrompts = 100
        },
        (value) => {
          value.fixedSeed = 37
        },
      ]) {
        const changed = structuredClone(good)
        edit(changed)
        assert.throws(() => assertBatchCapPlan(changed))
      }
      for (const edit of [
        (value) => {
          value.seed = 37
        },
        (value) => {
          value.iteration = 99
        },
        (value) => {
          value.requestedSeedPolicy = 'random'
        },
      ]) {
        const changed = structuredClone(good.items[0])
        edit(changed)
        assert.throws(() => assertBatchCapFrozen({}, changed, {}), /independent literal table/)
      }
    }
})

test('fixture guards reject unknown fields, standalone refusal/mutation stages and unpinned/overlapping paths', () => {
  for (const edit of [
    (value) => {
      value.extra = true
    },
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.profile = 'generation-seed-boundary'
    },
    (value) => {
      value.objective = 'sdxl'
    },
    (value) => {
      value.stage = 'refusal'
    },
    (value) => {
      value.mutation = {}
    },
    (value) => {
      value.referenceFixture.sha256 = 'abc'
    },
    (value) => {
      value.workerBaseline.sha256 = 'A'.repeat(64)
    },
    (value) => {
      value.referenceFixture.extra = 1
    },
    (value) => {
      value.referenceFixture.path = '/tmp/source.json'
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.artifacts = path.dirname(value.referenceFixture.path)
    },
    (value) => {
      value.artifacts = path.dirname(value.workerBaseline.path)
    },
    (value) => {
      value.artifacts += '/..'
    },
    (value) => {
      value.baseline = {
        reportPath: path.join(root, 'runs/report.json'),
        reportSha256: 'c'.repeat(64),
      }
    },
  ]) {
    const bad = wrapper()
    edit(bad)
    assert.throws(() => validateBatchCapFixture(bad))
  }
  for (const edit of [
    (value) => {
      delete value.baseline
    },
    (value) => {
      value.baseline.reportSha256 = 'abc'
    },
    (value) => {
      value.baseline.extra = true
    },
    (value) => {
      value.baseline.reportPath = '/tmp/report.json'
    },
    (value) => {
      value.artifacts = path.dirname(value.baseline.reportPath)
    },
  ]) {
    const bad = wrapper('epsilon', 'prefix')
    edit(bad)
    assert.throws(() => validateBatchCapFixture(bad))
  }
  for (const kind of ['anima-img2img', 'illustrious-img2img', 'unknown'])
    assert.throws(() => normalizeBatchCapNativeInputs({ kind }), /qualified txt2img/)
})
