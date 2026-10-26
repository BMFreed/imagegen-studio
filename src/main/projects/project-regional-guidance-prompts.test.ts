import type { ProjectTab } from '../../shared/api.js'
import {
  IGS_SAFETY_CEILINGS,
  type IgsProjectDocumentV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
  projectAssetReferences,
} from '../../shared/projects/project-schema.js'
import {
  type GenerationPrompt,
  type PromptEmbeddingRef,
  reconcilePromptEmbeddings,
} from '../../shared/projects/prompt-embeddings.js'
import type {
  ProjectRegionalGuidanceOwner,
  ProjectRegionalGuidancePromptChange,
} from '../../shared/projects/regional-guidance.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { RegionalPromptSync } from '../../renderer/components/regional-prompt-sync.js'
import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService, type ProjectServiceOptions } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

type Resolver = NonNullable<ProjectServiceOptions['resolvePromptEmbeddings']>
type ResolverInput = Parameters<Resolver>[0]
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)

interface Fixture {
  calls: ResolverInput[]
  co: () => NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
  document: () => IgsProjectDocumentV1
  ref: PromptEmbeddingRef
  restart: () => ProjectService
  savedPath: string
  service: ProjectService
  setAfterSave: (hook?: ProjectAutosaveOptions['afterSaveCommit']) => void
  setBeforeEdit: (hook?: ProjectAutosaveOptions['beforeEditCommit']) => void
  setResolver: (hook: Resolver) => void
  shadow: ProjectShadowStore
  tab: () => ProjectTab
}

function embedding(): PromptEmbeddingRef {
  return {
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: null,
      civitaiModelId: null,
      civitaiVersionId: null,
      displayName: 'Portable saved embedding',
      fileSha256: 'a'.repeat(64),
      kind: 'embedding',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Exact copied version',
    },
    token: '<saved>',
  }
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function owner(
  tab: ProjectTab,
  regionId = tab.regionalGuidance![0].id,
): ProjectRegionalGuidanceOwner {
  return { documentId: tab.documentId, documentRevision: tab.documentRevision, regionId }
}

function region(tab: ProjectTab, id = tab.regionalGuidance![0].id): IgsRegionalGuidanceV1 {
  const result = tab.regionalGuidance?.find((value) => value.id === id)
  assert.ok(result)
  return result
}

function group(tab: ProjectTab, polarity: 'negative' | 'positive') {
  return `regional:${region(tab).id}:${polarity}:${randomUUID()}`
}

function fingerprint(document: IgsProjectDocumentV1) {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex')
}

/**
 * Real SQLite, coordinator, shadow and package IO. The embedding resolver is a declared seam; these
 * tests do not qualify installed files, a catalog, IPC, an image worker or inference.
 */
