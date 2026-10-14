import type { ProjectSmartPatchLayerView, ProjectTab } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { draftOwnerKey, ProjectDraftSync } from '../../renderer/components/project-draft-sync.js'
import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

async function withService(
  run: (service: ProjectService, repository: ProjectIndexRepository) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-patch-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow: new ProjectShadowStore(path.join(root, 'autosave')),
  })
  try {
    await run(service, repository)
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function patches(tab: ProjectTab): ProjectSmartPatchLayerView[] {
  return tab.layers.filter(
    (layer): layer is ProjectSmartPatchLayerView => layer.kind === 'smart-patch',
  )
}

async function createPair(service: ProjectService) {
  let normal = await service.create({ height: 256, title: 'Owned patches', width: 256 })
  normal = await service.updateGenerationDraft(normal.id, {
    kind: 'positive-prompt',
    text: 'normal source',
  })
  await service.save(normal.id)
  const original = await service.addSmartPatchLayer(normal.id)
  const pair = await service.addSmartPatchLayer(normal.id)
  assert.equal(pair.layers.length, 2)
  const [first, second] = patches(pair)
  assert.ok(first && second)
  assert.equal(
    second.id,
    patches(original)[0].id,
    'The existing Patch remains beneath the new top layer.',
  )
  return { first, normal, pair, second }
}

test('real + Patch copies acknowledged normal inputs into independent empty owners with one undo per creation', async () => {
  await withService(async (service) => {
    const { first, normal, pair, second } = await createPair(service)
    assert.notEqual(first.id, second.id)
    assert.notEqual(first.mask.id, second.mask.id)
    for (const patch of [first, second]) {
      assert.deepEqual(patch.generationDraft, normal.generationDraft)
      assert.deepEqual(patch.boundingBox, normal.primaryBbox)
      assert.deepEqual(patch.internalResolution, { height: 256, width: 256 })
      assert.deepEqual(patch.mask, { asset: null, id: patch.mask.id, revision: 0 })
      assert.deepEqual(patch.rasterSubLayers, [])
      assert.equal(patch.activeRasterSubLayerId, null)
      assert.equal(patch.status, 'empty')
    }
    assert.deepEqual(pair.acceptedResults, [])
    const undone = await service.undo(normal.id)
    assert.deepEqual(patches(undone), [second])
    assert.deepEqual(patches(await service.redo(normal.id)), [first, second])
  })
})

for (const ownerIndex of [0, 1]) {
  test(`targeted Patch ${ownerIndex + 1} authoring survives real Save/reopen without touching its neighbor or normal inputs`, async () => {
    await withService(async (service, repository) => {
      const { first, normal, pair, second } = await createPair(service)
      const owner = [first, second][ownerIndex]
      const neighbor = [first, second][1 - ownerIndex]
      const row = (await repository.listProjects())[0]
      const oldBytes = await readFile(row.canonicalPath)
      const rect = { height: 192, width: 128, x: -23, y: 47 }
      let updated = await service.updateGenerationDraft(
        pair.id,
        { kind: 'positive-prompt', text: `owned literal ${ownerIndex}` },
        undefined,
        owner.id,
      )
      updated = await service.updateSmartPatchLayer(pair.id, owner.id, {
        kind: 'bounding-box',
        rect,
      })
      updated = await service.updateSmartPatchLayer(pair.id, owner.id, {
        kind: 'internal-resolution',
        size: { height: 256, width: 384 },
      })
      const expected = patches(updated)[ownerIndex]
      assert.equal(expected.generationDraft.positivePrompt.text, `owned literal ${ownerIndex}`)
      assert.deepEqual(expected.boundingBox, rect)
      assert.deepEqual(expected.internalResolution, { height: 256, width: 384 })
      assert.deepEqual(patches(updated)[1 - ownerIndex], neighbor)
      assert.deepEqual(updated.generationDraft, normal.generationDraft)
      assert.deepEqual(updated.primaryBbox, normal.primaryBbox)
      assert.ok(
        (await readFile(row.canonicalPath)).equals(oldBytes),
        'Dirty Patch edits must not implicitly replace the saved package.',
      )
      const undone = await service.undo(pair.id)
      assert.deepEqual(patches(undone)[ownerIndex].internalResolution, owner.internalResolution)
      assert.deepEqual(patches(undone)[ownerIndex].boundingBox, rect)
      assert.deepEqual(patches(await service.redo(pair.id))[ownerIndex], expected)
      await service.save(pair.id)
      const saved = await readIgsPackage(row.canonicalPath)
      assert.deepEqual(
        saved.project.layers,
        patches(updated).map(({ maskImageUrl: _url, status: _status, ...layer }) => layer),
      )
      assert.equal(saved.manifest.preview.status, 'empty')
      await service.close(pair.id)
      const reopened = await service.open(pair.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Expected saved Project')
      }
      assert.deepEqual(reopened.tab.layers, updated.layers)
      assert.equal(reopened.tab.dirty, false)
    })
  })
}

test('ordinary Project edit remains an independent neighboring owner after empty patches exist', async () => {
  await withService(async (service) => {
    const { pair } = await createPair(service)
    const updated = await service.updateGenerationDraft(pair.id, {
      kind: 'positive-prompt',
      text: 'normal changed',
    })
    assert.equal(updated.generationDraft.positivePrompt.text, 'normal changed')
    assert.deepEqual(updated.layers, pair.layers)
    const undo = await service.undo(pair.id)
    assert.deepEqual(undo.generationDraft, pair.generationDraft)
    assert.deepEqual(undo.layers, pair.layers)
  })
})

test('missing/locked Patch and malformed geometry refuse without document or history mutation', async () => {
  await withService(async (service) => {
    const { first, pair } = await createPair(service)
    await assert.rejects(
      service.updateGenerationDraft(
        pair.id,
        { kind: 'positive-prompt', text: 'lost owner' },
        undefined,
        randomUUID(),
      ),
      { code: 'PROJECT_LAYER_NOT_FOUND' },
    )
    await assert.rejects(
      service.updateSmartPatchLayer(pair.id, first.id, {
        kind: 'bounding-box',
        rect: { height: 1, width: 0, x: 0, y: 0 },
      }),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], pair)
    const locked = await service.updateSmartPatchLayer(pair.id, first.id, {
      kind: 'lock',
      locked: true,
    })
    await assert.rejects(
      service.updateGenerationDraft(
        pair.id,
        { kind: 'positive-prompt', text: 'locked owner' },
        undefined,
        first.id,
      ),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    await assert.rejects(
      service.updateSmartPatchLayer(pair.id, first.id, {
        kind: 'internal-resolution',
        size: { height: 128, width: 128 },
      }),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], locked)
    const hidden = await service.updateSmartPatchLayer(pair.id, first.id, {
      kind: 'visibility',
      visible: false,
    })
    assert.equal(patches(hidden)[0].visible, false)
    assert.equal(patches(hidden)[0].locked, true)
    const shown = await service.updateSmartPatchLayer(pair.id, first.id, {
      kind: 'visibility',
      visible: true,
    })
    assert.deepEqual(shown.layers, locked.layers)
    const unlocked = await service.updateSmartPatchLayer(pair.id, first.id, {
      kind: 'lock',
      locked: false,
    })
    assert.deepEqual(unlocked.layers, pair.layers)
  })
})

