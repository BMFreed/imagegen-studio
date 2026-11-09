import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { PreparedSmartPatchAnimaRegionalInput } from './project-smart-patch-regional-input.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import {
  ANIMA_SMART_PATCH_REGIONAL_PROFILE,
  captureFrozenSmartPatchAnimaRegionalInputV1,
  capturePreparedSmartPatchAnimaRegionalInput,
  SMART_PATCH_REGIONAL_ALPHA_ROLES,
} from './project-smart-patch-regional-input.js'
import {
  attachSmartPatchAnimaRegionalInput,
  hydrateFrozenSmartPatchAnimaRegionalInput,
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import {
  assertQueuedSmartPatchBundle,
  buildFrozenQueuedSmartPatchV1,
  parseFrozenQueuedSmartPatchV1,
} from './smart-patch-queued-generation.js'
import { literalPreparedSmartPatchInputMaterial } from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const prompt = (text: string) => ({ embeddingRefs: [], text })

/** Literal authored regional sources; actual frozen, bundle and queue owners remain subjects. */
function regionalInput(material: SmartPatchInputMaterial): PreparedSmartPatchAnimaRegionalInput {
  const { context: ctx } = material.manifest
  const entry = material.manifest.items[0]
  const globalPrompts = {
    negative: structuredClone(ctx.generationDraft.negativePrompt),
    positive: structuredClone(ctx.generationDraft.positivePrompt),
  }
  const recipe: PreparedSmartPatchAnimaRegionalInput['recipe'] = {
    bbox: { ...ctx.bbox },
    documentId: ctx.documentId,
    documentRevision: ctx.documentRevision,
    family: 'anima',
    globalPrompts,
    internalResolution: { ...ctx.internalResolution },
    item: { ...structuredClone(entry.item), iteration: 0, promptPairIndex: 0 },
    kind: 'smart-patch-regional-recipe',
    layerId: ctx.layerId,
    modelSha256: ctx.generationDraft.model!.fileSha256,
    regions: [0, 1, 2].map((index) => {
      const positive = index === 0 ? prompt('(a,b)2') : index === 1 ? null : prompt('')
      const local =
        index === 0 ? prompt('(blur)0.75') : index === 1 ? prompt('dormant {local}') : prompt('')
      const inherited = index === 1
      return {
        authoredPrompts: { negative: local, positive, useGlobalNegativePrompt: inherited },
        coverage: {
          alpha: Uint8Array.from({ length: ctx.bbox.width * ctx.bbox.height }, (_, pixel) =>
            pixel % 4 === index ? 255 : pixel % 4 === 3 ? 127 + (index % 2) : 0,
          ),
          bounds: { ...ctx.bbox },
          intersection: { ...ctx.bbox },
          kind: 'covered' as const,
        },
        maskId: randomUUID(),
        maskRevision: index + 1,
        negative: {
          prompt: inherited ? structuredClone(globalPrompts.negative) : local,
          source: inherited ? ('smart-patch' as const) : ('regional' as const),
        },
        positive,
        referenceImages: [],
        regionId: randomUUID(),
      }
    }),
    sampling: {
      animaMethod: ctx.generationDraft.sampling.animaMethod as 'euler' | 'heun',
      cfgScale: ctx.generationDraft.sampling.cfgScale!,
      denoisingStrength: ctx.generationDraft.sampling.denoisingStrength!,
      steps: ctx.generationDraft.sampling.steps!,
    },
    smartMask: { maskId: ctx.mask.id, maskRevision: ctx.mask.revision },
  }
  const sources: { polarity: 'negative' | 'positive'; sourceId: string; text: string }[] = [
    { polarity: 'positive', sourceId: ctx.layerId, text: globalPrompts.positive.text },
    { polarity: 'negative', sourceId: ctx.layerId, text: globalPrompts.negative.text },
  ]
  for (const region of recipe.regions) {
    if (region.positive !== null) {
      sources.push({ polarity: 'positive', sourceId: region.regionId, text: region.positive.text })
    }
    if (region.negative.prompt.text !== '') {
      sources.push({
        polarity: 'negative',
        sourceId: region.regionId,
        text: region.negative.prompt.text,
      })
    }
  }
  return capturePreparedSmartPatchAnimaRegionalInput({
    compiledPrompts: sources.map((source) => ({
      ...source,
      prompt: compileAnimaPromptWeighting(source.text),
    })),
    profile: ANIMA_SMART_PATCH_REGIONAL_PROFILE,
    promptInterpretation: ANIMA_PROMPT_INTERPRETATION,
    recipe,
    schemaVersion: 1,
  })
}

async function fixture() {
  const ordinary = await literalPreparedSmartPatchInputMaterial('anima', 'inpaint')
  const prepared = regionalInput(ordinary)
  return {
    ordinary,
    prepared,
    regional: await attachSmartPatchAnimaRegionalInput(ordinary, prepared),
  }
}

function clone(input: SmartPatchInputMaterial): SmartPatchInputMaterial {
  return {
    files: Object.fromEntries(
      Object.entries(input.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
    ),
    manifest: structuredClone(input.manifest),
  }
}

function replaceRaw(
  material: SmartPatchInputMaterial,
  role: (typeof SMART_PATCH_REGIONAL_ALPHA_ROLES)[number],
  bytes: Buffer,
) {
  material.files[role] = bytes
  material.manifest.files[role] = {
    ...material.manifest.files[role]!,
    byteSize: bytes.length,
    sha256: digest(bytes),
  }
}

test('new Smart regional material owns ordered raw world alpha and separately signed source records', async () => {
  const { ordinary, prepared, regional } = await fixture()
  assert.equal('regional' in ordinary.manifest, false)
  assert.deepEqual(
    Object.keys(regional.files).sort(),
    [...Object.keys(ordinary.files), ...SMART_PATCH_REGIONAL_ALPHA_ROLES].sort(),
  )
  assert.equal(regional.manifest.regional!.promptInterpretation, ANIMA_PROMPT_INTERPRETATION)
  assert.deepEqual(
    regional.manifest.regional!.recipe.regions.map((r) => r.coverage.alpha),
    SMART_PATCH_REGIONAL_ALPHA_ROLES,
  )
  assert.deepEqual(
    hydrateFrozenSmartPatchAnimaRegionalInput(regional.manifest, regional.files),
    prepared,
  )
  for (const [index, role] of SMART_PATCH_REGIONAL_ALPHA_ROLES.entries()) {
    assert.equal(
      regional.files[role].length,
      prepared.recipe.bbox.width * prepared.recipe.bbox.height,
    )
    assert.ok(
      regional.files[role].equals(Buffer.from(prepared.recipe.regions[index].coverage.alpha)),
    )
    assert.notEqual(
      regional.files[role].buffer,
      prepared.recipe.regions[index].coverage.alpha.buffer,
    )
    assert.equal(regional.manifest.files[role]!.sha256, digest(regional.files[role]))
  }
  assert.deepEqual(
    regional.manifest.regional!.compiledPrompts.map((p) => [p.sourceId, p.polarity, p.text]),
    prepared.compiledPrompts.map((p) => [p.sourceId, p.polarity, p.text]),
  )
  assert.equal(regional.manifest.regional!.recipe.regions[1].negative.source, 'smart-patch')
  assert.deepEqual(
    regional.manifest.regional!.recipe.regions[1].negative.prompt,
    prepared.recipe.globalPrompts.negative,
  )
  assert.equal(
    regional.manifest.regional!.recipe.regions[1].authoredPrompts!.negative!.text,
    'dormant {local}',
  )
})

test('current private default and explicit fragment marker preserve independently literal fragment weighting', async () => {
  const { ordinary, prepared } = await fixture()
  const current = prepared.compiledPrompts.find((p) => p.text === '(a,b)2')!
  assert.deepEqual(current.prompt, {
    cleanedText: 'a , b',
    spans: [
      { end: 1, start: 0, weight: 2 },
      { end: 2, start: 1, weight: 1 },
      { end: 3, start: 2, weight: 2 },
      { end: 4, start: 3, weight: 1 },
      { end: 5, start: 4, weight: 2 },
    ],
    version: 'anima-prompt-weighting-v1',
  })
  const { promptInterpretation: _marker, ...without } = prepared
  const legacyPrivate = capturePreparedSmartPatchAnimaRegionalInput(without)
  assert.equal(Object.hasOwn(legacyPrivate, 'promptInterpretation'), false)
  assert.deepEqual(legacyPrivate.compiledPrompts, prepared.compiledPrompts)
  await assert.rejects(attachSmartPatchAnimaRegionalInput(ordinary, legacyPrivate))
  const frozen = await attachSmartPatchAnimaRegionalInput(ordinary, prepared)
  const malformed = structuredClone(frozen.manifest.regional!)
  malformed.promptInterpretation = 'legacy' as never
  assert.throws(() => captureFrozenSmartPatchAnimaRegionalInputV1(malformed))
})

test('ordinary material and queued rows retain their exact no-extension output shape', async () => {
  const { ordinary } = await fixture()
  const roundTrip = await parseSmartPatchInputMaterial(
    JSON.parse(JSON.stringify(ordinary.manifest)),
    ordinary.files,
  )
  assert.deepEqual(roundTrip, ordinary)
  const bundle = {
    ...ordinary,
    id: randomUUID(),
    manifestSha256: digest(JSON.stringify(ordinary.manifest)),
  }
  const queued = buildFrozenQueuedSmartPatchV1(bundle, 0)
  assert.equal('regional' in queued, false)
  assert.deepEqual(parseFrozenQueuedSmartPatchV1(queued), queued)
  assert.throws(() => hydrateFrozenSmartPatchAnimaRegionalInput(ordinary.manifest, ordinary.files))
})

test('attachment detaches both input planes and signed metadata before its first await', async () => {
  const { ordinary, prepared } = await fixture()
  const expected = structuredClone(prepared)
  const source = Buffer.from(ordinary.files['source.png'])
  const pending = attachSmartPatchAnimaRegionalInput(ordinary, prepared)
  prepared.recipe.regions[0].coverage.alpha.fill(0)
  prepared.recipe.globalPrompts.negative.text = 'late caller mutation'
  ordinary.files['source.png'].fill(0)
  ordinary.manifest.context.bbox.x += 1
  const completed = await pending
  assert.deepEqual(
    hydrateFrozenSmartPatchAnimaRegionalInput(completed.manifest, completed.files),
    expected,
  )
  assert.ok(completed.files['source.png'].equals(source))
})

for (const [name, mutate] of [
  [
    'source-kind',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.kind = 'current-canvas-regional-recipe' as never
    },
  ],
  [
    'interpretation',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.promptInterpretation = 'old' as never
    },
  ],
  [
    'model',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.modelSha256 = 'b'.repeat(64)
    },
  ],
  [
    'document',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.documentId = randomUUID()
    },
  ],
  [
    'layer',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.layerId = randomUUID()
    },
  ],
  [
    'Smart-mask',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.smartMask.maskRevision += 1
    },
  ],
  [
    'seed',
    (m: SmartPatchInputMaterial) => {
      ;(m.manifest.regional!.recipe.item as { seed: number }).seed += 1
    },
  ],
  [
    'iteration',
    (m: SmartPatchInputMaterial) => {
      ;(m.manifest.regional!.recipe.item as { iteration: number }).iteration = 1
    },
  ],
  [
    'method',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.sampling.animaMethod = 'dpmpp_2m' as never
    },
  ],
  [
    'processing',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.internalResolution.width += 8
    },
  ],
  [
    'bbox-origin',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.bbox.x += 1
    },
  ],
  [
    'inheritance',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.regions[1].negative.prompt.text = 'Canvas exclusion'
    },
  ],
  [
    'compiled-sign',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.compiledPrompts = structuredClone(m.manifest.regional!.compiledPrompts)
      ;(m.manifest.regional!.compiledPrompts as unknown as { polarity: string }[])[3].polarity =
        'positive'
    },
  ],
  [
    'reference',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.regions[0].referenceImages = [{} as never]
    },
  ],
  [
    'alpha-role',
    (m: SmartPatchInputMaterial) => {
      m.manifest.regional!.recipe.regions[0].coverage.alpha = 'regional-1.alpha8'
    },
  ],
  [
    'raw-size',
    (m: SmartPatchInputMaterial) => {
      m.manifest.files['regional-0.alpha8']!.byteSize += 1
    },
  ],
  [
    'raw-dimensions',
    (m: SmartPatchInputMaterial) => {
      m.manifest.files['regional-0.alpha8']!.width += 1
    },
  ],
  [
    'extra-item',
    (m: SmartPatchInputMaterial) => {
      m.manifest.items.push(structuredClone(m.manifest.items[0]))
    },
  ],
] as const) {
  test(`frozen regional ${name} mismatch refuses metadata and actual material without partial output`, async () => {
    const { regional } = await fixture()
    mutate(regional)
    assert.throws(() => parseFrozenSmartPatchInputV1(regional.manifest))
    await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
  })
}

