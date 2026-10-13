/** Real Apply/preparation/request/SQLite/provenance producers; tensor execution is native-only. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../src/main/db/database.ts'
import { GenerationOrchestrator } from '../src/main/projects/generation-orchestrator.ts'
import { GenerationQueueRepository } from '../src/main/projects/generation-queue.ts'
import { prepareNormalGeneration } from '../src/main/projects/project-generation-preparation.ts'
import { provenanceFromVerifiedRasterCandidate } from '../src/main/projects/project-generation-provenance.ts'
import { localProjectRecoveryKey } from '../src/main/projects/project-identity.ts'
import {
  acceptedOutputPngFixture,
  transparentTargetPngFixture,
} from '../src/main/projects/test-fixtures/accepted-provenance.ts'
import { createResultPresetIntent } from '../src/renderer/components/result-preset-draft.ts'
import {
  applyPresetSections,
  includedPresetSections,
  presetApplicationDiagnostics,
} from '../src/shared/presets/preset-application.ts'
import { parsePresetPayload } from '../src/shared/presets/preset-schema.ts'
import { isQualifiedInferenceWorkerReady } from '../src/shared/projects/inference-worker-capabilities.ts'
import { createEmptyProjectDocumentV1 } from '../src/shared/projects/project-schema.ts'
import {
  assertInstalledPresetConfiguration,
  assertInstalledPresetDraft,
  assertInstalledPresetFrozen,
  assertInstalledPresetRetainedRows,
  assertInstalledPresetResultPayload,
  assertInstalledPresetSources,
  installedPresetCases,
  normalizeInstalledPresetExecutionInputs,
  validateInstalledPresetFixture,
} from './installed-preset-qualification.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/installed-presets-oracle')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const icc = '113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1'
const ready = {
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.14.0',
  capabilities: [
    'illustrious-txt2img',
    'target-composition',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-lora',
    'illustrious-external-vae',
    'illustrious-vae-precision',
    'illustrious-euler',
    'illustrious-noise-profile',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-embeddings',
    'illustrious-outpaint',
  ],
}

/** Literal descriptors independently transcribed from the trained-source qualification. */
function reference() {
  const appData = path.join(root, 'pool/data/imagegen-studio')
  const values = {
    illustriousEpsilon: [
      700140,
      6938040416,
      'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
      'checkpoint',
      833294,
      1022833,
      928571,
      'epsilon',
    ],
    illustrious: [
      700040,
      6938040794,
      'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
      'checkpoint',
      1147756,
      2679856,
      2566634,
      'v_prediction',
    ],
    illustriousLora: [
      700060,
      114437420,
      'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
      'lora',
      700060,
      700061,
      700062,
      null,
    ],
    externalVaeNative: [
      700080,
      167335542,
      'f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7',
      'vae',
      700070,
      700081,
      700082,
      null,
    ],
  }
  return {
    appData,
    ...Object.fromEntries(
      Object.entries(values).map(
        ([
          key,
          [managedId, byteSize, sha256, type, modelId, versionId, fileId, trainedObjective],
        ]) => [
          key,
          {
            byteSize,
            sha256,
            type,
            family: 'illustrious',
            name: key,
            versionName: `${key} exact`,
            trainedObjective,
            origin: { modelId, versionId, fileId },
            installed: {
              resourceId: randomUUID(),
              versionId: randomUUID(),
              managedPath: path.join(appData, 'models', `qualified-${managedId}.safetensors`),
            },
          },
        ],
      ),
    ),
  }
}
function resource(ref, key) {
  const source = ref[key]
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: source.origin.fileId,
    civitaiModelId: source.origin.modelId,
    civitaiVersionId: source.origin.versionId,
    displayName: source.name,
    fileSha256: source.sha256,
    kind: source.type,
    localModelId: source.installed.resourceId,
    localVersionId: source.installed.versionId,
    predictionType: source.trainedObjective,
    versionName: source.versionName,
  }
}
function catalog(ref) {
  return Object.keys(ref)
    .filter((key) => key !== 'appData')
    .map((key) => {
      const source = ref[key]
      return {
        id: source.installed.resourceId,
        modelId: source.origin.modelId,
        name: source.name,
        resourceType: source.type,
        author: null,
        description: null,
        defaultVersionId: source.installed.versionId,
        previewDataUrl: null,
        sourceUrl: null,
        trainedWords: [],
        versions: [
          {
            id: source.installed.versionId,
            civitaiVersionId: source.origin.versionId,
            civitaiFileId: source.origin.fileId,
            name: source.versionName,
            baseModelFamily: 'illustrious',
            fileName: 'exact.safetensors',
            fileSizeBytes: source.byteSize,
            fileStatus: 'ready',
            format: 'safetensors',
            installedAt: '2026-10-14T10:00:00.000Z',
            predictionType: source.trainedObjective,
            sha256: source.sha256,
            trainedWords: [],
            dependencyIssues: [],
            ...(source.type === 'checkpoint'
              ? {
                  noiseProfile: {
                    effective: {
                      schemaVersion: 1,
                      baseSchedule: 'sdxl-scaled-linear-v1',
                      rescaleBetasZeroSnr: source.trainedObjective === 'v_prediction',
                      timestepSpacing: 'leading',
                    },
                    rescaleBetasZeroSnrSource: 'override',
                    timestepSpacingSource: 'override',
                  },
                }
              : {}),
          },
        ],
      }
    })
}
function wrapper() {
  return {
    schemaVersion: 1,
    profile: 'installed-presets',
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, 'evidence'),
  }
}

