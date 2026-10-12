/**
 * Actual Main prepared rows/configuration, with explicitly mechanical report/pixel/lifecycle
 * doubles.
 */
import { createHash } from 'node:crypto'
import {
  installedEnvelope,
  installedFixture,
  resource,
} from './illustrious-dynamic-image-test-fixtures.mjs'
import { produce } from './illustrious-image-seed-replay-test-fixtures.mjs'
export { installedFixture, resource }
export function envelope(stage = 'boundary', objective = 'epsilon', mode = 'img2img') {
  const base = installedEnvelope('baseline', objective, mode)
  return {
    ...base,
    profile: 'illustrious-image-batch-cap',
    stage,
    ...(stage === 'prefix'
      ? {
          baseline: {
            reportPath: base.artifacts.replace('baseline-', 'boundary-') + '/report.json',
            reportSha256: 'e'.repeat(64),
          },
        }
      : {}),
    artifacts: base.artifacts.replace('baseline-', stage + '-'),
  }
}
export function authoring(reference, stage, objective, mode) {
  const key = objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious'
  return {
    seed: { policy: 'fixed', value: 0 },
    dynamicPrompt: {
      maxPrompts: stage === 'boundary' ? 4 : 3,
      seedBehavior: stage === 'boundary' ? 'per-iteration' : 'per-prompt',
    },
    sampling: {
      steps: 3,
      cfgScale: 5,
      sampler: objective === 'epsilon' ? 'Euler a' : 'Euler',
      scheduler: 'Normal',
      denoisingStrength: 0.5,
    },
    model: resource(reference, key),
    vae: resource(reference, 'externalVaeNative'),
    vaePrecision: 'FP32',
    cfgRescale: 0,
    loras: [{ enabled: true, resource: resource(reference, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: {
      text: 'a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph',
      embeddingRefs: [],
    },
    negativePrompt: { text: '{(blurry:0.7)|(noisy:0.7)}, low quality', embeddingRefs: [] },
  }
}
export async function produced(reference, stage, objective, mode) {
  return await produce(reference, objective, mode, 'fixed', 0, {
    batch: {
      iterations: stage === 'boundary' ? 8 : 2,
      maxPrompts: stage === 'boundary' ? 4 : 3,
      seedBehavior: stage === 'boundary' ? 'per-iteration' : 'per-prompt',
    },
  })
}
const pixel = (pair, seed) =>
  createHash('sha256').update(`declared-pixel-double:${pair}:${seed}`).digest('hex')
export function generations(actual, plan, accepted = false) {
  return actual.rows.map((row, index) => {
    const frozen = JSON.parse(row.frozen_payload_json)
    return {
      queueItemId: row.id,
      expectedItem: plan.items[index],
      frozen,
      row: { status: 'completed' },
      provenance: { generationConfiguration: actual.configs[index] },
      accepted,
      dimensions: {
        pixelSha256: pixel(plan.items[index].promptPairIndex, frozen.context.sampling.seed),
      },
    }
  })
}
export function retainedBoundary(actual, plan) {
  return {
    status: 'passed',
    profile: 'illustrious-image-batch-cap',
    stage: 'boundary',
    objective: plan.objective,
    literalPlan: plan,
    resolvedPlan: plan,
    nativePhysicalExit: { confirmed: true },
    savedPackage: {
      acceptedLayers: 32,
      sourceLayers: 1,
      totalLayers: 33,
      reopened: true,
      lastActualSeedSnapshot: 7,
    },
    admissions: actual.rows.map((row) => ({ row })),
    generations: generations(actual, plan, true),
    comparisons: actual.rows.map(({ id }) => ({ queueItemId: id, readOnly: true })),
    refusal33: {
      unchanged: true,
      before: { projectCandidateCount: 32, layerCount: 1 },
      after: { projectCandidateCount: 32, layerCount: 1 },
      ui: {
        reviewCount: 32,
        mainStateObservation: { value: { phase: 'idle', error: { code: 'BATCH_TOO_LARGE' } } },
      },
    },
  }
}
