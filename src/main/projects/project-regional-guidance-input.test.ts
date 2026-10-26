import {
  type IgsProjectAssetRefV1,
  type IgsProjectDocumentV1,
  type IgsRegionalGuidanceReferenceImageV1,
  type IgsRegionalGuidanceV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
  projectAssetReferences,
} from '../../shared/projects/project-schema.js'
import type { PromptEmbeddingRef } from '../../shared/projects/prompt-embeddings.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import fs, {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { IgsAssetSource } from './igs-package.js'
import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { decodeProjectMaskPng, encodeProjectMaskPng } from './project-mask.js'
import { withFrozenRegionalGuidanceInput } from './project-regional-guidance-input.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { invalidMaskRgbFixture } from './test-fixtures/project-mask.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const SOFT_ALPHA = [255, 1, 0, 0, 128, 255]
const TARGET = { height: 3, width: 3, x: -1, y: -2 }
const PROJECTED_ALPHA = [0, 0, 0, 1, 0, 0, 128, 255, 0]

type Fixture = Awaited<ReturnType<typeof fixture>>

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function expectedSnapshot(document: IgsProjectDocumentV1) {
  return structuredClone({
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    lastActualSeedSnapshot: document.lastActualSeedSnapshot,
    primaryBbox: document.primaryBbox,
    ...(document.regionalGuidance !== undefined
      ? { regionalGuidance: document.regionalGuidance }
      : {}),
  })
}

function regionalMembers(document: IgsProjectDocumentV1) {
  return (document.regionalGuidance ?? []).flatMap((region) => [
    ...(region.mask.asset
      ? [{ member: region.mask.asset, regionId: region.id, role: 'mask' as const }]
      : []),
    ...(region.referenceImages ?? []).flatMap((reference) => [
      {
        member: reference.asset,
        referenceId: reference.id,
        regionId: region.id,
        role: 'image' as const,
      },
      {
        member: reference.thumbnail,
        referenceId: reference.id,
        regionId: region.id,
        role: 'thumbnail' as const,
      },
      ...(reference.sourceIccProfile
        ? [
            {
              member: reference.sourceIccProfile,
              referenceId: reference.id,
              regionId: region.id,
              role: 'profile' as const,
            },
          ]
        : []),
    ]),
  ])
}

async function names(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).sort()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function tree(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const visit = async (current: string) => {
    for (const name of await names(current)) {
      const filename = path.join(current, name)
      const entry = await lstat(filename)
      assert.equal(entry.isSymbolicLink(), false, 'Fixture tree must contain no links')
      if (entry.isDirectory()) {
        await visit(filename)
      } else {
        result[path.relative(directory, filename)] = digest(await readFile(filename))
      }
    }
  }
  await visit(directory)
  return result
}

