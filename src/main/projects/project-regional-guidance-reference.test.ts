import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  IGS_MIMETYPE,
  IGS_SAFETY_CEILINGS,
  projectAssetReferences,
  projectOwnedIds,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import crypto, { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import {
  readIgsPackage,
  saveIgsPackage,
  verifyRegionalReferenceAssetSource,
} from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectRegionalReferenceThumbnailUrl } from './project-regional-reference-resource.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

type ReferenceWorker = Pick<ProjectWorkerClient, 'createImportThumbnail' | 'normalizeImport'>
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/** Actual Service/SQLite/coordinator/shadow/ZIP; only CPU output and timing seams are controlled. */
async function withProject(run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.dispose()
  }
}
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-regional-references-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const services: ProjectService[] = []
  let beforeEdit: ProjectAutosaveOptions['beforeEditCommit']
  let afterSave: ProjectAutosaveOptions['afterSaveCommit']
  const restart = () => {
    const service = new ProjectService({
      autosaveOptions: {
        afterSaveCommit: async () => afterSave?.(),
        beforeEditCommit: async (doc) => beforeEdit?.(doc),
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      },
      dataRoot: root,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: path.join(root, 'scratch'),
      },
      shadow,
    })
    services.push(service)
    return service
  }
  const service = restart()
  const created = await service.create({ height: 256, title: 'Regional references', width: 256 })
  const id = created.id
  const co = () => service.getOpenDocumentForAcceptance(id)!
  const png = await acceptedOutputPngFixture(64, 64)
  const webp = await readFile(
    path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
  )
  const profile = await readFile(path.resolve('worker-python/tests/fixtures/AdobeRGB1998.icc'))
  const model = acceptedRasterProvenanceFixture(co().document, png, {
    height: 64,
    width: 64,
    x: 0,
    y: 0,
  }).generationConfiguration.model
  await co().applyDocument({
    ...co().document,
    generationDraft: { ...co().document.generationDraft, model },
  })
  await service.addSmartPatchLayer(id)
  await co().applyDocument({
    ...co().document,
    layers: co().document.layers.map((layer) =>
      layer.kind === 'smart-patch'
        ? {
            ...layer,
            generationDraft: {
              ...layer.generationDraft,
              model: { ...model, baseModelFamily: 'anima', predictionType: null },
            },
          }
        : layer,
    ),
  })
  const tab = () => service.getOpenTabs().find((tab) => tab.id === id)!
  await service.addRegionalGuidance(id, {
    documentId: tab().documentId,
    documentRevision: tab().documentRevision,
  })
  const regionId = tab().regionalGuidance![0].id
  const owner = () => ({
    documentId: tab().documentId,
    documentRevision: tab().documentRevision,
    regionId,
  })
  await service.updateRegionalGuidance(id, owner(), { enabled: false, kind: 'enabled' })
  await service.save(id)
  await service.clearHistory(id)
  const selected = path.join(root, 'authorized.png')
  await writeFile(selected, png)
  const calls = { normalize: 0, thumbnail: 0 }
  let normalizeHook: (() => Promise<void>) | undefined
  let thumbnailHook: (() => Promise<void>) | undefined
  let bad: 'image-dimensions' | 'profile' | 'thumbnail' | undefined
  const worker: ReferenceWorker = {
    createImportThumbnail: async (input) => {
      calls.thumbnail++
      await thumbnailHook?.()
      const bytes = bad === 'thumbnail' ? png : webp
      await writeFile(input.thumbnailWebpPath, bytes)
      return {
        byteSize: bytes.length,
        colorSpace: 'srgb',
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: input.thumbnailWebpPath,
        sha256: sha(bytes),
        width: 64,
      }
    },
    normalizeImport: async (input) => {
      calls.normalize++
      assert.ok((await readFile(input.inputPath)).equals(png))
      assert.equal(input.inputSha256, sha(png))
      await normalizeHook?.()
      await writeFile(input.normalizedPngPath, png)
      await writeFile(input.originalIccPath, bad === 'profile' ? Buffer.alloc(128) : profile)
      const icc = bad === 'profile' ? Buffer.alloc(128) : profile
      return {
        normalized: {
          byteSize: png.length,
          colorSpace: 'srgb',
          height: 64,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.normalizedPngPath,
          sha256: sha(png),
          width: bad === 'image-dimensions' ? 63 : 64,
        },
        originalIcc: { byteSize: icc.length, path: input.originalIccPath, sha256: sha(icc) },
        sourceFormat: 'PNG',
      }
    },
  }
  return {
    add: () =>
      service.importRegionalGuidanceReferenceImage(id, owner(), async () => selected, worker),
    calls,
    co,
    db: database.db,
    dispose: async () => {
      beforeEdit = undefined
      afterSave = undefined
      for (const service of services.reverse()) {
        for (const tab of service.getOpenTabs()) {
          await service.discardAndClose(tab.id)
        }
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    },
    document: () => co().document,
    id,
    owner,
    png,
    profile,
    refs: () => co().document.regionalGuidance![0].referenceImages ?? [],
    restart,
    root,
    savedPath: co().filePath,
    selected,
    service,
    setAfterSave: (hook?: ProjectAutosaveOptions['afterSaveCommit']) => {
      afterSave = hook
    },
    setBad: (value?: typeof bad) => {
      bad = value
    },
    setBeforeEdit: (hook?: ProjectAutosaveOptions['beforeEditCommit']) => {
      beforeEdit = hook
    },
    setNormalize: (hook?: () => Promise<void>) => {
      normalizeHook = hook
    },
    setThumbnail: (hook?: () => Promise<void>) => {
      thumbnailHook = hook
    },
    shadow,
    tab,
    webp,
    worker,
  }
}

