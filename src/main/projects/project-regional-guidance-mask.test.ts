import type {
  ProjectRegionalGuidanceLayerView,
  ProjectRegionalGuidanceMaskEditRequest,
  ProjectTab,
} from '../../shared/api.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import {
  IGS_MIMETYPE,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  projectAssetReferences,
  projectMaskAssets,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import test from 'node:test'
import * as yazl from 'yazl'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectMaskImageUrl } from './project-mask-resource.js'
import { decodeProjectMaskPng, readProjectMaskSource } from './project-mask.js'
import { parseProjectRegionalMaskImageUrl } from './project-regional-mask-resource.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  fixtureMaskPng,
  invalidMaskRgbFixture,
  paintedPatchFixture,
} from './test-fixtures/project-mask.js'

const rasterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type Edit = ProjectRegionalGuidanceMaskEditRequest['edit']
type Coordinator = NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>

interface Fixture {
  a: string
  b: string
  co: () => Coordinator
  document: () => IgsProjectDocumentV1
  restart: () => ProjectService
  root: string
  savedPath: string
  service: ProjectService
  setAfterSave: (hook?: ProjectAutosaveOptions['afterSaveCommit']) => void
  setBeforeEdit: (hook?: ProjectAutosaveOptions['beforeEditCommit']) => void
  shadow: ProjectShadowStore
  smartId: string
  tab: () => ProjectTab
}

/**
 * Real public service/SQLite/coordinator/shadow/ZIP. Only fixture pixels and timing seams are
 * controlled.
 */