async function withProject(run: (fixture: Fixture) => Promise<void>, documentOnly = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-regional-prompts-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const services: ProjectService[] = []
  const calls: ResolverInput[] = []
  let beforeEdit: ProjectAutosaveOptions['beforeEditCommit']
  let afterSave: ProjectAutosaveOptions['afterSaveCommit']
  let resolve: Resolver = async (input) =>
    reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, [])
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
      resolvePromptEmbeddings: documentOnly
        ? undefined
        : async (input) => {
            calls.push(structuredClone(input))
            return await resolve(input)
          },
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
  const ref = embedding()
  try {
    let tab = await service.create({ height: 256, title: 'Regional prompt authoring', width: 256 })
    tab = await service.addSmartPatchLayer(tab.id)
    const co = () => service.getOpenDocumentForAcceptance(tab.id)!
    const document = co().document
    const rasterId = randomUUID()
    // Portable refs, Raster and contrasting Smart context are fixture preconditions only.
    const checkpoint = { ...ref.resource, kind: 'checkpoint' as const }
    await co().applyDocument(
      {
        ...document,
        generationDraft: {
          ...document.generationDraft,
          model: checkpoint,
          negativePrompt: { embeddingRefs: [ref], text: 'global <saved>' },
          positivePrompt: { embeddingRefs: [], text: '{global|template}, ordinary authoring' },
        },
        layers: [
          ...document.layers.map((layer) =>
            layer.kind === 'smart-patch'
              ? {
                  ...layer,
                  generationDraft: {
                    ...layer.generationDraft,
                    model: { ...checkpoint, baseModelFamily: 'anima' as const },
                    positivePrompt: { embeddingRefs: [], text: 'Smart-only context' },
                  },
                }
              : layer,
          ),
          {
            asset: {
              bytes: png.length,
              height: 2,
              path: `assets/layers/${rasterId}.png`,
              sha256: createHash('sha256').update(png).digest('hex'),
              width: 2,
            },
            blendMode: 'normal',
            id: rasterId,
            kind: 'raster',
            locked: false,
            name: 'Exact neighbor',
            opacity: 1,
            transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 11, y: -19 },
            visible: true,
          },
        ],
      },
      { [`assets/layers/${rasterId}.png`]: { bytes: png } },
    )
    const current = service.getOpenTabs()[0]
    tab = await service.addRegionalGuidance(tab.id, {
      documentId: current.documentId,
      documentRevision: current.documentRevision,
    })
    const savedPath = co().filePath
    await service.save(tab.id)
    await service.clearHistory(tab.id)
    await run({
      calls,
      co,
      document: () => co().document,
      ref,
      restart,
      savedPath,
      service,
      setAfterSave: (hook) => {
        afterSave = hook
      },
      setBeforeEdit: (hook) => {
        beforeEdit = hook
      },
      setResolver: (hook) => {
        resolve = hook
      },
      shadow,
      tab: () => service.getOpenTabs().find((value) => value.id === tab.id)!,
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

async function change(f: Fixture, command: ProjectRegionalGuidancePromptChange, id?: string) {
  return await f.service.updateRegionalGuidancePrompt(f.tab().id, owner(f.tab(), id), command)
}

async function addBlock(f: Fixture, polarity: 'negative' | 'positive') {
  return await change(f, { kind: 'block', polarity, present: true })
}

test('regional absent and explicit empty blocks survive real Save and reopen; clear retains and final remove omits', async () => {
  await withProject(async (f) => {
    const baseline = f.document()
    const absent = await readIgsPackage(f.savedPath)
    const baselineAssets = new Map<string, Buffer>()
    for (const asset of projectAssetReferences(baseline)) {
      baselineAssets.set(asset.path, await absent.readMember(asset.path))
    }
    assert.equal(Object.hasOwn(absent.project.regionalGuidance![0], 'prompts'), false)
    const noBlocks = f.tab()
    await change(f, { kind: 'block', polarity: 'negative', present: false })
    assert.deepEqual(f.tab(), noBlocks)
    await assert.rejects(change(f, { kind: 'text', polarity: 'positive', text: 'absent block' }), {
      code: 'PROJECT_INVALID_INPUT',
    })
    await assert.rejects(change(f, { kind: 'negative-source', useGlobalNegativePrompt: true }), {
      code: 'PROJECT_INVALID_INPUT',
    })
    await f.service.save(f.tab().id)
    assert.equal(
      Object.hasOwn((await readIgsPackage(f.savedPath)).project.regionalGuidance![0], 'prompts'),
      false,
    )
    await addBlock(f, 'positive')
    await change(f, { kind: 'text', polarity: 'positive', text: '{red|blue}, (soft:1.2)\n' })
    await change(f, { kind: 'text', polarity: 'positive', text: '' })
    await addBlock(f, 'negative')
    await f.service.save(f.tab().id)
    const key = f.tab().id
    await f.service.close(key)
    const reopened = await f.service.open(key)
    assert.equal(reopened.kind, 'opened')
    const portable = await readIgsPackage(f.savedPath)
    assert.deepEqual(portable.project.regionalGuidance![0].prompts, {
      negative: { embeddingRefs: [], text: '' },
      positive: { embeddingRefs: [], text: '' },
      useGlobalNegativePrompt: false,
    })
    await change(f, { kind: 'block', polarity: 'negative', present: false })
    assert.equal(region(f.tab()).prompts!.useGlobalNegativePrompt, true)
    await change(f, { kind: 'block', polarity: 'positive', present: false })
    assert.equal(Object.hasOwn(region(f.tab()), 'prompts'), false)
    await f.service.save(f.tab().id)
    const removed = await readIgsPackage(f.savedPath)
    assert.equal(Object.hasOwn(removed.project.regionalGuidance![0], 'prompts'), false)
    assert.deepEqual(removed.project.layers, baseline.layers)
    assert.deepEqual(removed.project.generationDraft, baseline.generationDraft)
    for (const asset of projectAssetReferences(baseline)) {
      assert.ok((await removed.readMember(asset.path)).equals(baselineAssets.get(asset.path)!))
    }
    assert.equal(f.calls.length, 0, 'ordinary text must not consult the embedding catalog seam')
  })
})

test('regional inheritance toggle retains custom template and exact refs through shadow recovery and package reopen', async () => {
  await withProject(async (f) => {
    const baseline = f.document()
    await addBlock(f, 'negative')
    const custom: GenerationPrompt = {
      embeddingRefs: [f.ref],
      text: '  {warm|cool}, <saved>\n(bad anatomy:1.2)  ',
    }
    f.setResolver(async () => structuredClone(custom))
    await change(f, { kind: 'text', polarity: 'negative', text: custom.text })
    await change(f, { kind: 'negative-source', useGlobalNegativePrompt: true })
    assert.deepEqual(region(f.tab()).prompts!.negative, custom)
    const repeated = f.tab()
    await addBlock(f, 'negative')
    assert.deepEqual(f.tab(), repeated, 'repeated Add must preserve inherited source and history')
    f.setResolver(async (input) =>
      reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, []),
    )
    await f.service.updateGenerationDraft(f.tab().id, {
      kind: 'negative-prompt',
      text: 'new global text',
    })
    assert.deepEqual(region(f.tab()).prompts!.negative, custom)
    await f.service.flushAutosave(f.tab().id)
    const saved = await readIgsPackage(f.savedPath)
    const inspected = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(inspected.status, 'recoverable')
    if (inspected.status !== 'recoverable') {
      throw new Error('Regional authoring must be recoverable.')
    }
    assert.deepEqual(inspected.document.regionalGuidance![0].prompts!.negative, custom)
    assert.deepEqual(inspected.dirtyAssets, {})
    const key = f.tab().id
    const restarted = f.restart()
    assert.equal((await restarted.open(key)).kind, 'recovery-required')
    let recovered = await restarted.resolveRecovery(key, 'recover')
    assert.deepEqual(region(recovered).prompts!.negative, custom)
    recovered = await restarted.updateRegionalGuidancePrompt(key, owner(recovered), {
      kind: 'negative-source',
      useGlobalNegativePrompt: false,
    })
    assert.deepEqual(region(recovered).prompts!.negative, custom)
    await restarted.save(key)
    await restarted.close(key)
    const opened = await restarted.open(key)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('Saved regional prompts must reopen.')
    }
    assert.deepEqual(region(opened.tab).prompts!.negative, custom)
    const portable = await readIgsPackage(f.savedPath)
    assert.deepEqual(portable.project.regionalGuidance![0].prompts!.negative, custom)
    assert.deepEqual(portable.project.layers, baseline.layers)
    assert.equal(portable.project.generationDraft.negativePrompt.text, 'new global text')
    assert.equal(
      portable.project.generationDraft.positivePrompt.text,
      baseline.generationDraft.positivePrompt.text,
    )
    const removed = await restarted.updateRegionalGuidancePrompt(key, owner(opened.tab), {
      kind: 'block',
      polarity: 'negative',
      present: false,
    })
    assert.equal(Object.hasOwn(region(removed), 'prompts'), false)
    const restored = await restarted.undo(key)
    assert.deepEqual(region(restored).prompts!.negative, custom)
    assert.equal(region(restored).prompts!.useGlobalNegativePrompt, false)
  })
})

