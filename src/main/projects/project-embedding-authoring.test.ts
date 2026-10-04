import type { ProjectEmbeddingIdentity, ProjectGenerationDraftChange } from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import type {
  GenerationPrompt,
  PromptEmbeddingSelection,
} from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ProjectDraftSync } from '../../renderer/components/project-draft-sync.js'
import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService, type ProjectServiceOptions } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const placeholdersDir = path.resolve('src/main/projects/placeholders')
type EmbeddingResolverInput = Parameters<
  NonNullable<ProjectServiceOptions['resolvePromptEmbeddings']>
>[0]

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function withEmbeddingService(
  run: (context: {
    dataRoot: string
    modelRepository: ModelRepository
    models: ModelService
    projectOptions: ProjectServiceOptions
    repository: ProjectIndexRepository
    retiredTabIds: Set<string>
    service: ProjectService
    shadow: ProjectShadowStore
  }) => Promise<void>,
  options: {
    beforeEditCommit?: ProjectAutosaveOptions['beforeEditCommit']
    documentOnly?: boolean
    verify?: (input: EmbeddingResolverInput, models: ModelService) => Promise<GenerationPrompt>
  } = {},
) {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-embedding-authoring-'))
  const database = openAppDatabase(dataRoot, path.resolve('src/main/db/migrations'))
  const modelRepository = new ModelRepository(database.db)
  const models = new ModelService(
    modelRepository,
    new CivitaiClient(),
    new CivitaiTokenStore(
      {
        decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
        encryptStringAsync: async () => Buffer.alloc(0),
        getSelectedStorageBackend: () => 'gnome_libsecret',
        isAsyncEncryptionAvailable: async () => true,
      },
      dataRoot,
    ),
  )
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(dataRoot, 'autosave'))
  const projectOptions: ProjectServiceOptions = {
    autosaveOptions: {
      beforeEditCommit: options.beforeEditCommit,
      debounceMs: 0,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    },
    dataRoot,
    repository,
    resolvePromptEmbeddings: options.documentOnly
      ? undefined
      : (input) =>
          options.verify
            ? options.verify(input, models)
            : models.resolveGenerationPromptEmbeddings(input),
    roots: { placeholdersDir, scratchDir: path.join(dataRoot, 'scratch') },
    shadow,
  }
  const service = new ProjectService(projectOptions)
  const retiredTabIds = new Set<string>()
  try {
    await run({
      dataRoot,
      modelRepository,
      models,
      projectOptions,
      repository,
      retiredTabIds,
      service,
      shadow,
    })
  } finally {
    for (const tab of service.getOpenTabs()) {
      if (!retiredTabIds.has(tab.id)) {
        await service.flushAutosave(tab.id)
      }
    }
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

async function publishEmbedding(
  modelRepository: ModelRepository,
  dataRoot: string,
  versionId = 20_002,
  fileName = 'face.safetensors',
  modelId = 20_001,
  kind: 'checkpoint' | 'embedding' = 'embedding',
) {
  const bytes = Buffer.from(`Exact installed embedding authoring fixture ${versionId}`)
  const managedPath = path.join(dataRoot, `installed-${versionId}.safetensors`)
  await writeFile(managedPath, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const ids = await modelRepository.publishVerifiedInstallation({
    primary: {
      file: {
        managedPath,
        originalFilename: fileName,
        sha256,
        sizeBytes: bytes.length,
        verifiedAt: new Date().toISOString(),
      },
      resource: {
        displayName: 'Copied face display name',
        source: { kind: 'civitai', modelId },
        sourceMetadata: { baseModel: 'Illustrious' },
        type: kind,
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'SafeTensor',
        name: `Copied version ${versionId}`,
        predictionType: kind === 'checkpoint' ? 'epsilon' : null,
        source: { expectedSha256: sha256, fileId: versionId + 100, kind: 'civitai', versionId },
        sourceMetadata: { baseModel: 'Illustrious', trainedWords: ['unrelated-negative-alias'] },
      },
    },
  })
  return {
    ...ids,
    bytes,
    managedPath,
    sha256,
    token: `<${fileName.slice(0, -'.safetensors'.length)}>`,
  }
}

async function importPortablePrompt(
  service: ProjectService,
  dataRoot: string,
  positivePrompt: GenerationPrompt,
) {
  const document = createEmptyProjectDocumentV1({ title: 'Portable embedding prompt' })
  document.generationDraft.positivePrompt = structuredClone(positivePrompt)
  document.generationDraft.negativePrompt = structuredClone(positivePrompt)
  const source = path.join(dataRoot, `portable-${randomUUID()}.igs`)
  await saveIgsPackage(source, {
    assets: {},
    preview: {
      ...(await readProjectPlaceholders(placeholdersDir, 'empty')),
      rect: null,
      status: 'empty',
    },
    project: document,
  })
  const selected = await service.selectImport(source)
  assert.equal(selected.kind, 'transfer-required')
  if (selected.kind !== 'transfer-required') {
    throw new Error('Expected a portable fixture transfer.')
  }
  const imported = await service.finishImport(selected.importId, 'copy')
  assert.equal(imported.result.kind, 'opened')
  if (imported.result.kind !== 'opened') {
    throw new Error('Expected the portable prompt Project to open.')
  }
  return imported.result.tab
}

test('real embedding Project history, shadow recovery and Save/reopen preserve literal text and exact refs together', async () => {
  await withEmbeddingService(
    async ({
      dataRoot,
      modelRepository,
      models,
      projectOptions,
      repository,
      retiredTabIds,
      service,
      shadow,
    }) => {
      const installed = await publishEmbedding(modelRepository, dataRoot)
      const created = await service.create({
        height: 64,
        title: 'Embedding persistence',
        width: 64,
      })
      const neighbor = await service.create({ height: 64, title: 'Neighbor', width: 64 })
      await service.updateGenerationDraft(created.id, { kind: 'positive-prompt', text: 'portrait' })
      await service.updateGenerationDraft(created.id, { kind: 'seed', policy: 'fixed', value: 0 })
      await service.save(created.id)
      const savedPath = (await repository.getProject(created.id))!.canonicalPath
      const savedBytes = await readFile(savedPath)
      const group = randomUUID()
      const chosen = await service.updateGenerationDraft(
        created.id,
        {
          embeddingSelection: {
            resourceId: installed.resourceId,
            token: installed.token,
            versionId: installed.versionId,
          },
          kind: 'positive-prompt',
          text: `portrait, ${installed.token}`,
        },
        group,
      )
      const ref = chosen.generationDraft.positivePrompt.embeddingRefs[0]
      assert.ok(ref, 'verified explicit choice creates its exact resource sidecar')
      assert.equal(ref.resource.kind, 'embedding')
      assert.equal(ref.resource.fileSha256, installed.sha256)
      assert.equal(ref.resource.localVersionId, installed.versionId)
      const final = await service.updateGenerationDraft(
        created.id,
        {
          kind: 'positive-prompt',
          text: `${chosen.generationDraft.positivePrompt.text}, ${installed.token}`,
        },
        group,
      )
      assert.deepEqual(
        final.generationDraft.positivePrompt.embeddingRefs,
        [ref],
        'repeated literal binds once',
      )
      await service.sealPromptHistory(created.id, group)
      const undone = await service.undo(created.id)
      assert.deepEqual(undone.generationDraft.positivePrompt, {
        embeddingRefs: [],
        text: 'portrait',
      })
      assert.equal(undone.dirty, false)
      assert.deepEqual(
        (await service.redo(created.id)).generationDraft.positivePrompt,
        final.generationDraft.positivePrompt,
      )
      const negative = await service.updateGenerationDraft(created.id, {
        kind: 'negative-prompt',
        text: installed.token,
      })
      assert.deepEqual(
        negative.generationDraft.negativePrompt.embeddingRefs,
        [ref],
        'same canonical literal in either polarity',
      )
      assert.equal(negative.generationDraft.seed.value, 0)
      await service.flushAutosave(created.id)
      assert.deepEqual(
        await readFile(savedPath),
        savedBytes,
        'autosave does not replace the explicit snapshot',
      )
      const recovery = await shadow.inspect({
        projectPath: savedPath,
        savedPackage: await readIgsPackage(savedPath),
      })
      assert.equal(recovery.status, 'recoverable')
      if (recovery.status !== 'recoverable') {
        throw new Error('Expected actual recovery storage')
      }
      assert.deepEqual(recovery.document.generationDraft, negative.generationDraft)
      const restarted = new ProjectService({
        ...projectOptions,
        autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      })
      retiredTabIds.add(created.id)
      assert.equal((await restarted.open(created.id)).kind, 'recovery-required')
      const recovered = await restarted.resolveRecovery(created.id, 'recover')
      assert.deepEqual(recovered.generationDraft, negative.generationDraft)
      await restarted.save(created.id)
      await restarted.close(created.id)
      const newer = await publishEmbedding(modelRepository, dataRoot, 20_003)
      await models.setDefaultVersion(newer.resourceId, newer.versionId)
      const reopened = await restarted.open(created.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Saved embedding Project did not reopen')
      }
      assert.deepEqual(reopened.tab.generationDraft, negative.generationDraft)
      assert.deepEqual(
        (await readIgsPackage(savedPath)).project.generationDraft,
        negative.generationDraft,
      )
      assert.deepEqual(
        service.getOpenTabs().find((tab) => tab.id === neighbor.id)?.generationDraft.positivePrompt,
        { embeddingRefs: [], text: '' },
      )
      await restarted.close(created.id)
    },
  )
})

test('ambiguous unchanged literal is bound only by exact selection and a failed verified edit changes nothing durable', async () => {
  await withEmbeddingService(async ({ dataRoot, modelRepository, repository, service, shadow }) => {
    const first = await publishEmbedding(modelRepository, dataRoot)
    const competing = await publishEmbedding(
      modelRepository,
      dataRoot,
      20_003,
      'face.safetensors',
      20_004,
    )
    const created = await service.create({ height: 64, title: 'Collision', width: 64 })
    const unbound = await service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: first.token,
    })
    assert.deepEqual(unbound.generationDraft.positivePrompt.embeddingRefs, [])
    const linked = await service.updateGenerationDraft(created.id, {
      embeddingSelection: {
        resourceId: first.resourceId,
        token: first.token,
        versionId: first.versionId,
      },
      kind: 'positive-prompt',
      text: first.token,
    })
    assert.equal(
      linked.generationDraft.positivePrompt.embeddingRefs[0].resource.localVersionId,
      first.versionId,
    )
    await service.save(created.id)
    const savedPath = (await repository.getProject(created.id))!.canonicalPath
    const savedBytes = await readFile(savedPath)
    const before = structuredClone(service.getOpenTabs()[0])
    await unlink(competing.managedPath)
    await assert.rejects(
      service.updateGenerationDraft(created.id, {
        embeddingSelection: {
          resourceId: competing.resourceId,
          token: competing.token,
          versionId: competing.versionId,
        },
        kind: 'positive-prompt',
        text: `${first.token}, a rejected edit`,
      }),
    )
    assert.deepEqual(service.getOpenTabs()[0], before)
    await service.flushAutosave(created.id)
    assert.deepEqual(await readFile(savedPath), savedBytes)
    assert.equal(
      (
        await shadow.inspect({
          projectPath: savedPath,
          savedPackage: await readIgsPackage(savedPath),
        })
      ).status,
      'absent',
    )
    await unlink(first.managedPath)
    const retained = await service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: `${first.token}, still authored`,
    })
    assert.deepEqual(
      retained.generationDraft.positivePrompt.embeddingRefs,
      before.generationDraft.positivePrompt.embeddingRefs,
    )
    const pruned = await service.updateGenerationDraft(created.id, {
      kind: 'positive-prompt',
      text: 'plain prompt',
    })
    assert.deepEqual(pruned.generationDraft.positivePrompt.embeddingRefs, [])
    assert.deepEqual(
      (await service.undo(created.id)).generationDraft.positivePrompt,
      retained.generationDraft.positivePrompt,
    )
  })
})