async function withProject(run: (f: Fixture) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-regional-mask-'))
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
        beforeEditCommit: async (document) => beforeEdit?.(document),
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
  try {
    let tab = await service.create({ height: 256, title: 'Durable regional masks', width: 256 })
    const co = () => service.getOpenDocumentForAcceptance(tab.id)!
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
      name: 'Protected Raster',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 11, y: -19 },
      visible: true,
    }
    const smart = paintedPatchFixture(co().document)
    assert.ok(smart.mask.asset)
    await co().applyDocument(
      { ...co().document, layers: [raster, smart] },
      {
        [raster.asset.path]: { bytes: rasterPng },
        [smart.mask.asset.path]: { bytes: fixtureMaskPng() },
      },
    )
    tab = service.getOpenTabs().find(({ id }) => id === tab.id)!
    tab = await service.addRegionalGuidance(tab.id, owner(tab))
    tab = await service.addRegionalGuidance(tab.id, owner(tab))
    const [a, b] = tab.regionalGuidance!
    tab = await service.updateRegionalGuidancePrompt(
      tab.id,
      { ...owner(tab), regionId: a.id },
      { kind: 'block', polarity: 'positive', present: true },
    )
    tab = await service.updateRegionalGuidancePrompt(
      tab.id,
      { ...owner(tab), regionId: a.id },
      { kind: 'text', polarity: 'positive', text: 'Preserved regional prompt' },
    )
    await service.save(tab.id)
    const savedPath = co().filePath
    await service.close(tab.id)
    assert.equal((await service.open(tab.id)).kind, 'opened')
    await run({
      a: a.id,
      b: b.id,
      co,
      document: () => co().document,
      restart,
      root,
      savedPath,
      service,
      setAfterSave: (hook) => {
        afterSave = hook
      },
      setBeforeEdit: (hook) => {
        beforeEdit = hook
      },
      shadow,
      smartId: smart.id,
      tab: () => service.getOpenTabs().find(({ id }) => id === tab.id)!,
    })
  } finally {
    beforeEdit = undefined
    afterSave = undefined
    for (const service of services.reverse()) {
      for (const tab of service.getOpenTabs()) {
        await service.discardAndClose(tab.id)
      }
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

const owner = (tab: ProjectTab) => ({
  documentId: tab.documentId,
  documentRevision: tab.documentRevision,
})
function region(tab: ProjectTab, id: string): ProjectRegionalGuidanceLayerView {
  const result = tab.regionalGuidance?.find((r) => r.id === id)
  assert.ok(result)
  return result
}
function request(tab: ProjectTab, id: string, edit: Edit): ProjectRegionalGuidanceMaskEditRequest {
  const { mask } = region(tab, id)
  return { ...owner(tab), edit, maskId: mask.id, maskRevision: mask.revision }
}
const brush = (
  x: number,
  y: number,
  operation: 'add' | 'subtract' = 'add',
  diameter = 1,
): Edit => ({ diameter, kind: 'brush', operation, points: [{ x, y }] })
const square: Edit = {
  kind: 'polygon',
  operation: 'add',
  points: [
    { x: -8, y: -4 },
    { x: -4, y: -4 },
    { x: -4, y: -2 },
    { x: -8, y: -2 },
  ],
}
async function edit(f: Fixture, id: string, operation: Edit) {
  return f.service.editRegionalGuidanceMask(f.tab().id, id, request(f.tab(), id, operation))
}
async function pixels(service: ProjectService, value: ProjectRegionalGuidanceLayerView) {
  assert.ok(value.mask.asset && value.maskImageUrl)
  const capability = parseProjectRegionalMaskImageUrl(value.maskImageUrl)
  assert.ok(capability)
  const resource = service.getRegionalMaskAsset(capability)
  assert.ok(resource)
  const bytes =
    resource.kind === 'staged'
      ? await readProjectMaskSource(resource.source, resource.member)
      : await (await readIgsPackage(resource.filePath)).readMember(resource.member.path)
  assert.equal(digest(bytes), value.mask.asset.sha256)
  return { alpha: decodeProjectMaskPng(bytes, value.mask.asset), bounds: value.mask.bounds, bytes }
}
function pixel(value: Awaited<ReturnType<typeof pixels>>, x: number, y: number) {
  const column = x - value.bounds.x
  const row = y - value.bounds.y
  return column < 0 || row < 0 || column >= value.bounds.width || row >= value.bounds.height
    ? 0
    : value.alpha[row * value.bounds.width + column]
}
function withoutRegionMasks(document: IgsProjectDocumentV1) {
  return {
    ...document,
    documentRevision: null,
    regionalGuidance: document.regionalGuidance?.map(({ mask: _mask, ...region }) => region),
  }
}
function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('regional CPU tools edit only the captured mask at negative world coordinates with exact transforms and one Undo per gesture', async () => {
  await withProject(async (f) => {
    const baseline = structuredClone(f.document())
    const saved = await readFile(f.savedPath)
    const untouched = structuredClone(region(f.tab(), f.b))
    const tab = await edit(f, f.a, square)
    const painted = region(tab, f.a)
    const value = await pixels(f.service, painted)
    assert.deepEqual(value.bounds, { height: 2, width: 4, x: -8, y: -4 })
    assert.ok(
      Buffer.from(value.alpha).equals(Buffer.from([255, 255, 255, 255, 255, 255, 255, 255])),
    )
    assert.equal(painted.mask.revision, 1)
    assert.deepEqual(withoutRegionMasks(f.document()), withoutRegionMasks(baseline))
    assert.deepEqual(region(tab, f.b), untouched)
    assert.ok((await readFile(f.savedPath)).equals(saved))
    await f.service.undo(tab.id)
    assert.deepEqual(f.document(), baseline)
    await f.service.redo(tab.id)
    assert.ok((await pixels(f.service, region(f.tab(), f.a))).bytes.equals(value.bytes))
    const brushed = await edit(f, f.a, brush(-2.5, -3.5))
    assert.equal(pixel(await pixels(f.service, region(brushed, f.a)), -3, -4), 255)
    const erased = await edit(f, f.a, brush(-2.5, -3.5, 'subtract', 2))
    const beforeMove = await pixels(f.service, region(erased, f.a))
    assert.equal(pixel(beforeMove, -3, -4), 0)
    assert.equal(pixel(beforeMove, -8, -4), 255)
    const moved = await edit(f, f.a, {
      kind: 'transform',
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 12, y: -14 },
    })
    const translated = await pixels(f.service, region(moved, f.a))
    assert.deepEqual(translated.bounds, { ...beforeMove.bounds, x: 12, y: -14 })
    assert.ok(
      translated.bytes.equals(beforeMove.bytes),
      'Integer translation retains immutable PNG bytes.',
    )
    const rotated = await edit(f, f.a, {
      kind: 'transform',
      transform: { rotationDegrees: 90, scaleX: 1, scaleY: 1, x: 12, y: -14 },
    })
    const quarter = await pixels(f.service, region(rotated, f.a))
    assert.deepEqual(quarter.bounds, {
      height: translated.bounds.width,
      width: translated.bounds.height,
      x: 12 - translated.bounds.height,
      y: -14,
    })
    for (let row = 0; row < translated.bounds.height; row++) {
      for (let column = 0; column < translated.bounds.width; column++) {
        assert.equal(
          quarter.alpha[column * quarter.bounds.width + translated.bounds.height - 1 - row],
          translated.alpha[row * translated.bounds.width + column],
        )
      }
    }
    assert.deepEqual(withoutRegionMasks(f.document()), withoutRegionMasks(baseline))
  })
})

test('regional no-op clear and subtract preserve revision/history; clear is canonical and full Undo/Redo retains exact bytes', async () => {
  await withProject(async (f) => {
    const initial = structuredClone(f.document())
    for (const operation of [{ kind: 'clear' } as const, brush(100, 100, 'subtract')]) {
      await edit(f, f.a, operation)
      assert.deepEqual(f.document(), initial)
      assert.equal(f.tab().canUndo, false)
    }
    await edit(f, f.a, square)
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const before = structuredClone(f.document())
    const original = await pixels(f.service, region(f.tab(), f.a))
    await edit(f, f.a, {
      kind: 'transform',
      transform: {
        rotationDegrees: 360,
        scaleX: 1,
        scaleY: 1,
        x: original.bounds.x,
        y: original.bounds.y,
      },
    })
    await edit(f, f.a, brush(100, 100, 'subtract'))
    assert.deepEqual(f.document(), before)
    assert.equal(f.tab().canUndo, false)
    const cleared = await edit(f, f.a, { kind: 'clear' })
    assert.deepEqual(region(cleared, f.a).mask, {
      asset: null,
      id: region(cleared, f.a).mask.id,
      revision: 2,
    })
    assert.equal(Object.hasOwn(region(cleared, f.a), 'maskImageUrl'), false)
    await f.service.save(cleared.id)
    assert.equal(
      (await readIgsPackage(f.savedPath)).manifest.members.some(
        ({ path }) =>
          path === before.regionalGuidance?.find((item) => item.id === f.a)?.mask.asset?.path,
      ),
      false,
    )
    await f.service.undo(cleared.id)
    assert.ok((await pixels(f.service, region(f.tab(), f.a))).bytes.equals(original.bytes))
    await f.service.save(cleared.id)
    await f.service.redo(cleared.id)
    assert.equal(region(f.tab(), f.a).mask.asset, null)
    await f.service.save(cleared.id)
    const reopened = await readIgsPackage(f.savedPath)
    assert.deepEqual(reopened.project.regionalGuidance, f.document().regionalGuidance)
  })
})

// Mutation target: duplicateRegionalGuidance's new mask memberPath. Reusing source.mask.asset.path
// or omitting regional assets from a collector must fail this real Save/reopen case.
test('regional duplicate mutation boundary: fresh owned mask path survives source clear, delete, Undo and portable reopen', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    const source = structuredClone(region(f.tab(), f.a))
    assert.ok(source.mask.asset)
    const original = await pixels(f.service, source)
    const duplicated = await f.service.duplicateRegionalGuidance(f.tab().id, {
      ...owner(f.tab()),
      regionId: f.a,
    })
    const copy = duplicated.regionalGuidance![1]
    assert.ok(copy.mask.asset)
    assert.notEqual(copy.id, source.id)
    assert.notEqual(copy.mask.id, source.mask.id)
    assert.equal(copy.mask.revision, 1)
    assert.equal(
      copy.mask.asset.path,
      `assets/masks/${copy.mask.id}/${source.mask.asset.sha256}.png`,
    )
    assert.notEqual(copy.mask.asset.path, source.mask.asset.path)
    assert.deepEqual(copy.prompts, source.prompts)
    assert.ok((await pixels(f.service, copy)).bytes.equals(original.bytes))
    await edit(f, f.a, { kind: 'clear' })
    const deleting = await f.service.deleteRegionalGuidance(f.tab().id, {
      ...owner(f.tab()),
      regionId: copy.id,
    })
    assert.equal(
      deleting.regionalGuidance?.some(({ id }) => id === copy.id),
      false,
    )
    await f.service.save(deleting.id)
    await f.service.undo(deleting.id)
    assert.ok((await pixels(f.service, region(f.tab(), copy.id))).bytes.equals(original.bytes))
    await f.service.save(deleting.id)
    const saved = await readIgsPackage(f.savedPath)
    const storedCopy = saved.project.regionalGuidance!.find(({ id }) => id === copy.id)!
    assert.ok(storedCopy.mask.asset)
    assert.ok((await saved.readMember(storedCopy.mask.asset.path)).equals(original.bytes))
    assert.equal(
      saved.manifest.members.some(({ path }) => path === source.mask.asset!.path),
      false,
    )
    assert.equal(
      saved.manifest.members.some(({ path }) => path === copy.mask.asset!.path),
      true,
    )
    const expected = structuredClone(f.document())
    await f.service.close(deleting.id)
    const reopened = await f.service.open(deleting.id)
    assert.equal(reopened.kind, 'opened')
    assert.deepEqual(f.document(), expected)
    assert.ok((await pixels(f.service, region(f.tab(), copy.id))).bytes.equals(original.bytes))
  })
})