test('regional import adopts owned bytes with one Undo; order/no-op/remove-last and source-independent Save/reopen preserve neighbors', async () => {
  await withProject(async (f) => {
    const neighbors = structuredClone(f.document().layers)
    const draft = structuredClone(f.document().generationDraft)
    const first = await f.add()
    assert.ok(first)
    assert.equal(f.refs().length, 1)
    const reference = structuredClone(f.refs()[0])
    assert.equal(reference.name, 'authorized.png')
    assert.equal(reference.sourceFormat, 'PNG')
    assert.equal(f.document().regionalGuidance![0].enabled, false)
    assert.deepEqual(f.document().layers, neighbors)
    assert.deepEqual(f.document().generationDraft, draft)
    const capability = parseProjectRegionalReferenceThumbnailUrl(
      first.regionalGuidance![0].referenceImages![0].thumbnailUrl,
    )
    assert.ok(capability)
    assert.equal(f.service.getRegionalReferenceThumbnail(capability)?.kind, 'staged')
    await f.service.undo(f.id)
    assert.equal(Object.hasOwn(f.document().regionalGuidance![0], 'referenceImages'), false)
    assert.equal(f.tab().canUndo, false)
    await f.service.redo(f.id)
    assert.deepEqual(f.refs(), [reference])
    const revision = f.document().documentRevision
    await f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
      kind: 'move',
      referenceId: reference.id,
      targetIndex: 0,
    })
    assert.equal(f.document().documentRevision, revision)
    await f.add()
    const second = structuredClone(f.refs()[1])
    await f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
      kind: 'move',
      referenceId: second.id,
      targetIndex: 0,
    })
    assert.deepEqual(
      f.refs().map(({ id }) => id),
      [second.id, reference.id],
    )
    await f.service.undo(f.id)
    assert.deepEqual(
      f.refs().map(({ id }) => id),
      [reference.id, second.id],
    )
    await f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
      kind: 'remove',
      referenceId: second.id,
    })
    await f.service.save(f.id)
    const saved = await readIgsPackage(f.savedPath)
    assert.ok((await saved.readMember(reference.asset.path)).equals(f.png))
    assert.ok((await saved.readMember(reference.thumbnail.path)).equals(f.webp))
    assert.ok((await saved.readMember(reference.sourceIccProfile!.path)).equals(f.profile))
    assert.equal(JSON.stringify(saved.project).includes('thumbnailUrl'), false)
    await rm(f.selected)
    await f.service.close(f.id)
    assert.equal((await f.service.open(f.id)).kind, 'opened')
    assert.deepEqual(f.refs(), [reference])
    assert.equal(f.service.getRegionalReferenceThumbnail(capability), null)
    await f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
      kind: 'remove',
      referenceId: reference.id,
    })
    assert.equal(Object.hasOwn(f.document().regionalGuidance![0], 'referenceImages'), false)
    await f.service.undo(f.id)
    assert.deepEqual(f.refs(), [reference])
  })
})