test('document-only Project can prune imported refs but refuses new embedding choices', async () => {
  await withEmbeddingService(
    async ({ dataRoot, modelRepository, models, service }) => {
      const installed = await publishEmbedding(modelRepository, dataRoot)
      const prompt = await models.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: installed.token,
      })
      const portable = await importPortablePrompt(service, dataRoot, prompt)
      const before = structuredClone(service.getOpenTabs()[0])
      await assert.rejects(
        service.updateGenerationDraft(portable.id, {
          embeddingSelection: {
            resourceId: installed.resourceId,
            token: installed.token,
            versionId: installed.versionId,
          },
          kind: 'positive-prompt',
          text: `${installed.token}, rejected`,
        }),
        { code: 'PROJECT_NOT_READY' },
      )
      assert.deepEqual(service.getOpenTabs()[0], before)
      const retained = await service.updateGenerationDraft(portable.id, {
        kind: 'positive-prompt',
        text: `${installed.token}, retained`,
      })
      assert.deepEqual(retained.generationDraft.positivePrompt.embeddingRefs, prompt.embeddingRefs)
      const pruned = await service.updateGenerationDraft(portable.id, {
        kind: 'positive-prompt',
        text: 'plain',
      })
      assert.deepEqual(pruned.generationDraft.positivePrompt.embeddingRefs, [])
      assert.deepEqual(pruned.generationDraft.negativePrompt, prompt)
    },
    { documentOnly: true },
  )
})