test('regional inheritance mutation boundary: portable package retains dormant custom text and exact refs', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'negative')
    const custom: GenerationPrompt = {
      embeddingRefs: [f.ref],
      text: '{custom|negative}, <saved>\n  exact authored spacing  ',
    }
    f.setResolver(async () => structuredClone(custom))
    await change(f, { kind: 'text', polarity: 'negative', text: custom.text })
    await change(f, { kind: 'negative-source', useGlobalNegativePrompt: true })
    // Deliberately measure after the real writer/loader, so the mutation oracle is durable.
    await f.service.save(f.tab().id)
    const key = f.tab().id
    await f.service.close(key)
    const reopened = await f.service.open(key)
    assert.equal(reopened.kind, 'opened')
    const saved = await readIgsPackage(f.savedPath)
    assert.deepEqual(saved.project.regionalGuidance![0].prompts, {
      negative: custom,
      positive: null,
      useGlobalNegativePrompt: true,
    })
    assert.equal(saved.project.generationDraft.negativePrompt.text, 'global <saved>')
    if (reopened.kind !== 'opened') {
      throw new Error('Mutation boundary must reopen a real package.')
    }
    assert.deepEqual(region(reopened.tab).prompts, saved.project.regionalGuidance![0].prompts)
  })
})

test('regional inheritance neighbor: global positive edits preserve absent regional blocks in actual packages', async () => {
  await withProject(async (f) => {
    await f.service.updateGenerationDraft(f.tab().id, {
      kind: 'positive-prompt',
      text: 'global positive control',
    })
    await f.service.save(f.tab().id)
    const saved = await readIgsPackage(f.savedPath)
    assert.equal(saved.project.generationDraft.positivePrompt.text, 'global positive control')
    assert.equal(Object.hasOwn(saved.project.regionalGuidance![0], 'prompts'), false)
    assert.equal(saved.project.generationDraft.negativePrompt.text, 'global <saved>')
  })
})

test('regional focus groups own one Undo and net-zero focus preserves Redo and saved absence', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const baseline = f.document()
    const historyGroupId = group(f.tab(), 'positive')
    for (const text of ['r', 'red', '{red|blue}']) {
      await change(f, { historyGroupId, kind: 'text', polarity: 'positive', text })
    }
    await f.service.sealPromptHistory(f.tab().id, historyGroupId)
    assert.equal(f.tab().canUndo, true)
    await f.service.undo(f.tab().id)
    assert.deepEqual(f.document(), baseline)
    assert.equal(f.tab().canUndo, false)
    assert.equal(f.tab().canRedo, true)
    const zeroGroup = group(f.tab(), 'positive')
    await change(f, {
      historyGroupId: zeroGroup,
      kind: 'text',
      polarity: 'positive',
      text: 'temporary',
    })
    await change(f, { historyGroupId: zeroGroup, kind: 'text', polarity: 'positive', text: '' })
    await f.service.sealPromptHistory(f.tab().id, historyGroupId)
    await f.service.sealPromptHistory(f.tab().id, zeroGroup)
    assert.deepEqual(f.document(), baseline)
    assert.equal(f.tab().canUndo, false)
    assert.equal(f.tab().canRedo, true)
    await f.service.redo(f.tab().id)
    assert.equal(region(f.tab()).prompts!.positive!.text, '{red|blue}')
    assert.equal(f.tab().canRedo, false)
  })
})

test('regional prompt no-ops and malformed, locked, stale or foreign owners leave document and package intact', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    await addBlock(f, 'negative')
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const baseline = f.tab()
    const bytes = await readFile(f.savedPath)
    for (const command of [
      { kind: 'block', polarity: 'positive', present: true },
      { kind: 'text', polarity: 'positive', text: '' },
      { kind: 'negative-source', useGlobalNegativePrompt: false },
    ] as const) {
      await change(f, command)
    }
    assert.deepEqual(f.tab(), baseline)
    const valid = { kind: 'text', polarity: 'positive', text: 'refused' } as const
    for (const target of [
      { ...owner(f.tab()), documentRevision: randomUUID() },
      { ...owner(f.tab()), documentId: randomUUID() },
      owner(f.tab(), region(f.tab()).mask.id),
      owner(f.tab(), f.tab().layers[0].id),
    ]) {
      await assert.rejects(f.service.updateRegionalGuidancePrompt(f.tab().id, target, valid))
    }
    for (const invalid of [
      { ...valid, embeddingRefs: [f.ref] },
      { ...valid, historyGroupId: `regional:${randomUUID()}:positive:${randomUUID()}` },
      { ...valid, historyGroupId: group(f.tab(), 'negative') },
      {
        ...valid,
        embeddingSelection: {
          resource: f.ref.resource,
          resourceId: randomUUID(),
          token: '<saved>',
          versionId: randomUUID(),
        },
      },
    ]) {
      await assert.rejects(
        f.service.updateRegionalGuidancePrompt(f.tab().id, owner(f.tab()), invalid),
        { code: 'PROJECT_INVALID_INPUT' },
      )
    }
    assert.deepEqual(f.tab(), baseline)
    const stale = owner(f.tab())
    await change(f, { kind: 'negative-source', useGlobalNegativePrompt: true })
    await assert.rejects(f.service.updateRegionalGuidancePrompt(f.tab().id, stale, valid), {
      code: 'EDIT_CONFLICT',
    })
    await assert.rejects(
      change(f, { kind: 'text', polarity: 'negative', text: 'hidden custom edit' }),
      { code: 'PROJECT_INVALID_INPUT' },
    )
    await f.service.updateRegionalGuidance(f.tab().id, owner(f.tab()), {
      kind: 'lock',
      locked: true,
    })
    const locked = f.tab()
    for (const command of [
      valid,
      { kind: 'block', polarity: 'positive', present: true },
      { kind: 'negative-source', useGlobalNegativePrompt: true },
    ] as const) {
      await assert.rejects(change(f, command), { code: 'PROJECT_LAYER_LOCKED' })
    }
    assert.deepEqual(f.tab(), locked)
    assert.ok((await readFile(f.savedPath)).equals(bytes))
  })
})