test('ownership mutation oracle: painted-region duplicate must retain independent reference PNG/WebP paths and exact bytes; source neighbor survives removal', async () => {
  await withProject(async (f) => {
    await f.add()
    await f.service.editRegionalGuidanceMask(f.id, f.owner().regionId, {
      documentId: f.owner().documentId,
      documentRevision: f.owner().documentRevision,
      edit: { diameter: 1, kind: 'brush', operation: 'add', points: [{ x: 0.5, y: 0.5 }] },
      maskId: f.document().regionalGuidance![0].mask.id,
      maskRevision: 0,
    })
    const original = structuredClone(f.document().regionalGuidance![0])
    await f.service.duplicateRegionalGuidance(f.id, f.owner())
    const copy = f.document().regionalGuidance![1]
    assert.ok(copy.referenceImages?.length)
    assert.notEqual(copy.id, original.id)
    assert.notEqual(copy.mask.id, original.mask.id)
    assert.ok(copy.mask.asset)
    const copied = copy.referenceImages[0]
    assert.notEqual(copied.id, original.referenceImages![0].id)
    assert.notEqual(copied.asset.path, original.referenceImages![0].asset.path)
    assert.notEqual(copied.thumbnail.path, original.referenceImages![0].thumbnail.path)
    assert.deepEqual(copied.sourceIccProfile, original.referenceImages![0].sourceIccProfile)
    for (const member of [copied.asset, copied.thumbnail]) {
      assert.ok(f.co().getCurrentAssetSource(member))
    }
    assert.equal(new Set(projectOwnedIds(f.document())).size, projectOwnedIds(f.document()).length)
    await f.service.updateRegionalGuidanceReferenceImage(
      f.id,
      { ...f.owner(), regionId: copy.id },
      { kind: 'remove', referenceId: copied.id },
    )
    assert.deepEqual(f.document().regionalGuidance![0], original)
    await f.service.undo(f.id)
    await f.service.save(f.id)
    const saved = await readIgsPackage(f.savedPath)
    assert.ok((await saved.readMember(copied.asset.path)).equals(f.png))
    assert.ok((await saved.readMember(copied.thumbnail.path)).equals(f.webp))
    assert.equal(
      saved.manifest.members.filter(({ path }) => path.startsWith('assets/profiles/')).length,
      1,
    )
  })
})

test('family and lock gates precede the lazy dialog; cancellation is inert; existing refs remain repairable under Anima/null', async () => {
  await withProject(async (f) => {
    let selections = 0
    const select = async () => {
      selections++
      return null
    }
    const before = structuredClone(f.document())
    assert.equal(
      await f.service.importRegionalGuidanceReferenceImage(f.id, f.owner(), select, f.worker),
      null,
    )
    assert.deepEqual(f.document(), before)
    assert.equal(f.tab().canUndo, false)
    await f.add()
    const referenceId = f.refs()[0].id
    for (const family of ['anima', null] as const) {
      const draft = f.document().generationDraft
      await f.co().applyDocument({
        ...f.document(),
        generationDraft: {
          ...draft,
          model: family ? { ...draft.model!, baseModelFamily: family, predictionType: null } : null,
        },
      })
      const calls = selections
      await assert.rejects(
        f.service.importRegionalGuidanceReferenceImage(f.id, f.owner(), select, f.worker),
        { code: 'PROJECT_INVALID_INPUT' },
      )
      assert.equal(selections, calls)
      await f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
        kind: 'move',
        referenceId,
        targetIndex: 0,
      })
    }
    await f.service.updateRegionalGuidance(f.id, f.owner(), { kind: 'lock', locked: true })
    const locked = structuredClone(f.document())
    await assert.rejects(
      f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
        kind: 'remove',
        referenceId,
      }),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    await assert.rejects(
      f.service.importRegionalGuidanceReferenceImage(f.id, f.owner(), select, f.worker),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    assert.deepEqual(f.document(), locked)
    await f.service.updateRegionalGuidance(f.id, f.owner(), { kind: 'lock', locked: false })
    await f.service.updateRegionalGuidanceReferenceImage(f.id, f.owner(), {
      kind: 'remove',
      referenceId,
    })
    assert.equal(f.refs().length, 0)
  })
})