/** Real SQLite/coordinator/shadow/writer/loader; literal image construction is only fixture setup. */
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-regional-input-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const shadowRoot = path.join(root, 'autosave')
  const shadow = new ProjectShadowStore(shadowRoot)
  const scratch = path.join(root, 'scratch')
  let afterSave: ProjectAutosaveOptions['afterSaveCommit']
  const service = new ProjectService({
    autosaveOptions: {
      afterSaveCommit: async () => afterSave?.(),
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    },
    dataRoot: root,
    readLastActualSeed: async (tabId, documentId) =>
      (
        await database.db
          .selectFrom('generation_seed_cursor')
          .select('actual_seed')
          .where('local_project_key', '=', tabId)
          .where('document_id', '=', documentId)
          .executeTakeFirst()
      )?.actual_seed ?? null,
    repository: new ProjectIndexRepository(database.db),
    roots: { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: scratch },
    shadow,
  })
  try {
    const tab = await service.create({ height: 256, title: 'Private regional input', width: 256 })
    const id = tab.id
    const co = () => service.getOpenDocumentForAcceptance(id)!
    const document = () => co().document
    const png = await acceptedOutputPngFixture(64, 64)
    const thumbnail = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
    )
    const profile = await readFile(path.resolve('worker-python/tests/fixtures/AdobeRGB1998.icc'))
    const maskBytes = encodeProjectMaskPng(Uint8Array.from(SOFT_ALPHA), 3, 2)
    const sources = new Map<string, Buffer>()
    const add = <Member extends IgsProjectAssetRefV1>(member: Member, bytes: Buffer): Member => {
      sources.set(member.path, Buffer.from(bytes))
      return member
    }
    const reference = (): IgsRegionalGuidanceReferenceImageV1 => {
      const referenceId = randomUUID()
      return {
        asset: add(
          {
            bytes: png.length,
            height: 64,
            path: `assets/regional-references/${referenceId}/${digest(png)}.png`,
            sha256: digest(png),
            width: 64,
          },
          png,
        ),
        id: referenceId,
        name: `Ordered reference ${sources.size}`,
        sourceFormat: 'JPEG',
        sourceIccProfile: add(
          {
            bytes: profile.length,
            path: `assets/profiles/${digest(profile)}.icc`,
            sha256: digest(profile),
          },
          profile,
        ),
        thumbnail: add(
          {
            bytes: thumbnail.length,
            height: 64,
            path: `assets/regional-references/${referenceId}/${digest(thumbnail)}.webp`,
            sha256: digest(thumbnail),
            width: 64,
          },
          thumbnail,
        ),
      }
    }
    const region = (enabled: boolean, painted: boolean): IgsRegionalGuidanceV1 => {
      const maskId = randomUUID()
      return {
        enabled,
        id: randomUUID(),
        locked: !enabled,
        mask: painted
          ? {
              asset: add(
                {
                  bytes: maskBytes.length,
                  height: 2,
                  path: `assets/masks/${maskId}/${digest(maskBytes)}.png`,
                  sha256: digest(maskBytes),
                  width: 3,
                },
                maskBytes,
              ),
              bounds: { height: 2, width: 3, x: -2, y: -1 },
              id: maskId,
              revision: 4,
            }
          : { asset: null, id: maskId, revision: 0 },
        name: enabled ? 'Enabled zero-opacity owner' : 'Disabled locked owner',
        overlayOpacity: enabled ? 0 : 0.125,
      }
    }
    const [a, b, c, d] = [
      region(true, true),
      region(false, true),
      region(false, false),
      region(true, false),
    ]
    const model = acceptedRasterProvenanceFixture(document(), png, {
      height: 64,
      width: 64,
      x: 0,
      y: 0,
    }).generationConfiguration.model
    const embedding: PromptEmbeddingRef = {
      resource: { ...model, kind: 'embedding', localModelId: randomUUID(), predictionType: null },
      token: '<saved>',
    }
    a.prompts = {
      negative: { embeddingRefs: [embedding], text: '  {dormant|local}, <saved>\n' },
      positive: { embeddingRefs: [embedding], text: '{first|second}, (soft:0.5), <saved>\n ' },
      useGlobalNegativePrompt: true,
    }
    a.referenceImages = [reference(), reference()]
    b.referenceImages = [reference()]
    c.prompts = {
      negative: null,
      positive: { embeddingRefs: [], text: '' },
      useGlobalNegativePrompt: true,
    }
    const rasterId = randomUUID()
    const rasterAsset = add(
      {
        bytes: png.length,
        height: 64,
        path: `assets/layers/${rasterId}.png`,
        sha256: digest(png),
        width: 64,
      },
      png,
    )
    const patches = (['illustrious', 'anima'] as const).map((family): IgsSmartPatchLayerV1 => {
      const variant = smartPatchVariantMetadataFixture(family)
      const alpha = Uint8Array.from({ length: 35 }, (_, index) => [0, 64, 128, 255][index % 4])
      const bytes = literalSmartPatchColorPng(
        7,
        5,
        Array.from(alpha, (value) => [23, 47, 91, value]).flat(),
        4,
      )
      Object.assign(variant.asset, { bytes: bytes.length, sha256: digest(bytes) })
      Object.assign(variant.generationProvenance.executionResultContext.output, {
        byteSize: bytes.length,
        contributionAlpha8: { byteSize: alpha.length, height: 5, sha256: digest(alpha), width: 7 },
        sha256: digest(bytes),
      })
      add(variant.asset, bytes)
      return {
        activeRasterSubLayerId: variant.id,
        blendMode: 'normal',
        boundingBox: { height: 64, width: 64, x: 101, y: -201 },
        generationDraft: structuredClone(
          variant.generationProvenance.layerSourceContext.generationDraft,
        ),
        id: randomUUID(),
        internalResolution: { height: 64, width: 64 },
        kind: 'smart-patch',
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: `Protected ${family} Smart result`,
        opacity: 0.75,
        rasterSubLayers: [variant],
        visible: true,
      }
    })
    const authored = parseProjectDocumentV1({
      ...document(),
      generationDraft: {
        ...document().generationDraft,
        model,
        negativePrompt: { embeddingRefs: [embedding], text: 'Canvas global <saved>' },
        positivePrompt: { embeddingRefs: [], text: '{Canvas|template}' },
        seed: { policy: 'fixed', value: 0 },
      },
      lastActualSeedSnapshot: 0,
      layers: [
        {
          asset: rasterAsset,
          blendMode: 'normal',
          generationProvenance: acceptedRasterProvenanceFixture(document(), png, {
            height: 64,
            width: 64,
            x: 0,
            y: 0,
          }),
          id: rasterId,
          kind: 'raster',
          locked: true,
          name: 'Protected accepted Raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 11 },
          visible: true,
        },
        ...patches,
      ],
      primaryBbox: { height: 256, width: 256, x: -17, y: 23 },
      regionalGuidance: [a, b, c, d],
    })
    await co().applyDocument(
      authored,
      Object.fromEntries([...sources].map(([memberPath, bytes]) => [memberPath, { bytes }])),
    )
    await database.db
      .insertInto('generation_seed_cursor')
      .values({
        actual_seed: 0,
        candidate_id: randomUUID(),
        completion_order: 1,
        document_id: document().documentId,
        local_project_key: id,
        updated_at: '2026-10-24T12:00:00.000Z',
      })
      .execute()
    // Save snapshots the trusted operational cursor; establish seed zero before that boundary.
    await service.save(id)
    await service.close(id)
    assert.equal((await service.open(id)).kind, 'opened')
    assert.equal(document().lastActualSeedSnapshot, 0)
    return {
      a: a.id,
      b: b.id,
      c: c.id,
      co,
      d: d.id,
      database,
      dispose: async () => {
        afterSave = undefined
        for (const open of service.getOpenTabs()) {
          await service.discardAndClose(open.id)
        }
        await database.close()
        await rm(root, { force: true, recursive: true })
      },
      document,
      id,
      maskBytes,
      png,
      profile,
      reference,
      root,
      savedPath: co().filePath,
      scratch,
      service,
      setAfterSave: (hook?: ProjectAutosaveOptions['afterSaveCommit']) => {
        afterSave = hook
      },
      shadow,
      shadowRoot,
      sources,
      thumbnail,
    }
  } catch (error) {
    afterSave = undefined
    try {
      for (const open of service.getOpenTabs()) {
        await service.discardAndClose(open.id)
      }
    } finally {
      await database.close()
      await rm(root, { force: true, recursive: true })
    }
    throw error
  }
}

async function withProject(run: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.dispose()
  }
}

async function sqlState(f: Fixture) {
  const schema = await sql<{
    name: string
    type: string
  }>`select type, name, tbl_name, sql from sqlite_master order by type, name`.execute(f.database.db)
  const tables: Record<string, unknown[]> = {}
  for (const entry of schema.rows.filter((entry) => entry.type === 'table')) {
    const rows = await sql`select * from ${sql.table(entry.name)}`.execute(f.database.db)
    tables[entry.name] = rows.rows.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    )
  }
  return { schema: schema.rows, tables }
}

async function state(f: Fixture, settleAutosave = true) {
  if (settleAutosave) {
    await f.service.flushAutosave(f.id)
  }
  const current = f.service.getOpenTabs().find(({ id }) => id === f.id)
  return {
    document: structuredClone(f.document()),
    history: {
      canRedo: current!.canRedo,
      canUndo: current!.canUndo,
      dirty: current!.dirty,
      epoch: f.co().documentEpoch,
    },
    packageBytes: await readFile(f.savedPath),
    shadow: await tree(f.shadowRoot),
    sql: await sqlState(f),
  }
}

async function assertUnchanged(
  f: Fixture,
  before: Awaited<ReturnType<typeof state>>,
  settleAutosave = false,
) {
  // The before-state already drained authoring. Forcing another dirty flush here would itself
  // replace the shadow snapshot UUID and make the test measure its own write instead of capture.
  const after = await state(f, settleAutosave)
  assert.ok(
    after.packageBytes.equals(before.packageBytes),
    'Read-only capture must not replace package bytes',
  )
  const { packageBytes: _before, ...expected } = before
  const { packageBytes: _after, ...actual } = after
  assert.deepEqual(actual, expected)
}