test('regional duplicate neighbor: empty cleared source gets fresh empty revision zero and detached prompts', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    await edit(f, f.a, { kind: 'clear' })
    const source = region(f.tab(), f.a)
    const duplicated = await f.service.duplicateRegionalGuidance(f.tab().id, {
      ...owner(f.tab()),
      regionId: f.a,
    })
    const copy = duplicated.regionalGuidance![1]
    assert.deepEqual(copy.mask, { asset: null, id: copy.mask.id, revision: 0 })
    assert.notEqual(copy.mask.id, source.mask.id)
    copy.prompts!.positive!.text = 'DTO mutation'
    assert.equal(region(f.tab(), f.a).prompts!.positive!.text, 'Preserved regional prompt')
    assert.equal(region(f.tab(), copy.id).prompts!.positive!.text, 'Preserved regional prompt')
    await f.service.save(duplicated.id)
    assert.equal((await readIgsPackage(f.savedPath)).project.regionalGuidance![1].mask.asset, null)
  })
})

test('regional malformed, Fit, crossed, stale, locked and over-limit edits refuse without document/history/package effects; disabled authoring works', async () => {
  await withProject(async (f) => {
    const initial = structuredClone(f.document())
    const saved = await readFile(f.savedPath)
    const valid = request(f.tab(), f.a, square)
    const smart = f.tab().layers.find(({ id }) => id === f.smartId)
    assert.ok(smart?.kind === 'smart-patch')
    const raster = f.tab().layers.find((layer) => layer.kind !== 'smart-patch')
    assert.ok(raster)
    for (const [id, input, code] of [
      [f.a, { ...valid, edit: { kind: 'fit-bbox' } }, 'PROJECT_INVALID_INPUT'],
      [f.a, { ...valid, sourcePath: '/outside' }, 'PROJECT_INVALID_INPUT'],
      [f.a, { ...valid, edit: { ...square, ignored: true } }, 'PROJECT_INVALID_INPUT'],
      [f.a, { ...valid, documentId: randomUUID() }, 'EDIT_CONFLICT'],
      [f.a, { ...valid, documentRevision: randomUUID() }, 'EDIT_CONFLICT'],
      [f.a, { ...valid, maskId: randomUUID() }, 'EDIT_CONFLICT'],
      [f.a, { ...valid, maskRevision: 1 }, 'EDIT_CONFLICT'],
      [f.b, valid, 'EDIT_CONFLICT'],
      [raster.id, valid, 'PROJECT_LAYER_NOT_FOUND'],
      [
        f.smartId,
        { ...valid, maskId: smart.mask.id, maskRevision: smart.mask.revision },
        'PROJECT_LAYER_NOT_FOUND',
      ],
      [randomUUID(), valid, 'PROJECT_LAYER_NOT_FOUND'],
      [f.a, { ...valid, edit: brush(PROJECT_MASK_MAX_COORDINATE, 0, 'add', 512) }, 'MASK_LIMIT'],
      [
        f.a,
        {
          ...valid,
          edit: {
            kind: 'transform',
            transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          },
        },
        'MASK_INPUT_INVALID',
      ],
    ] as const) {
      await assert.rejects(
        f.service.editRegionalGuidanceMask(
          f.tab().id,
          id,
          input as ProjectRegionalGuidanceMaskEditRequest,
        ),
        { code },
      )
      assert.deepEqual(f.document(), initial)
      assert.equal(f.tab().canUndo, false)
      assert.ok((await readFile(f.savedPath)).equals(saved))
    }
    await f.service.updateRegionalGuidance(
      f.tab().id,
      { ...owner(f.tab()), regionId: f.a },
      { kind: 'lock', locked: true },
    )
    const locked = structuredClone(f.document())
    await assert.rejects(edit(f, f.a, square), { code: 'PROJECT_LAYER_LOCKED' })
    assert.deepEqual(f.document(), locked)
    await f.service.updateRegionalGuidance(
      f.tab().id,
      { ...owner(f.tab()), regionId: f.a },
      { kind: 'lock', locked: false },
    )
    await f.service.updateRegionalGuidance(
      f.tab().id,
      { ...owner(f.tab()), regionId: f.a },
      { enabled: false, kind: 'enabled' },
    )
    await f.service.updateRegionalGuidance(
      f.tab().id,
      { ...owner(f.tab()), regionId: f.a },
      { kind: 'overlay-opacity', overlayOpacity: 0 },
    )
    const disabled = await edit(f, f.a, square)
    assert.ok(region(disabled, f.a).mask.asset)
    assert.equal(region(disabled, f.a).enabled, false)
    assert.equal(region(disabled, f.a).overlayOpacity, 0)
  })
})