test('dialog, normalize and thumbnail awaits reject edit/Undo ABA and closed/reopened owners without attachment publication', async () => {
  for (const phase of ['dialog', 'normalize', 'thumbnail', 'closed-dialog'] as const) {
    await withProject(async (f) => {
      const entered = deferred()
      const release = deferred()
      const wait = async () => {
        entered.release()
        await release.promise
      }
      if (phase === 'normalize') {
        f.setNormalize(wait)
      }
      if (phase === 'thumbnail') {
        f.setThumbnail(wait)
      }
      const pending = f.service.importRegionalGuidanceReferenceImage(
        f.id,
        f.owner(),
        async () => {
          if (phase === 'dialog' || phase === 'closed-dialog') {
            await wait()
          }
          return f.selected
        },
        f.worker,
      )
      const refused = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
      await entered.promise
      const initialRevision = f.document().documentRevision
      if (phase === 'closed-dialog') {
        await f.service.close(f.id)
        await f.service.open(f.id)
      } else {
        await f.service.updateGenerationDraft(f.id, {
          kind: 'positive-prompt',
          text: 'Interference',
        })
        await f.service.undo(f.id)
        assert.equal(f.document().documentRevision, initialRevision)
      }
      const expected = structuredClone(f.document())
      release.release()
      await refused
      assert.deepEqual(f.document(), expected)
      assert.equal(f.refs().length, 0)
      if (phase === 'dialog' || phase === 'closed-dialog') {
        assert.equal(f.calls.normalize, 0)
      }
    })
  }
})

test('staged adoption rejects ABA after real source copies, without phantom attachment or history', async () => {
  await withProject(async (f) => {
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async (candidate) => {
      if (candidate.regionalGuidance?.[0].referenceImages) {
        entered.release()
        await release.promise
      }
    })
    const pending = f.add()
    const refused = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
    await entered.promise
    await f.service.updateGenerationDraft(f.id, { kind: 'positive-prompt', text: 'ABA' })
    await f.service.undo(f.id)
    const expected = structuredClone(f.document())
    release.release()
    await refused
    f.setBeforeEdit()
    assert.deepEqual(f.document(), expected)
    assert.equal(f.refs().length, 0)
    assert.equal(f.tab().canUndo, false)
  })
})

test('actual adoption rejects mismatched dimensions, malformed profiles and non-WebP thumbnails without changing package or document', async () => {
  for (const bad of ['image-dimensions', 'profile', 'thumbnail'] as const) {
    await withProject(async (f) => {
      f.setBad(bad)
      const before = structuredClone(f.document())
      const saved = await readFile(f.savedPath)
      await assert.rejects(f.add())
      assert.deepEqual(f.document(), before)
      assert.equal(f.tab().canUndo, false)
      assert.ok((await readFile(f.savedPath)).equals(saved))
      assert.equal(
        (await readdir(path.join(f.root, 'scratch'))).some((name) =>
          name.startsWith('regional-reference-import-'),
        ),
        false,
      )
    })
  }
})