test('finite installed preset envelope pins four scopes and eight outputs before all external reads', () => {
  assert.deepEqual(validateInstalledPresetFixture(wrapper()), {
    expectedScopes: 4,
    expectedAdmissions: 8,
    expectedCompletions: 8,
    expectedAccepted: 4,
  })
  for (const change of [
    (value) => {
      value.unbounded = true
    },
    (value) => {
      value.schemaVersion = 2
    },
    (value) => {
      value.profile = 'anything'
    },
    (value) => {
      value.referenceFixture.sha256 = 'x'
    },
    (value) => {
      value.workerBaseline.path = '/tmp/outside.json'
    },
    (value) => {
      value.artifacts = root
    },
    (value) => {
      value.artifacts = `${root}/evidence/../not-canonical`
    },
    (value) => {
      value.referenceFixture.extra = 'unknown'
    },
  ]) {
    const input = wrapper()
    change(input)
    assert.throws(() => validateInstalledPresetFixture(input))
  }
})

test('finite cases pin actual source lineage and expose advisory full versus selected-only partial differences', () => {
  const ref = reference()
  const scopes = installedPresetCases(ref)
  assert.deepEqual(
    scopes.map(({ id }) => id),
    ['epsilon-full', 'epsilon-partial', 'v_prediction-full', 'v_prediction-partial'],
  )
  assert.equal(Object.isFrozen(scopes[0].sourcePayload.model.noiseProfile), true)
  for (const scope of scopes) {
    parsePresetPayload(scope.sourcePayload)
    parsePresetPayload(scope.expectedPayload)
    assert.equal(scope.sourcePayload.cfgRescale, 0.25)
    assert.equal(scope.editedFields.cfgRescale, 0)
    assert.equal(scope.expectedPayload.seed.value, 0)
    assert.equal(scope.expectedPayload.guidance.cfgScale, 4)
    assert.equal(scope.expectedPayload.guidance.steps, 3)
    if (scope.scope === 'full') {
      assert.equal(scope.sourcePayload.model.fileSha256, scope.expectedPayload.model.fileSha256)
      assert.notEqual(scope.sourcePayload.model.predictionType, scope.objective)
      assert.equal(scope.sourcePayload.model.noiseProfile.timestepSpacing, 'trailing')
      assert.equal(scope.selectedSections.length, 11)
      assert.deepEqual(scope.baselinePayload.size, { width: 320, height: 320 })
      assert.deepEqual(scope.baselinePayload.seed, { policy: 'fixed', value: 37 })
      assert.deepEqual(scope.baselinePayload.sampling, { sampler: 'Euler a', scheduler: 'Normal' })
    } else {
      assert.deepEqual(scope.selectedSections, [
        'prompt',
        'negativePrompt',
        'guidance',
        'cfgRescale',
      ])
      assert.notEqual(scope.sourcePayload.model.fileSha256, scope.expectedPayload.model.fileSha256)
      assert.equal(scope.sourcePayload.seed.value, 37)
      assert.equal(scope.sourcePayload.size.width, 320)
      assert.deepEqual(scope.sourcePayload.loras, [])
      assert.equal(scope.sourcePayload.vae, null)
      assert.equal(scope.sourcePayload.vaePrecision, 'Auto')
    }
  }
  for (const change of [
    (value) => {
      value.illustrious.sha256 = 'c'.repeat(64)
    },
    (value) => {
      value.illustriousEpsilon.trainedObjective = 'v_prediction'
    },
    (value) => {
      value.externalVaeNative.byteSize++
    },
    (value) => {
      value.illustriousLora.installed.managedPath = path.join(value.appData, 'other.safetensors')
    },
  ]) {
    const wrong = structuredClone(ref)
    change(wrong)
    assert.throws(() => assertInstalledPresetSources(wrong))
  }
})

