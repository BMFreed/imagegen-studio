/** Report/UI doubles around actual Main admission/configuration; no installed inference claim. */
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  authoring,
  installedFixture,
  produce,
} from './illustrious-image-seed-replay-test-fixtures.mjs'
import { normalizeIllustriousDynamicImageNativeInputs } from './illustrious-dynamic-image-qualification.mjs'

export { installedFixture, produce }
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/image-seed-wrap-unit')
export function envelope(stage = 'wrap', objective = 'epsilon', mode = 'img2img') {
  return {
    schemaVersion: 1,
    profile: 'illustrious-image-seed-wrap',
    stage,
    objective,
    mode,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, `${stage}-${objective}-${mode}`),
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
    ...(stage === 'wrap'
      ? {
          baseline: {
            reportPath: path.join(root, `control-max-${objective}-${mode}/report.json`),
            reportSha256: 'e'.repeat(64),
          },
          zeroControl: {
            reportPath: path.join(root, `control-zero-${objective}-${mode}/report.json`),
            reportSha256: 'f'.repeat(64),
          },
        }
      : {}),
  }
}
export function authored(reference, stage = 'wrap', objective = 'epsilon', mode = 'img2img') {
  const draft = authoring(
    reference,
    objective,
    mode,
    'fixed',
    stage === 'control-zero' ? 0 : 4294967295,
  )
  draft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-prompt' }
  draft.positivePrompt.text = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
  draft.negativePrompt.text = '(blurry:0.7), low quality'
  return draft
}
export async function produced(reference, stage, objective, mode) {
  return await produce(
    reference,
    objective,
    mode,
    'fixed',
    stage === 'control-zero' ? 0 : 4294967295,
    {
      concretePair: true,
      batch: { iterations: stage === 'wrap' ? 2 : 1, maxPrompts: 1, seedBehavior: 'per-prompt' },
    },
  )
}
export function observedGenerations(producer, plan, accepted = false) {
  return producer.rows.map((row, index) => {
    const frozen = JSON.parse(row.frozen_payload_json)
    return {
      queueItemId: row.id,
      expectedItem: plan.items[index],
      frozen,
      row: { status: 'completed' },
      accepted,
      dimensions: {
        pixelSha256: frozen.context.sampling.seed === 0 ? '0'.repeat(64) : '1'.repeat(64),
      },
      provenance: { generationConfiguration: producer.configs[index] },
      qualification: {
        beforeExplicitAdd: true,
        normalizedInputs: normalizeIllustriousDynamicImageNativeInputs(frozen),
      },
    }
  })
}
export function retainedControl(producer, plan) {
  return {
    status: 'passed',
    profile: 'illustrious-image-seed-wrap',
    stage: plan.stage,
    objective: plan.objective,
    literalPlan: plan,
    resolvedPlan: plan,
    sourceSha256: { 'declared-source-double.mjs': 'a'.repeat(64) },
    bundleSha256: { 'declared-bundle-double.cjs': 'b'.repeat(64) },
    appData: '/declared-read-only-appdata-double',
    runtimeId: 'declared-runtime-double',
    nativePhysicalExit: { confirmed: true },
    savedPackage: {
      acceptedLayers: 1,
      sourceLayers: 1,
      totalLayers: 2,
      reopened: true,
      lastActualSeedSnapshot: plan.items[0].seed,
    },
    admissions: producer.rows.map((row) => ({ row })),
    generations: observedGenerations(producer, plan, true),
    comparisons: producer.rows.map(({ id }) => ({ queueItemId: id, readOnly: true })),
  }
}