function helperInput(f: Fixture, document = structuredClone(f.document())) {
  return {
    document,
    packagePath: f.savedPath,
    pendingSource: (member: IgsProjectAssetRefV1): IgsAssetSource | null => ({
      bytes: f.sources.get(member.path)!,
    }),
    scratchBasePath: path.join(f.root, 'helper-scratch'),
  }
}

async function assertAssets(
  capture: CapturedRegionalGuidanceInput,
  f: Fixture,
  document: IgsProjectDocumentV1,
) {
  const expected = regionalMembers(document)
  assert.deepEqual(
    capture.assets.map(({ filePath: _path, ...asset }) => asset),
    expected,
  )
  for (const asset of capture.assets) {
    assert.equal(path.dirname(asset.filePath), capture.stagingRoot)
    assert.ok(
      (await capture.readAsset(asset.member.path)).equals(f.sources.get(asset.member.path)!),
      'Captured member bytes must match exact owned fixture',
    )
  }
}

test('actual service captures every authored region and ordered independent assets without document/history/package/shadow/SQL effects', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    const scratchBefore = await names(f.scratch)
    let stage = ''
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      stage = capture.stagingRoot
      assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
      assert.equal(capture.snapshot.lastActualSeedSnapshot, 0)
      assert.equal(capture.snapshot.generationDraft.seed.value, 0)
      assert.deepEqual(
        capture.snapshot.regionalGuidance!.map(({ enabled }) => enabled),
        [true, false, false, true],
      )
      assert.equal(capture.snapshot.regionalGuidance![0].overlayOpacity, 0)
      assert.equal(capture.snapshot.regionalGuidance![1].locked, true)
      assert.equal(capture.snapshot.regionalGuidance![2].prompts!.positive!.text, '')
      assert.equal(Object.hasOwn(capture.snapshot.regionalGuidance![3], 'prompts'), false)
      await assertAssets(capture, f, before.document)
      const mask = capture.snapshot.regionalGuidance![0].mask
      assert.ok(mask.asset)
      assert.deepEqual(mask.bounds, { height: 2, width: 3, x: -2, y: -1 })
      assert.deepEqual(
        Array.from(decodeProjectMaskPng(await capture.readAsset(mask.asset.path), mask.asset)),
        SOFT_ALPHA,
      )
      // The source file and UUID paths differ even when two image payloads are identical.
      const references = capture.assets.filter(({ role }) => role === 'image')
      assert.equal(references.length, 3)
      assert.equal(new Set(references.map(({ member }) => member.path)).size, 3)
      assert.equal(new Set(references.map(({ referenceId }) => referenceId)).size, 3)
      assert.equal(new Set(references.map(({ member }) => member.sha256)).size, 1)
    })
    await assert.rejects(lstat(stage), { code: 'ENOENT' })
    assert.deepEqual(await names(f.scratch), scratchBefore)
    await assertUnchanged(f, before)
  })
})

test('actual service preserves legacy absence and an explicit empty regional collection without materializing prompt defaults', async () => {
  await withProject(async (f) => {
    for (const present of [false, true]) {
      const next = structuredClone(f.document())
      if (present) {
        next.regionalGuidance = []
      } else {
        delete next.regionalGuidance
      }
      await f.co().applyDocument(next)
      await f.service.save(f.id)
      const before = await state(f)
      await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
        assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
        assert.equal(Object.hasOwn(capture.snapshot, 'regionalGuidance'), present)
        assert.deepEqual(capture.assets, [])
        await assert.rejects(capture.projectMask(f.a, TARGET))
      })
      await assertUnchanged(f, before)
    }
  })
})

// Semantic mutation pair: remove the private pending Buffer.from copy. This case must fail while
// the unmodified-buffer neighbor below remains green; root executes mutations in an isolated copy.
test('exact-buffer detachment mutation boundary: caller mutation before the first await cannot replace captured masks, images or prompts', async () => {
  await withProject(async (f) => {
    const input = helperInput(f)
    const original = structuredClone(input.document)
    const expected = expectedSnapshot(original)
    const buffers = new Map<string, Buffer>(
      [...f.sources].map(([key, bytes]) => [key, Buffer.from(bytes)]),
    )
    input.pendingSource = (member) => ({ bytes: buffers.get(member.path)! })
    const pending = withFrozenRegionalGuidanceInput(input, async (capture) => {
      assert.deepEqual(capture.snapshot, expected)
      await assertAssets(capture, f, original)
    })
    for (const bytes of buffers.values()) {
      bytes.fill(0)
    }
    input.document.generationDraft.negativePrompt.text = 'Caller replacement'
    input.document.regionalGuidance![0].prompts!.negative!.embeddingRefs[0].token = '<foreign>'
    input.document.regionalGuidance![0].referenceImages!.reverse()
    await pending
    assert.deepEqual(await names(input.scratchBasePath), [])
  })
})

test('exact-buffer detachment neighbor: unchanged pending sources preserve exact coverage and authored templates', async () => {
  await withProject(async (f) => {
    const input = helperInput(f)
    await withFrozenRegionalGuidanceInput(input, async (capture) => {
      assert.deepEqual(capture.snapshot, expectedSnapshot(f.document()))
      await assertAssets(capture, f, f.document())
    })
    assert.deepEqual(await names(input.scratchBasePath), [])
  })
})