test('regional staged publication rejects edit/Undo ABA and lock without phantom mask history or published assets', async () => {
  for (const interference of ['aba', 'lock'] as const) {
    await withProject(async (f) => {
      const initial = structuredClone(f.document())
      const entered = deferred()
      const release = deferred()
      f.setBeforeEdit(async (candidate) => {
        if (candidate.regionalGuidance?.find(({ id }) => id === f.a)?.mask.asset) {
          entered.release()
          await release.promise
        }
      })
      const editing = edit(f, f.a, square)
      const refused = assert.rejects(editing, { code: 'EDIT_CONFLICT' })
      await entered.promise
      let expected: IgsProjectDocumentV1
      try {
        if (interference === 'aba') {
          await f.service.updateGenerationDraft(f.tab().id, {
            kind: 'positive-prompt',
            text: 'ABA interference',
          })
          await f.service.undo(f.tab().id)
          assert.equal(f.document().documentRevision, initial.documentRevision)
        } else {
          await f.service.updateRegionalGuidance(
            f.tab().id,
            { ...owner(f.tab()), regionId: f.a },
            { kind: 'lock', locked: true },
          )
        }
        expected = structuredClone(f.document())
      } finally {
        release.release()
      }
      await refused
      f.setBeforeEdit()
      assert.deepEqual(f.document(), expected!)
      assert.equal(region(f.tab(), f.a).mask.asset, null)
      if (interference === 'aba') {
        assert.equal(f.tab().canUndo, false)
        assert.equal(f.tab().canRedo, true)
      } else {
        await f.service.undo(f.tab().id)
        assert.deepEqual(f.document(), initial)
      }
    })
  }
})

