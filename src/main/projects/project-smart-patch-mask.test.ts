import type {
  ProjectSmartPatchLayerView,
  ProjectSmartPatchMaskEditRequest,
  ProjectTab,
} from '../../shared/api.js'
import type { ProjectMaskEdit } from '../../shared/projects/project-mask.js'
import type { IgsRasterLayerV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32 } from 'node:zlib'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectMaskImageUrl } from './project-mask-resource.js'
import { decodeProjectMaskPng, readProjectMaskSource } from './project-mask.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function fixture(
  run: (state: {
    first: ProjectSmartPatchLayerView
    normal: ProjectTab
    raster: IgsRasterLayerV1
    repository: ProjectIndexRepository
    savedPath: string
    second: ProjectSmartPatchLayerView
    service: ProjectService
    shadow: ProjectShadowStore
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-painted-mask-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow,
  })
  try {
    let normal = await service.create({ height: 256, title: 'Real painted-mask owner', width: 256 })
    normal = await service.updateGenerationDraft(normal.id, {
      kind: 'positive-prompt',
      text: 'normal inputs stay owned',
    })
    await service.save(normal.id)
    const savedPath = (await repository.listProjects())[0].canonicalPath
    await service.close(normal.id)
    const saved = await readIgsPackage(savedPath)
    const rasterId = randomUUID()
    const raster: IgsRasterLayerV1 = {
      asset: {
        bytes: rasterPng.length,
        height: 2,
        path: `assets/layers/${rasterId}.png`,
        sha256: digest(rasterPng),
        width: 2,
      },
      blendMode: 'normal',
      id: rasterId,
      kind: 'raster',
      locked: false,
      name: 'Literal Raster neighbor',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 11, y: -19 },
      visible: true,
    }
    // Declared literal Raster precondition, published only while the genuine Project is closed.
    await saveIgsPackage(savedPath, {
      assets: { [raster.asset.path]: { bytes: rasterPng } },
      preview: {
        merged: await saved.readMember('preview/merged.png'),
        rect: { height: 2, width: 2, x: 11, y: -19 },
        status: 'unavailable',
        thumbnail: await saved.readMember('preview/thumbnail.webp'),
      },
      project: { ...saved.project, documentRevision: randomUUID(), layers: [raster] },
    })
    const opened = await service.open(normal.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('The declared saved fixture did not reopen.')
    }
    normal = opened.tab
    await service.addSmartPatchLayer(normal.id)
    const pair = await service.addSmartPatchLayer(normal.id)
    const [first, second] = pair.layers.filter(
      (layer): layer is ProjectSmartPatchLayerView => layer.kind === 'smart-patch',
    )
    assert.ok(first && second)
    await run({ first, normal, raster, repository, savedPath, second, service, shadow })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function layer(tab: ProjectTab, id: string): ProjectSmartPatchLayerView {
  const found = tab.layers.find((value) => value.id === id)
  assert.ok(found?.kind === 'smart-patch')
  return found
}

function request(
  tab: ProjectTab,
  id: string,
  edit: ProjectMaskEdit,
): ProjectSmartPatchMaskEditRequest {
  const mask = layer(tab, id).mask
  return {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    edit,
    maskId: mask.id,
    maskRevision: mask.revision,
  }
}

const brush = (x: number, y: number, operation: 'add' | 'subtract' = 'add'): ProjectMaskEdit => ({
  diameter: 12,
  kind: 'brush',
  operation,
  points: [{ x, y }],
})

async function pixels(service: ProjectService, patch: ProjectSmartPatchLayerView) {
  assert.ok(patch.maskImageUrl && patch.mask.asset && 'bounds' in patch.mask)
  const capability = parseProjectMaskImageUrl(patch.maskImageUrl)
  assert.ok(capability)
  const resource = service.getMaskAsset(capability)
  assert.ok(resource)
  const bytes =
    resource.kind === 'staged'
      ? await readProjectMaskSource(resource.source, resource.member)
      : await (await readIgsPackage(resource.filePath)).readMember(resource.member.path)
  assert.equal(digest(bytes), patch.mask.asset.sha256)
  return { alpha: decodeProjectMaskPng(bytes, patch.mask.asset), bounds: patch.mask.bounds, bytes }
}