test('actual service projection retains private soft-alpha owner despite exposed snapshot/assets/target/result mutations and closes both read capabilities', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    const member = before.document.regionalGuidance![0].mask.asset!
    let retained!: CapturedRegionalGuidanceInput
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      retained = capture
      const target = { ...TARGET }
      const projecting = capture.projectMask(f.a, target)
      target.x = 10_000
      target.width = 1
      const first = await projecting
      assert.equal(first.kind, 'covered')
      assert.deepEqual(first.bounds, TARGET)
      assert.deepEqual(first.intersection, { height: 2, width: 2, x: -1, y: -1 })
      assert.deepEqual(Array.from(first.alpha), PROJECTED_ALPHA)
      first.alpha.fill(0)
      first.bounds.x = 888
      const bytes = await capture.readAsset(member.path)
      assert.ok(bytes.equals(f.maskBytes))
      bytes.fill(0)
      const publicMask = capture.assets.find(({ role }) => role === 'mask')!
      publicMask.member.path = 'assets/layers/foreign.png'
      publicMask.member.sha256 = '0'.repeat(64)
      publicMask.filePath = f.savedPath
      capture.assets.length = 0
      capture.snapshot.regionalGuidance![0].mask = { asset: null, id: randomUUID(), revision: 0 }
      capture.snapshot.regionalGuidance![0].id = randomUUID()
      capture.snapshot.generationDraft.positivePrompt.text = 'Exposed snapshot mutation'
      const repeated = await capture.projectMask(f.a, TARGET)
      assert.deepEqual(Array.from(repeated.alpha), PROJECTED_ALPHA)
      assert.deepEqual(repeated.bounds, TARGET)
      assert.ok((await capture.readAsset(member.path)).equals(f.maskBytes))
      assert.equal((await capture.projectMask(f.d, TARGET)).kind, 'empty')
      assert.equal(
        (await capture.projectMask(f.a, { height: 1, width: 1, x: 100, y: 100 })).kind,
        'outside',
      )
      const hole = await capture.projectMask(f.a, { height: 1, width: 1, x: 0, y: -1 })
      assert.equal(hole.kind, 'intersecting-empty')
      assert.deepEqual(Array.from(hole.alpha), [0])
      await assert.rejects(capture.projectMask(randomUUID(), TARGET))
      await assert.rejects(capture.projectMask(f.a, { height: 1, width: 2049, x: 0, y: 0 }))
      await assert.rejects(capture.projectMask(f.a, { height: 2048, width: 2048, x: 0, y: 0 }))
      await assert.rejects(capture.readAsset('project.json'))
      await assert.rejects(capture.readAsset(path.join(capture.stagingRoot, 'foreign.png')))
      await assert.rejects(capture.readAsset('../outside'))
    })
    await assert.rejects(retained.readAsset(member.path))
    await assert.rejects(retained.projectMask(f.a, TARGET))
    await assert.rejects(lstat(retained.stagingRoot), { code: 'ENOENT' })
    await assertUnchanged(f, before)
  })
})

test('actual service accepts translated saved mask descriptors and projects captured bounds while pending mask source remains null', async () => {
  await withProject(async (f) => {
    const next = structuredClone(f.document())
    const mask = next.regionalGuidance![0].mask
    assert.ok(mask.asset)
    mask.bounds = { ...mask.bounds, x: mask.bounds.x + 17, y: mask.bounds.y - 11 }
    mask.revision++
    await f.co().applyDocument(next)
    assert.equal(f.co().getCurrentAssetSource(mask.asset), null)
    const before = await state(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
      const projected = await capture.projectMask(f.a, {
        ...TARGET,
        x: TARGET.x + 17,
        y: TARGET.y - 11,
      })
      assert.deepEqual(Array.from(projected.alpha), PROJECTED_ALPHA)
      assert.ok((await capture.readAsset(mask.asset.path)).equals(f.maskBytes))
    })
    await assertUnchanged(f, before)
  })
})

test('actual service accepts a new reference with independent pending image/thumb and an exact globally saved shared original ICC', async () => {
  await withProject(async (f) => {
    const reference = f.reference()
    const next = structuredClone(f.document())
    next.regionalGuidance![0].referenceImages!.push(reference)
    await f.co().applyDocument(next, {
      [reference.asset.path]: { bytes: f.png },
      [reference.thumbnail.path]: { bytes: f.thumbnail },
    })
    assert.equal(f.co().getCurrentAssetSource(reference.sourceIccProfile!), null)
    assert.ok(f.co().getCurrentAssetSource(reference.asset))
    const saved = await readIgsPackage(f.savedPath)
    assert.equal(
      saved.project.regionalGuidance!.some((region) =>
        region.referenceImages?.some(({ id }) => id === reference.id),
      ),
      false,
    )
    const before = await state(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      assert.ok((await capture.readAsset(reference.sourceIccProfile!.path)).equals(f.profile))
      assert.ok((await capture.readAsset(reference.asset.path)).equals(f.png))
      await assertAssets(capture, f, before.document)
    })
    await assertUnchanged(f, before)
  })
})

test('helper refuses role-invalid and corrupt sources using actual validators without touching source bytes or durable neighbors', async (t) => {
  await withProject(async (f) => {
    const before = await state(f)
    for (const fault of [
      'corrupt',
      'mask-rgb',
      'image-profile',
      'thumbnail-format',
      'icc-format',
      'missing',
      'symlink',
    ] as const) {
      await t.test(fault, async () => {
        const input = helperInput(f)
        const buffers = new Map<string, Buffer>(
          [...f.sources].map(([key, bytes]) => [key, Buffer.from(bytes)]),
        )
        let member: IgsProjectAssetRefV1 = input.document.regionalGuidance![0].mask.asset!
        let bad: Buffer | undefined
        if (fault === 'corrupt') {
          buffers.set(member.path, Buffer.alloc(member.bytes))
        }
        if (fault === 'mask-rgb') {
          bad = invalidMaskRgbFixture()
          const mask = input.document.regionalGuidance![0].mask
          assert.ok(mask.asset)
          Object.assign(mask.asset, { bytes: bad.length, height: 2, width: 2 })
          if ('bounds' in mask) {
            mask.bounds = { height: 2, width: 2, x: -2, y: -1 }
          }
        }
        const reference = input.document.regionalGuidance![0].referenceImages![0]
        if (fault === 'image-profile') {
          member = reference.asset
          bad = encodeProjectMaskPng(new Uint8Array(64 * 64).fill(255), 64, 64)
        }
        if (fault === 'thumbnail-format') {
          member = reference.thumbnail
          bad = f.png
        }
        if (fault === 'icc-format') {
          member = reference.sourceIccProfile!
          bad = Buffer.alloc(128)
        }
        if (bad) {
          const oldPath = member.path
          member.bytes = bad.length
          member.sha256 = digest(bad)
          member.path = path.posix.join(
            path.posix.dirname(oldPath),
            `${member.sha256}${path.posix.extname(oldPath)}`,
          )
          buffers.set(member.path, bad)
        }
        const raw = path.join(f.root, `raw-${fault}`)
        await writeFile(raw, f.maskBytes)
        const link = `${raw}-link`
        if (fault === 'symlink') {
          await symlink(raw, link)
        }
        const rejectedPath = member.path
        input.pendingSource = (requested) => {
          if (requested.path === rejectedPath && (fault === 'missing' || fault === 'symlink')) {
            return { sourcePath: fault === 'missing' ? `${raw}-missing` : link }
          }
          return { bytes: buffers.get(requested.path)! }
        }
        let yielded = false
        await assert.rejects(
          withFrozenRegionalGuidanceInput(input, async () => {
            yielded = true
          }),
        )
        assert.equal(yielded, false)
        assert.ok(
          (await readFile(raw)).equals(f.maskBytes),
          'Acquisition failure never deletes or changes a source',
        )
        if (fault === 'symlink') {
          assert.equal((await lstat(link)).isSymbolicLink(), true)
        }
        assert.deepEqual(await names(input.scratchBasePath), [])
      })
    }
    await assertUnchanged(f, before)
  })
})