test('regional staged caller snapshots stay detached and a closed coordinator cannot publish into reopened owner', async () => {
  await withProject(async (f) => {
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async () => {
      entered.release()
      await release.promise
    })
    const input = request(f.tab(), f.a, brush(-6.5, -3.5))
    const editing = f.service.editRegionalGuidanceMask(f.tab().id, f.a, input)
    await entered.promise
    input.maskId = randomUUID()
    if (input.edit.kind === 'brush') {
      input.edit.points[0].x = 90.5
    }
    release.release()
    await editing
    f.setBeforeEdit()
    const value = await pixels(f.service, region(f.tab(), f.a))
    assert.equal(pixel(value, -7, -4), 255)
    assert.equal(pixel(value, 90, -4), 0)
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const initial = structuredClone(f.document())
    const held = deferred()
    const resume = deferred()
    f.setBeforeEdit(async () => {
      held.release()
      await resume.promise
    })
    const closingId = f.tab().id
    const stale = edit(f, f.b, square)
    const refused = assert.rejects(stale, (error: unknown) =>
      Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['COORDINATOR_CLOSED', 'EDIT_CONFLICT'].includes(String(error.code)),
      ),
    )
    await held.promise
    try {
      await f.service.close(closingId)
      assert.equal((await f.service.open(closingId)).kind, 'opened')
    } finally {
      resume.release()
    }
    await refused
    f.setBeforeEdit()
    assert.deepEqual(f.document(), initial)
    assert.equal(f.tab().canUndo, false)
  })
})

