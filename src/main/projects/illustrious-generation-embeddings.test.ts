import {
  activePromptEmbeddingRefs,
  type PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import {
  illustriousEmbeddingFixture,
  publishIllustriousEmbeddingFixture,
} from '../models/test-fixtures/illustrious-embedding.js'
import {
  effectiveGenerationEmbeddings,
  frozenEmbeddingFieldsAgree,
  type FrozenGenerationEmbeddings,
  type FrozenPromptEmbeddingRefs,
  reverifyFrozenGenerationEmbeddings,
  validAuthoredGenerationEmbeddings,
  workerEmbeddings,
} from './illustrious-generation-embeddings.js'

function ref(token: string, source = 1): PromptEmbeddingRef {
  return {
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: source + 200,
      civitaiModelId: source,
      civitaiVersionId: source + 100,
      displayName: `Copied ${source}`,
      fileSha256: source.toString(16).padStart(64, '0'),
      kind: 'embedding',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Copied v1',
    },
    token,
  }
}
function pool(refs: FrozenPromptEmbeddingRefs): FrozenGenerationEmbeddings {
  const descriptor = (ref: PromptEmbeddingRef) => ({
    byteSize: 9000,
    managedPath: `/models/${ref.resource.localVersionId}.safetensors`,
    reference: structuredClone(ref.resource),
    token: ref.token,
  })
  return { negative: refs.negative.map(descriptor), positive: refs.positive.map(descriptor) }
}

test('embedding concrete subset uses case-sensitive boundaries, longest overlap, stable order and detached refs', () => {
  const short = ref('foo')
  const long = ref('<foo>', 2)
  const later = ref('<later>', 3)
  const refs = [short, later, long]
  const original = structuredClone(refs)
  assert.deepEqual(activePromptEmbeddingRefs('prefixfoo <FOO> <foo> <later>', refs), [long, later])
  assert.deepEqual(activePromptEmbeddingRefs('<FOO>', [long]), [])
  assert.deepEqual(activePromptEmbeddingRefs('<foo> foo', refs), [long, short])
  const output = activePromptEmbeddingRefs('<foo>', refs)
  output[0].resource.displayName = 'caller mutation'
  assert.deepEqual(refs, original)
})
test('embedding frozen agreement preserves cross-polarity identities and filters each concrete branch from its pool', () => {
  const positive = ref('<same>')
  const negative = ref('<same>', 2)
  const inactive = ref('<other>', 3)
  const refs = { negative: [negative], positive: [inactive, positive] }
  const verifiedPool = pool(refs)
  const prompts = { negative: '<same>', positive: 'portrait <same>' }
  const context = {
    embeddingRefs: refs,
    embeddings: effectiveGenerationEmbeddings(prompts, refs, verifiedPool),
    prompts,
  }
  assert.deepEqual(
    context.embeddings.positive.map((entry) => entry.reference),
    [positive.resource],
  )
  assert.deepEqual(
    context.embeddings.negative.map((entry) => entry.reference),
    [negative.resource],
  )
  const wire = workerEmbeddings(context)!
  assert.equal(wire.positive[0].sha256, positive.resource.fileSha256)
  assert.equal(wire.negative[0].sha256, negative.resource.fileSha256)
  assert.equal(wire.negative[0].path, verifiedPool.negative[0].managedPath)
  assert.equal(frozenEmbeddingFieldsAgree(context, workerEmbeddings(context)), true)
  const next = { negative: '', positive: '<other>' }
  const nextContext = {
    ...context,
    embeddings: effectiveGenerationEmbeddings(next, refs, verifiedPool),
    prompts: next,
  }
  assert.deepEqual(
    nextContext.embeddings.positive.map((entry) => entry.reference),
    [inactive.resource],
  )
  assert.deepEqual(nextContext.embeddings.negative, [])
  assert.equal(frozenEmbeddingFieldsAgree(nextContext, workerEmbeddings(nextContext)), true)
  context.embeddings.positive[0].reference.displayName = 'mutation'
  assert.equal(verifiedPool.positive[1].reference.displayName, positive.resource.displayName)
  assert.deepEqual(context.embeddingRefs, refs)
})
test('embedding original refs reject same-polarity literal conflicts and unsupported identity without policing other polarity', () => {
  const first = ref('<same>')
  const second = ref('<same>', 2)
  assert.equal(validAuthoredGenerationEmbeddings({ negative: [second], positive: [first] }), true)
  for (const refs of [
    { negative: [], positive: [first, second] },
    { negative: [], positive: [first, first] },
    {
      negative: [],
      positive: [{ ...first, resource: { ...first.resource, kind: 'lora' as const } }],
    },
    {
      negative: [],
      positive: [{ ...first, resource: { ...first.resource, baseModelFamily: 'anima' as const } }],
    },
    {
      negative: [],
      positive: [{ ...first, resource: { ...first.resource, predictionType: 'epsilon' as const } }],
    },
    {
      negative: [],
      positive: [{ ...first, resource: { ...first.resource, civitaiFileId: null } }],
    },
  ]) {
    assert.equal(validAuthoredGenerationEmbeddings(refs), false)
  }
})
test('embedding historical absence and explicit known empty state do not invent fields or wire', () => {
  const prompts = { negative: '', positive: 'ordinary prompt' }
  const empty = { negative: [], positive: [] }
  assert.equal(frozenEmbeddingFieldsAgree({ prompts }), true)
  assert.equal(
    frozenEmbeddingFieldsAgree({ embeddingRefs: empty, embeddings: empty, prompts }),
    true,
  )
  assert.equal(workerEmbeddings({ embeddings: empty }), undefined)
  assert.equal(frozenEmbeddingFieldsAgree({ embeddingRefs: empty, prompts }), false)
  assert.equal(frozenEmbeddingFieldsAgree({ embeddings: empty, prompts }), false)
  assert.equal(frozenEmbeddingFieldsAgree({ prompts }, empty), false)
  const malformed = { positive: [] } as unknown as FrozenGenerationEmbeddings
  assert.doesNotThrow(() => workerEmbeddings({ embeddings: malformed }))
  assert.equal(workerEmbeddings({ embeddings: malformed }), undefined)
  assert.equal(
    frozenEmbeddingFieldsAgree({ embeddingRefs: empty, embeddings: malformed, prompts }),
    false,
  )
})
test('embedding agreement refuses swapped polarity, metadata/size/path/hash/token mutations and omitted effective files', () => {
  const refs = { negative: [ref('<same>', 2)], positive: [ref('<same>')] }
  const prompts = { negative: '<same>', positive: '<same>' }
  const context = { embeddingRefs: refs, embeddings: pool(refs), prompts }
  const wire = workerEmbeddings(context)!
  assert.equal(frozenEmbeddingFieldsAgree(context, wire), true)
  assert.equal(frozenEmbeddingFieldsAgree(context), false)
  for (const edit of [
    (input: typeof context) => {
      input.embeddings.positive = []
    },
    (input: typeof context) => {
      input.embeddings.negative = []
    },
    (input: typeof context) => {
      input.embeddings.positive = input.embeddings.negative
    },
    (input: typeof context) => {
      input.embeddings.positive[0].reference.displayName = 'altered metadata'
    },
    (input: typeof context) => {
      input.embeddings.positive[0].token = '<different>'
    },
    (input: typeof context) => {
      input.embeddings.positive[0].byteSize = 0
    },
    (input: typeof context) => {
      input.embeddings.positive[0].managedPath = 'relative.safetensors'
    },
    (input: typeof context) => {
      input.embeddings.positive[0].managedPath = '/models/../altered.safetensors'
    },
  ]) {
    const changed = structuredClone(context)
    edit(changed)
    assert.equal(frozenEmbeddingFieldsAgree(changed, workerEmbeddings(changed)), false)
  }
  for (const change of [
    { byteSize: 9001 },
    { path: '/different.safetensors' },
    { sha256: 'f'.repeat(64) },
    { token: '<different>' },
  ]) {
    const changed = structuredClone(wire)
    Object.assign(changed.positive[0], change)
    assert.equal(frozenEmbeddingFieldsAgree(context, changed), false)
  }
  assert.throws(() => effectiveGenerationEmbeddings(prompts, refs, { negative: [], positive: [] }))
})