test('regional duplicate copies prompt templates and exact refs independently with new current-owned IDs', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'negative')
    const prompt = { embeddingRefs: [f.ref], text: '{one|two}, <saved>' }
    f.setResolver(async () => structuredClone(prompt))
    await change(f, { kind: 'text', polarity: 'negative', text: prompt.text })
    await change(f, { kind: 'negative-source', useGlobalNegativePrompt: true })
    const before = f.document()
    const source = region(f.tab())
    const tab = await f.service.duplicateRegionalGuidance(f.tab().id, owner(f.tab()))
    const copy = tab.regionalGuidance![1]
    assert.notEqual(copy.id, source.id)
    assert.notEqual(copy.mask.id, source.mask.id)
    assert.deepEqual(copy.prompts, source.prompts)
    await change(f, { kind: 'negative-source', useGlobalNegativePrompt: false }, copy.id)
    await change(f, { kind: 'text', polarity: 'negative', text: 'copy custom' }, copy.id)
    assert.deepEqual(region(f.tab(), source.id), source)
    assert.deepEqual(region(f.tab(), copy.id).prompts!.negative, {
      embeddingRefs: [],
      text: 'copy custom',
    })
    assert.deepEqual(f.document().generationDraft, before.generationDraft)
    assert.deepEqual(f.document().layers, before.layers)
  })
})

test('regional resolver captures Current Canvas family, IDs, text and owner before await and returns detached sidecars', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    const entered = deferred()
    const release = deferred()
    f.setResolver(async (input) => {
      entered.release()
      await release.promise
      assert.equal(input.modelFamily, 'illustrious')
      return { embeddingRefs: [f.ref], text: input.text }
    })
    const target = owner(f.tab())
    const command = {
      embeddingSelection: {
        resourceId: f.ref.resource.localModelId,
        token: f.ref.token,
        versionId: f.ref.resource.localVersionId,
      },
      kind: 'text' as const,
      polarity: 'positive' as const,
      text: '<saved>',
    }
    const pending = f.service.updateRegionalGuidancePrompt(f.tab().id, target, command)
    await entered.promise
    target.regionId = randomUUID()
    command.text = 'caller changed'
    command.embeddingSelection.token = '<caller>'
    release.release()
    const result = await pending
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].text, '<saved>')
    assert.equal(f.calls[0].selection!.token, '<saved>')
    assert.deepEqual(region(result).prompts!.positive, { embeddingRefs: [f.ref], text: '<saved>' })
    region(result).prompts!.positive!.embeddingRefs[0].resource.displayName = 'DTO changed'
    assert.equal(
      region(f.tab()).prompts!.positive!.embeddingRefs[0].resource.displayName,
      f.ref.resource.displayName,
    )
  })
})

test('regional document-only edits retain and prune copied refs but reject new exact selections', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    const doc = f.document()
    doc.regionalGuidance![0].prompts!.positive = { embeddingRefs: [f.ref], text: '<saved>' }
    await f.co().applyDocument(doc)
    await change(f, { kind: 'text', polarity: 'positive', text: 'prefix <saved>' })
    assert.deepEqual(region(f.tab()).prompts!.positive!.embeddingRefs, [f.ref])
    await change(f, { kind: 'text', polarity: 'positive', text: 'ordinary text' })
    assert.deepEqual(region(f.tab()).prompts!.positive!.embeddingRefs, [])
    const before = f.tab()
    await assert.rejects(
      change(f, {
        embeddingSelection: {
          resourceId: f.ref.resource.localModelId,
          token: '<saved>',
          versionId: f.ref.resource.localVersionId,
        },
        kind: 'text',
        polarity: 'positive',
        text: '<saved>',
      }),
      { code: 'PROJECT_NOT_READY' },
    )
    assert.deepEqual(f.tab(), before)
  }, true)
})

test('regional delayed resolver and staged publication reject ABA, deletion, lock, source changes and coordinator replacement', async (t) => {
  for (const phase of ['resolver', 'staging'] as const) {
    for (const interference of [
      'ABA',
      'delete',
      'delete-region',
      'lock',
      'source',
      'reopen',
    ] as const) {
      await t.test(`${phase}: ${interference}`, async () =>
        withProject(async (f) => {
          await addBlock(f, 'negative')
          await f.service.save(f.tab().id)
          await f.service.clearHistory(f.tab().id)
          const baseline = f.document()
          const entered = deferred()
          const release = deferred()
          if (phase === 'resolver') {
            f.setResolver(async (input) => {
              entered.release()
              await release.promise
              return { embeddingRefs: [], text: input.text }
            })
          } else {
            f.setBeforeEdit(async (candidate) => {
              if (candidate.regionalGuidance?.[0].prompts?.negative?.text === '<held>') {
                entered.release()
                await release.promise
              }
            })
          }
          const key = f.tab().id
          const pending = change(f, { kind: 'text', polarity: 'negative', text: '<held>' })
          const refused = assert.rejects(pending, (error: unknown) =>
            Boolean(
              error &&
              typeof error === 'object' &&
              'code' in error &&
              ['COORDINATOR_CLOSED', 'EDIT_CONFLICT'].includes(String(error.code)),
            ),
          )
          await entered.promise
          try {
            switch (interference) {
              case 'ABA': {
                await f.service.setPrimaryBbox(key, { ...f.tab().primaryBbox, x: 77 })
                await f.service.undo(key)
                assert.equal(f.document().documentRevision, baseline.documentRevision)

                break
              }
              case 'delete': {
                await change(f, { kind: 'block', polarity: 'negative', present: false })

                break
              }
              case 'delete-region': {
                await f.service.deleteRegionalGuidance(key, owner(f.tab()))

                break
              }
              case 'lock': {
                await f.service.updateRegionalGuidance(key, owner(f.tab()), {
                  kind: 'lock',
                  locked: true,
                })

                break
              }
              case 'source': {
                await change(f, { kind: 'negative-source', useGlobalNegativePrompt: true })

                break
              }
              default: {
                await f.service.close(key)
                assert.equal((await f.service.open(key)).kind, 'opened')
              }
            }
          } finally {
            release.release()
          }
          await refused
          f.setBeforeEdit()
          if (interference === 'delete-region') {
            assert.equal(f.tab().regionalGuidance, undefined)
          } else {
            assert.notEqual(region(f.tab()).prompts?.negative?.text, '<held>')
          }
          if (interference === 'ABA' || interference === 'reopen') {
            assert.deepEqual(f.document(), baseline)
            assert.equal(f.tab().canUndo, false)
          }
        }),
      )
    }
  }
})