test('saved lookup refuses crossed region mask/image ownership even when all bytes and hashes remain valid', async (t) => {
  await withProject(async (f) => {
    const before = await state(f)
    for (const kind of ['mask', 'reference'] as const) {
      await t.test(kind, async () => {
        const input = helperInput(f)
        input.pendingSource = () => null
        const [a, b] = input.document.regionalGuidance!
        if (kind === 'mask') {
          ;[a.mask, b.mask] = [b.mask, a.mask]
        } else {
          ;[a.referenceImages![0], b.referenceImages![0]] = [
            b.referenceImages![0],
            a.referenceImages![0],
          ]
        }
        await assert.rejects(withFrozenRegionalGuidanceInput(input, async () => undefined))
        assert.deepEqual(await names(input.scratchBasePath), [])
      })
    }
    await assertUnchanged(f, before)
  })
})

test('aggregate byte preflight refuses before source reads or staging creation without allocating large fixture buffers', async () => {
  await withProject(async (f) => {
    const input = helperInput(f)
    const refs = input.document.regionalGuidance![0].referenceImages!
    refs[0].asset.bytes = 300 * 1024 * 1024
    refs[1].asset.bytes = 300 * 1024 * 1024
    let sourceCalls = 0
    input.pendingSource = () => {
      sourceCalls++
      throw new Error('Byte preflight must precede all source acquisition')
    }
    await assert.rejects(withFrozenRegionalGuidanceInput(input, async () => undefined))
    assert.equal(sourceCalls, 0)
    await assert.rejects(lstat(input.scratchBasePath), { code: 'ENOENT' })
  })
})

test('service aggregate preflight refuses oversized acknowledged descriptors before any coordinator source access or buffer copy', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    const scratchBefore = await names(f.scratch)
    const coordinator = f.co()
    const document = coordinator.document
    const [first, second] = document.regionalGuidance![0].referenceImages!
    const originalSizes = [first.asset.bytes, second.asset.bytes]
    const originalSource = coordinator.getCurrentAssetSource
    const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(coordinator, 'document')
    let sourceCalls = 0
    let sourceBufferAccesses = 0
    let yielded = false
    try {
      // Controlled acknowledged metadata only: these descriptors remain schema-valid, but no
      // writer/loader receives invented large image bytes. The real service entry is the subject.
      first.asset.bytes = 300 * 1024 * 1024
      second.asset.bytes = 300 * 1024 * 1024
      assert.deepEqual(parseProjectDocumentV1(document), document)
      // The coordinator getter returns detached data; expose this controlled oversized snapshot
      // explicitly to the real service without publishing invalid fixture assets to storage.
      Object.defineProperty(coordinator, 'document', { configurable: true, get: () => document })
      coordinator.getCurrentAssetSource = (member) => {
        sourceCalls++
        const bytes = f.sources.get(member.path)
        assert.ok(bytes, 'Every controlled source is an existing small fixture buffer')
        return {
          get bytes() {
            sourceBufferAccesses++
            return bytes
          },
        }
      }
      await assert.rejects(
        f.service.withCapturedRegionalGuidanceInput(f.id, async () => {
          yielded = true
        }),
        /512 MiB/,
      )
    } finally {
      first.asset.bytes = originalSizes[0]
      second.asset.bytes = originalSizes[1]
      coordinator.getCurrentAssetSource = originalSource
      if (originalDocumentDescriptor) {
        Object.defineProperty(coordinator, 'document', originalDocumentDescriptor)
      } else {
        Reflect.deleteProperty(coordinator, 'document')
      }
    }
    assert.equal(
      sourceCalls,
      0,
      'The real service must reject the aggregate before consulting coordinator asset sources',
    )
    assert.equal(
      sourceBufferAccesses,
      0,
      'An oversized service capture must not access source buffers for eager copies',
    )
    assert.equal(yielded, false)
    assert.deepEqual(await names(f.scratch), scratchBefore)
    await assertUnchanged(f, before)
  })
})

test('service aggregate preflight neighbor acquires an under-limit saved document through real coordinator sources', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    const coordinator = f.co()
    const originalSource = coordinator.getCurrentAssetSource
    const requested: string[] = []
    coordinator.getCurrentAssetSource = (member) => {
      requested.push(member.path)
      return originalSource.call(coordinator, member)
    }
    try {
      await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
        assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
        await assertAssets(capture, f, before.document)
      })
    } finally {
      coordinator.getCurrentAssetSource = originalSource
    }
    assert.ok(requested.length > 0, 'The healthy service control must really acquire its sources')
    assert.deepEqual(
      [...new Set(requested)].sort(),
      [...new Set(regionalMembers(before.document).map(({ member }) => member.path))].sort(),
    )
    await assertUnchanged(f, before)
  })
})

