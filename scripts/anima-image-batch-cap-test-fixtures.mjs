/** Actual Main rows/configs; path/report/pixel/DOM/lifecycle values below are disclosed peers. */
import { createHash } from 'node:crypto'
import path from 'node:path'
import { envelope as imageEnvelope } from './anima-dynamic-image-test-fixtures.mjs'
import {
  authoring,
  installedFixture,
  produced,
  resource,
} from './anima-image-batch-cap-main-fixtures.mjs'
import { normalizeAnimaImageBatchCapNativeInputs } from './anima-image-batch-cap-qualification.mjs'
export { authoring, installedFixture, produced, resource }
export { comparisonInput } from './anima-dynamic-image-per-prompt-test-fixtures.mjs'

export function envelope(stage = 'boundary', mode = 'img2img') {
  const common = imageEnvelope('baseline', mode),
    root = path.dirname(common.referenceFixture.path)
  return {
    ...common,
    profile: 'anima-image-batch-cap',
    stage,
    artifacts: path.join(root, `${stage}-${mode}`),
    ...(stage === 'prefix'
      ? {
          baseline: {
            reportPath: path.join(root, `boundary-${mode}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
        }
      : {}),
  }
}
const pixel = (pair, seed) =>
  createHash('sha256').update(`declared-not-native-pixel:${pair}:${seed}`).digest('hex')
export function generations(actual, plan, accepted = false) {
  return actual.rows.map((row, index) => ({
    queueItemId: row.id,
    expectedItem: plan.items[index],
    frozen: JSON.parse(row.frozen_payload_json),
    row: { status: 'completed' },
    provenance: { generationConfiguration: actual.configs[index] },
    accepted,
    qualification: {
      beforeExplicitAdd: true,
      normalizedInputs: normalizeAnimaImageBatchCapNativeInputs(
        JSON.parse(row.frozen_payload_json),
      ),
    },
    dimensions: { pixelSha256: pixel(plan.items[index].promptPairIndex, plan.items[index].seed) },
  }))
}
export function retainedBoundary(actual, plan) {
  return {
    status: 'passed',
    profile: 'anima-image-batch-cap',
    stage: 'boundary',
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
        mainStateObservation: {
          value: {
            phase: 'idle',
            error: { code: 'BATCH_TOO_LARGE' },
            runningJobId: null,
            jobs: [],
          },
        },
      },
    },
  }
}