for (const [name, mutate] of [
  [
    'missing',
    (m: SmartPatchInputMaterial) => {
      delete m.files['regional-1.alpha8']
    },
  ],
  [
    'extra',
    (m: SmartPatchInputMaterial) => {
      m.files['foreign.alpha8'] = Buffer.from([255])
    },
  ],
  [
    'corrupt',
    (m: SmartPatchInputMaterial) => {
      m.files['regional-0.alpha8'][0] ^= 255
    },
  ],
  [
    'swapped',
    (m: SmartPatchInputMaterial) => {
      ;[m.files['regional-0.alpha8'], m.files['regional-1.alpha8']] = [
        m.files['regional-1.alpha8'],
        m.files['regional-0.alpha8'],
      ]
    },
  ],
] as const) {
  test(`actual ${name} raw alpha refuses full frozen byte qualification`, async () => {
    const { regional } = await fixture()
    mutate(regional)
    await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
  })
}

test('a digest-matching wrong alpha classification is not accepted as pixel proof', async () => {
  const { regional } = await fixture()
  replaceRaw(
    regional,
    'regional-0.alpha8',
    Buffer.alloc(regional.files['regional-0.alpha8'].length),
  )
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
})

test('raw pixels outside the exact clipped intersection refuse after a matching digest', async () => {
  const { regional } = await fixture()
  const bbox = regional.manifest.context.bbox
  regional.manifest.regional!.recipe.regions[0].coverage.intersection = {
    height: 1,
    width: 1,
    x: bbox.x,
    y: bbox.y,
  }
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
})

