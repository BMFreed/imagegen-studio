import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildAnimaWorkerRequest } from '../src/shared/projects/anima-worker-request.ts'
import { IGS_SRGB_ICC_SHA256 } from '../src/shared/projects/color-profile.ts'
import { planGenerationBatch } from '../src/shared/projects/generation-batch-plan.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import { prepareAnimaGenerationBatch } from '../src/main/projects/anima-generation-batch.ts'
import { prepareAnimaGeneration } from '../src/main/projects/anima-generation-preparation.ts'
import { buildFrozenQueuedAnimaGenerationV1 } from '../src/main/projects/anima-queued-generation.ts'
import { parseFrozenGenerationPayloadV1 } from '../src/main/projects/generation-queue.ts'
import { prepareNormalTxt2Img } from '../src/main/projects/project-generation-preparation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { ANIMA_BATCH_READY } from '../src/main/projects/test-fixtures/anima-batch.ts'

import {
  assertSeedBoundaryConfiguration,
  assertSeedBoundaryFrozen,
  normalizeSeedBoundaryExecutionInputs,
  normalizeSeedBoundaryNativeInputs,
  resolveSeedBoundaryPlan,
  validateSeedBoundaryFixture,
} from './generation-seed-boundary-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio')
const max = 0xffff_ffff
const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'
const objectives = ['anima', 'epsilon', 'v_prediction']
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function wrapper(objective = 'epsilon', stage = 'random', replaySeed = 0) {
  return {
    schemaVersion: 1,
    profile: 'generation-seed-boundary',
    objective,
    stage,
    referenceFixture: { path: path.join(root, 'shared/fixture.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'runs/entry/sources.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `runs/seeds/${objective}-${stage}`),
    ...(['replay', 'restored'].includes(stage)
      ? {
          baseline: {
            reportPath: path.join(root, 'runs/healthy/report.json'),
            reportSha256: 'c'.repeat(64),
          },
        }
      : {}),
    ...(stage === 'replay' ? { replaySeed } : {}),
  }
}

/** Literal resource descriptors only. Resolver doubles do not claim installed file qualification. */
function installedFixture() {
  const appData = path.join(root, 'shared/data/imagegen-studio')
  const definitions = {
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
      Object.entries(definitions).map(
        ([key, [family, type, managedId, byteSize, digest, ids, trainedObjective]]) => [
          key,
          {
            family,
            type,
            byteSize,
            sha256: digest,
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

function descriptor(fixture, key) {
  const source = fixture[key]
  return {
    byteSize: source.byteSize,
    managedPath: source.installed.managedPath,
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

function file(fixture, key) {
  const source = fixture[key]
  return { byteSize: source.byteSize, path: source.installed.managedPath, sha256: source.sha256 }
}

/**
 * Real preparation resolves the batch base once. Production planner/compiler/parser/provenance
 * boundaries run below; model verification is substituted and no ML/native process is launched.
 */
async function productionRecords(plan, fixture, randomBase = 37) {
  const document = createEmptyProjectDocumentV1({
    title: 'Seed boundary',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
  })
  const draft = document.generationDraft
  const isAnima = plan.objective === 'anima'
  const loraKey = isAnima ? 'animaLora' : 'illustriousLora'
  draft.model = reference(fixture, plan.modelKey)
  draft.loras = [{ enabled: true, resource: reference(fixture, loraKey), weight: -0.5 }]
  draft.positivePrompt.text = plan.sourcePrompts.positive
  draft.negativePrompt.text = plan.sourcePrompts.negative
  draft.seed = { policy: plan.requestedSeedPolicy, value: plan.fixedSeed }
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
  const targetBytes = await transparentTargetPngFixture(256, 256)
  const target = {
    bbox: document.primaryBbox,
    composite: {
      bytes: targetBytes,
      byteSize: targetBytes.length,
      colorSpace: 'srgb',
      width: 256,
      height: 256,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: sha256(targetBytes),
    },
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: draft,
    lastActualSeedSnapshot: null,
    mode: 'txt2img',
  }
  let randomCalls = 0
  const randomUint32 = () => {
    randomCalls++
    return randomBase
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
          assert.fail('No embeddings are authored.'),
      }
  const prepared = await (isAnima ? prepareAnimaGeneration : prepareNormalTxt2Img)({
    target,
    modelService,
    randomUint32,
  })
  assert.equal(randomCalls, plan.stage === 'random' ? 1 : 0)
  const items = isAnima
    ? prepareAnimaGenerationBatch({ prepared, iterations: 2 }).items
    : planGenerationBatch({
        baseSeed: prepared.context.sampling.seed,
        iterations: 2,
        maxJobs: 32,
        maxPrompts: plan.maxPrompts,
        positivePrompt: plan.sourcePrompts.positive,
        negativePrompt: plan.sourcePrompts.negative,
        seedBehavior: plan.seedBehavior,
      }).items
  const frozenRecords = items.map((item) => {
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
          target: { ...fileTarget(context.target), path: '/tmp/seed-boundary/target.png' },
          output: {
            pngPath: `/tmp/seed-boundary/${item.promptPairIndex}-${item.iteration}.png`,
            stagingRoot: '/tmp/seed-boundary',
          },
        },
        ANIMA_BATCH_READY,
      )
      return buildFrozenQueuedAnimaGenerationV1({ context, item, request })
    }
    const context = structuredClone(prepared.context)
    context.prompts = structuredClone(item.prompts)
    context.sampling.seed = item.seed
    context.sampling.seedBehavior = plan.seedBehavior
    return parseFrozenGenerationPayloadV1(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'illustrious-txt2img',
        originRequestId: randomUUID(),
        context,
        workerJob: {
          schemaVersion: 1,
          bbox: context.bbox,
          prompts: context.prompts,
          sampling: {
            cfgRescale: 0,
            cfgScale: 5,
            scheduler: plan.sampler,
            noiseProfile,
            seed: item.seed,
            steps: 3,
          },
          checkpoint: {
            path: fixture[plan.modelKey].installed.managedPath,
            predictionType: plan.objective,
            sha256: fixture[plan.modelKey].sha256,
          },
          loras: [{ ...file(fixture, 'illustriousLora'), weight: -0.5 }],
          vae: file(fixture, 'externalVaeNative'),
          vaePrecision: 'FP32',
          target: fileTarget(context.target),
        },
      }),
    )
  })
  const output = await acceptedOutputPngFixture(256, 256)
  const projectPath = '/tmp/seed-boundary.igs'
  const configurations = frozenRecords.map((frozen) => {
    const id = randomUUID()
    const frozenPayloadJson = JSON.stringify(frozen)
    const context = frozen.context
    const candidate = {
      actualSeed: context.sampling.seed,
      assetPath: '/tmp/seed-boundary/result.png',
      bbox: context.bbox,
      candidateId: id,
      completedAt: '2026-10-09T12:00:00.000Z',
      completionOrder: 1,
      documentId: context.documentId,
      documentRevision: context.documentRevision,
      frozenPayloadJson,
      frozenPayloadSha256: sha256(frozenPayloadJson),
      image: {
        byteSize: output.length,
        width: 256,
        height: 256,
        sha256: sha256(output),
        iccSha256: IGS_SRGB_ICC_SHA256,
      },
      localProjectKey: localProjectRecoveryKey(projectPath),
      projectPath,
      queueItemId: id,
      stagingSessionId: randomUUID(),
    }
    return provenanceFromVerifiedRasterCandidate({
      candidate,
      imagePngBytes: output,
      acceptedAt: '2026-10-09T12:01:00.000Z',
    }).generationConfiguration
  })
  return {
    admissions: frozenRecords.map((frozen) => ({
      id: randomUUID(),
      frozen_payload_json: JSON.stringify(frozen),
    })),
    configurations,
    frozenRecords,
    items,
    prepared,
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

// Boundary: independent expected table vs real preparation, expansion, typed Anima wire and
// portable provenance. Invariants include first-row Random base, zero/MAX and immutable metadata.
// Neighbor: Fixed replay changes requested policy only. Mutations corrupt one subsequent seed,
// requested policy, native step seed, weights, resource or accepted actual seed.
for (const objective of objectives) {
  test(`${objective}: four stages retain handwritten pair-major prefix and uint32 schedules`, async () => {
    const fixture = installedFixture()
    for (const [stage, expectedSeeds] of [
      ['random', [37, 38, 37, 38]],
      ['replay', [37, 38, 37, 38]],
      ['wrap', [max, 0, 1, 2]],
      ['restored', [max, 0]],
    ]) {
      const plan = validateSeedBoundaryFixture(wrapper(objective, stage, 37))
      assert.equal(Object.isFrozen(plan.items[0].prompts), true)
      assert.deepEqual(
        plan.items.map(({ promptPairIndex, iteration, prompts }) => [
          promptPairIndex,
          iteration,
          prompts.positive,
          prompts.negative,
        ]),
        stage === 'restored'
          ? [
              [0, 0, red, blurry],
              [0, 1, red, blurry],
            ]
          : [
              [0, 0, red, blurry],
              [0, 1, red, blurry],
              [1, 0, red, noisy],
              [1, 1, red, noisy],
            ],
      )
      assert.ok(plan.sourcePrompts.positive.includes('(blue:1.3)'))
      assert.equal(plan.maxPrompts, stage === 'restored' ? 1 : 2)
      assert.equal(plan.expectedCanceled, 0)
      if (stage === 'random')
        assert.deepEqual(
          plan.items.map(({ seed }) => seed),
          [null, null, null, null],
        )
      const records = await productionRecords(plan, fixture)
      const resolved = resolveSeedBoundaryPlan(plan, records.admissions)
      assert.deepEqual(
        records.items.map(({ seed }) => seed),
        expectedSeeds,
      )
      assert.deepEqual(
        resolved.items.map(({ seed }) => seed),
        expectedSeeds,
      )
      assert.equal(plan.items[0].seed, stage === 'random' ? null : expectedSeeds[0])
      for (const [index, frozen] of records.frozenRecords.entries()) {
        assertSeedBoundaryFrozen(frozen, resolved.items[index], fixture)
        assertSeedBoundaryConfiguration(
          records.configurations[index],
          resolved.items[index],
          fixture,
        )
      }
      if (stage === 'random') {
        assert.deepEqual(resolved.randomBaseSource, {
          kind: 'first-admitted-frozen-request',
          queueItemId: records.admissions[0].id,
          seed: 37,
        })
        assert.deepEqual(resolveSeedBoundaryPlan(resolved, records.admissions), resolved)
      }
    }
  })

  test(`${objective}: Random zero and MAX bases are observed once; later rows cannot become expectations`, async () => {
    const fixture = installedFixture()
    const plan = validateSeedBoundaryFixture(wrapper(objective))
    for (const [base, seeds] of [
      [0, [0, 1, 0, 1]],
      [max, [max, 0, max, 0]],
    ]) {
      const records = await productionRecords(plan, fixture, base)
      const resolved = resolveSeedBoundaryPlan(plan, records.admissions)
      assert.equal(resolved.baseSeed, base)
      assert.deepEqual(
        resolved.items.map(({ seed }) => seed),
        seeds,
      )
      const corrupted = structuredClone(records.admissions)
      const payload = JSON.parse(corrupted[3].frozen_payload_json)
      payload.context.sampling.seed = (seeds[3] + 1) % 2 ** 32
      corrupted[3].frozen_payload_json = JSON.stringify(payload)
      assert.throws(() => resolveSeedBoundaryPlan(plan, corrupted), /independent uint32 table/)
      assert.throws(() => resolveSeedBoundaryPlan(plan, corrupted.slice(0, 3)), /admission count/)
      const duplicate = structuredClone(records.admissions)
      duplicate[1].id = duplicate[0].id
      assert.throws(() => resolveSeedBoundaryPlan(plan, duplicate), /unique/)
      for (const edit of [
        (row) => {
          row.context.sampling.seed = 2 ** 32
        },
        (row) => {
          row.context.sampling.seed = -1
        },
        (row) => {
          row.context.sampling.requestedSeedPolicy = 'fixed'
        },
        (row) => {
          row.context.sampling.seedBehavior = 'per-prompt'
        },
      ]) {
        const changed = structuredClone(records.admissions)
        const frozen = JSON.parse(changed[0].frozen_payload_json)
        edit(frozen)
        changed[0].frozen_payload_json = JSON.stringify(frozen)
        assert.throws(() => resolveSeedBoundaryPlan(plan, changed))
      }
      const detached = records.admissions.map(({ id, frozen_payload_json }) => ({
        id,
        frozen: JSON.parse(frozen_payload_json),
      }))
      assert.deepEqual(resolveSeedBoundaryPlan(plan, detached), resolved)
      detached[0].frozen_payload_json = records.admissions[0].frozen_payload_json
      assert.throws(() => resolveSeedBoundaryPlan(plan, detached), /exactly one/)
      const alteredExpected = structuredClone(resolved)
      alteredExpected.items[3].seed = 123
      assert.throws(() => resolveSeedBoundaryPlan(alteredExpected, records.admissions))
    }
  })

  test(`${objective}: Random→Fixed replay omits only requested policy and preserves behavior/native axes`, async () => {
    const fixture = installedFixture()
    const random = await productionRecords(validateSeedBoundaryFixture(wrapper(objective)), fixture)
    const plan = validateSeedBoundaryFixture(wrapper(objective, 'replay', 37))
    const replay = await productionRecords(plan, fixture)
    for (const [index, original] of random.frozenRecords.entries()) {
      const matched = replay.frozenRecords[index]
      assert.notDeepEqual(
        normalizeSeedBoundaryNativeInputs(original),
        normalizeSeedBoundaryNativeInputs(matched),
      )
      assert.deepEqual(
        normalizeSeedBoundaryExecutionInputs(original, plan),
        normalizeSeedBoundaryExecutionInputs(matched, plan),
      )
      const changed = structuredClone(matched)
      changed.context.sampling.seedBehavior = 'per-prompt'
      assert.notDeepEqual(
        normalizeSeedBoundaryExecutionInputs(original, plan),
        normalizeSeedBoundaryExecutionInputs(changed, plan),
      )
      const native = structuredClone(matched)
      native.workerJob.loras[0].weight = 0.5
      assert.notDeepEqual(
        normalizeSeedBoundaryExecutionInputs(original, plan),
        normalizeSeedBoundaryExecutionInputs(native, plan),
      )
      assert.equal(original.context.sampling.requestedSeedPolicy, 'random')
      assert.equal(matched.context.sampling.requestedSeedPolicy, 'fixed')
    }
    for (const stage of ['random', 'wrap', 'restored'])
      assert.throws(
        () =>
          normalizeSeedBoundaryExecutionInputs(
            replay.frozenRecords[0],
            validateSeedBoundaryFixture(wrapper(objective, stage)),
          ),
        /Only the declared/,
      )
  })

  test(`${objective}: exact frozen/native/portable oracle detects plausible seed and resource corruptions`, async () => {
    const fixture = installedFixture()
    const plan = validateSeedBoundaryFixture(wrapper(objective, 'wrap'))
    const records = await productionRecords(plan, fixture)
    const expected = plan.items[1]
    const good = records.frozenRecords[1]
    for (const edit of [
      (value) => {
        value.context.sampling.seed = 1
      },
      (value) => {
        value.context.sampling.requestedSeedPolicy = 'random'
      },
      (value) => {
        value.context.sampling.seedBehavior = 'per-iteration'
      },
      (value) => {
        value.workerJob.sampling.seed = 1
      },
      (value) => {
        value.workerJob.loras[0].weight = 0
      },
      (value) => {
        value.context.prompts.negative = noisy
      },
      (value) => {
        value.workerJob.target.sha256 = 'f'.repeat(64)
      },
      ...(objective === 'anima'
        ? [
            (value) => {
              value.workerJob.sampling.stepSeed = 1
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
      assert.throws(() => assertSeedBoundaryFrozen(changed, expected, fixture))
    }
    for (const edit of [
      (value) => {
        value.sampling.actualSeed = 1
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
      const changed = structuredClone(records.configurations[1])
      edit(changed)
      assert.throws(() => assertSeedBoundaryConfiguration(changed, expected, fixture))
    }
    assertSeedBoundaryFrozen(good, expected, fixture)
    assertSeedBoundaryConfiguration(records.configurations[1], expected, fixture)
  })
}

test('fixture guards reject unknown schema/stage/objective, path overlap and invalid replay/mutation combinations', () => {
  assert.throws(
    () => normalizeSeedBoundaryNativeInputs({ kind: 'anima-img2img' }),
    /qualified txt2img/,
  )
  for (const edit of [
    (value) => {
      value.extra = true
    },
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.objective = 'sample'
    },
    (value) => {
      value.stage = 'iteration'
    },
    (value) => {
      value.profile = 'anima-dynamic-batch'
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.artifacts = value.referenceFixture.path
    },
    (value) => {
      value.artifacts = path.join(root, 'shared')
    },
    (value) => {
      value.workerBaseline.sha256 = 'g'.repeat(64)
    },
    (value) => {
      value.referenceFixture.path = '/tmp/unowned.json'
    },
    (value) => {
      value.replaySeed = 0
    },
    (value) => {
      value.baseline = {
        reportPath: path.join(root, 'runs/healthy/report.json'),
        reportSha256: 'c'.repeat(64),
      }
    },
  ]) {
    const fixture = wrapper()
    edit(fixture)
    assert.throws(() => validateSeedBoundaryFixture(fixture))
  }
  for (const value of [-1, 1.5, 2 ** 32, NaN, Infinity, '0', null, undefined])
    assert.throws(() =>
      validateSeedBoundaryFixture({ ...wrapper('epsilon', 'replay'), replaySeed: value }),
    )
  for (const stage of ['replay', 'restored']) {
    const fixture = wrapper('epsilon', stage)
    delete fixture.baseline
    assert.throws(() => validateSeedBoundaryFixture(fixture))
  }
  for (const objective of objectives) {
    const mutation = {
      module: objective === 'anima' ? 'anima_euler.py' : 'inference.py',
      originalSha256: 'd'.repeat(64),
      mutatedSha256: 'e'.repeat(64),
    }
    const baseline = {
      reportPath: path.join(root, 'runs/wrap/report.json'),
      reportSha256: 'c'.repeat(64),
    }
    const healthy = wrapper(objective, 'wrap')
    assert.throws(() => validateSeedBoundaryFixture({ ...healthy, baseline }))
    assert.throws(() => validateSeedBoundaryFixture({ ...healthy, mutation }))
    assert.equal(
      validateSeedBoundaryFixture({ ...healthy, baseline, mutation }).expectedAdmissions,
      4,
    )
    assert.throws(() =>
      validateSeedBoundaryFixture({
        ...healthy,
        baseline,
        mutation: { ...mutation, module: 'unknown.py' },
      }),
    )
    assert.throws(() =>
      validateSeedBoundaryFixture({
        ...healthy,
        baseline,
        mutation: { ...mutation, mutatedSha256: mutation.originalSha256 },
      }),
    )
    for (const stage of ['random', 'replay', 'restored'])
      assert.throws(() =>
        validateSeedBoundaryFixture({ ...wrapper(objective, stage), baseline, mutation }),
      )
  }
})
