import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ANIMA_BASE_1_0_CHECKPOINT,
  ANIMA_BASE_1_0_COMPANION_BYTES,
  ANIMA_BASE_1_0_COMPANIONS,
  ANIMA_BASE_1_0_TOTAL_BYTES,
  ANIMA_HF_REVISION,
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
  ANIMA_SOURCE_LICENSE,
  isPinnedAnimaBaseCheckpoint,
} from './anima-manifest.js'

test('Anima Base 1.0 manifest pins exact source files and their integrity metadata', () => {
  assert.equal(ANIMA_HF_REVISION, 'f973fc41ec7545364ac9776c2440285f43ff2a30')
  assert.deepEqual(
    [ANIMA_BASE_1_0_CHECKPOINT, ...ANIMA_BASE_1_0_COMPANIONS].map(
      ({ path, role, sha256, sizeBytes }) => ({ path, role, sha256, sizeBytes }),
    ),
    [
      {
        path: 'split_files/diffusion_models/anima-base-v1.0.safetensors',
        role: 'checkpoint',
        sha256: 'bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e',
        sizeBytes: 4_182_218_328,
      },
      {
        path: 'split_files/text_encoders/qwen_3_06b_base.safetensors',
        role: 'qwen3-encoder',
        sha256: 'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
        sizeBytes: 1_192_135_096,
      },
      {
        path: 'split_files/vae/qwen_image_vae.safetensors',
        role: 'vae',
        sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
        sizeBytes: 253_806_246,
      },
    ],
  )

  for (const item of [ANIMA_BASE_1_0_CHECKPOINT, ...ANIMA_BASE_1_0_COMPANIONS]) {
    assert.equal(
      item.url,
      `https://huggingface.co/circlestone-labs/Anima/resolve/${ANIMA_HF_REVISION}/${item.path}`,
    )
    assert.match(item.sha256, /^[0-9a-f]{64}$/)
    assert.equal(item.license, ANIMA_SOURCE_LICENSE)
  }
  assert.equal(
    ANIMA_SOURCE_LICENSE.url,
    `https://huggingface.co/circlestone-labs/Anima/blob/${ANIMA_HF_REVISION}/LICENSE.md`,
  )
  assert.equal(ANIMA_SOURCE_LICENSE.id, 'circlestone-labs-non-commercial-license')
  assert.equal(ANIMA_QWEN3_0_6B_ENCODER, ANIMA_BASE_1_0_COMPANIONS[0])
  assert.equal(ANIMA_QWEN_IMAGE_VAE, ANIMA_BASE_1_0_COMPANIONS[1])
  assert.equal(ANIMA_BASE_1_0_COMPANION_BYTES, 1_445_941_342)
  assert.equal(ANIMA_BASE_1_0_TOTAL_BYTES, 5_628_159_670)
})

test('Base source identity is exact and separate from installable Anima dependency selection', () => {
  assert.equal(isPinnedAnimaBaseCheckpoint(ANIMA_BASE_1_0_CHECKPOINT.sha256), true)
  assert.equal(isPinnedAnimaBaseCheckpoint(ANIMA_BASE_1_0_CHECKPOINT.sha256.toUpperCase()), true)
  assert.equal(isPinnedAnimaBaseCheckpoint('0'.repeat(64)), false)
  assert.equal(isPinnedAnimaBaseCheckpoint('anima-base-v1.0.safetensors'), false)
  assert.equal(isPinnedAnimaBaseCheckpoint(undefined), false)
  assert.deepEqual(ANIMA_BASE_1_0_COMPANIONS, [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE])
})
