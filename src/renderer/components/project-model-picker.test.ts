import type { ModelCatalogItem, ModelVersionView, ProjectTab } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkpointCatalog,
  planModelResourceSelection,
  portableModelRelinkCandidate,
  readyDefaultVersion,
  savedModelAvailability,
  selectableVersion,
} from './project-model-picker.js'

const shaA = 'a'.repeat(64)
const shaB = 'b'.repeat(64)

function version(
  id: string,
  sha256: string,
  fileStatus: ModelVersionView['fileStatus'],
): ModelVersionView {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 4,
    civitaiVersionId: 3,
    dependencyIssues: [],
    fileName: `${id}.safetensors`,
    fileSizeBytes: 100,
    fileStatus,
    format: 'SafeTensor',
    id,
    installedAt: '2026-09-27T00:00:00.000Z',
    name: id,
    predictionType: 'epsilon',
    sha256,
  }
}

function resource(defaultVersionId: string, versions: ModelVersionView[]): ModelCatalogItem {
  return {
    author: null,
    defaultVersionId,
    description: null,
    id: 'model-a',
    modelId: 2,
    name: 'Portrait model',
    previewDataUrl: null,
    resourceType: 'checkpoint',
    sourceUrl: null,
    trainedWords: [],
    versions,
  }
}

function savedModel(): NonNullable<ProjectTab['generationDraft']['model']> {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: 4,
    civitaiModelId: 2,
    civitaiVersionId: 3,
    displayName: 'Portrait model',
    fileSha256: shaA,
    kind: 'checkpoint',
    localModelId: 'model-a',
    localVersionId: 'version-a',
    predictionType: 'epsilon',
    versionName: 'version-a',
  }
}

test('only a ready exact catalog default can initialize a new model selection', () => {
  const first = version('version-a', shaA, 'ready')
  const second = version('version-b', shaB, 'ready')
  const checkpoint = resource(second.id, [first, second])
  assert.equal(readyDefaultVersion(checkpoint)?.id, second.id)
  assert.equal(readyDefaultVersion({ ...checkpoint, defaultVersionId: first.id })?.id, first.id)
  assert.equal(
    readyDefaultVersion(resource(first.id, [{ ...first, fileStatus: 'missing' }, second])),
    null,
    'a missing default must not silently select another installed version',
  )
  assert.equal(readyDefaultVersion({ ...checkpoint, resourceType: 'lora' }), null)
  assert.deepEqual(checkpointCatalog([checkpoint, { ...checkpoint, resourceType: 'lora' }]), [
    checkpoint,
  ])
  assert.equal(selectableVersion({ ...first, baseModelFamily: null }), false)
})

test('a checkpoint with an unavailable default still lets the user choose a ready alternate', () => {
  const unavailableDefault = version('version-a', shaA, 'missing')
  const readyAlternate = version('version-b', shaB, 'ready')
  const checkpoint = resource(unavailableDefault.id, [unavailableDefault, readyAlternate])
  assert.equal(readyDefaultVersion(checkpoint), null)
  assert.deepEqual(planModelResourceSelection(checkpoint), { kind: 'choose-version' })
  assert.deepEqual(
    planModelResourceSelection(resource(readyAlternate.id, [unavailableDefault, readyAlternate])),
    {
      kind: 'select-default',
      versionId: readyAlternate.id,
    },
  )
  assert.deepEqual(
    planModelResourceSelection(resource(unavailableDefault.id, [unavailableDefault])),
    {
      kind: 'unavailable',
    },
  )
  assert.deepEqual(planModelResourceSelection({ ...checkpoint, resourceType: 'lora' }), {
    kind: 'unavailable',
  })
})