test('saved acquisition refuses and preserves foreign destination installed after actual extraction open', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    for (const { member } of regionalMembers(before.document)) {
      assert.equal(
        f.co().getCurrentAssetSource(member),
        null,
        'This case must read real saved members',
      )
    }
    const foreign = Buffer.from('Foreign destination installed during saved member acquisition')
    const foreignFixture = path.join(f.root, 'foreign-extraction-destination.asset')
    await writeFile(foreignFixture, foreign, { flag: 'wx', mode: 0o600 })
    const originalOpen = fs.open
    let injected = false
    let destination = ''
    let observedBoundary: 'exclusive-writer' | 'temporary-sync-reader' | null = null
    let yielded = false
    fs.open = async (...args: Parameters<typeof fs.open>) => {
      // The original OS open runs exactly once and its real FD is returned unchanged. Old
      // extraction opens its streamed temporary member for sync; the private exclusive copier
      // opens the final member for writing. Both leave an awaited publication window here.
      const handle = await originalOpen(...args)
      const openedPath = String(args[0])
      const stage = path.dirname(openedPath)
      const basename = path.basename(openedPath)
      const memberName = /^\.?(member-\d+\.asset)(?:\.[a-f0-9-]+\.tmp)?$/.exec(basename)
      const flags = args[1]
      const oldSyncRead = basename.startsWith('.') && flags === 'r'
      const exclusiveWrite =
        !basename.startsWith('.') &&
        typeof flags === 'number' &&
        (flags & constants.O_EXCL) !== 0 &&
        (flags & (constants.O_WRONLY | constants.O_RDWR)) !== 0
      if (
        !injected &&
        memberName &&
        path.dirname(stage) === f.scratch &&
        path.basename(stage).startsWith('regional-input-') &&
        (oldSyncRead || exclusiveWrite)
      ) {
        injected = true
        destination = path.join(stage, memberName[1])
        observedBoundary = oldSyncRead ? 'temporary-sync-reader' : 'exclusive-writer'
        try {
          // rename is the controlled external intervention. For the exclusive path the opened
          // inode stays pinned by handle while this foreign inode replaces its pathname.
          await rename(foreignFixture, destination)
        } catch (error) {
          await handle.close()
          throw error
        }
      }
      return handle
    }
    syncBuiltinESMExports()
    let outcome: { error: unknown; refused: boolean }
    try {
      outcome = await f.service
        .withCapturedRegionalGuidanceInput(f.id, async () => {
          yielded = true
        })
        .then(
          () => ({ error: null, refused: false }),
          (error: unknown) => ({ error, refused: true }),
        )
    } finally {
      fs.open = originalOpen
      syncBuiltinESMExports()
    }
    assert.equal(
      injected,
      true,
      'The actual saved member open must reach the OS timing intervention',
    )
    assert.ok(
      observedBoundary,
      'A changed copier filename/transport needs an explicit barrier update',
    )
    await assertUnchanged(f, before)
    const remaining = await readFile(destination).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    assert.ok(
      remaining?.equals(foreign),
      'Saved acquisition must preserve the exact foreign destination instead of overwriting or deleting it',
    )
    assert.equal(
      outcome.refused,
      true,
      'A replaced acquisition destination must refuse the entire lease',
    )
    assert.ok(outcome.error instanceof Error)
    assert.equal(
      yielded,
      false,
      'Foreign replacement must never be accepted as an owned captured lease',
    )
  })
})

async function replacePackage(f: Fixture, replacement: IgsProjectDocumentV1) {
  const saved = await readIgsPackage(f.savedPath)
  const assets: Record<string, IgsAssetSource> = {}
  for (const member of projectAssetReferences(saved.project)) {
    assets[member.path] ??= { bytes: await saved.readMember(member.path) }
  }
  await saveIgsPackage(f.savedPath, {
    assets,
    preview: {
      merged: await saved.readMember('preview/merged.png'),
      rect: saved.manifest.preview.rect,
      status: saved.manifest.preview.status,
      thumbnail: await saved.readMember('preview/thumbnail.webp'),
    },
    project: replacement,
  })
  assert.deepEqual((await readIgsPackage(f.savedPath)).project, replacement)
}

test('actual service permits immutable-dependency metadata-only dirty/replacement controls but refuses an external Project identity replacement', async () => {
  await withProject(async (f) => {
    await f.service.updateGenerationDraft(f.id, {
      kind: 'positive-prompt',
      text: 'Live metadata-only edit',
    })
    let before = await state(f)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
      await assertAssets(capture, f, before.document)
    })
    await assertUnchanged(f, before)
    const saved = (await readIgsPackage(f.savedPath)).project
    await replacePackage(f, {
      ...saved,
      documentRevision: randomUUID(),
      title: 'Outside metadata only, exact immutable dependencies',
    })
    // Capture is not a Save validator. Do not introduce an unrelated forced autosave over this
    // outside replacement: record the existing shadow and exercise only the requested capture.
    before = await state(f, false)
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
      await assertAssets(capture, f, before.document)
    })
    await assertUnchanged(f, before, false)
    const replacement = {
      ...saved,
      documentId: randomUUID(),
      documentRevision: randomUUID(),
      title: 'Different outside Project identity',
    }
    await replacePackage(f, replacement)
    before = await state(f, false)
    await assert.rejects(f.service.withCapturedRegionalGuidanceInput(f.id, async () => undefined))
    await assertUnchanged(f, before, false)
    assert.deepEqual((await readIgsPackage(f.savedPath)).project, replacement)
  })
})

/** Controlled delay after a real exclusive stage allocation, before any acquired input is yielded. */
async function acquisitionBarrier(f: Fixture) {
  const original = fs.mkdtemp
  const entered = deferred()
  const release = deferred()
  let observed = false
  fs.mkdtemp = (async (...args: Parameters<typeof fs.mkdtemp>) => {
    const result = await original(...args)
    if (!observed && String(args[0]).startsWith(path.join(f.scratch, 'regional-input-'))) {
      observed = true
      entered.release()
      await release.promise
    }
    return result
  }) as typeof fs.mkdtemp
  syncBuiltinESMExports()
  return {
    entered: entered.promise,
    release: release.release,
    restore: () => {
      fs.mkdtemp = original
      syncBuiltinESMExports()
    },
  }
}

test('actual service acquisition refuses observed edit/Undo ABA and coordinator close/reopen without phantom state', async (t) => {
  for (const interference of ['edit-undo', 'close-reopen'] as const) {
    await t.test(interference, async () =>
      withProject(async (f) => {
        const initialRevision = f.document().documentRevision
        const initialEpoch = f.co().documentEpoch
        const coordinator = f.co()
        const scratchBefore = await names(f.scratch)
        const barrier = await acquisitionBarrier(f)
        let yielded = false
        const capture = f.service.withCapturedRegionalGuidanceInput(f.id, async () => {
          yielded = true
        })
        const refused = assert.rejects(capture, { code: 'EDIT_CONFLICT' })
        try {
          await Promise.race([
            barrier.entered,
            capture.then(() => assert.fail('Capture settled without reaching acquisition barrier')),
          ])
          if (interference === 'edit-undo') {
            await f.service.updateGenerationDraft(f.id, {
              kind: 'positive-prompt',
              text: 'Observed ABA edit',
            })
            await f.service.undo(f.id)
            assert.equal(f.document().documentRevision, initialRevision)
            assert.ok(f.co().documentEpoch > initialEpoch)
          } else {
            await f.service.close(f.id)
            assert.equal((await f.service.open(f.id)).kind, 'opened')
            assert.notEqual(f.co(), coordinator)
            assert.equal(f.document().documentRevision, initialRevision)
          }
          const expected = await state(f)
          barrier.release()
          await refused
          assert.equal(yielded, false)
          await assertUnchanged(f, expected)
          assert.deepEqual(await names(f.scratch), scratchBefore)
        } finally {
          barrier.release()
          try {
            await refused
          } finally {
            barrier.restore()
          }
        }
      }),
    )
  }
})