test('actual draft transport retains queued selection effects and only prunes refs in optimistic overlays', async () => {
  await withEmbeddingService(async ({ dataRoot, modelRepository, service }) => {
    const installed = await publishEmbedding(modelRepository, dataRoot)
    await publishEmbedding(modelRepository, dataRoot, 20_003, 'face.safetensors', 20_004)
    let tab = await service.create({ height: 64, title: 'Draft transport', width: 64 })
    const gate = deferred()
    const entered = deferred()
    const sent: ProjectGenerationDraftChange[] = []
    const overlays: GenerationPrompt[] = []
    const sync = new ProjectDraftSync({
      onAcknowledged: (ack) => {
        tab = ack
      },
      onError: (_id, error) => assert.fail(error),
      onOverlay: (_id, draft) => {
        if (draft) {
          overlays.push(draft.positivePrompt)
        }
      },
      send: async (id, change, group) => {
        sent.push(structuredClone(change))
        if (sent.length === 1) {
          entered.release()
          await gate.promise
        }
        return service.updateGenerationDraft(id, change, group)
      },
    })
    sync.change(tab, { kind: 'positive-prompt', text: 'first IPC' })
    await entered.promise
    const choice: PromptEmbeddingSelection = {
      resourceId: installed.resourceId,
      token: installed.token,
      versionId: installed.versionId,
    }
    sync.change(tab, { embeddingSelection: choice, kind: 'positive-prompt', text: installed.token })
    sync.change(tab, { kind: 'positive-prompt', text: `${installed.token}, further typing` })
    choice.versionId = randomUUID()
    assert.ok(
      overlays.every((prompt) => prompt.embeddingRefs.length === 0),
      'renderer never creates trusted refs',
    )
    gate.release()
    await sync.flush(tab.id)
    assert.equal(sent.length, 3, 'selection is never coalesced out by following plain text')
    assert.equal(sent[1].kind, 'positive-prompt')
    if (sent[1].kind === 'positive-prompt') {
      assert.equal(sent[1].embeddingSelection?.versionId, installed.versionId)
    }
    assert.equal(tab.generationDraft.positivePrompt.text, `${installed.token}, further typing`)
    assert.equal(
      tab.generationDraft.positivePrompt.embeddingRefs[0].resource.localVersionId,
      installed.versionId,
    )
    await service.save(tab.id)
    const sameText = tab.generationDraft.positivePrompt.text
    sync.change(tab, {
      embeddingSelection: {
        resourceId: installed.resourceId,
        token: installed.token,
        versionId: installed.versionId,
      },
      kind: 'positive-prompt',
      text: sameText,
    })
    await sync.flush(tab.id)
    assert.equal(sent.length, 4, 'an unchanged literal can still carry a verified explicit choice')
    sync.change(tab, { kind: 'positive-prompt', text: 'remove the literal' })
    assert.deepEqual(overlays.at(-1)?.embeddingRefs, [], 'optimistic removal drops stale sidecars')
    await sync.flush(tab.id)
    assert.deepEqual(tab.generationDraft.positivePrompt.embeddingRefs, [])
  })
})

