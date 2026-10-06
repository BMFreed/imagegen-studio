import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createEngineInstallPlan,
  ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
  EngineInstallPlanError,
} from './engine-install-plan.ts'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.ts'

// Controlled complete finite manifest for the actual pure Main planner, not an installed runtime.
const runtimeArtifact = (overrides = {}) => ({
  filename: 'python-runtime.tar.zst',
  id: 'python-runtime',
  installedSizeBytes: 150,
  sha256: '1'.repeat(64),
  sizeBytes: 100,
  ...overrides,
})
const exactVerified = (artifact) => ({
  filename: artifact.filename,
  id: artifact.id,
  kind: artifact.kind,
  sha256: artifact.sha256,
  sizeBytes: artifact.sizeBytes,
})
const refuse = (input) =>
  assert.throws(
    () => createEngineInstallPlan(input),
    (error) => {
      assert.ok(error instanceof EngineInstallPlanError)
      assert.equal(error.code, 'INVALID_ENGINE_INSTALL_PLAN')
      return true
    },
  )

test('the actual full engine byte plan always appends one exact LaMa artifact and includes its bytes', () => {
  // Mutation: omit LaMa from the sum or return the runtime-only number as complete setup size.
  const plan = createEngineInstallPlan({
    runtimeArtifacts: [
      runtimeArtifact(),
      runtimeArtifact({
        filename: 'worker.whl',
        id: 'worker-wheel',
        installedSizeBytes: 60,
        sha256: '2'.repeat(64),
        sizeBytes: 40,
      }),
    ],
  })
  assert.equal(plan.artifacts.length, 3)
  assert.deepEqual(plan.artifacts[2], {
    filename: LAMA_OUTPAINT_ARTIFACT.filename,
    id: ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
    installedSizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    kind: LAMA_OUTPAINT_ARTIFACT.role,
    reused: false,
    sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
  })
  assert.deepEqual(plan.totals, {
    additionalInstalledBytes: 210 + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    downloadBytes: 140 + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    installedBytes: 210 + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    stagingBytes: 140 + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
  })
  assert.deepEqual(plan.unknownInstalledSizeArtifactIds, [])
  for (const artifact of plan.artifacts) {
    assert.equal(Object.hasOwn(artifact, 'path'), false)
    assert.equal(Object.hasOwn(artifact, 'url'), false)
  }
})

test('missing, empty and sparse runtime manifests refuse rather than treating LaMa alone as an engine', () => {
  for (const input of [
    undefined,
    null,
    {},
    { runtimeArtifacts: [] },
    { runtimeArtifacts: Array(1) },
  ]) {
    refuse(input)
  }
})

test('runtime identities, exact sizes and disk footprints reject malformed or renderer-shaped metadata', () => {
  for (const field of ['id', 'filename', 'sizeBytes', 'sha256', 'installedSizeBytes']) {
    const artifact = runtimeArtifact()
    delete artifact[field]
    refuse({ runtimeArtifacts: [artifact] })
  }
  for (const id of [
    '',
    '../runtime',
    '.',
    '..',
    'runtime/one',
    'runtime\\one',
    ' runtime',
    'a\n',
  ]) {
    refuse({ runtimeArtifacts: [runtimeArtifact({ id })] })
  }
  for (const filename of ['', '../python', '.', '..', '/python', 'a\\b', 'a b', 'a\n']) {
    refuse({ runtimeArtifacts: [runtimeArtifact({ filename })] })
  }
  for (const sha256 of ['', 'f'.repeat(63), 'F'.repeat(64), 'g'.repeat(64), null]) {
    refuse({ runtimeArtifacts: [runtimeArtifact({ sha256 })] })
  }
  for (const size of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '100']) {
    refuse({ runtimeArtifacts: [runtimeArtifact({ sizeBytes: size })] })
    refuse({ runtimeArtifacts: [runtimeArtifact({ installedSizeBytes: size })] })
  }
  for (const extra of [
    { path: '/tmp/runtime' },
    { url: 'https://example.test/runtime' },
    { reused: true },
  ]) {
    refuse({ runtimeArtifacts: [runtimeArtifact(extra)] })
  }
  refuse({ runtimeArtifacts: [runtimeArtifact()], rendererVerified: true })
})

test('duplicate runtime IDs or destination filenames and attempts to replace the pinned LaMa refuse', () => {
  const first = runtimeArtifact()
  for (const second of [
    runtimeArtifact({ filename: 'second.whl' }),
    runtimeArtifact({ id: 'second' }),
    runtimeArtifact({ filename: 'PYTHON-RUNTIME.TAR.ZST', id: 'second' }),
  ]) {
    refuse({ runtimeArtifacts: [first, second] })
  }
  refuse({ runtimeArtifacts: [runtimeArtifact({ id: ENGINE_OUTPAINT_INFILL_ARTIFACT_ID })] })
  refuse({ runtimeArtifacts: [runtimeArtifact({ filename: LAMA_OUTPAINT_ARTIFACT.filename })] })
})

