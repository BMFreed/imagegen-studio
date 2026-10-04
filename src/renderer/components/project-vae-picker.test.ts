import type { ModelCatalogItem, ProjectTab } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { portableModelRelinkCandidate, savedModelAvailability } from './project-model-picker.js'
import {
  externalVaeGenerationReason,
  projectVaeDiagnostic,
  projectVaeOptions,
  type SavedVae,
} from './project-vae-picker.js'

function catalog(): ModelCatalogItem[] {
  return [
    {
      author: null,
      defaultVersionId: 'version-a',
      description: null,
      id: 'model-a',
      modelId: 2,
      name: 'External VAE',
      previewDataUrl: null,
      resourceType: 'vae',
      sourceUrl: null,
      trainedWords: [],
      versions: [
        {
          baseModelFamily: 'illustrious',
          civitaiFileId: 4,
          civitaiVersionId: 3,
          dependencyIssues: [],
          fileName: 'vae.safetensors',
          fileSizeBytes: 100,
          fileStatus: 'ready',
          format: 'SafeTensor',
          id: 'version-a',
          installedAt: '2026-10-04T00:00:00.000Z',
          name: 'v1',
          predictionType: null,
          sha256: 'a'.repeat(64),
          trainedWords: [],
        },
      ],
    },
  ]
}
function saved(): SavedVae {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 4,
    civitaiModelId: 2,
    civitaiVersionId: 3,
    displayName: 'External VAE',
    fileSha256: 'a'.repeat(64),
    kind: 'vae',
    localModelId: 'model-a',
    localVersionId: 'version-a',
    predictionType: null,
    versionName: 'v1',
  }
}

test('VAE options include exact eligible versions without default-driven selection or Anima companions', () => {
  const list = catalog()
  const resource = list[0]!
  const first = resource.versions[0]!
  resource.versions.push({ ...first, fileStatus: 'missing', id: 'version-b', name: 'v2' })
  list.push(
    { ...resource, id: 'checkpoint', resourceType: 'checkpoint' },
    { ...resource, id: 'lora', resourceType: 'lora' },
    {
      ...resource,
      id: 'pinned-anima',
      modelId: null,
      versions: [{ ...first, baseModelFamily: 'anima' }],
    },
    {
      ...resource,
      id: 'alternative-anima',
      modelId: 9,
      versions: [{ ...first, baseModelFamily: 'anima' }],
    },
    { ...resource, id: 'unqualified', versions: [{ ...first, predictionType: 'epsilon' }] },
  )
  const before = structuredClone(list)
  const options = projectVaeOptions(list)
  assert.equal(options.length, 2)
  assert.equal(options[0]!.value, 'version-a')
  assert.equal(options[0]!.disabled, false)
  assert.equal(options[1]!.disabled, true)
  assert.equal(options[1]!.status, 'Missing file')
  resource.defaultVersionId = 'version-b'
  assert.equal(projectVaeOptions(list)[0]!.value, 'version-a')
  assert.equal(savedModelAvailability(saved(), list), 'ready')
  resource.defaultVersionId = before[0]!.defaultVersionId
  assert.deepEqual(list, before, 'picker projection must never change registry metadata')
})

test('saved VAE diagnostics distinguish checked exact, missing, corrupt, unavailable catalog and family', () => {
  const list = catalog()
  assert.equal(projectVaeDiagnostic(saved(), list, true, 'illustrious'), null)
  assert.match(
    projectVaeDiagnostic(saved(), [], true, 'illustrious')!,
    /Exact VAE version unavailable/,
  )
  list[0]!.versions[0]!.fileStatus = 'corrupt'
  assert.match(projectVaeDiagnostic(saved(), list, true, 'illustrious')!, /needs repair/)
  assert.match(projectVaeDiagnostic(saved(), list, false, 'illustrious')!, /could not be checked/)
  assert.match(projectVaeDiagnostic(saved(), list, true, 'anima')!, /requires an Illustrious model/)
  assert.match(
    projectVaeDiagnostic({ ...saved(), kind: 'lora' }, list, true, 'illustrious')!,
    /not supported/,
  )
  assert.match(
    projectVaeDiagnostic({ ...saved(), predictionType: 'epsilon' }, list, true, 'illustrious')!,
    /not supported/,
  )
  assert.match(projectVaeDiagnostic(null, list, true, 'anima')!, /required installed VAE/)
  assert.match(projectVaeDiagnostic(null, list, true, null)!, /Choose an Illustrious model/)
  assert.equal(projectVaeDiagnostic(null, [], true, 'illustrious'), null)
})

test('portable VAE relink suggestion requires one exact installed source and hash', () => {
  const list = catalog()
  const foreign = { ...saved(), localModelId: 'foreign-model', localVersionId: 'foreign-version' }
  assert.ok(portableModelRelinkCandidate(foreign, list))
  assert.match(projectVaeDiagnostic(foreign, list, true, 'illustrious')!, /Link it/)
  assert.equal(
    portableModelRelinkCandidate(saved(), list),
    null,
    'already bound exact version has no relink',
  )
  for (const change of [
    { civitaiModelId: 8 },
    { civitaiVersionId: 8 },
    { civitaiFileId: 8 },
    { fileSha256: 'b'.repeat(64) },
    { baseModelFamily: 'anima' as const },
    { predictionType: 'epsilon' as const },
  ]) {
    assert.equal(portableModelRelinkCandidate({ ...foreign, ...change }, list), null)
  }
  assert.equal(
    portableModelRelinkCandidate(foreign, [...list, { ...list[0]!, id: 'duplicate' }]),
    null,
  )
  list[0]!.versions[0]!.fileStatus = 'missing'
  assert.equal(portableModelRelinkCandidate(foreign, list), null)
})

test('external VAE admission follows qualified capability without blocking embedded neighbors', () => {
  const draftVae: ProjectTab['generationDraft']['vae'] = saved()
  assert.match(externalVaeGenerationReason(draftVae, false)!, /does not support.*Update.*Embedded/)
  assert.match(externalVaeGenerationReason(draftVae, null)!, /Checking/)
  assert.equal(externalVaeGenerationReason(draftVae, true), null)
  for (const capability of [true, false, null]) {
    assert.equal(externalVaeGenerationReason(null, capability), null)
  }
})