test('normal and legacy Project preparation refuse unbound known embedding literals before CPU composition', async () => {
  await withEmbeddingService(
    async ({ dataRoot, modelRepository, models, service }) => {
      const installed = await publishEmbedding(modelRepository, dataRoot)
      await publishEmbedding(modelRepository, dataRoot, 20_003, 'face.safetensors', 20_004)
      const checkpoint = await publishEmbedding(
        modelRepository,
        dataRoot,
        20_050,
        'checkpoint.safetensors',
        20_051,
        'checkpoint',
      )
      const tab = await service.create({ height: 64, title: 'Unbound refusal', width: 64 })
      await service.setGenerationModel(
        tab.id,
        await models.resolveGenerationCheckpoint(checkpoint.resourceId, checkpoint.versionId),
      )
      await service.updateGenerationDraft(tab.id, { kind: 'sampling-steps', value: 2 })
      await service.updateGenerationDraft(tab.id, { kind: 'sampling-cfg-scale', value: 7.5 })
      let compositions = 0
      const worker = {
        composeTarget: async () => {
          compositions++
          throw new Error('Neighboring control reached CPU composition')
        },
      }
      for (const prepare of [
        service.prepareNormalGenerationContext.bind(service),
        service.prepareNormalTxt2ImgContext.bind(service),
      ]) {
        for (const kind of ['positive-prompt', 'negative-prompt'] as const) {
          await service.updateGenerationDraft(tab.id, { kind, text: installed.token })
          const before = structuredClone(service.getOpenTabs()[0].generationDraft)
          await assert.rejects(prepare(tab.id, worker, models), { code: 'MODEL_EMBEDDING_UNBOUND' })
          assert.equal(compositions, 0)
          assert.deepEqual(
            service.getOpenTabs()[0].generationDraft,
            before,
            'Generate must never auto-link the literal',
          )
          await service.updateGenerationDraft(tab.id, { kind, text: 'plain neighboring text' })
        }
      }
      await assert.rejects(
        service.prepareNormalGenerationContext(tab.id, worker, models),
        /Neighboring control reached CPU composition/,
      )
      assert.equal(
        compositions,
        1,
        'removing the known unbound literal allows the ordinary CPU path',
      )
    },
    { documentOnly: true },
  )
})