test('actual service capture during observed Save A/edit B keeps saved A and dirty B separate and unchanged', async () => {
  await withProject(async (f) => {
    await f.service.updateGenerationDraft(f.id, { kind: 'positive-prompt', text: 'Saved Canvas A' })
    const a = structuredClone(f.document())
    const committed = deferred()
    const release = deferred()
    f.setAfterSave(async () => {
      committed.release()
      await release.promise
    })
    const saving = f.service.save(f.id)
    try {
      await Promise.race([
        committed.promise,
        saving.then(() => assert.fail('Save did not reach commit barrier')),
      ])
      assert.deepEqual((await readIgsPackage(f.savedPath)).project, a)
      await f.service.updateRegionalGuidancePrompt(
        f.id,
        {
          documentId: f.document().documentId,
          documentRevision: f.document().documentRevision,
          regionId: f.a,
        },
        { kind: 'text', polarity: 'positive', text: 'Dirty regional B' },
      )
      const before = await state(f)
      await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
        assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
        assert.equal(
          capture.snapshot.regionalGuidance![0].prompts!.positive!.text,
          'Dirty regional B',
        )
        await assertAssets(capture, f, before.document)
      })
      await assertUnchanged(f, before)
    } finally {
      release.release()
      await saving
      f.setAfterSave()
    }
    const saved = await readIgsPackage(f.savedPath)
    assert.deepEqual(saved.project, a)
    const shadow = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(shadow.status, 'recoverable')
    if (shadow.status !== 'recoverable') {
      assert.fail('Dirty B must remain recoverable')
    }
    assert.equal(shadow.document.regionalGuidance![0].prompts!.positive!.text, 'Dirty regional B')
    assert.equal(f.service.getOpenTabs()[0].dirty, true)
  })
})

test('a yielded actual service lease keeps original masks/references/templates after edits, Clear, Delete, Save and close', async () => {
  await withProject(async (f) => {
    const original = structuredClone(f.document())
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      await f.service.updateGenerationDraft(f.id, {
        kind: 'positive-prompt',
        text: 'New live Canvas context',
      })
      const mask = f.document().regionalGuidance!.find(({ id }) => id === f.a)!.mask
      await f.service.editRegionalGuidanceMask(f.id, f.a, {
        documentId: f.document().documentId,
        documentRevision: f.document().documentRevision,
        edit: { kind: 'clear' },
        maskId: mask.id,
        maskRevision: mask.revision,
      })
      await f.service.updateRegionalGuidance(
        f.id,
        {
          documentId: f.document().documentId,
          documentRevision: f.document().documentRevision,
          regionId: f.b,
        },
        { kind: 'lock', locked: false },
      )
      await f.service.deleteRegionalGuidance(f.id, {
        documentId: f.document().documentId,
        documentRevision: f.document().documentRevision,
        regionId: f.b,
      })
      await f.service.save(f.id)
      await f.service.close(f.id)
      const savedBytes = await readFile(f.savedPath)
      const sqlBefore = await sqlState(f)
      const shadowBefore = await tree(f.shadowRoot)
      assert.deepEqual(capture.snapshot, expectedSnapshot(original))
      await assertAssets(capture, f, original)
      assert.deepEqual(Array.from((await capture.projectMask(f.a, TARGET)).alpha), PROJECTED_ALPHA)
      assert.deepEqual(Array.from((await capture.projectMask(f.b, TARGET)).alpha), PROJECTED_ALPHA)
      assert.ok((await readFile(f.savedPath)).equals(savedBytes))
      assert.deepEqual(await sqlState(f), sqlBefore)
      assert.deepEqual(await tree(f.shadowRoot), shadowBefore)
      assert.equal(f.service.getOpenTabs().length, 0)
    })
    assert.equal((await f.service.open(f.id)).kind, 'opened')
    assert.equal(f.document().regionalGuidance!.find(({ id }) => id === f.a)!.mask.asset, null)
    assert.equal(
      f.document().regionalGuidance!.some(({ id }) => id === f.b),
      false,
    )
    assert.deepEqual(f.document().layers, original.layers)
    assert.equal(
      (await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute())[0]
        .actual_seed,
      0,
    )
  })
})

test('callback failure releases only owned lease files while pending source files and unrelated scratch survive', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    const input = helperInput(f)
    const source = path.join(f.root, 'owned-source-mask.png')
    await writeFile(source, f.maskBytes)
    const memberPath = f.document().regionalGuidance![0].mask.asset!.path
    const ordinarySource = input.pendingSource
    input.pendingSource = (member) =>
      member.path === memberPath ? { sourcePath: source } : ordinarySource(member)
    await mkdir(input.scratchBasePath)
    const neighbor = path.join(input.scratchBasePath, 'unrelated.txt')
    await writeFile(neighbor, 'Retained neighbor')
    const failure = new Error('Declared callback failure')
    let stage = ''
    await assert.rejects(
      withFrozenRegionalGuidanceInput(input, async (capture) => {
        stage = capture.stagingRoot
        assert.ok((await capture.readAsset(memberPath)).equals(f.maskBytes))
        throw failure
      }),
      (error: unknown) => error === failure,
    )
    await assert.rejects(lstat(stage), { code: 'ENOENT' })
    assert.ok((await readFile(source)).equals(f.maskBytes))
    assert.equal(await readFile(neighbor, 'utf8'), 'Retained neighbor')
    await assertUnchanged(f, before)
  })
})