test('a saved exact file remains selected across default changes and reports loss of that file', () => {
  const first = version('version-a', shaA, 'ready')
  const second = version('version-b', shaB, 'ready')
  const selected = savedModel()
  assert.equal(savedModelAvailability(selected, [resource(second.id, [first, second])]), 'ready')
  assert.equal(
    savedModelAvailability(selected, [
      resource(second.id, [{ ...first, fileStatus: 'missing' }, second]),
    ]),
    'missing',
  )
  assert.equal(
    savedModelAvailability(selected, [
      resource(second.id, [{ ...first, fileStatus: 'corrupt' }, second]),
    ]),
    'corrupt',
  )
  assert.equal(
    savedModelAvailability(selected, [resource(second.id, [{ ...first, sha256: shaB }, second])]),
    'missing',
    'matching a local version id is not enough if the exact file identity changed',
  )
  assert.equal(savedModelAvailability(selected, [resource(second.id, [second])]), 'missing')
  assert.equal(savedModelAvailability(selected, []), 'missing')
  assert.equal(savedModelAvailability(null, []), 'none')
  assert.equal(
    savedModelAvailability(selected, [{ ...resource(second.id, [first]), modelId: 99 }]),
    'missing',
  )
  assert.equal(
    savedModelAvailability(selected, [resource(second.id, [{ ...first, civitaiVersionId: 99 }])]),
    'missing',
  )
  assert.equal(
    savedModelAvailability(selected, [resource(second.id, [{ ...first, civitaiFileId: 99 }])]),
    'missing',
  )
  assert.equal(
    savedModelAvailability(selected, [
      resource(second.id, [{ ...first, baseModelFamily: 'anima' }]),
    ]),
    'missing',
  )
})

test('portable relink is suggested only for one ready exact identity at a different local ID', () => {
  const saved = savedModel()
  const match = {
    ...resource('other-default', [version('version-local', shaA, 'ready')]),
    id: 'model-local',
  }
  const candidate = portableModelRelinkCandidate(saved, [match])
  assert.equal(candidate?.resource.id, 'model-local')
  assert.equal(candidate?.version.id, 'version-local')
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...match, versions: [{ ...match.versions[0]!, predictionType: 'v_prediction' }] },
    ])?.version.id,
    'version-local',
    'prediction metadata is not part of portable byte identity',
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...match, defaultVersionId: 'another-default', name: 'Renamed locally' },
    ])?.version.id,
    'version-local',
    'display names and catalog defaults are not portable identity',
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      resource('version-a', [version('version-a', shaA, 'ready')]),
    ]),
    null,
  )
  assert.equal(portableModelRelinkCandidate(saved, [match, { ...match, id: 'second-local' }]), null)
  assert.equal(portableModelRelinkCandidate(null, [match]), null)
})

test('portable relink refuses partial, mismatched, or unavailable metadata', () => {
  const saved = savedModel()
  const exact = version('local-version', shaA, 'ready')
  const installed = { ...resource(exact.id, [exact]), id: 'local-resource' }
  assert.equal(portableModelRelinkCandidate({ ...saved, civitaiModelId: null }, [installed]), null)
  assert.equal(
    portableModelRelinkCandidate({ ...saved, civitaiVersionId: null }, [installed]),
    null,
  )
  assert.equal(portableModelRelinkCandidate({ ...saved, civitaiFileId: null }, [installed]), null)
  assert.equal(portableModelRelinkCandidate({ ...saved, baseModelFamily: null }, [installed]), null)
  assert.equal(portableModelRelinkCandidate(saved, [{ ...installed, modelId: 22 }]), null)
  assert.equal(portableModelRelinkCandidate(saved, [{ ...installed, resourceType: 'lora' }]), null)
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...installed, versions: [{ ...exact, civitaiVersionId: 33 }] },
    ]),
    null,
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...installed, versions: [{ ...exact, civitaiFileId: 44 }] },
    ]),
    null,
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [{ ...installed, versions: [{ ...exact, sha256: shaB }] }]),
    null,
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...installed, versions: [{ ...exact, baseModelFamily: 'anima' }] },
    ]),
    null,
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...installed, versions: [{ ...exact, fileStatus: 'missing' }] },
    ]),
    null,
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      { ...installed, versions: [{ ...exact, fileStatus: 'corrupt' }] },
    ]),
    null,
  )

  const oldVersion = version('version-a', shaA, 'missing')
  const oldInstallation = resource(oldVersion.id, [oldVersion])
  assert.equal(portableModelRelinkCandidate(saved, [oldInstallation]), null)
  assert.equal(portableModelRelinkCandidate(saved, [oldInstallation, installed]), null)
  assert.equal(
    portableModelRelinkCandidate(saved, [
      resource(oldVersion.id, [{ ...oldVersion, fileStatus: 'corrupt' }]),
      installed,
    ]),
    null,
    'main treats two exact registry identities as ambiguous even when one file is corrupt',
  )
  assert.equal(
    portableModelRelinkCandidate(saved, [
      installed,
      {
        ...installed,
        id: 'corrupt-duplicate',
        versions: [{ ...exact, fileStatus: 'corrupt', id: 'corrupt-version' }],
      },
    ]),
    null,
    'a ready plus corrupt duplicate must not show an action that main will reject',
  )
})