for (const newer of ['edit', 'edit-undo', 'close-reopen', 'newer-prompt'] as const) {
  test(`embedding prompt verifier refuses its late response after ${newer}`, async () => {
    const gate = deferred()
    const entered = deferred()
    await withEmbeddingService(
      async ({ dataRoot, modelRepository, repository, service }) => {
        const installed = await publishEmbedding(modelRepository, dataRoot)
        const tab = await service.create({ height: 64, title: 'Late prompt', width: 64 })
        const savedPath = (await repository.getProject(tab.id))!.canonicalPath
        const savedBytes = await readFile(savedPath)
        const revision = service.getOpenDocumentForAcceptance(tab.id)!.document.documentRevision
        const pending = service.updateGenerationDraft(tab.id, {
          embeddingSelection: {
            resourceId: installed.resourceId,
            token: installed.token,
            versionId: installed.versionId,
          },
          kind: 'positive-prompt',
          text: `late ${installed.token}`,
        })
        const rejected = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
        await entered.promise
        if (newer === 'close-reopen') {
          await service.close(tab.id)
          assert.equal((await service.open(tab.id)).kind, 'opened')
        } else if (newer === 'newer-prompt') {
          await service.updateGenerationDraft(tab.id, {
            kind: 'positive-prompt',
            text: 'newer authored prompt',
          })
        } else {
          await service.setPrimaryBbox(tab.id, { ...tab.primaryBbox, x: 100 })
          if (newer === 'edit-undo') {
            await service.undo(tab.id)
            assert.equal(
              service.getOpenDocumentForAcceptance(tab.id)!.document.documentRevision,
              revision,
              'Undo recreates the exact portable revision',
            )
          }
        }
        const before = structuredClone(service.getOpenTabs()[0])
        gate.release()
        await rejected
        assert.deepEqual(service.getOpenTabs()[0], before)
        assert.deepEqual(await readFile(savedPath), savedBytes)
      },
      {
        verify: async (input, models) => {
          if (input.text.startsWith('late ')) {
            entered.release()
            await gate.promise
          }
          return models.resolveGenerationPromptEmbeddings(input)
        },
      },
    )
  })
}