test('regional source adoption validates content even when forged descriptors have self-consistent hashes', async () => {
  await withProject(async (f) => {
    await f.add()
    const before = structuredClone(f.document())
    const forged = structuredClone(before)
    const ref = forged.regionalGuidance![0].referenceImages![0]
    ref.asset.width = ref.asset.height = 65
    ref.thumbnail.width = ref.thumbnail.height = 65
    await assert.rejects(
      f.co().applyDocument(forged, {
        [ref.asset.path]: f
          .co()
          .getCurrentAssetSource(before.regionalGuidance![0].referenceImages![0].asset)!,
        [ref.thumbnail.path]: f
          .co()
          .getCurrentAssetSource(before.regionalGuidance![0].referenceImages![0].thumbnail)!,
      }),
    )
    assert.deepEqual(f.document(), before)
    const profile = f.refs()[0].sourceIccProfile!
    await assert.rejects(
      verifyRegionalReferenceAssetSource(
        { bytes: Buffer.alloc(128) },
        {
          ...profile,
          bytes: 128,
          path: `assets/profiles/${sha(Buffer.alloc(128))}.icc`,
          sha256: sha(Buffer.alloc(128)),
        },
        'profile',
      ),
    )
    const saved = await readIgsPackage(f.savedPath)
    const assets = Object.fromEntries(
      await Promise.all(
        projectAssetReferences(before).map(
          async (member) =>
            [
              member.path,
              f.co().getCurrentAssetSource(member) ?? {
                bytes: await saved.readMember(member.path),
              },
            ] as const,
        ),
      ),
    )
    await assert.rejects(
      saveIgsPackage(path.join(f.root, 'forged.igs'), {
        assets,
        preview: {
          merged: await saved.readMember('preview/merged.png'),
          rect: null,
          status: 'empty',
          thumbnail: await saved.readMember('preview/thumbnail.webp'),
        },
        project: forged,
      }),
    )
  })
})