function pixel(
  mask: { alpha: Uint8Array; bounds: { height: number; width: number; x: number; y: number } },
  x: number,
  y: number,
) {
  const column = x - mask.bounds.x
  const row = y - mask.bounds.y
  return column < 0 || row < 0 || column >= mask.bounds.width || row >= mask.bounds.height
    ? 0
    : mask.alpha[row * mask.bounds.width + column]
}

function editablePatch(patch: ProjectSmartPatchLayerView) {
  const { maskImageUrl: _capability, ...owned } = patch
  return owned
}

for (const ownerIndex of [0, 1]) {
  test(`actual mask gesture targets Patch ${ownerIndex + 1} and preserves its neighbor through Save/reopen`, async () => {
    await fixture(async ({ first, normal, raster, savedPath, second, service }) => {
      const before = service.getOpenTabs()[0]
      const owner = [first, second][ownerIndex]
      const neighbor = [first, second][1 - ownerIndex]
      const updated = await service.editSmartPatchMask(
        before.id,
        owner.id,
        request(before, owner.id, brush(-15.5, 32.5)),
      )
      assert.equal(layer(updated, owner.id).mask.revision, 1)
      assert.deepEqual(editablePatch(layer(updated, neighbor.id)), editablePatch(neighbor))
      assert.deepEqual(updated.primaryBbox, normal.primaryBbox)
      assert.deepEqual(updated.generationDraft, normal.generationDraft)
      assert.deepEqual(updated.acceptedResults, [])
      const bitmap = await pixels(service, layer(updated, owner.id))
      assert.equal(
        pixel(bitmap, -16, 32),
        255,
        'The literal negative-world-coordinate brush center must be covered.',
      )
      assert.equal(pixel(bitmap, 0, 32), 0, 'A point outside the brush remains clear.')
      assert.ok(
        bitmap.bounds.x < updated.primaryBbox.x,
        'Mask drawing is not clipped to the generation bbox.',
      )
      await service.save(updated.id)
      const saved = await readIgsPackage(savedPath)
      assert.equal(saved.manifest.preview.status, 'unavailable')
      assert.deepEqual(
        saved.manifest.preview.rect,
        { height: 2, width: 2, x: 11, y: -19 },
        'Mask extent cannot enlarge the Project preview.',
      )
      assert.ok(
        (await saved.readMember(raster.asset.path)).equals(rasterPng),
        'Raster bytes remain exact.',
      )
      const stored = saved.project.layers.find((value) => value.id === owner.id)
      assert.ok(stored?.kind === 'smart-patch')
      assert.deepEqual(stored.mask, layer(updated, owner.id).mask)
      assert.equal(
        saved.manifest.members.filter((member) => member.path.startsWith('assets/masks/')).length,
        1,
      )
      await service.close(updated.id)
      const reopened = await service.open(updated.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Saved masked Project failed to reopen.')
      }
      assert.deepEqual(
        editablePatch(layer(reopened.tab, owner.id)),
        editablePatch(layer(updated, owner.id)),
      )
      assert.ok(
        Buffer.from((await pixels(service, layer(reopened.tab, owner.id))).alpha).equals(
          Buffer.from(bitmap.alpha),
        ),
        'Reopened coverage remains byte exact.',
      )
    })
  })
}