test('embedding authoring epoch guards edit/Undo ABA in the actual asynchronous commit hook', async () => {
  const entered = deferred()
  const gate = deferred()
  let delay = true
  await withEmbeddingService(
    async ({ dataRoot, modelRepository, service }) => {
      const installed = await publishEmbedding(modelRepository, dataRoot)
      const tab = await service.create({ height: 64, title: 'Commit ABA', width: 64 })
      const before = structuredClone(service.getOpenTabs()[0])
      const beforeRevision = service.getOpenDocumentForAcceptance(tab.id)!.document.documentRevision
      const pending = service.updateGenerationDraft(tab.id, {
        embeddingSelection: {
          resourceId: installed.resourceId,
          token: installed.token,
          versionId: installed.versionId,
        },
        kind: 'positive-prompt',
        text: installed.token,
      })
      const rejected = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
      await entered.promise
      await service.setPrimaryBbox(tab.id, { ...tab.primaryBbox, x: 200 })
      await service.undo(tab.id)
      assert.equal(
        service.getOpenDocumentForAcceptance(tab.id)!.document.documentRevision,
        beforeRevision,
      )
      gate.release()
      await rejected
      assert.deepEqual(service.getOpenTabs()[0].generationDraft, before.generationDraft)
      assert.equal(service.getOpenTabs()[0].dirty, false)
      assert.equal(service.getOpenTabs()[0].canUndo, false)
    },
    {
      beforeEditCommit: async (document) => {
        if (delay && document.generationDraft.positivePrompt.text === '<face>') {
          delay = false
          entered.release()
          await gate.promise
        }
      },
    },
  )
})

