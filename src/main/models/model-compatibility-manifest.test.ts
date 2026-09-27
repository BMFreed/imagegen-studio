import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import {
  CHECKPOINT_COMPATIBILITY_MANIFEST,
  qualifiedCheckpointPredictionType,
} from './model-compatibility-manifest.js'

test('official Illustrious v0.1 record matches the pinned author file and scheduler config', () => {
  const [official] = CHECKPOINT_COMPATIBILITY_MANIFEST
  const pointer = readFileSync(
    new URL('./test-fixtures/illustrious-v01-lfs-pointer.txt', import.meta.url),
    'utf8',
  )
  const [version, digestLine, sizeLine, ...extra] = pointer.trimEnd().split('\n')
  assert.equal(version, 'version https://git-lfs.github.com/spec/v1')
  assert.equal(extra.length, 0)
  const digest = /^oid sha256:([a-f0-9]{64})$/.exec(digestLine ?? '')
  const size = /^size ([1-9]\d*)$/.exec(sizeLine ?? '')
  assert.ok(digest)
  assert.ok(size)
  const scheduler = JSON.parse(
    readFileSync(
      new URL('./test-fixtures/illustrious-v01-scheduler-config.json', import.meta.url),
      'utf8',
    ),
  ) as { prediction_type?: unknown }
  const checkpointHeader = gunzipSync(
    readFileSync(new URL('./test-fixtures/illustrious-v01-safetensors-header.gz', import.meta.url)),
  )
  assert.equal(Number(checkpointHeader.readBigUInt64LE(0)), checkpointHeader.length - 8)
  const header = JSON.parse(checkpointHeader.subarray(8).toString('utf8')) as {
    __metadata__?: Record<string, unknown>
  }
  assert.equal(official.baseModelFamily, 'illustrious')
  assert.equal(official.sha256, digest[1])
  assert.equal(official.sizeBytes, Number(size[1]))
  assert.equal(header.__metadata__?.['modelspec.architecture'], 'stable-diffusion-xl-v1-base')
  assert.equal(official.predictionType, header.__metadata__?.['modelspec.prediction_type'])
  assert.equal(official.predictionType, scheduler.prediction_type)
  assert.deepEqual(official.evidence, {
    checkpointPath: 'Illustrious-XL-v0.1.safetensors',
    repository: 'OnomaAIResearch/Illustrious-xl-early-release-v0',
    revision: 'dca0dac303e6dc4b0c31d8001bc685b89b5d0204',
    safetensorsHeaderSha256: createHash('sha256').update(checkpointHeader).digest('hex'),
    schedulerConfigPath: 'scheduler/scheduler_config.json',
  })
  assert.equal(qualifiedCheckpointPredictionType(official), 'epsilon')
  assert.equal(qualifiedCheckpointPredictionType({ ...official, sha256: '0'.repeat(64) }), null)
  assert.equal(qualifiedCheckpointPredictionType({ ...official, sizeBytes: 1 }), null)
  assert.equal(qualifiedCheckpointPredictionType({ ...official, baseModelFamily: 'anima' }), null)
})
