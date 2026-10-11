/** Test-only authoring/resource preconditions; no prepared batch or admitted results are fabricated. */
import { homedir } from 'node:os'
import path from 'node:path'
import { installedFixture, resource } from './noobai-lora-stack-image-test-fixtures.mjs'
import { literalIllustriousDynamicImagePlan } from './illustrious-dynamic-image-qualification.mjs'
export { installedFixture, resource }
const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/dynamic-image-unit')
export function installedEnvelope(stage = 'baseline', objective = 'epsilon', mode = 'img2img') {
  return {
    schemaVersion: 1,
    profile: 'illustrious-dynamic-image',
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
    ...(stage !== 'baseline'
      ? {
          baseline: {
            reportPath: path.join(root, 'healthy/report.json'),
            reportSha256: 'e'.repeat(64),
          },
        }
      : {}),
    ...(stage === 'control'
      ? {
          mutation: {
            module: 'inference.py',
            originalSha256: 'f'.repeat(64),
            mutatedSha256: '1'.repeat(64),
          },
        }
      : {}),
  }
}
export function authored(stage = 'baseline', objective = 'epsilon', mode = 'img2img') {
  const reference = installedFixture()
  const fixture = installedEnvelope(stage, objective, mode)
  const plan = literalIllustriousDynamicImagePlan(stage, objective, mode)
  const draft = {
    seed: { policy: 'fixed', value: 0 },
    dynamicPrompt: { maxPrompts: plan.maxPrompts, seedBehavior: 'per-iteration' },
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
    loras: [{ enabled: true, resource: resource(reference, 'illustriousLora'), weight: -0.5 }],
    positivePrompt: { text: plan.sourcePrompts.positive, embeddingRefs: [] },
    negativePrompt: { text: plan.sourcePrompts.negative, embeddingRefs: [] },
  }
  return { reference, fixture, plan, draft }
}
