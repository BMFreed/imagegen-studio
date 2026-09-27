import type { ModelCatalogItem, ProjectTab } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { projectPromptLoraSources } from './project-prompt-context.js'

function fixture() {
  const lora: ProjectTab['generationDraft']['loras'][number] = {
    enabled: true,
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: 10,
      civitaiModelId: 20,
      civitaiVersionId: 30,
      displayName: 'Saved LoRA',
      fileSha256: 'a'.repeat(64),
      kind: 'lora',
      localModelId: 'lora',
      localVersionId: 'exact',
      predictionType: null,
      versionName: 'Saved version',
    },
    weight: 0.7,
  }
  const catalog: ModelCatalogItem[] = [
    {
      author: null,
      defaultVersionId: 'other',
      description: null,
      id: 'lora',
      modelId: 20,
      name: 'Catalog LoRA',
      previewDataUrl: null,
      resourceType: 'lora',
      sourceUrl: null,
      trainedWords: ['wrong default'],
      versions: [
        {
          baseModelFamily: 'illustrious',
          civitaiFileId: 10,
          civitaiVersionId: 30,
          dependencyIssues: [],
          fileName: 'exact.safetensors',
          fileSizeBytes: 10,
          fileStatus: 'ready',
          format: 'SafeTensor',
          id: 'exact',
          installedAt: '2026-09-27T00:00:00.000Z',
          name: 'Exact version',
          predictionType: null,
          sha256: 'a'.repeat(64),
          trainedWords: ['exact trigger'],
        },
      ],
    },
  ]
  catalog[0]!.versions.push({
    ...catalog[0]!.versions[0]!,
    civitaiVersionId: 31,
    id: 'other',
    trainedWords: ['wrong version'],
  })
  return { catalog, lora }
}

// Boundary: real Project adapter; catalog data are fixtures, not a replacement adapter.
// Mutations: default-version lookup, ignored enabled/status/hash, implicit portable relink.
test('Project context uses the saved exact LoRA version, never the current catalog default', () => {
  const { catalog, lora } = fixture()
  const sources = projectPromptLoraSources([lora], catalog, true)
  assert.deepEqual(
    sources.map((source) => source.phrases),
    [['exact trigger']],
  )
  assert.equal(sources[0]?.name, 'Saved LoRA')
  catalog[0]!.defaultVersionId = 'exact'
  assert.deepEqual(projectPromptLoraSources([lora], catalog, true), sources)
  lora.weight = -0.1
  assert.deepEqual(
    projectPromptLoraSources([lora], catalog, true),
    sources,
    'weights do not own prompt text/context',
  )
})

test('disabled, unavailable, corrupt, changed or unlinked LoRAs do not supply prompt context', () => {
  const { catalog, lora } = fixture()
  assert.deepEqual(projectPromptLoraSources([lora], catalog, false), [])
  assert.deepEqual(projectPromptLoraSources([{ ...lora, enabled: false }], catalog, true), [])
  assert.deepEqual(projectPromptLoraSources([lora], [], true), [])
  assert.deepEqual(projectPromptLoraSources([], catalog, true), [])
  for (const patch of [
    { fileStatus: 'missing' as const },
    { fileStatus: 'corrupt' as const },
    { sha256: 'b'.repeat(64) },
    { civitaiFileId: 99 },
    { id: 'installed-elsewhere' },
  ]) {
    const altered = structuredClone(catalog)
    Object.assign(altered[0]!.versions[0]!, patch)
    assert.deepEqual(projectPromptLoraSources([lora], altered, true), [], JSON.stringify(patch))
  }
  const unknown = structuredClone(catalog)
  unknown[0]!.versions[0]!.baseModelFamily = null
  assert.equal(
    projectPromptLoraSources(
      [{ ...lora, resource: { ...lora.resource, baseModelFamily: null } }],
      unknown,
      true,
    ).length,
    1,
  )
})
