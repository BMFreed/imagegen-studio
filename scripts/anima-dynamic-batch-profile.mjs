/** Anima-specific authoring and literal assertions injected into the shared durable runner. */
import {
  assertDynamicBatchConfiguration,
  assertDynamicBatchFrozen,
  normalizeDynamicExecutionInputs,
  normalizeDynamicNativeInputs,
  validateDynamicBatchFixture,
} from './anima-dynamic-batch-qualification.mjs'
import { animaRegressionModelKeys } from './anima-regression-qualification.mjs'

export const animaDynamicBatchProfile = Object.freeze({
  profile: 'anima-dynamic-batch',
  entrySource: 'scripts/qualify-installed-dynamic-batch.mjs',
  adapterSource: 'scripts/anima-dynamic-batch-profile.mjs',
  oracleSource: 'scripts/anima-dynamic-batch-qualification.mjs',
  validateFixture: validateDynamicBatchFixture,
  assertFrozen: assertDynamicBatchFrozen,
  assertConfiguration: assertDynamicBatchConfiguration,
  normalizeNativeInputs: normalizeDynamicNativeInputs,
  normalizeExecutionInputs: normalizeDynamicExecutionInputs,
  modelKey: () => 'anima',
  loraKey: 'animaLora',
  originalSourceKeys: () => animaRegressionModelKeys,
  operation: 'anima-txt2img',
  cfgScale: 4,
  sampling: () => ({
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'Euler',
    code: 'euler',
    editedValue: 'Heun',
    editedCode: 'heun',
  }),
  comparisonChanged: [
    'sampling.animaMethod',
    'seed.actual',
    'prompt.text',
    'negativePrompt.text',
    'loras.stack',
  ],
  comparisonSame: [
    'model.resource',
    'anima.architecture',
    'anima.checkpointByteSize',
    'anima.qwen3Encoder',
    'anima.vae',
  ],
  boundary: {
    actual:
      'Built Electron renderer/preload/Main, public Generate/Results/Add/Save/recovery, installed worker0.14/native BF16, actual SQLite/PNG/.igs and native physical exit.',
    preconditions:
      'One canonical existing qualified runtime/catalog, nine resources/fourteen versions; exact Anima/Qwen3/Wan/Myth files. No installation, download or new model/runtime copies.',
    limits:
      '256x256, three Euler TXT evaluations, CFG4, signed ordinary Myth LoRA -0.5; declared finite Fixed/per-iteration, crash and Reuse/per-prompt cases only. Random, uint32 wrap, maximum32-job inference, image quality, broad compatibility and release qualification are outside this claim.',
  },
})