test('saved reference Save A/edit B survives the committed rebase interval after reopen', async () => {
  await withProject(async (f) => {
    await f.add()
    // Reference construction is a precondition. The operation under test below is an
    // unrelated Main draft edit, with every reference resolved afresh from the saved package.
    await f.service.save(f.id)
    await f.service.close(f.id)
    assert.equal((await f.service.open(f.id)).kind, 'opened')
    assert.equal(f.tab().canUndo, false)
    assert.equal(f.tab().canRedo, false)
    assert.equal(f.tab().dirty, false)
    const baseline = structuredClone(f.document())
    const references = structuredClone(f.refs())
    assert.equal(references.length, 1)
    for (const reference of references) {
      for (const member of [reference.asset, reference.thumbnail, reference.sourceIccProfile!]) {
        // The current public coordinator API represents an absent pending source with null.
        assert.equal(f.co().getCurrentAssetSource(member), null)
      }
    }
    await f.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 722,
        candidate_id: crypto.randomUUID(),
        completion_order: 17,
        document_id: baseline.documentId,
        local_project_key: f.id,
        updated_at: '2026-10-24T12:00:00.000Z',
      })
      .execute()
    const readCursor = () =>
      f.db
        .selectFrom('generation_seed_cursor')
        .selectAll()
        .where('local_project_key', '=', f.id)
        .execute()
    const cursor = await readCursor()
    assert.equal(cursor[0].actual_seed, 722)
    const assertReferenceBytes = async (saved: Awaited<ReturnType<typeof readIgsPackage>>) => {
      assert.deepEqual(saved.project.regionalGuidance, baseline.regionalGuidance)
      assert.deepEqual(saved.project.layers, baseline.layers)
      assert.deepEqual(saved.project.primaryBbox, baseline.primaryBbox)
      assert.equal(saved.project.lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)
      for (const reference of references) {
        assert.ok((await saved.readMember(reference.asset.path)).equals(f.png))
        assert.ok((await saved.readMember(reference.thumbnail.path)).equals(f.webp))
        assert.ok((await saved.readMember(reference.sourceIccProfile!.path)).equals(f.profile))
      }
    }
    await f.service.updateGenerationDraft(f.id, {
      kind: 'positive-prompt',
      text: 'Unrelated saved draft A',
    })
    const a = structuredClone(f.document())
    for (const reference of references) {
      assert.equal(f.co().getCurrentAssetSource(reference.asset), null)
      assert.equal(f.co().getCurrentAssetSource(reference.thumbnail), null)
    }
    const committed = deferred()
    const release = deferred()
    f.setAfterSave(async () => {
      committed.release()
      await release.promise
    })
    const saving = f.service.save(f.id)
    let b: typeof a | undefined
    try {
      await committed.promise
      const savedA = await readIgsPackage(f.savedPath)
      assert.deepEqual(savedA.project, a)
      await assertReferenceBytes(savedA)
      // Expected causal RED in R1: stageSources rejects SAVED_PROJECT_CHANGED here because A
      // is committed and saveTarget owns A, while baseDocument still identifies the reopened S.
      // A successful edit is required; do not turn this into assert.rejects or import another ref.
      await f.service.updateGenerationDraft(f.id, {
        kind: 'positive-prompt',
        text: 'Unrelated live draft B',
      })
      b = structuredClone(f.document())
      assert.deepEqual(b.regionalGuidance, baseline.regionalGuidance)
      assert.deepEqual(b.layers, baseline.layers)
      assert.deepEqual(b.generationDraft, {
        ...a.generationDraft,
        positivePrompt: { ...a.generationDraft.positivePrompt, text: 'Unrelated live draft B' },
      })
      assert.equal(b.lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)
      assert.deepEqual(f.calls, { normalize: 1, thumbnail: 1 })
      assert.equal(f.tab().dirty, true)
      await f.service.flushAutosave(f.id)
      const heldInspection = await f.shadow.inspect({
        projectPath: f.savedPath,
        savedPackage: savedA,
      })
      assert.equal(heldInspection.status, 'recoverable')
      if (heldInspection.status !== 'recoverable') {
        throw new Error('Draft B must survive the committed rebase interval.')
      }
      assert.deepEqual(heldInspection.document, b)
      assert.deepEqual(await readCursor(), cursor)
    } finally {
      release.release()
      f.setAfterSave()
      // Settle the actual Save even on the expected R1 failure, before fixture teardown.
      await saving
    }
    assert.ok(b)
    const savedA = await readIgsPackage(f.savedPath)
    assert.deepEqual(savedA.project, a)
    await assertReferenceBytes(savedA)
    assert.deepEqual(f.document(), b)
    const inspection = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: savedA })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('Draft B must remain recoverable after Save A settles.')
    }
    assert.deepEqual(inspection.document, b)
    const restarted = f.restart()
    assert.equal((await restarted.open(f.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(f.id, 'recover')
    assert.equal(recovered.canUndo, false)
    assert.equal(recovered.dirty, true)
    const recoveredB = structuredClone(restarted.getOpenDocumentForAcceptance(f.id)!.document)
    assert.notEqual(recoveredB.documentRevision, b.documentRevision)
    assert.deepEqual(recoveredB, { ...b, documentRevision: recoveredB.documentRevision })
    assert.deepEqual((await readIgsPackage(f.savedPath)).project, a)
    await restarted.save(f.id)
    await restarted.close(f.id)
    assert.equal((await restarted.open(f.id)).kind, 'opened')
    assert.deepEqual(restarted.getOpenDocumentForAcceptance(f.id)!.document, recoveredB)
    const savedB = await readIgsPackage(f.savedPath)
    assert.deepEqual(savedB.project, recoveredB)
    await assertReferenceBytes(savedB)
    assert.deepEqual(f.calls, { normalize: 1, thumbnail: 1 })
    assert.deepEqual(await readCursor(), cursor)
  })
})