test('embedding effective revalidation uses real SQLite/filesystem, keeps inactive missing files out, and detects changed effective bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-frozen-embeddings-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  try {
    const repository = new ModelRepository(database.db)
    const storage = {
      decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
      encryptStringAsync: async (plain: string) => Buffer.from(plain),
      getSelectedStorageBackend: () => 'gnome_libsecret',
      isAsyncEncryptionAvailable: async () => true,
    }
    const models = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
    )
    const first = await publishIllustriousEmbeddingFixture(repository, root, 9900, 9901)
    const other = await publishIllustriousEmbeddingFixture(
      repository,
      root,
      9902,
      9903,
      'other.safetensors',
      0.25,
    )
    const authored = await models.resolveGenerationPromptEmbeddings({
      modelFamily: 'illustrious',
      prompt: { embeddingRefs: [], text: '' },
      text: '<clean-style> <other>',
    })
    const refs = { negative: [], positive: authored.embeddingRefs }
    const descriptors: FrozenGenerationEmbeddings = { negative: [], positive: [] }
    for (const ref of refs.positive) {
      descriptors.positive.push({
        ...(await models.resolveVerifiedGenerationEmbeddingForPlan(ref.resource)),
        token: ref.token,
      })
    }
    const prompts = { negative: '', positive: '<clean-style>' }
    const context = {
      embeddingRefs: refs,
      embeddings: effectiveGenerationEmbeddings(prompts, refs, descriptors),
      prompts,
    }
    const customRefs = { negative: [], positive: [{ ...refs.positive[0], token: 'LegacyToken' }] }
    const customPool = {
      negative: [],
      positive: [{ ...descriptors.positive[0], token: 'LegacyToken' }],
    }
    const customPrompts = { negative: '', positive: 'portrait LegacyToken' }
    await assert.doesNotReject(
      reverifyFrozenGenerationEmbeddings(
        {
          embeddingRefs: customRefs,
          embeddings: effectiveGenerationEmbeddings(customPrompts, customRefs, customPool),
          prompts: customPrompts,
        },
        models,
      ),
    )
    await rm(other.managedPath)
    await assert.doesNotReject(reverifyFrozenGenerationEmbeddings(context, models))
    const captured = structuredClone(context)
    await writeFile(first.managedPath, illustriousEmbeddingFixture(0.5))
    await assert.rejects(reverifyFrozenGenerationEmbeddings(context, models), {
      code: 'MODEL_FILE_CORRUPT',
    })
    assert.deepEqual(context, captured)
    await writeFile(first.managedPath, first.bytes)
    const changed = structuredClone(context)
    changed.embeddings.positive[0].byteSize++
    await assert.rejects(
      reverifyFrozenGenerationEmbeddings(changed, models),
      /exact embedding changed/,
    )
    await rm(first.managedPath)
    await assert.rejects(reverifyFrozenGenerationEmbeddings(context, models), {
      code: 'MODEL_FILE_MISSING',
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})