function producerModels(ref, scope, configuredReference) {
  const component = (key) => ({
    byteSize: ref[key].byteSize,
    managedPath: ref[key].installed.managedPath,
    reference: resource(ref, key),
  })
  let checkpointReads = 0
  return {
    assertNoUnboundGenerationEmbeddings: async ({
      modelFamily,
      positivePrompt,
      negativePrompt,
    }) => {
      assert.equal(modelFamily, 'illustrious')
      assert.deepEqual(positivePrompt, {
        embeddingRefs: [],
        text: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
      })
      assert.deepEqual(negativePrompt, { embeddingRefs: [], text: '(blurry:0.7), low quality' })
    },
    resolveVerifiedGenerationCheckpointForPlan: async (saved) => {
      // Configured copied policy differs only in full Apply; the exact current library wins.
      assert.deepEqual(
        saved,
        checkpointReads++ === 0 ? configuredReference : resource(ref, scope.modelKey),
      )
      return {
        managedPath: ref[scope.modelKey].installed.managedPath,
        reference: resource(ref, scope.modelKey),
        noiseProfile: {
          schemaVersion: 1,
          baseSchedule: 'sdxl-scaled-linear-v1',
          rescaleBetasZeroSnr: scope.objective === 'v_prediction',
          timestepSpacing: 'leading',
        },
      }
    },
    resolveVerifiedGenerationLoraForPlan: async (saved) => {
      assert.deepEqual(saved, resource(ref, 'illustriousLora'))
      return component('illustriousLora')
    },
    resolveVerifiedGenerationVaeForPlan: async (saved) => {
      assert.deepEqual(saved, resource(ref, 'externalVaeNative'))
      return component('externalVaeNative')
    },
    resolveVerifiedGenerationEmbeddingForPlan: async () =>
      assert.fail('No embedding sidecars in this finite plan.'),
    resolveVerifiedGenerationAnimaBundleForPlan: async () =>
      assert.fail('No Anima bundle in this finite plan.'),
    resolveVerifiedAnimaGenerationLoraForPlan: async () =>
      assert.fail('No Anima LoRA in this finite plan.'),
  }
}