test('saved reference publication neighbor: external package replacement still refuses unrelated edits', async () => {
  await withProject(async (f) => {
    await f.add()
    await f.service.save(f.id)
    await f.service.close(f.id)
    assert.equal((await f.service.open(f.id)).kind, 'opened')
    const before = structuredClone(f.document())
    const history = {
      canRedo: f.tab().canRedo,
      canUndo: f.tab().canUndo,
      dirty: f.tab().dirty,
      epoch: f.co().documentEpoch,
    }
    assert.equal(history.canUndo, false)
    for (const reference of f.refs()) {
      assert.equal(f.co().getCurrentAssetSource(reference.asset), null)
      assert.equal(f.co().getCurrentAssetSource(reference.thumbnail), null)
      assert.equal(f.co().getCurrentAssetSource(reference.sourceIccProfile!), null)
    }
    const saved = await readIgsPackage(f.savedPath)
    const assets = Object.fromEntries(
      await Promise.all(
        projectAssetReferences(saved.project).map(
          async (member) => [member.path, { bytes: await saved.readMember(member.path) }] as const,
        ),
      ),
    )
    const external = {
      ...structuredClone(saved.project),
      documentRevision: crypto.randomUUID(),
      title: 'External validated package replacement',
    }
    // The actual writer and loader establish a valid outside replacement, with exact unchanged
    // regional image/thumbnail/profile bytes. No coordinator or Save target owns this revision.
    await saveIgsPackage(f.savedPath, {
      assets,
      preview: {
        merged: await saved.readMember('preview/merged.png'),
        rect: saved.manifest.preview.rect,
        status: saved.manifest.preview.status,
        thumbnail: await saved.readMember('preview/thumbnail.webp'),
      },
      project: external,
    })
    const replaced = await readIgsPackage(f.savedPath)
    assert.deepEqual(replaced.project, external)
    assert.deepEqual(replaced.project.regionalGuidance, before.regionalGuidance)
    for (const reference of f.refs()) {
      assert.ok((await replaced.readMember(reference.asset.path)).equals(f.png))
      assert.ok((await replaced.readMember(reference.thumbnail.path)).equals(f.webp))
      assert.ok((await replaced.readMember(reference.sourceIccProfile!.path)).equals(f.profile))
    }
    const externalBytes = await readFile(f.savedPath)
    await assert.rejects(
      f.service.updateGenerationDraft(f.id, {
        kind: 'positive-prompt',
        text: 'Must not publish over an outside replacement',
      }),
      { code: 'SAVED_PROJECT_CHANGED' },
    )
    assert.deepEqual(f.document(), before)
    assert.deepEqual(
      {
        canRedo: f.tab().canRedo,
        canUndo: f.tab().canUndo,
        dirty: f.tab().dirty,
        epoch: f.co().documentEpoch,
      },
      history,
    )
    assert.ok((await readFile(f.savedPath)).equals(externalBytes))
    assert.deepEqual((await readIgsPackage(f.savedPath)).project, external)
  })
})