test('regional resolver rewrite, malformed role and controlled staging refusal leave no document or history entry', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const baseline = f.tab()
    const bytes = await readFile(f.savedPath)
    f.setResolver(async () => ({ embeddingRefs: [], text: 'rewritten' }))
    await assert.rejects(change(f, { kind: 'text', polarity: 'positive', text: '<saved>' }), {
      code: 'PROJECT_INVALID_INPUT',
    })
    f.setResolver(async (input) => ({
      embeddingRefs: [{ ...f.ref, resource: { ...f.ref.resource, kind: 'checkpoint' } }],
      text: input.text,
    }))
    await assert.rejects(change(f, { kind: 'text', polarity: 'positive', text: '<saved>' }), {
      code: 'INVALID_PROJECT',
    })
    f.setBeforeEdit(async () => {
      throw new Error('Controlled regional prompt publication refusal')
    })
    await assert.rejects(
      change(f, { kind: 'text', polarity: 'positive', text: 'ordinary text' }),
      /Controlled regional prompt publication refusal/,
    )
    f.setBeforeEdit()
    assert.deepEqual(f.tab(), baseline)
    assert.ok((await readFile(f.savedPath)).equals(bytes))
  })
})

test('regional prompt Save A and later edit B retain separate package and recoverable authoring snapshots', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    await change(f, { kind: 'text', polarity: 'positive', text: 'Saved A' })
    const committed = deferred()
    const release = deferred()
    f.setAfterSave(async () => {
      committed.release()
      await release.promise
    })
    const key = f.tab().id
    const saving = f.service.save(key)
    await committed.promise
    try {
      assert.equal(
        (await readIgsPackage(f.savedPath)).project.regionalGuidance![0].prompts!.positive!.text,
        'Saved A',
      )
      await change(f, { kind: 'text', polarity: 'positive', text: 'Recover B' })
      await f.service.flushAutosave(key)
    } finally {
      release.release()
    }
    const result = await saving
    f.setAfterSave()
    assert.equal(result.tab.dirty, true)
    const saved = await readIgsPackage(f.savedPath)
    const inspected = await f.shadow.inspect({ projectPath: f.savedPath, savedPackage: saved })
    assert.equal(inspected.status, 'recoverable')
    if (inspected.status !== 'recoverable') {
      throw new Error('Edit B must remain recoverable.')
    }
    assert.equal(inspected.document.regionalGuidance![0].prompts!.positive!.text, 'Recover B')
    const restarted = f.restart()
    assert.equal((await restarted.open(key)).kind, 'recovery-required')
    const recovered = await restarted.resolveRecovery(key, 'recover')
    assert.equal(region(recovered).prompts!.positive!.text, 'Recover B')
    assert.equal(
      (await readIgsPackage(f.savedPath)).project.regionalGuidance![0].prompts!.positive!.text,
      'Saved A',
    )
  })
})

test('regional dirty prompts survive a real external-package Save refusal without replacing the external file', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    await change(f, { kind: 'text', polarity: 'positive', text: 'Unsaved local prompt' })
    await f.service.flushAutosave(f.tab().id)
    const before = f.document()
    const saved = await readIgsPackage(f.savedPath)
    const assets: Record<string, { bytes: Buffer }> = {}
    for (const ref of projectAssetReferences(saved.project)) {
      assets[ref.path] = { bytes: await saved.readMember(ref.path) }
    }
    await saveIgsPackage(f.savedPath, {
      assets,
      preview: {
        merged: await saved.readMember('preview/merged.png'),
        rect: saved.manifest.preview.rect,
        status: saved.manifest.preview.status,
        thumbnail: await saved.readMember('preview/thumbnail.webp'),
      },
      project: {
        ...saved.project,
        documentRevision: randomUUID(),
        title: 'External package owner',
      },
    })
    const external = await readFile(f.savedPath)
    await assert.rejects(f.service.save(f.tab().id))
    assert.deepEqual(f.document(), before)
    assert.ok((await readFile(f.savedPath)).equals(external))
    assert.equal(f.tab().dirty, true)
    assert.notEqual(
      (
        await f.shadow.inspect({
          projectPath: f.savedPath,
          savedPackage: await readIgsPackage(f.savedPath),
        })
      ).status,
      'absent',
    )
  })
})