test('portable embedding Link verifies exact identity and updates local IDs only in its named polarity', async () => {
  await withEmbeddingService(async ({ dataRoot, modelRepository, models, repository, service }) => {
    const installed = await publishEmbedding(modelRepository, dataRoot)
    const bound = await models.resolveGenerationPromptEmbeddings({
      modelFamily: null,
      prompt: { embeddingRefs: [], text: '' },
      text: installed.token,
    })
    const original = bound.embeddingRefs[0]
    const foreign = {
      resource: {
        ...original.resource,
        displayName: 'Saved old display name',
        localModelId: 'foreign model',
        localVersionId: 'foreign version',
        versionName: 'Saved old version',
      },
      token: 'legacy-face',
    }
    const prompt = { embeddingRefs: [foreign], text: `portrait, ${foreign.token}` }
    const tab = await importPortablePrompt(service, dataRoot, prompt)
    const identity: ProjectEmbeddingIdentity = {
      polarity: 'positive',
      resourceId: foreign.resource.localModelId,
      token: foreign.token,
      versionId: foreign.resource.localVersionId,
    }
    for (const changed of [
      { fileSha256: 'b'.repeat(64) },
      { civitaiModelId: 55 },
      { civitaiVersionId: 56 },
      { civitaiFileId: 57 },
      { baseModelFamily: 'anima' },
      { kind: 'lora' },
      { predictionType: 'epsilon' },
    ]) {
      await assert.rejects(
        service.relinkGenerationEmbedding(
          tab.id,
          identity,
          async (saved) => ({ ...saved, ...changed }) as typeof saved,
        ),
        { code: 'PROJECT_EMBEDDING_RELINK_MISMATCH' },
      )
      assert.deepEqual(service.getOpenTabs()[0], tab)
    }
    await assert.rejects(
      service.relinkGenerationEmbedding(
        tab.id,
        { ...identity, token: 'not a stored literal' },
        (saved) => models.resolvePortableGenerationEmbedding(saved),
      ),
      { code: 'PROJECT_EMBEDDING_NOT_SELECTED' },
    )
    const linked = await service.relinkGenerationEmbedding(tab.id, identity, async (saved) => ({
      ...(await models.resolvePortableGenerationEmbedding(saved)),
      displayName: 'New library name',
      versionName: 'New library version',
    }))
    const expected = {
      ...foreign,
      resource: {
        ...foreign.resource,
        localModelId: installed.resourceId,
        localVersionId: installed.versionId,
      },
    }
    assert.deepEqual(linked.generationDraft.positivePrompt, {
      ...prompt,
      embeddingRefs: [expected],
    })
    assert.deepEqual(linked.generationDraft.negativePrompt, prompt)
    assert.deepEqual((await service.undo(tab.id)).generationDraft.positivePrompt, prompt)
    assert.deepEqual((await service.redo(tab.id)).generationDraft.positivePrompt.embeddingRefs, [
      expected,
    ])
    await service.save(tab.id)
    assert.deepEqual(
      (await readIgsPackage((await repository.getProject(tab.id))!.canonicalPath)).project
        .generationDraft,
      linked.generationDraft,
    )
  })
})

for (const newer of ['edit', 'edit-undo', 'close-reopen'] as const) {
  test(`portable embedding Link rejects a late verifier after ${newer}`, async () => {
    await withEmbeddingService(async ({ dataRoot, modelRepository, models, service }) => {
      const installed = await publishEmbedding(modelRepository, dataRoot)
      const bound = await models.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: installed.token,
      })
      const ref = bound.embeddingRefs[0]
      ref.resource.localModelId = 'foreign model'
      ref.resource.localVersionId = 'foreign version'
      const tab = await importPortablePrompt(service, dataRoot, bound)
      const gate = deferred()
      const entered = deferred()
      const pending = service.relinkGenerationEmbedding(
        tab.id,
        {
          polarity: 'positive',
          resourceId: 'foreign model',
          token: ref.token,
          versionId: 'foreign version',
        },
        async (saved) => {
          entered.release()
          await gate.promise
          return models.resolvePortableGenerationEmbedding(saved)
        },
      )
      const rejected = assert.rejects(pending, { code: 'EDIT_CONFLICT' })
      await entered.promise
      if (newer === 'close-reopen') {
        await service.close(tab.id)
        assert.equal((await service.open(tab.id)).kind, 'opened')
      } else {
        await service.setPrimaryBbox(tab.id, { ...tab.primaryBbox, y: -10 })
        if (newer === 'edit-undo') {
          await service.undo(tab.id)
        }
      }
      const before = structuredClone(service.getOpenTabs()[0])
      gate.release()
      await rejected
      assert.deepEqual(service.getOpenTabs()[0], before)
    })
  })
}