test('actual Eraser removes only mask coverage; one Undo/Redo restores exact mask PNG state', async () => {
  await fixture(async ({ first, normal, second, service }) => {
    let tab = service.getOpenTabs()[0]
    const polygon: ProjectMaskEdit = {
      kind: 'polygon',
      operation: 'add',
      points: [
        { x: 0, y: 0 },
        { x: 48, y: 0 },
        { x: 48, y: 48 },
        { x: 0, y: 48 },
      ],
    }
    tab = await service.editSmartPatchMask(tab.id, first.id, request(tab, first.id, polygon))
    const beforeErase = layer(tab, first.id)
    const original = await pixels(service, beforeErase)
    assert.equal(pixel(original, 24, 24), 255)
    tab = await service.editSmartPatchMask(
      tab.id,
      first.id,
      request(tab, first.id, brush(24.5, 24.5, 'subtract')),
    )
    const erasedPatch = layer(tab, first.id)
    const erased = await pixels(service, erasedPatch)
    assert.equal(pixel(erased, 24, 24), 0, 'The literal eraser interior must become transparent.')
    assert.equal(pixel(erased, 3, 3), 255, 'The neighboring mask area remains covered.')
    assert.deepEqual(editablePatch(layer(tab, second.id)), editablePatch(second))
    assert.deepEqual(tab.primaryBbox, normal.primaryBbox)
    const undone = await service.undo(tab.id)
    assert.deepEqual(layer(undone, first.id).mask, beforeErase.mask)
    assert.ok(
      (await pixels(service, layer(undone, first.id))).bytes.equals(original.bytes),
      'One Undo restores the complete pre-gesture PNG.',
    )
    const redone = await service.redo(tab.id)
    assert.deepEqual(layer(redone, first.id).mask, erasedPatch.mask)
    assert.ok(
      (await pixels(service, layer(redone, first.id))).bytes.equals(erased.bytes),
      'One Redo restores the complete eraser result.',
    )
  })
})

test('clear preserves mask identity and advances revision once; empty edits are real no-ops', async () => {
  await fixture(async ({ first, service }) => {
    let tab = service.getOpenTabs()[0]
    const empty = await service.editSmartPatchMask(
      tab.id,
      first.id,
      request(tab, first.id, brush(12, 12, 'subtract')),
    )
    assert.deepEqual(empty, tab)
    tab = await service.editSmartPatchMask(
      tab.id,
      first.id,
      request(tab, first.id, brush(12.5, 12.5)),
    )
    const original = layer(tab, first.id)
    const cleared = await service.editSmartPatchMask(
      tab.id,
      first.id,
      request(tab, first.id, { kind: 'clear' }),
    )
    assert.deepEqual(layer(cleared, first.id).mask, { asset: null, id: first.mask.id, revision: 2 })
    assert.equal(layer(cleared, first.id).maskImageUrl, null)
    assert.deepEqual(
      await service.editSmartPatchMask(
        tab.id,
        first.id,
        request(cleared, first.id, { kind: 'clear' }),
      ),
      cleared,
    )
    const restored = await service.undo(tab.id)
    assert.deepEqual(layer(restored, first.id).mask, original.mask)
    assert.equal(pixel(await pixels(service, layer(restored, first.id)), 12, 12), 255)
  })
})