test('regional aggregate UTF-8 ceiling rejects text, Add and copied prompts before publication with real near-limit Save controls', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    const input = f.document()
    for (let index = 0; index < 16; index += 1) {
      input.regionalGuidance!.push({
        enabled: false,
        id: randomUUID(),
        locked: false,
        mask: { asset: null, id: randomUUID(), revision: 0 },
        name: `Size fixture ${index}`,
        overlayOpacity: 0.5,
        prompts: {
          negative: null,
          positive: { embeddingRefs: [], text: '' },
          useGlobalNegativePrompt: true,
        },
      })
    }
    const near = parseProjectDocumentV1(input)
    let remaining =
      IGS_SAFETY_CEILINGS.projectJsonBytes - 8 - Buffer.byteLength(JSON.stringify(near), 'utf8')
    for (const filler of near.regionalGuidance!.slice(1)) {
      const count = Math.min(remaining, IGS_SAFETY_CEILINGS.textBytes)
      filler.prompts!.positive!.text = 'x'.repeat(count)
      remaining -= count
    }
    assert.equal(remaining, 0)
    await f.co().applyDocument(near)
    await f.service.save(f.tab().id)
    await f.service.clearHistory(f.tab().id)
    const before = fingerprint(f.document())
    const bytes = await readFile(f.savedPath)
    assert.equal(
      Buffer.byteLength(JSON.stringify(f.document()), 'utf8'),
      IGS_SAFETY_CEILINGS.projectJsonBytes - 8,
    )
    const copiedId = f.tab().regionalGuidance![1].id
    for (const attempt of [
      () => change(f, { kind: 'text', polarity: 'positive', text: 'я'.repeat(5) }),
      () =>
        f.service.addRegionalGuidance(f.tab().id, {
          documentId: f.tab().documentId,
          documentRevision: f.tab().documentRevision,
        }),
      () => f.service.duplicateRegionalGuidance(f.tab().id, owner(f.tab(), copiedId)),
    ]) {
      await assert.rejects(attempt(), { code: 'PROJECT_INVALID_INPUT' })
      assert.equal(fingerprint(f.document()), before, 'oversized regional input must not publish')
      assert.equal(f.tab().canUndo, false)
      assert.equal(f.tab().canRedo, false)
      assert.ok(
        (await readFile(f.savedPath)).equals(bytes),
        'oversized input must preserve package bytes',
      )
      const inspection = await f.shadow.inspect({
        projectPath: f.savedPath,
        savedPackage: await readIgsPackage(f.savedPath),
      })
      assert.ok(inspection.status === 'absent' || inspection.status === 'clean')
    }
    await change(f, { kind: 'text', polarity: 'positive', text: 'я'.repeat(4) })
    assert.equal(
      Buffer.byteLength(JSON.stringify(f.document()), 'utf8'),
      IGS_SAFETY_CEILINGS.projectJsonBytes,
    )
    await f.service.save(f.tab().id)
    assert.equal(
      (await readIgsPackage(f.savedPath)).project.regionalGuidance![0].prompts!.positive!.text,
      'я'.repeat(4),
    )
    // Release two owned filler blocks: the same copied-text and Add paths now fit.
    for (const filler of f.tab().regionalGuidance!.slice(2, 4)) {
      await f.service.deleteRegionalGuidance(f.tab().id, owner(f.tab(), filler.id))
    }
    const copied = await f.service.duplicateRegionalGuidance(f.tab().id, owner(f.tab(), copiedId))
    assert.equal(
      copied.regionalGuidance![2].prompts!.positive!.text.length,
      IGS_SAFETY_CEILINGS.textBytes,
    )
    const tab = f.tab()
    await f.service.addRegionalGuidance(tab.id, {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
    })
    assert.ok(
      Buffer.byteLength(JSON.stringify(f.document()), 'utf8') <=
        IGS_SAFETY_CEILINGS.projectJsonBytes,
    )
  })
})

