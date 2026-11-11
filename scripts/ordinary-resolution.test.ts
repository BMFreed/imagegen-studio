import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  ORDINARY_RESOLUTION_CASES,
  ORDINARY_RESOLUTION_CONTRACT,
  ORDINARY_RESOLUTION_RUN,
} from '../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.js'
import { ordinaryResolutionFixtureFrom } from './qualify-regional-character-visual.mjs'

function fixture() {
  const root = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
  return {
    appData: path.join(root, 'shared/regional-public-worker-014-20261103/data/imagegen-studio'),
    artifacts: ORDINARY_RESOLUTION_RUN,
    checkpoint: {
      byteSize: 6_938_040_760,
      civitaiFileId: 798_303,
      civitaiModelId: 795_765,
      civitaiVersionId: 889_818,
      modelName: 'Illustrious XL v0.1 (official pinned epsilon)',
      path: path.join(
        root,
        'shared/illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors',
      ),
      sha256: '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
      versionName: 'v0.1',
    },
    contract: {
      path: path.join(ORDINARY_RESOLUTION_RUN, 'experiment-contract.json'),
      sha256: 'a'.repeat(64),
    },
    deadlineSeconds: 600,
    profile: 'ordinary-resolution-v1',
    provisionReport: { path: path.join(root, 'active-report.json'), sha256: 'b'.repeat(64) },
    schemaVersion: 1,
  }
}

test('resolution fixture import is inert and preserves the four fixed ordinary controls', () => {
  const source = fixture()
  assert.deepEqual(ordinaryResolutionFixtureFrom(source), source)
  assert.deepEqual(source, fixture())
  assert.deepEqual(
    ORDINARY_RESOLUTION_CASES.map(({ label }) => label),
    ['seed123-512', 'seed123-1024', 'seed124-512', 'seed124-1024'],
  )
  assert.ok(ORDINARY_RESOLUTION_CASES.every(({ image, outside }) => image === null && !outside))
  assert.equal(ORDINARY_RESOLUTION_CONTRACT.nativeRequestCeiling, 4)
})

for (const fault of [
  'extra-option',
  'deadline',
  'wrong-model',
  'checkpoint-path',
  'artifact-path',
  'contract-path',
  'shared-data-path',
  'reference-option',
] as const) {
  test(`ordinary resolution refuses ${fault} before a native consumer`, () => {
    const source = fixture()
    const input =
      fault === 'extra-option'
        ? { ...source, seed: 125 }
        : fault === 'reference-option'
          ? { ...source, referenceImages: {} }
          : source
    if (fault === 'deadline') {
      source.deadlineSeconds = 601
    }
    if (fault === 'wrong-model') {
      source.checkpoint.sha256 = 'c'.repeat(64)
    }
    if (fault === 'checkpoint-path') {
      source.checkpoint.path = path.join(ORDINARY_RESOLUTION_RUN, 'another.safetensors')
    }
    if (fault === 'artifact-path') {
      source.artifacts = path.join(ORDINARY_RESOLUTION_RUN, 'retry')
    }
    if (fault === 'contract-path') {
      source.contract.path = path.join(ORDINARY_RESOLUTION_RUN, 'other.json')
    }
    if (fault === 'shared-data-path') {
      source.appData = path.join(ORDINARY_RESOLUTION_RUN, 'data')
    }
    assert.throws(() => ordinaryResolutionFixtureFrom(input))
  })
}