test('Save A followed by reference B retains saved A and independently recoverable dirty B', async () => {
  await withProject(async (f) => {
    await f.add()
    const a = structuredClone(f.document())
    const committed = deferred()
    const release = deferred()
    f.setAfterSave(async () => {
      committed.release()
      await release.promise
    })
    const saving = f.service.save(f.id)
    await committed.promise
    try {
      assert.deepEqual(
        (await readIgsPackage(f.savedPath)).project.regionalGuidance,
        a.regionalGuidance,
      )
      await f.add()
      await f.service.flushAutosave(f.id)
    } finally {
      release.release()
    }
    await saving
    f.setAfterSave()
    assert.equal(f.refs().length, 2)
    const expected = structuredClone(f.document())
    const saved = await readIgsPackage(f.savedPath)
    assert.equal(saved.project.regionalGuidance![0].referenceImages!.length, 1)
    const inspection = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(inspection.status, 'recoverable')
    const restarted = f.restart()
    assert.equal((await restarted.open(f.id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(f.id, 'recover')
    assert.equal(recovered.canUndo, false)
    assert.deepEqual(
      restarted.getOpenDocumentForAcceptance(f.id)!.document.regionalGuidance,
      expected.regionalGuidance,
    )
    await restarted.save(f.id)
    const portable = await readIgsPackage(f.savedPath)
    assert.deepEqual(portable.project.regionalGuidance, expected.regionalGuidance)
    for (const ref of expected.regionalGuidance![0].referenceImages!) {
      assert.ok((await portable.readMember(ref.asset.path)).equals(f.png))
    }
  })
})

test('reference UUID allocation retries current region/mask/reference collisions before adoption', async (t) => {
  await withProject(async (f) => {
    await f.add()
    const occupied = projectOwnedIds(f.document())
    const original = crypto.randomUUID
    const expected = original()
    const ids = [...occupied, expected]
    const mock = t.mock.method(crypto, 'randomUUID', () => ids.shift() ?? original())
    syncBuiltinESMExports()
    try {
      await f.add()
      assert.equal(f.refs()[1].id, expected)
    } finally {
      mock.mock.restore()
      syncBuiltinESMExports()
    }
  })
})

test('prepublication reference budgets count five ZIP members and deduplicate ICC; overflow preserves source and history', async () => {
  await withProject(async (f) => {
    await f.add()
    await f.service.save(f.id)
    const before = structuredClone(f.document())
    const originalEntries = IGS_SAFETY_CEILINGS.archiveEntries
    const originalBytes = IGS_SAFETY_CEILINGS.archiveUncompressedBytes
    try {
      // Five assets after duplication (one shared ICC) plus five non-assets.
      Reflect.set(IGS_SAFETY_CEILINGS, 'archiveEntries', 9)
      await assert.rejects(f.service.duplicateRegionalGuidance(f.id, f.owner()), {
        code: 'PROJECT_INVALID_INPUT',
      })
      assert.deepEqual(f.document(), before)
      Reflect.set(IGS_SAFETY_CEILINGS, 'archiveEntries', 10)
      await f.service.duplicateRegionalGuidance(f.id, f.owner())
      assert.equal(f.document().regionalGuidance!.length, 2)
      await f.service.undo(f.id)
      assert.deepEqual(f.document(), before)
      Reflect.set(IGS_SAFETY_CEILINGS, 'archiveEntries', originalEntries)
      const saved = await readIgsPackage(f.savedPath)
      const savedBytes = saved.manifest.members.reduce(
        (sum, member) => sum + member.bytes,
        Buffer.byteLength(JSON.stringify(saved.manifest)) + Buffer.byteLength(IGS_MIMETYPE),
      )
      Reflect.set(IGS_SAFETY_CEILINGS, 'archiveUncompressedBytes', savedBytes)
      assert.deepEqual((await readIgsPackage(f.savedPath)).project, before)
      await assert.rejects(f.add(), { code: 'PROJECT_INVALID_INPUT' })
      assert.deepEqual(f.document(), before)
    } finally {
      Reflect.set(IGS_SAFETY_CEILINGS, 'archiveEntries', originalEntries)
      Reflect.set(IGS_SAFETY_CEILINGS, 'archiveUncompressedBytes', originalBytes)
    }
  })
})

test('dirty recovery detects actual regional thumbnail corruption and legacy Save/reopen retains absent regional fields', async () => {
  await withProject(async (f) => {
    const legacy = await f.service.create({
      height: 256,
      title: 'Legacy no regional state',
      width: 256,
    })
    await f.service.save(legacy.id)
    await f.service.close(legacy.id)
    assert.equal((await f.service.open(legacy.id)).kind, 'opened')
    assert.equal(
      Object.hasOwn(
        f.service.getOpenDocumentForAcceptance(legacy.id)!.document,
        'regionalGuidance',
      ),
      false,
    )
    await f.add()
    await f.service.flushAutosave(f.id)
    const saved = await readIgsPackage(f.savedPath)
    const inspection = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('Expected dirty regional assets.')
    }
    const source = inspection.dirtyAssets[f.refs()[0].thumbnail.path]
    assert.ok('sourcePath' in source)
    const corrupt = Buffer.from(f.webp)
    corrupt[0] ^= 1
    await writeFile(source.sourcePath, corrupt)
    const invalid = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(invalid.status, 'invalid')
    if (invalid.status === 'invalid') {
      assert.equal(invalid.reason, 'ASSET_MISMATCH')
    }
    await writeFile(source.sourcePath, f.webp)
  })
})