test('resource selection and LoRA scalar authoring are addressed to a Patch rather than the normal Project', async () => {
  await withService(async (service) => {
    const { first, pair, second } = await createPair(service)
    const checkpoint = {
      baseModelFamily: 'illustrious' as const,
      civitaiFileId: 3,
      civitaiModelId: 1,
      civitaiVersionId: 2,
      displayName: 'Copied resource',
      fileSha256: 'e'.repeat(64),
      kind: 'checkpoint' as const,
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: 'epsilon' as const,
      versionName: 'exact version',
    }
    const lora = {
      ...checkpoint,
      kind: 'lora' as const,
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
    }
    let updated = await service.setGenerationModel(pair.id, checkpoint, second.id)
    updated = await service.addGenerationLora(pair.id, lora, second.id)
    const identity = { resourceId: lora.localModelId, versionId: lora.localVersionId }
    updated = await service.updateGenerationDraft(
      pair.id,
      { ...identity, kind: 'lora-weight', value: -0.5 },
      undefined,
      second.id,
    )
    assert.deepEqual(patches(updated)[0], first)
    assert.deepEqual(updated.generationDraft, pair.generationDraft)
    assert.equal(patches(updated)[1].generationDraft.model?.localModelId, checkpoint.localModelId)
    assert.equal(patches(updated)[1].generationDraft.loras[0].weight, -0.5)
    updated = await service.removeGenerationLora(pair.id, identity, second.id)
    assert.deepEqual(patches(updated)[1].generationDraft.loras, [])
    assert.deepEqual(updated.generationDraft, pair.generationDraft)
  })
})