async function exerciseProducers(ref, scope, manualControl) {
  assert.equal(
    isQualifiedInferenceWorkerReady(ready),
    true,
    'The producer fixture declares the full qualified 0.14 Illustrious capability contract.',
  )
  let document = createEmptyProjectDocumentV1({
    title: 'Real installed preset producers',
    primaryBbox: { x: 0, y: 0, width: 256, height: 256 },
  })
  if (manualControl)
    Object.assign(
      document,
      applyPresetSections(
        document,
        scope.expectedPayload,
        includedPresetSections(scope.expectedPayload),
      ),
    )
  else {
    Object.assign(
      document,
      applyPresetSections(
        document,
        scope.baselinePayload,
        includedPresetSections(scope.baselinePayload),
      ),
    )
    if (scope.scope === 'full') {
      assert.deepEqual(document.primaryBbox, { x: 0, y: 0, width: 320, height: 320 })
      assert.deepEqual(document.generationDraft.seed, { policy: 'fixed', value: 37 })
      assert.equal(document.generationDraft.sampling.sampler, 'Euler a')
    }
    const copied = structuredClone(scope.sourcePayload)
    copied.cfgRescale = 0
    const diagnostics = presetApplicationDiagnostics({
      catalog: catalog(ref),
      current: document,
      payload: copied,
      selectedSections: scope.selectedSections,
    })
    assert.equal(
      diagnostics.some(({ blocking }) => blocking),
      false,
    )
    assert.equal(
      diagnostics.filter(({ code }) => code === 'POLICY_ADVISORY_MISMATCH').length,
      scope.scope === 'full' ? 2 : 0,
    )
    Object.assign(document, applyPresetSections(document, copied, scope.selectedSections))
    assert.equal(
      scope.sourcePayload.cfgRescale,
      0.25,
      'Temporary editor changes cannot mutate source.',
    )
  }
  assertInstalledPresetDraft(document, scope, { manualControl })
  assert.equal(document.generationDraft.seed.value, 0)
  assert.equal(document.generationDraft.sampling.steps, 3)
  assert.equal(document.generationDraft.sampling.sampler, 'Euler')
  const configured = structuredClone(document.generationDraft.model)
  const models = producerModels(ref, scope, configured)
  const bytes = await transparentTargetPngFixture(256, 256)
  const prepared = await prepareNormalGeneration({
    target: {
      bbox: document.primaryBbox,
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      generationDraft: document.generationDraft,
      lastActualSeedSnapshot: null,
      mode: 'txt2img',
      composite: {
        bytes,
        byteSize: bytes.length,
        colorSpace: 'srgb',
        height: 256,
        width: 256,
        iccSha256: icc,
        sha256: digest(bytes),
      },
    },
    modelService: models,
    randomUint32: () => assert.fail('Fixed seed zero cannot randomize.'),
  })
  assert.equal(prepared.context.model.reference.predictionType, scope.objective)
  assert.equal(
    prepared.context.sampling.noiseProfile.rescaleBetasZeroSnr,
    scope.objective === 'v_prediction',
  )
  assert.equal(
    document.generationDraft.model.predictionType,
    configured.predictionType,
    'Preparing must not rewrite Project advisory snapshot.',
  )
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-installed-preset-producers-'))
  let database
  try {
    database = openAppDatabase(temporary, path.resolve('src/main/db/migrations'))
    const scratch = path.join(temporary, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const projectPath = path.join(temporary, 'owner.igs')
    await writeFile(projectPath, 'indexed queue ownership fixture', { flag: 'wx', mode: 0o600 })
    const tabId = localProjectRecoveryKey(projectPath)
    const queue = new GenerationQueueRepository(database.db, temporary)
    await queue.recoverAfterRestart()
    const orchestrator = new GenerationOrchestrator(
      {
        getOpenDocumentId: (id) => (id === tabId ? document.documentId : null),
        getOpenTabs: () => [{ id: tabId }],
        prepareNormalGenerationContext: async () =>
          assert.fail('Do not recompose a prepared batch.'),
      },
      {
        getProject: async () => ({
          canonicalPath: projectPath,
          documentId: document.documentId,
          fileHealth: 'ready',
          localProjectKey: tabId,
        }),
      },
      models,
      queue,
      { assertReadyForPublication: () => undefined, preflightBatchCapacity: async () => undefined },
      {
        cancelAndWait: async () => assert.fail('No Cancel in producer tests.'),
        runOne: async () => assert.fail('No tensor inference in producer tests.'),
      },
      scratch,
    )
    const admitted = await orchestrator.enqueuePreparedBatch(
      tabId,
      prepared,
      { iterations: 1, maxPrompts: 100, seedBehavior: 'per-iteration' },
      { ready },
    )
    assert.equal(admitted.items.length, 1)
    const row = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', admitted.items[0].id)
      .executeTakeFirstOrThrow()
    const frozen = JSON.parse(row.frozen_payload_json)
    assertInstalledPresetFrozen(frozen, scope, ref)
    // Oracle sensitivity uses a controlled SQL fault on a real persisted row, not a production
    // semantic mutation. Restore its exact bytes before any provenance consumer runs.
    const originalRows = [structuredClone(row)]
    const currentRows = () => database.db.selectFrom('generation_queue_item').selectAll().execute()
    assertInstalledPresetRetainedRows(originalRows, await currentRows(), 'id')
    assertInstalledPresetRetainedRows(originalRows, await currentRows(), 'local_project_key')
    assert.throws(() => assertInstalledPresetRetainedRows(originalRows, [], 'id'))
    assert.throws(() =>
      assertInstalledPresetRetainedRows(originalRows, originalRows, 'unknown_key'),
    )
    assert.throws(() => assertInstalledPresetRetainedRows(originalRows, [row, row], 'id'))
    try {
      await database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: JSON.stringify({ ...frozen, originRequestId: randomUUID() }) })
        .where('id', '=', row.id)
        .execute()
      const changedRows = await currentRows()
      assert.throws(() => assertInstalledPresetRetainedRows(originalRows, changedRows, 'id'))
      assert.throws(() =>
        assertInstalledPresetRetainedRows(originalRows, changedRows, 'local_project_key'),
      )
    } finally {
      await database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: row.frozen_payload_json })
        .where('id', '=', row.id)
        .execute()
    }
    assertInstalledPresetRetainedRows(originalRows, await currentRows(), 'id')
    // Later edits cannot alter the persisted operational source.
    document.generationDraft.positivePrompt.text = 'later current Project prompt'
    document.generationDraft.seed.value = 37
    prepared.context.sampling.cfgScale = 8
    assert.equal(
      (
        await database.db
          .selectFrom('generation_queue_item')
          .select('frozen_payload_json')
          .where('id', '=', row.id)
          .executeTakeFirstOrThrow()
      ).frozen_payload_json,
      row.frozen_payload_json,
    )
    const output = await acceptedOutputPngFixture(256, 256)
    const provenance = provenanceFromVerifiedRasterCandidate({
      acceptedAt: '2026-10-14T10:01:00.000Z',
      imagePngBytes: output,
      candidate: {
        actualSeed: 0,
        assetPath: path.join(temporary, 'candidate.png'),
        bbox: { x: 0, y: 0, width: 256, height: 256 },
        candidateId: row.id,
        queueItemId: row.id,
        completedAt: '2026-10-14T10:00:00.000Z',
        completionOrder: 1,
        documentId: frozen.context.documentId,
        documentRevision: frozen.context.documentRevision,
        frozenPayloadJson: row.frozen_payload_json,
        frozenPayloadSha256: digest(row.frozen_payload_json),
        image: {
          byteSize: output.length,
          width: 256,
          height: 256,
          sha256: digest(output),
          iccSha256: icc,
        },
        localProjectKey: tabId,
        projectPath,
        stagingSessionId: row.staging_session_id,
      },
    })
    assertInstalledPresetConfiguration(provenance.generationConfiguration, scope, ref)
    const intent = createResultPresetIntent({
      data: {
        currentMode: 'img2img',
        documentId: document.documentId,
        generationConfiguration: provenance.generationConfiguration,
        layerId: randomUUID(),
        modeUnavailableReason: null,
      },
      layerName: 'Accepted result',
      projectName: 'Actual owner',
    })
    assertInstalledPresetResultPayload(intent.definition.payload, scope)
    assert.equal(Object.hasOwn(intent.definition.payload, 'seed'), false)
    assert.equal(intent.definition.payload.model.predictionType, scope.objective)
    assert.equal(intent.definition.payload.prompt.text.includes('later'), false)
    return frozen
  } finally {
    try {
      await database?.close()
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
}

for (const [objective, scopeName] of [
  ['epsilon', 'full'],
  ['epsilon', 'partial'],
  ['v_prediction', 'full'],
  ['v_prediction', 'partial'],
]) {
  test(`real producers ${objective}-${scopeName}: selected Apply uses current library policy in wire/provenance/result preset`, async () => {
    const ref = reference()
    const scope = installedPresetCases(ref).find(
      (value) => value.objective === objective && value.scope === scopeName,
    )
    const applied = await exerciseProducers(ref, scope, false)
    const manual = await exerciseProducers(ref, scope, true)
    assert.deepEqual(
      normalizeInstalledPresetExecutionInputs(applied),
      normalizeInstalledPresetExecutionInputs(manual),
    )
    // Exact execution controls must reject drift, rather than deleting arbitrary semantic axes.
    for (const change of [
      (value) => {
        value.context.model.reference.predictionType =
          objective === 'epsilon' ? 'v_prediction' : 'epsilon'
      },
      (value) => {
        value.workerJob.sampling.noiseProfile.timestepSpacing = 'trailing'
      },
      (value) => {
        value.context.sampling.cfgScale = 5
      },
      (value) => {
        value.workerJob.loras[0].weight = 0.5
      },
      (value) => {
        value.context.bbox.width = 320
      },
      (value) => {
        value.context.sampling.seed = 37
      },
    ]) {
      const changed = structuredClone(applied)
      change(changed)
      assert.throws(() => assertInstalledPresetFrozen(changed, scope, ref))
      assert.notDeepEqual(
        normalizeInstalledPresetExecutionInputs(changed),
        normalizeInstalledPresetExecutionInputs(applied),
      )
    }
    const badOwner = structuredClone(applied)
    badOwner.context.documentId = 'not-an-owner'
    assert.throws(() => normalizeInstalledPresetExecutionInputs(badOwner))
  })
}