test('regional nonempty duplicate rechecks its source owner after staging and refuses a concurrent lock without a phantom copy', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const before = structuredClone(f.document())
    const entered = deferred()
    const release = deferred()
    f.setBeforeEdit(async (candidate) => {
      if (candidate.regionalGuidance!.length === 3) {
        entered.release()
        await release.promise
      }
    })
    const duplicating = f.service.duplicateRegionalGuidance(f.tab().id, {
      ...owner(f.tab()),
      regionId: f.a,
    })
    const refused = assert.rejects(duplicating, { code: 'EDIT_CONFLICT' })
    await entered.promise
    try {
      await f.service.updateRegionalGuidance(
        f.tab().id,
        { ...owner(f.tab()), regionId: f.a },
        { kind: 'lock', locked: true },
      )
    } finally {
      release.release()
    }
    await refused
    f.setBeforeEdit()
    assert.equal(f.document().regionalGuidance!.length, 2)
    await f.service.undo(f.tab().id)
    assert.deepEqual(f.document(), before)
  })
})

test('regional Save A and later mask B retain separate immutable package and recoverable coverage', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    const a = await pixels(f.service, region(f.tab(), f.a))
    const aDocument = structuredClone(f.document())
    const committed = deferred()
    const release = deferred()
    f.setAfterSave(async () => {
      committed.release()
      await release.promise
    })
    const id = f.tab().id
    const saving = f.service.save(id)
    await committed.promise
    let b!: Awaited<ReturnType<typeof pixels>>
    try {
      const savedA = await readIgsPackage(f.savedPath)
      assert.deepEqual(savedA.project.regionalGuidance, aDocument.regionalGuidance)
      await edit(f, f.a, brush(-1.5, -3.5))
      b = await pixels(f.service, region(f.tab(), f.a))
      await f.service.flushAutosave(id)
    } finally {
      release.release()
    }
    const outcome = await saving
    f.setAfterSave()
    assert.equal(outcome.tab.dirty, true)
    const saved = await readIgsPackage(f.savedPath)
    const maskA = saved.project.regionalGuidance!.find(({ id }) => id === f.a)!.mask
    assert.ok(maskA.asset)
    assert.ok((await saved.readMember(maskA.asset.path)).equals(a.bytes))
    const inspection = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('Mask B must survive Save A.')
    }
    const maskB = inspection.document.regionalGuidance!.find(({ id }) => id === f.a)!.mask
    assert.ok(maskB.asset)
    assert.ok(
      (await readProjectMaskSource(inspection.dirtyAssets[maskB.asset.path], maskB.asset)).equals(
        b.bytes,
      ),
    )
    assert.notEqual(maskA.asset.sha256, maskB.asset.sha256)
    await f.service.undo(id)
    assert.ok((await pixels(f.service, region(f.tab(), f.a))).bytes.equals(a.bytes))
  })
})