test('stale identities, invalid commands, locked/hidden/missing/Raster targets refuse without any document or file effect', async () => {
  await fixture(async ({ first, raster, savedPath, service }) => {
    const baseline = service.getOpenTabs()[0]
    const input = request(baseline, first.id, brush(24.5, 24.5))
    const saved = await readFile(savedPath)
    for (const change of [
      { documentId: randomUUID() },
      { documentRevision: randomUUID() },
      { maskId: randomUUID() },
      { maskRevision: 1 },
    ]) {
      await assert.rejects(
        service.editSmartPatchMask(baseline.id, first.id, { ...input, ...change }),
        { code: 'EDIT_CONFLICT' },
      )
      assert.deepEqual(service.getOpenTabs()[0], baseline)
    }
    for (const id of [randomUUID(), raster.id]) {
      await assert.rejects(service.editSmartPatchMask(baseline.id, id, input), {
        code: 'PROJECT_LAYER_NOT_FOUND',
      })
    }
    await assert.rejects(
      service.editSmartPatchMask(
        baseline.id,
        first.id,
        request(baseline, first.id, {
          diameter: 0,
          kind: 'brush',
          operation: 'add',
          points: [{ x: 0, y: 0 }],
        }),
      ),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    const enormous: ProjectMaskEdit = {
      kind: 'polygon',
      operation: 'add',
      points: [
        { x: 0, y: 0 },
        { x: 10_000, y: 0 },
        { x: 10_000, y: 10_000 },
      ],
    }
    await assert.rejects(
      service.editSmartPatchMask(baseline.id, first.id, request(baseline, first.id, enormous)),
      { code: 'MASK_LIMIT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], baseline)
    assert.ok(
      (await readFile(savedPath)).equals(saved),
      'Rejected gestures cannot rewrite the saved Project.',
    )
    const locked = await service.updateSmartPatchLayer(baseline.id, first.id, {
      kind: 'lock',
      locked: true,
    })
    await assert.rejects(
      service.editSmartPatchMask(baseline.id, first.id, request(locked, first.id, brush(0, 0))),
      { code: 'PROJECT_LAYER_LOCKED' },
    )
    assert.deepEqual(service.getOpenTabs()[0], locked)
    const unlocked = await service.updateSmartPatchLayer(baseline.id, first.id, {
      kind: 'lock',
      locked: false,
    })
    const hidden = await service.updateSmartPatchLayer(baseline.id, first.id, {
      kind: 'visibility',
      visible: false,
    })
    await assert.rejects(
      service.editSmartPatchMask(baseline.id, first.id, request(hidden, first.id, brush(0, 0))),
      { code: 'PROJECT_LAYER_HIDDEN' },
    )
    assert.deepEqual(service.getOpenTabs()[0], hidden)
    assert.equal(unlocked.documentId, hidden.documentId)
  })
})

test('a saved mask decodes before editing and captures caller input across the real file-read await', async () => {
  await fixture(async ({ first, service }) => {
    let tab = service.getOpenTabs()[0]
    tab = await service.editSmartPatchMask(
      tab.id,
      first.id,
      request(tab, first.id, brush(12.5, 12.5)),
    )
    await service.save(tab.id)
    const current = service.getOpenTabs()[0]
    const input = request(current, first.id, brush(40.5, 12.5))
    const edit = service.editSmartPatchMask(tab.id, first.id, input)
    assert.equal(input.edit.kind, 'brush')
    if (input.edit.kind === 'brush') {
      input.edit.points[0].x = 140.5
    }
    const updated = await edit
    const bitmap = await pixels(service, layer(updated, first.id))
    assert.equal(pixel(bitmap, 40, 12), 255, 'The originally captured point remains authoritative.')
    assert.equal(pixel(bitmap, 140, 12), 0, 'Caller mutation after await cannot move the gesture.')
  })
})

test('mask capabilities are bound to owner, mask revision and document revision without Raster fallback', async () => {
  await fixture(async ({ first, second, service }) => {
    let tab = service.getOpenTabs()[0]
    tab = await service.editSmartPatchMask(
      tab.id,
      first.id,
      request(tab, first.id, brush(12.5, 12.5)),
    )
    const url = layer(tab, first.id).maskImageUrl
    assert.ok(url)
    const resource = parseProjectMaskImageUrl(url)
    assert.ok(resource)
    assert.ok(service.getMaskAsset(resource))
    assert.equal(service.getMaskAsset({ ...resource, layerId: second.id }), null)
    assert.equal(service.getMaskAsset({ ...resource, maskId: second.mask.id }), null)
    assert.equal(service.getMaskAsset({ ...resource, maskRevision: 0 }), null)
    assert.equal(parseProjectMaskImageUrl(url.replace(first.mask.id, second.mask.id)), null)
    tab = await service.updateSmartPatchLayer(tab.id, first.id, {
      kind: 'bounding-box',
      rect: { height: 128, width: 64, x: -30, y: 50 },
    })
    assert.equal(
      service.getMaskAsset(resource),
      null,
      'Even a bbox-only document edit expires the old capability.',
    )
    assert.equal(
      pixel(await pixels(service, layer(tab, first.id)), 12, 12),
      255,
      'A changed bbox does not transform mask pixels.',
    )
  })
})

test('actual local shadow includes painted PNGs and preserves saved bytes until explicit Save', async () => {
  await fixture(async ({ first, savedPath, service, shadow }) => {
    const before = service.getOpenTabs()[0]
    const savedBytes = await readFile(savedPath)
    const painted = await service.editSmartPatchMask(
      before.id,
      first.id,
      request(before, first.id, brush(-15.5, 32.5)),
    )
    await service.flushAutosave(before.id)
    const savedPackage = await readIgsPackage(savedPath)
    const inspection = await shadow.inspect({ projectPath: savedPath, savedPackage })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('The actual dirty shadow was not recoverable.')
    }
    const owned = inspection.document.layers.find((value) => value.id === first.id)
    assert.ok(owned?.kind === 'smart-patch')
    assert.deepEqual(owned.mask, layer(painted, first.id).mask)
    assert.ok(
      (await readFile(savedPath)).equals(savedBytes),
      'Shadow publication must not become implicit Save.',
    )
  })
})

const smallL: ProjectMaskEdit = {
  kind: 'polygon',
  operation: 'add',
  points: [
    { x: 10, y: 20 },
    { x: 16, y: 20 },
    { x: 16, y: 22 },
    { x: 12, y: 22 },
    { x: 12, y: 24 },
    { x: 10, y: 24 },
  ],
}

test('actual Transform targets B, preserves A/bbox/normal/Raster and saves exact rotated alpha with one Undo', async () => {
  await fixture(async ({ first, normal, raster, savedPath, second, service }) => {
    let tab = service.getOpenTabs()[0]
    tab = await service.editSmartPatchMask(tab.id, second.id, request(tab, second.id, smallL))
    const before = layer(tab, second.id)
    const initial = await pixels(service, before)
    tab = await service.editSmartPatchMask(
      tab.id,
      second.id,
      request(tab, second.id, {
        kind: 'transform',
        transform: { rotationDegrees: 90, scaleX: 1, scaleY: 1, x: -12, y: 20 },
      }),
    )
    const moved = layer(tab, second.id)
    assert.equal(moved.mask.revision, before.mask.revision + 1)
    assert.equal(moved.mask.id, before.mask.id)
    assert.deepEqual(moved.boundingBox, before.boundingBox)
    assert.deepEqual(moved.internalResolution, before.internalResolution)
    assert.deepEqual(moved.generationDraft, before.generationDraft)
    assert.deepEqual(editablePatch(layer(tab, first.id)), editablePatch(first))
    assert.deepEqual(tab.primaryBbox, normal.primaryBbox)
    assert.deepEqual(tab.generationDraft, normal.generationDraft)
    const rotated = await pixels(service, moved)
    assert.deepEqual(rotated.bounds, { height: 6, width: 4, x: -16, y: 20 })
    assert.deepEqual(
      [...rotated.alpha],
      [
        255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0,
        0, 255, 255,
      ],
    )
    const undone = await service.undo(tab.id)
    assert.deepEqual(layer(undone, second.id).mask, before.mask)
    assert.ok((await pixels(service, layer(undone, second.id))).bytes.equals(initial.bytes))
    tab = await service.redo(tab.id)
    assert.deepEqual(layer(tab, second.id).mask, moved.mask)
    assert.ok((await pixels(service, layer(tab, second.id))).bytes.equals(rotated.bytes))
    await service.save(tab.id)
    const saved = await readIgsPackage(savedPath)
    assert.ok((await saved.readMember(raster.asset.path)).equals(rasterPng))
    assert.deepEqual(saved.project.layers.find(({ id }) => id === second.id)?.kind, 'smart-patch')
    await service.close(tab.id)
    const reopened = await service.open(tab.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Saved transform must reopen.')
    }
    assert.deepEqual(layer(reopened.tab, second.id).mask, moved.mask)
    assert.ok((await pixels(service, layer(reopened.tab, second.id))).bytes.equals(rotated.bytes))
  })
})

test('actual Fit writes only B bbox with full padding/grid and leaves mask pixels/revision exact through Undo and Save', async () => {
  await fixture(async ({ first, normal, second, service }) => {
    let tab = service.getOpenTabs()[0]
    tab = await service.editSmartPatchMask(tab.id, second.id, request(tab, second.id, smallL))
    const before = layer(tab, second.id)
    const initial = await pixels(service, before)
    tab = await service.editSmartPatchMask(
      tab.id,
      second.id,
      request(tab, second.id, { kind: 'fit-bbox' }),
    )
    const fitted = layer(tab, second.id)
    assert.deepEqual(fitted.boundingBox, { height: 56, width: 56, x: -16, y: -8 })
    assert.deepEqual(fitted.mask, before.mask)
    assert.deepEqual(fitted.internalResolution, before.internalResolution)
    assert.deepEqual(fitted.generationDraft, before.generationDraft)
    assert.deepEqual(tab.primaryBbox, normal.primaryBbox)
    assert.deepEqual(tab.generationDraft, normal.generationDraft)
    assert.deepEqual(editablePatch(layer(tab, first.id)), editablePatch(first))
    assert.ok((await pixels(service, fitted)).bytes.equals(initial.bytes))
    const repeated = await service.editSmartPatchMask(
      tab.id,
      second.id,
      request(tab, second.id, { kind: 'fit-bbox' }),
    )
    assert.equal(repeated.documentRevision, tab.documentRevision)
    assert.equal(repeated.canUndo, tab.canUndo)
    tab = await service.undo(tab.id)
    assert.deepEqual(layer(tab, second.id).boundingBox, before.boundingBox)
    assert.deepEqual(layer(tab, second.id).mask, before.mask)
    tab = await service.redo(tab.id)
    await service.save(tab.id)
    assert.deepEqual(layer(tab, second.id).boundingBox, fitted.boundingBox)
    assert.ok((await pixels(service, layer(tab, second.id))).bytes.equals(initial.bytes))
  })
})

test('Transform and Fit refuse empty/stale/locked/hidden targets or oversize output without document/history/file effects', async () => {
  await fixture(async ({ savedPath, second, service }) => {
    let tab = service.getOpenTabs()[0]
    const identity: ProjectMaskEdit = {
      kind: 'transform',
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 10, y: 20 },
    }
    for (const edit of [identity, { kind: 'fit-bbox' } as const]) {
      const before = structuredClone(tab)
      await assert.rejects(
        service.editSmartPatchMask(tab.id, second.id, request(tab, second.id, edit)),
        { code: 'MASK_INPUT_INVALID' },
      )
      assert.deepEqual(service.getOpenTabs()[0], before)
    }
    tab = await service.editSmartPatchMask(tab.id, second.id, request(tab, second.id, smallL))
    await service.save(tab.id)
    const saved = await readFile(savedPath)
    const noOp = await service.editSmartPatchMask(
      tab.id,
      second.id,
      request(tab, second.id, identity),
    )
    assert.equal(noOp.documentRevision, tab.documentRevision)
    assert.deepEqual(layer(noOp, second.id).mask, layer(tab, second.id).mask)
    const stale = request(tab, second.id, { kind: 'fit-bbox' })
    tab = await service.updateSmartPatchLayer(tab.id, second.id, {
      kind: 'opacity',
      opacity: 0.6,
    })
    const before = structuredClone(tab)
    await assert.rejects(service.editSmartPatchMask(tab.id, second.id, stale), {
      code: 'EDIT_CONFLICT',
    })
    await assert.rejects(
      service.editSmartPatchMask(
        tab.id,
        second.id,
        request(tab, second.id, {
          kind: 'transform',
          transform: { rotationDegrees: 0, scaleX: 10_000, scaleY: 1, x: 0, y: 0 },
        }),
      ),
      { code: 'MASK_LIMIT' },
    )
    assert.deepEqual(service.getOpenTabs()[0], before)
    assert.ok((await readFile(savedPath)).equals(saved))
    for (const [change, code] of [
      [{ kind: 'lock', locked: true }, 'PROJECT_LAYER_LOCKED'],
      [{ kind: 'visibility', visible: false }, 'PROJECT_LAYER_HIDDEN'],
    ] as const) {
      tab = await service.updateSmartPatchLayer(tab.id, second.id, change)
      const blocked = structuredClone(tab)
      for (const edit of [identity, { kind: 'fit-bbox' } as const]) {
        await assert.rejects(
          service.editSmartPatchMask(tab.id, second.id, request(tab, second.id, edit)),
          { code },
        )
        assert.deepEqual(service.getOpenTabs()[0], blocked)
      }
      tab = await service.updateSmartPatchLayer(
        tab.id,
        second.id,
        change.kind === 'lock'
          ? { kind: 'lock', locked: false }
          : { kind: 'visibility', visible: true },
      )
    }
    assert.ok((await readFile(savedPath)).equals(saved))
  })
})

test('actual integer translation retains a valid imported split-IDAT PNG byte-for-byte across Save/reopen', async () => {
  await fixture(async ({ savedPath, second, service }) => {
    let tab = service.getOpenTabs()[0]
    tab = await service.editSmartPatchMask(tab.id, second.id, request(tab, second.id, smallL))
    await service.save(tab.id)
    const original = await pixels(service, layer(tab, second.id))
    await service.close(tab.id)
    const seed = await readIgsPackage(savedPath)
    const compressedLength = original.bytes.readUInt32BE(33)
    assert.equal(original.bytes.toString('ascii', 37, 41), 'IDAT')
    const compressed = original.bytes.subarray(41, 41 + compressedLength)
    const makeChunk = (payload: Buffer) => {
      const chunk = Buffer.alloc(payload.length + 12)
      chunk.writeUInt32BE(payload.length, 0)
      chunk.write('IDAT', 4, 'ascii')
      payload.copy(chunk, 8)
      chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4)
      return chunk
    }
    const divided = Buffer.concat([
      original.bytes.subarray(0, 33),
      makeChunk(compressed.subarray(0, Math.floor(compressed.length / 2))),
      makeChunk(compressed.subarray(Math.floor(compressed.length / 2))),
      original.bytes.subarray(41 + compressedLength + 4),
    ])
    assert.ok(!divided.equals(original.bytes))
    const hash = digest(divided)
    const oldPatch = seed.project.layers.find(({ id }) => id === second.id)
    assert.ok(oldPatch?.kind === 'smart-patch' && oldPatch.mask.asset)
    const maskBounds = oldPatch.mask.bounds
    const maskAsset = {
      ...oldPatch.mask.asset,
      bytes: divided.length,
      path: `assets/masks/${oldPatch.mask.id}/${hash}.png`,
      sha256: hash,
    }
    const assets: Record<string, { bytes: Buffer }> = {}
    for (const member of seed.manifest.members) {
      if (member.path.startsWith('assets/') && member.path !== oldPatch.mask.asset.path) {
        assets[member.path] = { bytes: await seed.readMember(member.path) }
      }
    }
    assets[maskAsset.path] = { bytes: divided }
    await saveIgsPackage(savedPath, {
      assets,
      preview: {
        merged: await seed.readMember('preview/merged.png'),
        rect: seed.manifest.preview.rect,
        status: 'unavailable',
        thumbnail: await seed.readMember('preview/thumbnail.webp'),
      },
      project: {
        ...seed.project,
        documentRevision: randomUUID(),
        layers: seed.project.layers.map((value) =>
          value.id === second.id
            ? {
                ...oldPatch,
                mask: {
                  asset: maskAsset,
                  bounds: maskBounds,
                  id: oldPatch.mask.id,
                  revision: oldPatch.mask.revision,
                },
              }
            : value,
        ),
      },
    })
    const opened = await service.open(tab.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Declared valid imported mask must open.')
    }
    tab = opened.tab
    assert.ok((await pixels(service, layer(tab, second.id))).bytes.equals(divided))
    tab = await service.editSmartPatchMask(
      tab.id,
      second.id,
      request(tab, second.id, {
        kind: 'transform',
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -16, y: 22 },
      }),
    )
    const translated = layer(tab, second.id)
    assert.deepEqual(translated.mask.asset, maskAsset)
    assert.deepEqual((await pixels(service, translated)).bounds, {
      height: 4,
      width: 6,
      x: -16,
      y: 22,
    })
    assert.ok(
      (await pixels(service, translated)).bytes.equals(divided),
      'Valid source compression/chunking must remain exact during translation.',
    )
    await service.save(tab.id)
    await service.close(tab.id)
    const reopened = await service.open(tab.id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind !== 'opened') {
      throw new Error('Moved imported PNG must reopen.')
    }
    assert.ok((await pixels(service, layer(reopened.tab, second.id))).bytes.equals(divided))
  })
})