test('regional refused selection repair keeps queued text bound across history and package reopen', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    const key = f.tab().id
    await f.service.save(key)
    await f.service.clearHistory(key)
    const baseline = f.document()
    const baselinePackage = await readIgsPackage(f.savedPath)
    const baselineAssets = new Map<string, Buffer>()
    for (const asset of projectAssetReferences(baseline)) {
      baselineAssets.set(asset.path, await baselinePackage.readMember(asset.path))
    }
    const exactA = structuredClone(f.ref)
    const exactC: PromptEmbeddingRef = {
      resource: {
        ...exactA.resource,
        fileSha256: 'c'.repeat(64),
        localVersionId: randomUUID(),
        versionName: 'Replacement exact version C',
      },
      token: exactA.token,
    }
    const enteredA = deferred()
    const releaseA = deferred()
    // Declared controlled binding seam: two versions own the same canonical token. Actual
    // ModelService file verification, installed catalogs, ML and inference are not qualified.
    f.setResolver(async (input) => {
      if (input.selection?.versionId === exactA.resource.localVersionId) {
        assert.equal(input.selection.resourceId, exactA.resource.localModelId)
        assert.equal(input.selection.token, exactA.token)
        enteredA.release()
        await releaseA.promise
        throw new Error('Controlled verification refusal for exact regional selection A')
      }
      if (input.selection) {
        assert.deepEqual(input.selection, {
          resourceId: exactC.resource.localModelId,
          token: exactC.token,
          versionId: exactC.resource.localVersionId,
        })
        return reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, [], exactC)
      }
      // Ambiguous-token equivalent: plain typing retains/prunes existing bindings and cannot
      // automatically choose either version, including when B still contains the same token.
      return reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, [])
    })

    let rendererAcknowledged = f.tab()
    const acknowledgements: ProjectTab[] = []
    const errors: (Error | null)[] = []
    const inFlight = new Set<Promise<ProjectTab>>()
    const sync = new RegionalPromptSync({
      current: (tabId) => (tabId === key ? rendererAcknowledged : undefined),
      onAcknowledged: (tab) => {
        rendererAcknowledged = structuredClone(tab)
        acknowledgements.push(structuredClone(tab))
        sync.observe(tab)
      },
      onError: (_tabId, error) => errors.push(error),
      onOverlay: () => {},
      seal: (tabId, historyGroupId) => f.service.sealPromptHistory(tabId, historyGroupId),
      send: async (tabId, target, command) => {
        const pending = f.service.updateRegionalGuidancePrompt(tabId, target, command)
        inFlight.add(pending)
        try {
          return await pending
        } finally {
          inFlight.delete(pending)
        }
      },
    })
    const oldGroup = group(rendererAcknowledged, 'positive')
    const newGroup = group(rendererAcknowledged, 'positive')
    const textA = `first selection ${exactA.token}`
    const textB = `${textA}, queued ordinary text`
    const textC = `${textB}, replacement focus suffix`
    try {
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        embeddingSelection: {
          resourceId: exactA.resource.localModelId,
          token: exactA.token,
          versionId: exactA.resource.localVersionId,
        },
        historyGroupId: oldGroup,
        kind: 'text',
        polarity: 'positive',
        text: textA,
      })
      await enteredA.promise
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        historyGroupId: oldGroup,
        kind: 'text',
        polarity: 'positive',
        text: textB,
      })
      sync.seal(rendererAcknowledged, owner(rendererAcknowledged), oldGroup)
      const refused = assert.rejects(
        sync.flush(key),
        /Controlled verification refusal for exact regional selection A/,
      )
      releaseA.release()
      await refused
      assert.deepEqual(f.document(), baseline)
      assert.equal(f.tab().canUndo, false)
      assert.equal(sync.hasPending(key), true)

      // The replacement repairs unpublished A in place while its own new-focus edit stays
      // after B and the old blur seal. Dropping only A creates an unbound B Undo snapshot.
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        embeddingSelection: {
          resourceId: exactC.resource.localModelId,
          token: exactC.token,
          versionId: exactC.resource.localVersionId,
        },
        historyGroupId: newGroup,
        kind: 'text',
        polarity: 'positive',
        text: textC,
      })
      sync.seal(rendererAcknowledged, owner(rendererAcknowledged), newGroup)
      await sync.flush(key)
      assert.equal(sync.hasPending(key), false)
      assert.ok(errors.some((error) => error?.message.includes('selection A')))
      assert.deepEqual(region(f.tab()).prompts!.positive, {
        embeddingRefs: [exactC],
        text: textC,
      })

      const undoC = await f.service.undo(key)
      // Main history is the decisive regression oracle: the old helper restores B with [].
      assert.deepEqual(region(undoC).prompts!.positive, {
        embeddingRefs: [exactC],
        text: textB,
      })
      assert.deepEqual(f.document().generationDraft, baseline.generationDraft)
      assert.deepEqual(f.document().layers, baseline.layers)
      assert.equal(f.document().lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)
      assert.ok(acknowledgements.some((tab) => region(tab).prompts!.positive!.text === textA))
      for (const tab of acknowledgements) {
        const prompt = region(tab).prompts!.positive!
        if (prompt.text === textA || prompt.text === textB) {
          assert.deepEqual(prompt.embeddingRefs, [exactC])
        }
      }
      await f.service.undo(key)
      assert.deepEqual(f.document(), baseline)
      assert.equal(f.tab().canUndo, false)
      const redoB = await f.service.redo(key)
      assert.deepEqual(region(redoB).prompts!.positive, { embeddingRefs: [exactC], text: textB })
      const redoC = await f.service.redo(key)
      assert.deepEqual(region(redoC).prompts!.positive, { embeddingRefs: [exactC], text: textC })
      assert.equal(redoC.canRedo, false)

      await f.service.save(key)
      const saved = await readIgsPackage(f.savedPath)
      const raw = JSON.parse(
        (await saved.readMember('project.json')).toString('utf8'),
      ) as IgsProjectDocumentV1
      assert.deepEqual(raw, saved.project)
      assert.deepEqual(saved.project.regionalGuidance![0].prompts!.positive, {
        embeddingRefs: [exactC],
        text: textC,
      })
      assert.deepEqual(saved.project.generationDraft, baseline.generationDraft)
      assert.deepEqual(saved.project.layers, baseline.layers)
      assert.deepEqual(saved.project.primaryBbox, baseline.primaryBbox)
      assert.equal(saved.project.lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)
      for (const [assetPath, bytes] of baselineAssets) {
        assert.ok((await saved.readMember(assetPath)).equals(bytes))
      }
      await f.service.close(key)
      const reopened = await f.service.open(key)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Repaired regional prompt must reopen.')
      }
      assert.deepEqual(region(reopened.tab).prompts!.positive, {
        embeddingRefs: [exactC],
        text: textC,
      })
      assert.deepEqual(f.document(), saved.project)
      assert.equal(reopened.tab.dirty, false)
    } finally {
      releaseA.release()
      sync.forget(key)
      await Promise.allSettled(inFlight)
    }
  })
})