test('a changed leased file refuses reads and exact cleanup retains its foreign replacement without touching original sources', async () => {
  await withProject(async (f) => {
    const before = await state(f)
    const foreign = Buffer.from('Foreign replacement must survive cleanup')
    const moved = path.join(f.root, 'original-leased-mask.png')
    let replaced = ''
    await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      const mask = capture.assets.find(({ role }) => role === 'mask')!
      replaced = mask.filePath
      await rename(replaced, moved)
      await writeFile(replaced, foreign)
      await assert.rejects(capture.readAsset(mask.member.path))
      await assert.rejects(capture.projectMask(mask.regionId, TARGET))
      const other = capture.assets.find(({ role }) => role === 'image')!
      assert.ok((await capture.readAsset(other.member.path)).equals(f.png))
    })
    assert.ok((await readFile(replaced)).equals(foreign))
    assert.ok((await readFile(moved)).equals(f.maskBytes))
    assert.deepEqual(await names(path.dirname(replaced)), [path.basename(replaced)])
    await assertUnchanged(f, before)
  })
})

test('a started actual lease read drains before callback failure cleanup and retained calls cannot reopen the lease', async () => {
  await withProject(async (f) => {
    const entered = deferred()
    const release = deferred()
    const originalOpen = fs.open
    const callbackFailure = new Error('Failure while a real leased file read is pending')
    let retained!: CapturedRegionalGuidanceInput
    let reading: Promise<Buffer> | undefined
    let settled = false
    let leasedPath = ''
    let intercepted = false
    fs.open = async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args)
      if (!intercepted && String(args[0]) === leasedPath) {
        intercepted = true
        entered.release()
        await release.promise
      }
      return handle
    }
    syncBuiltinESMExports()
    const pending = f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
      retained = capture
      const mask = capture.assets.find(({ role }) => role === 'mask')!
      leasedPath = mask.filePath
      reading = capture.readAsset(mask.member.path)
      void reading.catch(() => undefined)
      await entered.promise
      throw callbackFailure
    })
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    const failed = assert.rejects(pending, (error: unknown) => error === callbackFailure)
    try {
      await Promise.race([
        entered.promise,
        pending.then(() => assert.fail('Read barrier was not reached')),
      ])
      assert.equal((await lstat(leasedPath)).isFile(), true)
      assert.equal(
        settled,
        false,
        'A callback failure must await its started read before returning',
      )
      release.release()
      assert.ok((await reading!).equals(f.maskBytes))
      await failed
      await assert.rejects(lstat(retained.stagingRoot), { code: 'ENOENT' })
      await assert.rejects(retained.readAsset(retained.assets[0].member.path))
    } finally {
      release.release()
      try {
        await failed
      } finally {
        fs.open = originalOpen
        syncBuiltinESMExports()
      }
    }
  })
})

/** Real cleanup with one controlled replacement between its actual lstat and realpath replies. */
async function cleanupRealpathCase(injectForeign: boolean) {
  await withProject(async (f) => {
    const before = await state(f)
    const scratchBefore = await names(f.scratch)
    const foreign = Buffer.from('Foreign inode installed after cleanup lstat must survive unlink')
    const foreignFixture = path.join(f.root, 'foreign-cleanup-realpath.asset')
    await writeFile(foreignFixture, foreign, { flag: 'wx', mode: 0o600 })
    const originalLstat = fs.lstat
    const originalRealpath = fs.realpath
    let armed = false
    let leasedPath = ''
    let stage = ''
    let lstatObserved = false
    let realpathObserved = false
    let injected = false
    const observed: string[] = []
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      // Return the actual stat object unchanged; acquisition and callback reads remain unarmed.
      const entry = await originalLstat(...args)
      if (armed && String(args[0]) === leasedPath && !lstatObserved) {
        assert.equal(entry.isFile(), true)
        lstatObserved = true
        observed.push('original-lstat')
      }
      return entry
    }) as typeof fs.lstat
    fs.realpath = (async (...args: Parameters<typeof fs.realpath>) => {
      const canonical = await originalRealpath(...args)
      if (armed && String(args[0]) === leasedPath && !realpathObserved) {
        assert.equal(
          lstatObserved,
          true,
          'Cleanup must have observed the real leased-file stat first',
        )
        assert.equal(canonical, leasedPath)
        realpathObserved = true
        observed.push('original-realpath')
        if (injectForeign) {
          // This is a real OS rename while canonicalFile still holds the earlier actual stat.
          // Keep its realpath reply exact: the fixed cleanup must freshly qualify the inode
          // synchronously before deletion, rather than trusting the stale advisory observation.
          await rename(foreignFixture, leasedPath)
          injected = true
          observed.push('foreign-renamed')
        }
      }
      return canonical
    }) as typeof fs.realpath
    syncBuiltinESMExports()
    try {
      await f.service.withCapturedRegionalGuidanceInput(f.id, async (capture) => {
        stage = capture.stagingRoot
        leasedPath = capture.assets[0].filePath
        assert.deepEqual(capture.snapshot, expectedSnapshot(before.document))
        await assertAssets(capture, f, before.document)
        // No reads or other awaited callback work follow this arm. The next matching operations
        // therefore belong to cleanup, not acquisition, projection, or a still-running reader.
        armed = true
      })
    } finally {
      armed = false
      fs.lstat = originalLstat
      fs.realpath = originalRealpath
      syncBuiltinESMExports()
    }
    assert.equal(lstatObserved, true, 'The actual cleanup lstat barrier must be reached')
    assert.equal(realpathObserved, true, 'The actual cleanup realpath barrier must be reached')
    assert.deepEqual(
      observed,
      injectForeign
        ? ['original-lstat', 'original-realpath', 'foreign-renamed']
        : ['original-lstat', 'original-realpath'],
    )
    assert.equal(injected, injectForeign)
    await assertUnchanged(f, before)
    if (injectForeign) {
      const remaining = await readFile(leasedPath).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null
        }
        throw error
      })
      assert.ok(
        remaining?.equals(foreign),
        'Cleanup must preserve exact foreign bytes installed after lstat and before realpath returns',
      )
      assert.deepEqual(await names(stage), [path.basename(leasedPath)])
    } else {
      await assert.rejects(lstat(stage), { code: 'ENOENT' })
      assert.deepEqual(await names(f.scratch), scratchBefore)
      assert.ok((await readFile(foreignFixture)).equals(foreign))
    }
  })
}

test('cleanup preserves foreign bytes renamed over the leased file after observed lstat before realpath returns', async () => {
  await cleanupRealpathCase(true)
})

test('cleanup realpath neighbor removes unchanged owned files after the same observed lstat and realpath boundaries', async () => {
  await cleanupRealpathCase(false)
})
