import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  REFERENCE_UTILITY_CONTRACT,
  REFERENCE_UTILITY_RUN,
} from '../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.js'
import { referenceUtilityFixtureFrom } from './qualify-regional-character-visual.mjs'

function fixture() {
  const root = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
  return {
    appData: path.join(root, 'shared/regional-public-worker-014-20261103/data/imagegen-studio'),
    artifacts: REFERENCE_UTILITY_RUN,
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
      path: path.join(REFERENCE_UTILITY_RUN, 'experiment-contract.json'),
      sha256: 'a'.repeat(64),
    },
    deadlineSeconds: 600,
    profile: 'reference-utility-v1',
    provisionReport: { path: path.join(root, 'active-report.json'), sha256: 'b'.repeat(64) },
    referenceImages: {
      A: {
        byteSize: Number(REFERENCE_UTILITY_CONTRACT.referenceImages.A.byteSize),
        path: path.join(REFERENCE_UTILITY_RUN, 'reference-A.png'),
        sha256: String(REFERENCE_UTILITY_CONTRACT.referenceImages.A.sha256),
      },
      B: {
        ...REFERENCE_UTILITY_CONTRACT.referenceImages.B,
        path: path.join(REFERENCE_UTILITY_RUN, 'reference-B.png'),
      },
    },
    schemaVersion: 1,
  }
}

test('fixed visual fixture is import-safe and preserves exact original reference pins', () => {
  const source = fixture()
  const parsed = referenceUtilityFixtureFrom(source)
  assert.deepEqual(parsed, source)
  assert.deepEqual(source, fixture())
})

for (const fault of [
  'extra-option',
  'deadline',
  'wrong-model',
  'swapped-image',
  'thumbnail-path',
] as const) {
  test(`visual qualification refuses ${fault} before any native consumer`, () => {
    const source = fixture()
    const input = fault === 'extra-option' ? { ...source, seed: 125 } : source
    if (fault === 'deadline') {
      source.deadlineSeconds = 601
    }
    if (fault === 'wrong-model') {
      source.checkpoint.sha256 = 'c'.repeat(64)
    }
    if (fault === 'swapped-image') {
      source.referenceImages.A = { ...source.referenceImages.B }
    }
    if (fault === 'thumbnail-path') {
      source.referenceImages.A.path = path.join(REFERENCE_UTILITY_RUN, 'thumbnail.webp')
    }
    assert.throws(() => referenceUtilityFixtureFrom(input))
  })
}
