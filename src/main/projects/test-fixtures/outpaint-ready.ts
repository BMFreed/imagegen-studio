import { ANIMA_BATCH_READY } from './anima-batch.js'

/** Explicit transport substitute, not evidence that trained weights/runtime are installed. */
export const OUTPAINT_READY = {
  ...ANIMA_BATCH_READY,
  capabilities: [...ANIMA_BATCH_READY.capabilities, 'illustrious-outpaint', 'anima-outpaint'],
  workerVersion: '0.12.0',
}