test('orphan alpha roles and an explicit undefined regional extension cannot silently select ordinary Smart', async () => {
  const { ordinary, regional } = await fixture()
  const orphan = clone(ordinary)
  orphan.files['regional-0.alpha8'] = Buffer.from(regional.files['regional-0.alpha8'])
  orphan.manifest.files['regional-0.alpha8'] = { ...regional.manifest.files['regional-0.alpha8']! }
  assert.throws(() => parseFrozenSmartPatchInputV1(orphan.manifest))
  assert.throws(() => parseFrozenSmartPatchInputV1({ ...ordinary.manifest, regional: undefined }))
})

test('signed fields and raw alpha survive the existing durable commit load and exact discard', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-smart-bundle-'))
  try {
    const { prepared, regional } = await fixture()
    const expected = clone(regional)
    const repository = new SmartPatchInputBundleRepository(root)
    const bundle = await repository.publish(regional)
    const queued = buildFrozenQueuedSmartPatchV1(bundle, 0)
    for (const role of SMART_PATCH_REGIONAL_ALPHA_ROLES) {
      regional.files[role].fill(0)
    }
    regional.manifest.regional!.recipe.globalPrompts.negative.text = 'later authoring'
    const reloaded = await new SmartPatchInputBundleRepository(root).load(bundle.id)
    assert.deepEqual({ files: reloaded.files, manifest: reloaded.manifest }, expected)
    assert.deepEqual(
      hydrateFrozenSmartPatchAnimaRegionalInput(reloaded.manifest, reloaded.files),
      prepared,
    )
    assertQueuedSmartPatchBundle(queued, reloaded)
    const drift = structuredClone(queued)
    drift.regional!.recipe.regions[0].maskRevision += 1
    assert.throws(() => assertQueuedSmartPatchBundle(drift, reloaded))
    await repository.discard(bundle.id, bundle.manifestSha256)
    await assert.rejects(repository.load(bundle.id))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('SQLite reload and existing frozen Retry independently copy all regional bytes and signed metadata', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    f.material.manifest.items = f.material.manifest.items.slice(0, 1)
    const prepared = regionalInput(f.material)
    f.material = await attachSmartPatchAnimaRegionalInput(f.material, prepared)
    const [row] = await admitSmartPatch(f)
    const frozen = await f.queue.loadVerifiedSmartPatchInput(row.id)
    const terminal = await f.queue.cancel(row.id, row.statusSequence)
    const restarted = new GenerationQueueRepository(f.database.db, f.root)
    await restarted.recoverAfterRestart()
    const retry = await restarted.retryPreparedSmartPatchTerminal(row.id, terminal.statusSequence, {
      assertCurrent: () => undefined,
      modelService: f.models,
    })
    const replay = await restarted.loadVerifiedSmartPatchInput(retry.id)
    assert.notEqual(replay.payload.bundle.id, frozen.payload.bundle.id)
    assert.deepEqual(replay.payload.regional, frozen.payload.regional)
    assert.deepEqual(replay.payload.item, frozen.payload.item)
    for (const role of SMART_PATCH_REGIONAL_ALPHA_ROLES) {
      assert.ok(replay.bundle.files[role].equals(frozen.bundle.files[role]))
    }
    assert.deepEqual(
      hydrateFrozenSmartPatchAnimaRegionalInput(replay.bundle.manifest, replay.bundle.files),
      prepared,
    )
    const sourceFile = path.join(
      f.root,
      'generation-queued-inputs',
      'smart-patch',
      frozen.payload.bundle.id,
      'regional-0.alpha8',
    )
    const source = await readFile(sourceFile)
    await writeFile(sourceFile, Buffer.alloc(source.length))
    await assert.rejects(restarted.loadVerifiedSmartPatchInput(row.id))
    const independent = await restarted.loadVerifiedSmartPatchInput(retry.id)
    assert.deepEqual(independent.payload.regional, frozen.payload.regional)
    assert.ok(independent.bundle.files['regional-0.alpha8'].equals(source))
  })
})

test('a source Raster owner cannot be reused as a signed region or mask owner', async () => {
  const { regional } = await fixture()
  const sourceId = regional.manifest.context.sourceLayerIds[0]
  assert.ok(sourceId)
  const metadata = structuredClone(regional.manifest.regional!)
  regional.manifest.regional = metadata
  const previous = metadata.recipe.regions[0].regionId
  metadata.recipe.regions[0].regionId = sourceId
  for (const record of metadata.compiledPrompts as unknown as { sourceId: string }[]) {
    if (record.sourceId === previous) {
      record.sourceId = sourceId
    }
  }
  assert.throws(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files))
})

test('the existing 128 KiB metadata ceiling refuses before any bundle can be published', async () => {
  const { regional } = await fixture()
  const huge = structuredClone(regional.manifest)
  huge.regional!.recipe.regions[0].authoredPrompts!.negative!.text = 'x'.repeat(128 * 1024)
  assert.ok(Buffer.byteLength(JSON.stringify(huge), 'utf8') > 128 * 1024)
  assert.throws(() => parseFrozenSmartPatchInputV1(huge), {
    code: 'SMART_PATCH_INPUT_INVALID',
    message: 'The frozen Smart Patch manifest exceeds its byte limit.',
  })
})