test('regional refused selection removal cancels old unpublished text across history and package reopen', async () => {
  await withProject(async (f) => {
    await addBlock(f, 'positive')
    const key = f.tab().id
    await f.service.save(key)
    await f.service.clearHistory(key)
    const baseline = f.document()
    const baselineEpoch = f.co().documentEpoch
    const baselineBytes = await readFile(f.savedPath)
    const baselinePackage = await readIgsPackage(f.savedPath)
    const baselineAssets = new Map<string, Buffer>()
    for (const asset of projectAssetReferences(baseline)) {
      baselineAssets.set(asset.path, await baselinePackage.readMember(asset.path))
    }
    const exactA = structuredClone(f.ref)
    const exactC: PromptEmbeddingRef = {
      resource: {
        ...exactA.resource,
        fileSha256: 'c'.repeat(64),
        localVersionId: randomUUID(),
        versionName: 'Replacement C in re-added block',
      },
      token: exactA.token,
    }
    const enteredA = deferred()
    const releaseA = deferred()
    // Declared controlled resolver seam: A and C own one ambiguous token, A verification
    // refuses and explicit C binds exactly. Actual ModelService files/catalogs and ML are
    // not qualified; plain edits only retain/prune refs and never automatically choose C.
    f.setResolver(async (input) => {
      if (input.selection?.versionId === exactA.resource.localVersionId) {
        assert.deepEqual(input.selection, {
          resourceId: exactA.resource.localModelId,
          token: exactA.token,
          versionId: exactA.resource.localVersionId,
        })
        enteredA.release()
        await releaseA.promise
        throw new Error('Controlled verification refusal for removed-block selection A')
      }
      if (input.selection) {
        assert.deepEqual(input.selection, {
          resourceId: exactC.resource.localModelId,
          token: exactC.token,
          versionId: exactC.resource.localVersionId,
        })
        return reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, [], exactC)
      }
      return reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, [])
    })

    let rendererAcknowledged = f.tab()
    const publishedPrompts: (GenerationPrompt | null | undefined)[] = []
    const inFlight = new Set<Promise<ProjectTab>>()
    const sync = new RegionalPromptSync({
      current: (tabId) => (tabId === key ? rendererAcknowledged : undefined),
      onAcknowledged: (tab) => {
        rendererAcknowledged = structuredClone(tab)
        sync.observe(tab)
      },
      onError: () => {},
      onOverlay: () => {},
      seal: (tabId, historyGroupId) => f.service.sealPromptHistory(tabId, historyGroupId),
      send: async (tabId, target, command) => {
        const pending = f.service.updateRegionalGuidancePrompt(tabId, target, command)
        inFlight.add(pending)
        try {
          const tab = await pending
          // Successful real Main returns, independent of renderer ACK adoption.
          publishedPrompts.push(structuredClone(region(tab).prompts?.positive))
          return tab
        } finally {
          inFlight.delete(pending)
        }
      },
    })
    const oldGroup = group(rendererAcknowledged, 'positive')
    const newGroup = group(rendererAcknowledged, 'positive')
    const textA = `unpublished old block ${exactA.token}`
    const textB = `${textA}, queued text B`
    const textC = `newly added block ${exactC.token}, explicit replacement C`
    try {
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        embeddingSelection: {
          resourceId: exactA.resource.localModelId,
          token: exactA.token,
          versionId: exactA.resource.localVersionId,
        },
        historyGroupId: oldGroup,
        kind: 'text',
        polarity: 'positive',
        text: textA,
      })
      await enteredA.promise
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        historyGroupId: oldGroup,
        kind: 'text',
        polarity: 'positive',
        text: textB,
      })
      sync.seal(rendererAcknowledged, owner(rendererAcknowledged), oldGroup)
      // Both lifecycle commands precede the refusal and the replacement editor's selection.
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        kind: 'block',
        polarity: 'positive',
        present: false,
      })
      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        kind: 'block',
        polarity: 'positive',
        present: true,
      })
      const refused = assert.rejects(
        sync.flush(key),
        /Controlled verification refusal for removed-block selection A/,
      )
      releaseA.release()
      await refused
      assert.deepEqual(f.document(), baseline)
      assert.equal(f.co().documentEpoch, baselineEpoch)
      assert.equal(f.tab().canUndo, false)
      assert.equal(publishedPrompts.length, 0)
      assert.ok((await readFile(f.savedPath)).equals(baselineBytes))
      assert.equal(sync.hasPending(key), true)

      sync.change(rendererAcknowledged, owner(rendererAcknowledged), {
        embeddingSelection: {
          resourceId: exactC.resource.localModelId,
          token: exactC.token,
          versionId: exactC.resource.localVersionId,
        },
        historyGroupId: newGroup,
        kind: 'text',
        polarity: 'positive',
        text: textC,
      })
      sync.seal(rendererAcknowledged, owner(rendererAcknowledged), newGroup)
      await sync.flush(key)
      assert.equal(sync.hasPending(key), false)
      assert.deepEqual(region(f.tab()).prompts!.positive, { embeddingRefs: [exactC], text: textC })

      const undoC = await f.service.undo(key)
      assert.deepEqual(region(undoC).prompts!.positive, { embeddingRefs: [], text: '' })
      const undoAdd = await f.service.undo(key)
      assert.equal(Object.hasOwn(region(undoAdd), 'prompts'), false)
      await f.service.undo(key)
      // Decisive real-history oracle: repairing A before queued Remove resurrects B bound
      // to C here. The removed block must instead restore its captured pre-A empty state.
      assert.deepEqual(f.document(), baseline)
      assert.equal(f.tab().canUndo, false)
      assert.equal(
        publishedPrompts.some((prompt) => prompt?.text === textA || prompt?.text === textB),
        false,
        'unpublished text from the removed block must never be committed by Main',
      )
      const redoRemove = await f.service.redo(key)
      assert.equal(Object.hasOwn(region(redoRemove), 'prompts'), false)
      const redoAdd = await f.service.redo(key)
      assert.deepEqual(region(redoAdd).prompts!.positive, { embeddingRefs: [], text: '' })
      const redoC = await f.service.redo(key)
      assert.deepEqual(region(redoC).prompts!.positive, { embeddingRefs: [exactC], text: textC })
      assert.equal(redoC.canRedo, false)
      assert.deepEqual(f.document().generationDraft, baseline.generationDraft)
      assert.deepEqual(f.document().layers, baseline.layers)
      assert.equal(f.document().lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)

      await f.service.save(key)
      const saved = await readIgsPackage(f.savedPath)
      const raw = JSON.parse(
        (await saved.readMember('project.json')).toString('utf8'),
      ) as IgsProjectDocumentV1
      assert.deepEqual(raw, saved.project)
      assert.deepEqual(saved.project.regionalGuidance![0].prompts!.positive, {
        embeddingRefs: [exactC],
        text: textC,
      })
      assert.deepEqual(saved.project.generationDraft, baseline.generationDraft)
      assert.deepEqual(saved.project.layers, baseline.layers)
      assert.deepEqual(saved.project.primaryBbox, baseline.primaryBbox)
      assert.equal(saved.project.lastActualSeedSnapshot, baseline.lastActualSeedSnapshot)
      for (const [assetPath, bytes] of baselineAssets) {
        assert.ok((await saved.readMember(assetPath)).equals(bytes))
      }
      await f.service.close(key)
      const reopened = await f.service.open(key)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Replacement prompt in the re-added block must reopen.')
      }
      assert.deepEqual(region(reopened.tab).prompts!.positive, {
        embeddingRefs: [exactC],
        text: textC,
      })
      assert.deepEqual(f.document(), saved.project)
      assert.equal(reopened.tab.dirty, false)
    } finally {
      releaseA.release()
      sync.forget(key)
      await Promise.allSettled(inFlight)
    }
  })
})