test('regional saved PNG read captures caller input, resources bind exact owner, and dirty shadow recovers masks with unchanged saved package', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    await f.service.save(f.tab().id)
    const id = f.tab().id
    await f.service.close(id)
    assert.equal((await f.service.open(id)).kind, 'opened')
    const originalPackage = await readFile(f.savedPath)
    const before = structuredClone(f.document())
    const oldRegional = parseProjectRegionalMaskImageUrl(region(f.tab(), f.a).maskImageUrl!)!
    const smart = f.tab().layers.find(({ id }) => id === f.smartId)
    assert.ok(smart?.kind === 'smart-patch')
    const smartCapability = parseProjectMaskImageUrl(smart.maskImageUrl!)!
    assert.equal(
      f.service.getMaskAsset({ ...smartCapability, layerId: f.a, maskId: oldRegional.maskId }),
      null,
    )
    assert.equal(
      f.service.getRegionalMaskAsset({
        ...oldRegional,
        maskId: smart.mask.id,
        regionId: f.smartId,
      }),
      null,
    )
    const input = request(f.tab(), f.a, brush(-1.5, -3.5))
    const editing = f.service.editRegionalGuidanceMask(id, f.a, input)
    if (input.edit.kind === 'brush') {
      input.edit.points[0].x = 90.5
    }
    await editing
    const aPixels = await pixels(f.service, region(f.tab(), f.a))
    assert.equal(pixel(aPixels, -2, -4), 255)
    assert.equal(pixel(aPixels, 90, -4), 0)
    assert.equal(f.service.getRegionalMaskAsset(oldRegional), null)
    await edit(f, f.b, brush(20.5, -9.5))
    const bPixels = await pixels(f.service, region(f.tab(), f.b))
    const expected = structuredClone(f.document())
    await f.service.flushAutosave(id)
    const saved = await readIgsPackage(f.savedPath)
    const inspection = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      throw new Error('Painted regional masks require recoverable assets.')
    }
    assert.deepEqual(inspection.document, expected)
    for (const [regionId, bitmap] of [
      [f.a, aPixels],
      [f.b, bPixels],
    ] as const) {
      const mask = expected.regionalGuidance!.find(({ id }) => id === regionId)!.mask
      assert.ok(mask.asset)
      assert.ok(
        (await readProjectMaskSource(inspection.dirtyAssets[mask.asset.path], mask.asset)).equals(
          bitmap.bytes,
        ),
      )
    }
    assert.ok((await readFile(f.savedPath)).equals(originalPackage))
    const restarted = f.restart()
    assert.equal((await restarted.open(id)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(id, 'recover')
    assert.equal(recovered.canUndo, false)
    assert.equal(recovered.dirty, true)
    const recoveredDocument = restarted.getOpenDocumentForAcceptance(id)!.document
    assert.deepEqual(recoveredDocument.regionalGuidance, expected.regionalGuidance)
    assert.deepEqual(recoveredDocument.layers, before.layers)
    assert.ok((await pixels(restarted, region(recovered, f.a))).bytes.equals(aPixels.bytes))
    assert.ok((await pixels(restarted, region(recovered, f.b))).bytes.equals(bPixels.bytes))
    assert.ok((await readFile(f.savedPath)).equals(originalPackage))
    await restarted.save(id)
    const portable = await readIgsPackage(f.savedPath)
    assert.deepEqual(portable.project.regionalGuidance, expected.regionalGuidance)
    assert.equal(
      portable.manifest.members.filter(({ path }) => path.startsWith('assets/masks/')).length,
      3,
    )
    assert.equal(projectMaskAssets(portable.project).length, 3)
    assert.equal(projectAssetReferences(portable.project).length, 4)
    const raw = JSON.parse(
      (await portable.readMember('project.json')).toString('utf8'),
    ) as IgsProjectDocumentV1
    assert.equal(
      raw.regionalGuidance!.some((value) => Object.hasOwn(value, 'maskImageUrl')),
      false,
    )
    await restarted.close(id)
    const reopened = await restarted.open(id)
    assert.equal(reopened.kind, 'opened')
    if (reopened.kind === 'opened') {
      assert.ok((await pixels(restarted, region(reopened.tab, f.b))).bytes.equals(bPixels.bytes))
    }
  })
})

test('regional polygon subtract and baked scaling preserve neighbors; over-limit transforms and controlled staging failures publish nothing', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    const scaled = await edit(f, f.a, {
      kind: 'transform',
      transform: { rotationDegrees: 0, scaleX: 2, scaleY: 2, x: -8, y: -4 },
    })
    const doubled = await pixels(f.service, region(scaled, f.a))
    assert.deepEqual(doubled.bounds, { height: 4, width: 8, x: -8, y: -4 })
    assert.ok(Buffer.from(doubled.alpha).equals(Buffer.alloc(32, 255)))
    await edit(f, f.a, {
      kind: 'polygon',
      operation: 'subtract',
      points: [
        { x: -6, y: -4 },
        { x: -4, y: -4 },
        { x: -4, y: 0 },
        { x: -6, y: 0 },
      ],
    })
    const cut = await pixels(f.service, region(f.tab(), f.a))
    assert.equal(pixel(cut, -5, -3), 0)
    assert.equal(pixel(cut, -8, -3), 255)
    const before = structuredClone(f.document())
    await assert.rejects(
      edit(f, f.a, {
        kind: 'transform',
        transform: { rotationDegrees: 45, scaleX: 10_000, scaleY: 10_000, x: -8, y: -4 },
      }),
      { code: 'MASK_LIMIT' },
    )
    assert.deepEqual(f.document(), before)
    f.setBeforeEdit(async () => {
      throw new Error('Controlled regional source publication refusal')
    })
    await assert.rejects(edit(f, f.b, square), /Controlled regional source publication refusal/)
    f.setBeforeEdit()
    assert.deepEqual(f.document(), before)
    await f.service.undo(f.tab().id)
    assert.ok((await pixels(f.service, region(f.tab(), f.a))).bytes.equals(doubled.bytes))
  })
})