test('download, staging and installed totals refuse safe-integer overflow while the exact boundary passes', () => {
  const maximumRuntimeDownload = Number.MAX_SAFE_INTEGER - LAMA_OUTPAINT_ARTIFACT.sizeBytes
  const exact = createEngineInstallPlan({
    runtimeArtifacts: [
      runtimeArtifact({ installedSizeBytes: null, sizeBytes: maximumRuntimeDownload }),
    ],
  })
  assert.equal(exact.totals.downloadBytes, Number.MAX_SAFE_INTEGER)
  assert.equal(exact.totals.stagingBytes, Number.MAX_SAFE_INTEGER)
  refuse({
    runtimeArtifacts: [
      runtimeArtifact({ installedSizeBytes: null, sizeBytes: maximumRuntimeDownload + 1 }),
    ],
  })
  refuse({
    runtimeArtifacts: [runtimeArtifact({ installedSizeBytes: Number.MAX_SAFE_INTEGER })],
  })
})

test('only exact independently verified installed identities remove download and additional footprint bytes', () => {
  const input = { runtimeArtifacts: [runtimeArtifact()] }
  const full = createEngineInstallPlan(input)
  const infill = full.artifacts[1]
  const reusedInfill = createEngineInstallPlan({
    ...input,
    verifiedInstalledArtifacts: [exactVerified(infill)],
  })
  assert.deepEqual(reusedInfill.totals, {
    additionalInstalledBytes: 150,
    downloadBytes: 100,
    installedBytes: 150 + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    stagingBytes: 100,
  })
  assert.equal(reusedInfill.artifacts[0].reused, false)
  assert.equal(reusedInfill.artifacts[1].reused, true)
  const allReused = createEngineInstallPlan({
    ...input,
    verifiedInstalledArtifacts: full.artifacts.map(exactVerified),
  })
  assert.deepEqual(allReused.totals, {
    additionalInstalledBytes: 0,
    downloadBytes: 0,
    installedBytes: 150 + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    stagingBytes: 0,
  })
})

test('changed size, digest, type or names cannot bypass a download through installed verification', () => {
  const runtimeArtifacts = [runtimeArtifact()]
  const plan = createEngineInstallPlan({ runtimeArtifacts })
  for (const artifact of plan.artifacts) {
    const verified = exactVerified(artifact)
    for (const change of [
      { filename: 'different.bin' },
      { id: 'unplanned' },
      { kind: artifact.kind === 'runtime' ? 'outpaint-infill' : 'runtime' },
      { sha256: '3'.repeat(64) },
      { sizeBytes: artifact.sizeBytes + 1 },
      { sizeBytes: 0 },
      { path: '/tmp/claimed-installed' },
    ]) {
      refuse({ runtimeArtifacts, verifiedInstalledArtifacts: [{ ...verified, ...change }] })
    }
    refuse({ runtimeArtifacts, verifiedInstalledArtifacts: [verified, verified] })
  }
  for (const verifiedInstalledArtifacts of [null, true, {}, Array(1)]) {
    refuse({ runtimeArtifacts, verifiedInstalledArtifacts })
  }
})

test('unknown installed footprints remain explicitly unknown without hiding exact download totals', () => {
  const runtimeArtifacts = [runtimeArtifact({ installedSizeBytes: null })]
  const plan = createEngineInstallPlan({ runtimeArtifacts })
  assert.equal(plan.totals.downloadBytes, 100 + LAMA_OUTPAINT_ARTIFACT.sizeBytes)
  assert.equal(plan.totals.stagingBytes, plan.totals.downloadBytes)
  assert.equal(plan.totals.installedBytes, null)
  assert.equal(plan.totals.additionalInstalledBytes, null)
  assert.deepEqual(plan.unknownInstalledSizeArtifactIds, ['python-runtime'])
  const reusedUnknown = createEngineInstallPlan({
    runtimeArtifacts,
    verifiedInstalledArtifacts: [exactVerified(plan.artifacts[0])],
  })
  assert.equal(reusedUnknown.totals.installedBytes, null)
  assert.equal(reusedUnknown.totals.additionalInstalledBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
  assert.equal(reusedUnknown.totals.downloadBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
})

test('the path-free plan owns immutable detached values while the caller retains its manifest', () => {
  const artifact = runtimeArtifact()
  const input = { runtimeArtifacts: [artifact] }
  const plan = createEngineInstallPlan(input)
  artifact.sizeBytes = 1
  artifact.filename = 'changed.tar'
  input.runtimeArtifacts.length = 0
  assert.equal(plan.artifacts[0].sizeBytes, 100)
  assert.equal(plan.artifacts[0].filename, 'python-runtime.tar.zst')
  assert.throws(() => {
    plan.artifacts[0].reused = true
  }, TypeError)
  assert.throws(() => {
    plan.totals.downloadBytes = 0
  }, TypeError)
  assert.throws(() => {
    plan.artifacts.pop()
  }, TypeError)
  assert.throws(() => {
    plan.unknownInstalledSizeArtifactIds.push('invented')
  }, TypeError)
})
