import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { parseProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage } from './igs-package.js'
import { projectAcceptedResults } from './project-accepted-results.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { decodeProjectMaskPng, readProjectMaskSource } from './project-mask.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  fixtureMaskAlpha,
  fixtureMaskPng,
  invalidMaskRgbFixture,
  paintedPatchFixture,
} from './test-fixtures/project-mask.js'

async function withProject(
  run: (fixture: {
    root: string
    roots: { placeholdersDir: string; scratchDir: string }
    session: ProjectSession
    shadow: ProjectShadowStore
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-owned-mask-'))
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: path.join(root, 'scratch'),
  }
  try {
    const session = await ProjectSession.create(
      path.join(root, 'Project.igs'),
      'Mask storage',
      roots,
    )
    await run({ root, roots, session, shadow: new ProjectShadowStore(path.join(root, 'shadow')) })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('actual mask Save/read/reopen keeps world coverage independent of bbox, with no preview or accepted entry', async () => {
  await withProject(async ({ roots, session }) => {
    const png = fixtureMaskPng()
    const patch = paintedPatchFixture(session.document, png)
    assert.ok(patch.mask.asset)
    const bbox = structuredClone(session.document.primaryBbox)
    const draft = structuredClone(session.document.generationDraft)
    session.applyDocument({ ...session.document, layers: [patch] })
    await session.save({ assets: { [patch.mask.asset.path]: { bytes: png } } })
    const saved = await readIgsPackage(session.filePath)
    assert.deepEqual(saved.project.layers, [patch])
    assert.deepEqual(saved.project.primaryBbox, bbox)
    assert.deepEqual(saved.project.generationDraft, draft)
    assert.deepEqual(saved.manifest.preview, { rect: null, status: 'empty' })
    assert.deepEqual(
      saved.manifest.members
        .filter((member) => member.path.startsWith('assets/'))
        .map((member) => member.path),
      [patch.mask.asset.path],
    )
    assert.deepEqual(
      [...decodeProjectMaskPng(await saved.readMember(patch.mask.asset.path), patch.mask.asset)],
      fixtureMaskAlpha,
    )
    assert.deepEqual(projectAcceptedResults(session.localRecoveryKey, saved.project), [])
    const reopened = await ProjectSession.open(session.filePath, roots)
    assert.deepEqual(reopened.document.layers, [patch])

    const before = await readFile(session.filePath)
    const bad = invalidMaskRgbFixture()
    const invalid = paintedPatchFixture(reopened.document, bad)
    assert.ok(invalid.mask.asset)
    reopened.applyDocument({ ...reopened.document, layers: [invalid] })
    await assert.rejects(reopened.save({ assets: { [invalid.mask.asset.path]: { bytes: bad } } }), {
      code: 'INVALID_IMAGE',
    })
    assert.deepEqual(await readFile(session.filePath), before)
    assert.deepEqual((await readIgsPackage(session.filePath)).project.layers, [patch])
  })
})

test('Clear/Save drops mask members, while real Undo/Redo retains saved-base mask bytes', async () => {
  await withProject(async ({ roots, session, shadow }) => {
    const png = fixtureMaskPng()
    const patch = paintedPatchFixture(session.document, png)
    assert.ok(patch.mask.asset)
    const asset = patch.mask.asset
    session.applyDocument({ ...session.document, layers: [patch] })
    await session.save({ assets: { [asset.path]: { bytes: png } } })
    // Start from a reopened package: Undo must retain/extract the old ZIP member, not fixture bytes.
    const owner = await ProjectAutosaveCoordinator.attach(
      await ProjectSession.open(session.filePath, roots),
      roots,
      shadow,
      { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    )
    try {
      const empty = { ...patch, mask: { asset: null, id: patch.mask.id, revision: 2 } }
      await owner.applyDocument({ ...owner.document, layers: [empty] })
      await owner.save()
      const cleared = await readIgsPackage(session.filePath)
      assert.deepEqual(cleared.project.layers, [empty])
      assert.equal(
        cleared.manifest.members.some((member) => member.path.startsWith('assets/masks/')),
        false,
      )
      await owner.undo()
      assert.deepEqual(owner.document.layers, [patch])
      const source = owner.getCurrentAssetSource(asset)
      assert.ok(source && 'sourcePath' in source)
      assert.deepEqual(await readProjectMaskSource(source, asset), png)
      await owner.save()
      assert.deepEqual(await (await readIgsPackage(session.filePath)).readMember(asset.path), png)
      await owner.redo()
      assert.deepEqual(owner.document.layers, [empty])
      await owner.save()
    } finally {
      const closing = owner.dirty ? await owner.discardChanges(roots) : owner
      await closing.close()
    }
  })
})

test('real shadow write/recovery checks canonical coverage, including a hash-consistent on-disk format fault', async () => {
  await withProject(async ({ root, session, shadow }) => {
    const png = fixtureMaskPng()
    const patch = paintedPatchFixture(session.document, png)
    assert.ok(patch.mask.asset)
    const document: IgsProjectDocumentV1 = {
      ...session.document,
      documentRevision: randomUUID(),
      layers: [patch],
    }
    await shadow.write({
      dirtyAssets: { [patch.mask.asset.path]: { bytes: png } },
      document,
      projectPath: session.filePath,
      savedDocument: session.document,
    })
    const savedPackage = await readIgsPackage(session.filePath)
    const inspect = await shadow.inspect({ projectPath: session.filePath, savedPackage })
    assert.equal(inspect.status, 'recoverable')
    if (inspect.status === 'recoverable') {
      assert.deepEqual(inspect.document.layers, [patch])
      assert.deepEqual(
        await readProjectMaskSource(inspect.dirtyAssets[patch.mask.asset.path], patch.mask.asset),
        png,
      )
    }
    // Controlled persisted-data fault: change bytes and all matching identities/hashes so the
    // mask-format reader, rather than the generic hash verifier, is the observable refusal.
    const bad = invalidMaskRgbFixture()
    const digest = createHash('sha256').update(bad).digest('hex')
    const badPatch = structuredClone(patch)
    assert.ok(badPatch.mask.asset)
    badPatch.mask.asset = {
      ...badPatch.mask.asset,
      bytes: bad.length,
      path: `assets/masks/${patch.mask.id}/${digest}.png`,
      sha256: digest,
    }
    const badDocument = parseProjectDocumentV1({ ...document, layers: [badPatch] })
    const directory = path.join(root, 'shadow', session.localRecoveryKey)
    const manifestPath = path.join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      baseRequiredAssetPaths: string[]
      dirtyAssets: { bytes: number; path: string; sha256: string }[]
      documentHash: string
      snapshotId: string
    }
    const snapshot = path.join(directory, 'snapshots', manifest.snapshotId)
    const bytes = Buffer.from(JSON.stringify(badDocument))
    manifest.documentHash = createHash('sha256').update(bytes).digest('hex')
    manifest.dirtyAssets = [{ bytes: bad.length, path: badPatch.mask.asset.path, sha256: digest }]
    manifest.baseRequiredAssetPaths = [badPatch.mask.asset.path]
    await mkdir(path.dirname(path.join(snapshot, badPatch.mask.asset.path)), { recursive: true })
    await writeFile(path.join(snapshot, badPatch.mask.asset.path), bad)
    await rm(path.join(snapshot, patch.mask.asset.path))
    await writeFile(path.join(snapshot, 'project.json'), bytes)
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.deepEqual(await shadow.inspect({ projectPath: session.filePath, savedPackage }), {
      reason: 'ASSET_MISMATCH',
      status: 'invalid',
    })
    assert.deepEqual((await readIgsPackage(session.filePath)).project, session.document)
  })
})

test('coordinator and shadow reject valid-hash invalid mask pixels before publishing a document', async () => {
  await withProject(async ({ roots, session, shadow }) => {
    const bad = invalidMaskRgbFixture()
    const patch = paintedPatchFixture(session.document, bad)
    assert.ok(patch.mask.asset)
    const owner = await ProjectAutosaveCoordinator.attach(session, roots, shadow, {
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    const original = structuredClone(owner.document)
    try {
      await assert.rejects(
        owner.applyDocument(
          { ...owner.document, layers: [patch] },
          { [patch.mask.asset.path]: { bytes: bad } },
        ),
        { code: 'MASK_IMAGE_INVALID' },
      )
      assert.deepEqual(owner.document, original)
      assert.equal(owner.canUndo, false)
      await assert.rejects(
        shadow.write({
          dirtyAssets: { [patch.mask.asset.path]: { bytes: bad } },
          document: { ...original, documentRevision: randomUUID(), layers: [patch] },
          projectPath: session.filePath,
          savedDocument: original,
        }),
        { code: 'SHADOW_ASSET_MISMATCH' },
      )
      assert.equal(
        (
          await shadow.inspect({
            projectPath: session.filePath,
            savedPackage: await readIgsPackage(session.filePath),
          })
        ).status,
        'absent',
      )
    } finally {
      await owner.close()
    }
  })
})