/** Deliberately malformed ZIP fixture: rewrite matching hashes so only mask pixel semantics refuse. */
async function invalidRegionalPackage(source: string, destination: string, regionId: string) {
  const archive = await readIgsPackage(source)
  const document = structuredClone(archive.project)
  document.documentRevision = randomUUID()
  const region = document.regionalGuidance!.find(({ id }) => id === regionId)!
  assert.ok(region.mask.asset)
  const previousPath = region.mask.asset.path
  const bytes = invalidMaskRgbFixture()
  const asset = {
    bytes: bytes.length,
    height: 2,
    path: `assets/masks/${region.mask.id}/${digest(bytes)}.png`,
    sha256: digest(bytes),
    width: 2,
  }
  region.mask = {
    asset,
    bounds: { height: 2, width: 2, x: -8, y: -4 },
    id: region.mask.id,
    revision: region.mask.revision,
  }
  const members = new Map<string, Buffer>()
  for (const member of archive.manifest.members) {
    if (member.path !== previousPath) {
      members.set(member.path, await archive.readMember(member.path))
    }
  }
  members.set('project.json', Buffer.from(JSON.stringify(document)))
  members.set(asset.path, bytes)
  const manifest = {
    ...archive.manifest,
    documentRevision: document.documentRevision,
    members: [...members].map(([path, bytes]) => ({
      bytes: bytes.length,
      path,
      sha256: digest(bytes),
    })),
  }
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(IGS_MIMETYPE), 'mimetype', { compress: false })
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json', { compress: false })
  for (const [path, bytes] of members) {
    zip.addBuffer(bytes, path, { compress: false })
  }
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(destination, { flags: 'wx' }))
  return { asset, bytes, document }
}

test('regional actual package loader, saved-mask edit and shadow reject hash-consistent invalid coverage without publishing edits', async () => {
  await withProject(async (f) => {
    await edit(f, f.a, square)
    await f.service.save(f.tab().id)
    const original = await readFile(f.savedPath)
    const before = structuredClone(f.document())
    const malformed = path.join(f.root, 'malformed.igs')
    const bad = await invalidRegionalPackage(f.savedPath, malformed, f.a)
    await assert.rejects(readIgsPackage(malformed), { code: 'INVALID_IMAGE' })
    await assert.rejects(
      f.co().applyDocument(bad.document, { [bad.asset.path]: { bytes: bad.bytes } }),
      { code: 'MASK_IMAGE_INVALID' },
    )
    await assert.rejects(
      f.shadow.write({
        dirtyAssets: { [bad.asset.path]: { bytes: bad.bytes } },
        document: bad.document,
        projectPath: f.savedPath,
        savedDocument: before,
      }),
      { code: 'SHADOW_ASSET_MISMATCH' },
    )
    assert.deepEqual(f.document(), before)
    assert.ok((await readFile(f.savedPath)).equals(original))
    const id = f.tab().id
    await f.service.close(id)
    assert.equal((await f.service.open(id)).kind, 'opened')
    try {
      await writeFile(f.savedPath, await readFile(malformed))
      await assert.rejects(edit(f, f.a, brush(10.5, -3.5)), { code: 'INVALID_IMAGE' })
      assert.deepEqual(f.document(), before)
      assert.equal(f.tab().canUndo, false)
    } finally {
      await writeFile(f.savedPath, original)
    }
  })
})