test('queued editor sends retain a captured Patch owner through the real service while normal and sibling overlays stay separate', async () => {
  await withService(async (service) => {
    const { first, pair, second } = await createPair(service)
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const sends: (string | undefined)[] = []
    const overlays = new Map<string, ProjectTab['generationDraft']>()
    const sync = new ProjectDraftSync({
      onAcknowledged: () => {},
      onError: (_tabId, cause) => assert.fail(cause.message),
      onOverlay: (tabId, draft, targetLayerId) => {
        const key = draftOwnerKey(tabId, targetLayerId)
        if (draft) {
          overlays.set(key, draft)
        } else {
          overlays.delete(key)
        }
      },
      send: async (tabId, change, groupId, targetLayerId) => {
        sends.push(targetLayerId)
        await barrier
        return service.updateGenerationDraft(tabId, change, groupId, targetLayerId)
      },
    })
    const editor = { ...pair, generationDraft: structuredClone(first.generationDraft) }
    sync.change(editor, { kind: 'positive-prompt', text: 'first incremental' }, undefined, first.id)
    sync.change(editor, { kind: 'positive-prompt', text: 'first final' }, undefined, first.id)
    editor.generationDraft = structuredClone(second.generationDraft)
    assert.equal(overlays.get(draftOwnerKey(pair.id, first.id))?.positivePrompt.text, 'first final')
    assert.equal(overlays.has(draftOwnerKey(pair.id, second.id)), false)
    assert.equal(overlays.has(draftOwnerKey(pair.id)), false)
    release()
    await sync.flush(pair.id)
    const result = service.getOpenTabs()[0]
    assert.deepEqual(sends, [first.id, first.id])
    assert.equal(patches(result)[0].generationDraft.positivePrompt.text, 'first final')
    assert.deepEqual(patches(result)[1], second)
    assert.deepEqual(result.generationDraft, pair.generationDraft)
    assert.equal(overlays.size, 0)
  })
})

test('an awaited Patch resource resolution refuses a newer document rather than replacing a sibling edit', async () => {
  await withService(async (service) => {
    const { first, pair, second } = await createPair(service)
    let release!: () => void
    let entered!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const request = service.setGenerationVae(
      pair.id,
      async () => {
        entered()
        await barrier
        return {
          baseModelFamily: 'illustrious',
          civitaiFileId: 3,
          civitaiModelId: 1,
          civitaiVersionId: 2,
          displayName: 'Resolved VAE',
          fileSha256: 'e'.repeat(64),
          kind: 'vae',
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
          predictionType: null,
          versionName: 'exact version',
        }
      },
      second.id,
    )
    await started
    const current = await service.updateGenerationDraft(
      pair.id,
      { kind: 'negative-prompt', text: 'newer first owner' },
      undefined,
      first.id,
    )
    release()
    await assert.rejects(request, { code: 'EDIT_CONFLICT' })
    assert.deepEqual(service.getOpenTabs()[0], current)
    assert.deepEqual(patches(current)[1], second)
    assert.deepEqual(current.generationDraft, pair.generationDraft)
  })
})
