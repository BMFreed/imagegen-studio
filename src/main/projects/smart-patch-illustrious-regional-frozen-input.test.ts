import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type {
  PreparedSmartPatchIllustriousRegionalInput,
  SmartPatchIllustriousRegionalProfile,
} from './project-smart-patch-illustrious-regional-input.js'
import type { SmartPatchGenerationMode } from './project-smart-patch-preparation.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { encodeProjectMaskPng } from './project-mask.js'
import {
  captureFrozenSmartPatchIllustriousRegionalInputV1,
  capturePreparedSmartPatchIllustriousRegionalInput,
} from './project-smart-patch-illustrious-regional-input.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import {
  attachSmartPatchIllustriousRegionalInput,
  hydrateFrozenSmartPatchIllustriousRegionalInput,
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import {
  assertQueuedSmartPatchBundle,
  buildFrozenQueuedSmartPatchV1,
  parseFrozenQueuedSmartPatchV1,
} from './smart-patch-queued-generation.js'
import {
  literalPreparedSmartPatchInputMaterial,
  literalSmartPatchColorPng,
  literalSmartPatchNumericPng,
} from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

const PROFILES = {
  img2img: 'invoke-illustrious-smart-regional-img2img-v1',
  inpaint: 'invoke-illustrious-smart-regional-inpaint-v1',
  outpaint: 'invoke-illustrious-smart-regional-outpaint-v1',
  txt2img: 'invoke-illustrious-smart-regional-txt2img-v1',
} as const satisfies Record<SmartPatchGenerationMode, SmartPatchIllustriousRegionalProfile>
const MODES = ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const prompt = (text: string) => ({ embeddingRefs: [], text })

/** Literal fixed-role pixels/resources; source preparation and ML are not substituted claims. */
function prepared(
  material: SmartPatchInputMaterial,
  profile: SmartPatchIllustriousRegionalProfile = PROFILES[material.manifest.mode],
): PreparedSmartPatchIllustriousRegionalInput {
  const { context: ctx, items } = material.manifest
  const recipe: PreparedSmartPatchIllustriousRegionalInput['recipe'] = {
    bbox: { ...ctx.bbox },
    documentId: ctx.documentId,
    documentRevision: ctx.documentRevision,
    family: 'illustrious',
    globalPrompts: {
      negative: structuredClone(ctx.generationDraft.negativePrompt),
      positive: structuredClone(ctx.generationDraft.positivePrompt),
    },
    internalResolution: { ...ctx.internalResolution },
    item: { ...structuredClone(items[0].item), iteration: 0, promptPairIndex: 0 },
    kind: 'smart-patch-regional-recipe',
    layerId: ctx.layerId,
    modelSha256: ctx.generationDraft.model!.fileSha256,
    regions: [0, 1].map((index) => {
      const positive = index === 0 ? prompt('(one cat)1.5') : null
      const local = prompt(index === 0 ? '(red scarf)1.5' : 'dormant {local|text}')
      return {
        authoredPrompts: { negative: local, positive, useGlobalNegativePrompt: index === 1 },
        coverage: {
          alpha: Uint8Array.from({ length: ctx.bbox.width * ctx.bbox.height }, (_, pixel) =>
            pixel % 3 === index ? 255 : pixel % 3 === 2 ? 127 + index : 0,
          ),
          bounds: { ...ctx.bbox },
          intersection: { ...ctx.bbox },
          kind: 'covered' as const,
        },
        maskId: randomUUID(),
        maskRevision: index + 1,
        negative: {
          prompt: index === 0 ? local : structuredClone(ctx.generationDraft.negativePrompt),
          source: index === 0 ? ('regional' as const) : ('smart-patch' as const),
        },
        positive,
        regionId: randomUUID(),
      }
    }),
    sampling: {
      cfgScale: ctx.generationDraft.sampling.cfgScale!,
      denoisingStrength: ctx.generationDraft.sampling.denoisingStrength!,
      scheduler: 'euler',
      steps: ctx.generationDraft.sampling.steps!,
    },
    smartMask: { maskId: ctx.mask.id, maskRevision: ctx.mask.revision },
  }
  return capturePreparedSmartPatchIllustriousRegionalInput({ profile, recipe, schemaVersion: 1 })
}

async function ordinaryInput(mode: SmartPatchGenerationMode) {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious', mode)
  const entry = material.manifest.items[0]
  assert.equal(entry.family, 'illustrious')
  if (entry.family !== 'illustrious') {
    assert.fail('Illustrious fixture required')
  }
  entry.inference.checkpoint.predictionType = 'epsilon'
  return await parseSmartPatchInputMaterial(material.manifest, material.files)
}

async function fixture(mode: SmartPatchGenerationMode) {
  const ordinary = await ordinaryInput(mode)
  const input = prepared(ordinary)
  const regional = await attachSmartPatchIllustriousRegionalInput(ordinary, input)
  return { input, ordinary, regional }
}

function clone(material: SmartPatchInputMaterial): SmartPatchInputMaterial {
  return {
    files: Object.fromEntries(Object.entries(material.files).map(([n, b]) => [n, Buffer.from(b)])),
    manifest: structuredClone(material.manifest),
  }
}

function assertMaterial(actual: SmartPatchInputMaterial, expected: SmartPatchInputMaterial) {
  assert.deepEqual(actual.manifest, expected.manifest)
  assert.deepEqual(Object.keys(actual.files).sort(), Object.keys(expected.files).sort())
  for (const [name, bytes] of Object.entries(expected.files)) {
    assert.ok(actual.files[name].equals(bytes), `Frozen material changed ${name}`)
  }
}

function assertPrepared(
  actual: PreparedSmartPatchIllustriousRegionalInput,
  expected: PreparedSmartPatchIllustriousRegionalInput,
) {
  const metadata = (input: PreparedSmartPatchIllustriousRegionalInput) => ({
    ...input,
    recipe: {
      ...input.recipe,
      regions: input.recipe.regions.map((r) => ({
        ...r,
        coverage: { ...r.coverage, alpha: digest(r.coverage.alpha) },
      })),
    },
  })
  assert.deepEqual(metadata(actual), metadata(expected))
  for (const [index, region] of expected.recipe.regions.entries()) {
    assert.ok(
      Buffer.from(actual.recipe.regions[index].coverage.alpha).equals(region.coverage.alpha),
    )
  }
}

function replaceFile(material: SmartPatchInputMaterial, name: string, bytes: Buffer) {
  const role = name as keyof SmartPatchInputMaterial['manifest']['files']
  const ref = material.manifest.files[role]
  assert.ok(ref)
  material.files[name] = bytes
  material.manifest.files[role] = { ...ref, byteSize: bytes.length, sha256: digest(bytes) }
}

for (const mode of Object.keys(PROFILES) as SmartPatchGenerationMode[]) {
  test(`public frozen ${mode} profile retains its exact world mode and source roles`, async () => {
    const { input, ordinary, regional } = await fixture(mode)
    assert.equal(regional.manifest.mode, mode)
    assert.equal(regional.manifest.regional!.profile, PROFILES[mode])
    assert.equal(
      regional.manifest.sourceAlpha,
      mode === 'txt2img' ? 'transparent' : mode === 'outpaint' ? 'mixed' : 'opaque',
    )
    assert.equal(Object.hasOwn(regional.files, 'model-source.png'), mode !== 'txt2img')
    assert.deepEqual(
      Object.keys(regional.files).sort(),
      [...Object.keys(ordinary.files), 'regional-0.alpha8', 'regional-1.alpha8'].sort(),
    )
    for (const [name, bytes] of Object.entries(ordinary.files)) {
      assert.ok(regional.files[name].equals(bytes), `Regional attachment changed ${name}`)
      assert.notEqual(regional.files[name], bytes)
    }
    assertPrepared(
      hydrateFrozenSmartPatchIllustriousRegionalInput(regional.manifest, regional.files),
      input,
    )
    const entry = regional.manifest.items[0]
    assert.equal(entry.family, 'illustrious')
    if (entry.family !== 'illustrious') {
      assert.fail('Original Illustrious fixture required')
    }
    assert.equal(entry.inference.sampling.scheduler, 'euler')
    assert.equal(entry.inference.sampling.denoisingStrength, mode === 'txt2img' ? undefined : 0.5)
    assert.equal(input.recipe.regions[1].negative.source, 'smart-patch')
    assert.deepEqual(input.recipe.regions[1].negative.prompt, input.recipe.globalPrompts.negative)
    assert.equal(input.recipe.regions[1].authoredPrompts!.negative!.text, 'dormant {local|text}')
  })

  for (const other of Object.keys(PROFILES) as SmartPatchGenerationMode[]) {
    if (other === mode) {
      continue
    }
    test(`frozen ${mode} material cannot borrow the ${other} profile`, async () => {
      const ordinary = await ordinaryInput(mode)
      const input = prepared(ordinary, PROFILES[other])
      const before = clone(ordinary)
      await assert.rejects(attachSmartPatchIllustriousRegionalInput(ordinary, input), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
      assertMaterial(ordinary, before)
    })
  }
}

for (const mode of MODES) {
  for (const sourceAlpha of ['transparent', 'opaque', 'mixed'] as const) {
    if (
      sourceAlpha ===
      (mode === 'txt2img' ? 'transparent' : mode === 'outpaint' ? 'mixed' : 'opaque')
    ) {
      continue
    }
    test(`frozen ${mode} metadata refuses declared ${sourceAlpha} source`, async () => {
      const { regional } = await fixture(mode)
      regional.manifest.sourceAlpha = sourceAlpha
      assert.throws(() => parseFrozenSmartPatchInputV1(regional.manifest), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    })
  }

  test(`matching source digest cannot change actual ${mode} world classification`, async () => {
    const { regional } = await fixture(mode)
    const { height, width } = regional.manifest.context.bbox
    const alpha = mode === 'txt2img' || mode === 'outpaint' ? 255 : 127
    replaceFile(
      regional,
      'source.png',
      literalSmartPatchColorPng(
        width,
        height,
        Array.from({ length: width * height }, () => [17, 31, 53, alpha]).flat(),
        4,
      ),
    )
    assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
    await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
  })

  if (mode === 'txt2img' || mode === 'img2img') {
    test(`matching ${mode} KEEP digest cannot select INP or silently discard protection`, async () => {
      const { regional } = await fixture(mode)
      const ref = regional.manifest.files['latent-keep-mask.png']
      replaceFile(
        regional,
        'latent-keep-mask.png',
        literalSmartPatchNumericPng(
          new Uint8Array(ref.width * ref.height).fill(1),
          ref.width,
          ref.height,
        ),
      )
      assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
      await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    })
  }

  test(`frozen ${mode} refuses changed raw bytes and extra or aliased alpha roles`, async () => {
    const { regional } = await fixture(mode)
    const changed = clone(regional)
    changed.files['regional-0.alpha8'][0] ^= 1
    await assert.rejects(parseSmartPatchInputMaterial(changed.manifest, changed.files))
    const extra = clone(regional)
    extra.files['regional-2.alpha8'] = Buffer.from(extra.files['regional-0.alpha8'])
    extra.manifest.files['regional-2.alpha8'] = { ...extra.manifest.files['regional-0.alpha8']! }
    assert.throws(() => parseFrozenSmartPatchInputV1(extra.manifest))
    const alias = structuredClone(regional.manifest.regional!)
    alias.recipe.regions[1].coverage.alpha = 'regional-0.alpha8'
    assert.throws(() => captureFrozenSmartPatchIllustriousRegionalInputV1(alias))
  })

  test(`caller and hydrated ${mode} mutation cannot replace any frozen source or signed stream`, async () => {
    const { input, ordinary, regional } = await fixture(mode)
    const expected = clone(regional)
    for (const bytes of Object.values(ordinary.files)) {
      bytes.fill(0)
    }
    input.recipe.regions[0].coverage.alpha.fill(0)
    input.recipe.regions[1].negative.prompt.text = 'later current Smart settings'
    assertMaterial(regional, expected)
    const hydrated = hydrateFrozenSmartPatchIllustriousRegionalInput(
      regional.manifest,
      regional.files,
    )
    hydrated.recipe.regions[0].coverage.alpha.fill(255)
    hydrated.recipe.globalPrompts.negative.text = 'returned mutable alias'
    assertMaterial(regional, expected)
  })

  test(`whole ${mode} bundle survives repository recreation and exact role verification`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), `igs-smart-${mode}-bundle-`))
    try {
      const { input, regional } = await fixture(mode)
      const expected = clone(regional)
      const owner = new SmartPatchInputBundleRepository(root)
      const saved = await owner.publish(regional)
      const payload = buildFrozenQueuedSmartPatchV1(saved, 0)
      regional.files['regional-0.alpha8'].fill(0)
      const loaded = await new SmartPatchInputBundleRepository(root).load(saved.id)
      assertMaterial(loaded, expected)
      assertPrepared(
        hydrateFrozenSmartPatchIllustriousRegionalInput(loaded.manifest, loaded.files),
        input,
      )
      assertQueuedSmartPatchBundle(parseFrozenQueuedSmartPatchV1(payload), loaded)
      const wrong = structuredClone(payload)
      wrong.regional!.profile = mode === 'txt2img' ? PROFILES.img2img : PROFILES.txt2img
      assert.throws(() => parseFrozenQueuedSmartPatchV1(wrong))
      await owner.discard(saved.id, saved.manifestSha256)
      await assert.rejects(owner.load(saved.id))
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test(`SQLite restart and frozen ${mode} Retry copy every source KEEP and regional byte`, async () => {
    // The existing queue fixture's second literal job is image-specific. Reuse its real
    // SQLite/catalog owner, then author one exact mode-specific material before admission.
    await withSmartPatchQueueFixture(
      'illustrious',
      async (f) => {
        const ordinary = await ordinaryInput(mode)
        const verified = f.material.manifest
        ordinary.manifest.context.projectKey = verified.context.projectKey
        ordinary.manifest.context.documentId = verified.context.documentId
        ordinary.manifest.context.documentRevision = verified.context.documentRevision
        ordinary.manifest.context.generationDraft.model = structuredClone(
          verified.context.generationDraft.model,
        )
        const item = ordinary.manifest.items[0]
        const sourceItem = verified.items[0]
        assert.equal(item.family, 'illustrious')
        assert.equal(sourceItem.family, 'illustrious')
        if (item.family !== 'illustrious' || sourceItem.family !== 'illustrious') {
          assert.fail('Original Illustrious fixture')
        }
        item.inference = {
          ...item.inference,
          checkpoint: {
            ...structuredClone(sourceItem.inference.checkpoint),
            predictionType: 'epsilon',
          },
        }
        const resolve = f.models.resolveVerifiedGenerationCheckpointForPlan.bind(f.models)
        f.models.resolveVerifiedGenerationCheckpointForPlan = async (saved) => {
          const result = await resolve(saved)
          return { ...result, reference: { ...result.reference, predictionType: 'epsilon' } }
        }
        const input = prepared(ordinary)
        f.material = await attachSmartPatchIllustriousRegionalInput(ordinary, input)
        const [row] = await admitSmartPatch(f)
        const original = await f.queue.loadVerifiedSmartPatchInput(row.id)
        const canceled = await f.queue.cancel(row.id, row.statusSequence)
        const queue = new GenerationQueueRepository(f.database.db, f.root)
        await queue.recoverAfterRestart()
        const retry = await queue.retryPreparedSmartPatchTerminal(row.id, canceled.statusSequence, {
          assertCurrent: () => undefined,
          modelService: f.models,
        })
        const replay = await queue.loadVerifiedSmartPatchInput(retry.id)
        assert.notEqual(replay.payload.bundle.id, original.payload.bundle.id)
        assert.equal(replay.payload.mode, mode)
        assert.equal(replay.payload.regional!.profile, PROFILES[mode])
        assert.deepEqual(replay.payload.item, original.payload.item)
        assert.deepEqual(replay.payload.regional, original.payload.regional)
        for (const [role, bytes] of Object.entries(original.bundle.files)) {
          assert.ok(replay.bundle.files[role].equals(bytes), `Retry changed ${role}`)
        }
        const role = mode === 'txt2img' ? 'regional-0.alpha8' : 'model-source.png'
        const source = path.join(
          f.root,
          'generation-queued-inputs',
          'smart-patch',
          original.payload.bundle.id,
          role,
        )
        const bytes = await readFile(source)
        await writeFile(source, Buffer.alloc(bytes.length))
        await assert.rejects(queue.loadVerifiedSmartPatchInput(row.id))
        assert.ok(
          (await queue.loadVerifiedSmartPatchInput(retry.id)).bundle.files[role].equals(bytes),
        )
      },
      {},
      'img2img',
    )
  })
}

const metadataRefusals: Record<string, (m: SmartPatchInputMaterial) => void> = {
  'Anima compiled prompts': (m) => {
    ;(m.manifest.regional as unknown as Record<string, unknown>).compiledPrompts = []
  },
  'Anima interpretation': (m) => {
    ;(m.manifest.regional as unknown as Record<string, unknown>).promptInterpretation =
      'invoke-fragments-v1'
  },
  'Canvas negative inheritance': (m) => {
    m.manifest.regional!.recipe.regions[1].negative.prompt.text = 'Current Canvas negative'
  },
  'missing exact noise policy': (m) => {
    const entry = m.manifest.items[0]
    assert.equal(entry.family, 'illustrious')
    if (entry.family !== 'illustrious') {
      assert.fail('Illustrious item required')
    }
    delete entry.inference.sampling.noiseProfile
  },
  'source Raster owner alias': (m) => {
    m.manifest.regional!.recipe.regions[0].regionId = m.manifest.context.sourceLayerIds[0]
  },
  'v prediction': (m) => {
    const entry = m.manifest.items[0]
    assert.equal(entry.family, 'illustrious')
    if (entry.family !== 'illustrious') {
      assert.fail('Illustrious item required')
    }
    entry.inference.checkpoint.predictionType = 'v_prediction'
  },
  'wrong family': (m) => {
    m.manifest.regional!.recipe.family = 'anima'
  },
  'wrong model': (m) => {
    m.manifest.regional!.recipe.modelSha256 = 'f'.repeat(64)
  },
  'wrong ordered role': (m) => {
    m.manifest.regional!.recipe.regions[1].coverage.alpha = 'regional-0.alpha8'
  },
  'wrong processing': (m) => {
    m.manifest.regional!.recipe.internalResolution.width += 8
  },
  'wrong revision': (m) => {
    m.manifest.regional!.recipe.documentRevision = randomUUID()
  },
  'wrong seed': (m) => {
    m.manifest.regional!.recipe.item = {
      ...m.manifest.regional!.recipe.item,
      seed: m.manifest.regional!.recipe.item.seed + 1,
    }
  },
  'wrong selected layer': (m) => {
    m.manifest.regional!.recipe.layerId = randomUUID()
  },
  'wrong Smart mask': (m) => {
    m.manifest.regional!.recipe.smartMask.maskRevision++
  },
  'wrong static item': (m) => {
    m.manifest.regional!.recipe.item = {
      ...m.manifest.regional!.recipe.item,
      iteration: m.manifest.regional!.recipe.item.iteration + 1,
    }
  },
  'wrong world descriptor': (m) => {
    m.manifest.files['regional-0.alpha8']!.width++
  },
  'wrong world origin': (m) => {
    m.manifest.regional!.recipe.bbox.x++
  },
  'zero SNR policy': (m) => {
    const entry = m.manifest.items[0]
    assert.equal(entry.family, 'illustrious')
    if (entry.family !== 'illustrious') {
      assert.fail('Illustrious item required')
    }
    entry.inference.sampling.noiseProfile!.rescaleBetasZeroSnr = true
  },
}
for (const [name, mutate] of Object.entries(metadataRefusals)) {
  test(`Illustrious frozen metadata refuses ${name} before raw pixel hydration`, async () => {
    const { regional } = await fixture('inpaint')
    mutate(regional)
    assert.throws(() => parseFrozenSmartPatchInputV1(regional.manifest), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
    await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
  })
}

test('frozen metadata and actual world planes retain separate evidence boundaries', async () => {
  const { regional } = await fixture('inpaint')
  assert.equal(Object.hasOwn(regional.manifest.regional!, 'compiledPrompts'), false)
  assert.equal(Object.hasOwn(regional.manifest.regional!, 'promptInterpretation'), false)
  const refs = regional.manifest.regional!
  refs.recipe.regions[0].coverage.kind = 'intersecting-empty'
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files), {
    code: 'SMART_PATCH_INPUT_INVALID',
  })
})

test('zero-region companion still owns exact Illustrious profile and original source roles', async () => {
  const ordinary = await ordinaryInput('img2img')
  const input = prepared(ordinary)
  input.recipe.regions = []
  const material = await attachSmartPatchIllustriousRegionalInput(ordinary, input)
  assert.deepEqual(Object.keys(material.files).sort(), Object.keys(ordinary.files).sort())
  assert.deepEqual(
    hydrateFrozenSmartPatchIllustriousRegionalInput(material.manifest, material.files),
    input,
  )
})

test('actual WORLD Smart mask coverage rejects IMG despite zero latent KEEP and nonzero regions', async () => {
  const { regional } = await fixture('img2img')
  const bytes = encodeProjectMaskPng(Uint8Array.of(1), 1, 1)
  const mask = regional.manifest.context.mask
  regional.manifest.context.mask = {
    ...mask,
    asset: {
      bytes: bytes.length,
      height: 1,
      path: `assets/masks/${mask.id}/${digest(bytes)}.png`,
      sha256: digest(bytes),
      width: 1,
    },
    bounds: {
      height: 1,
      width: 1,
      x: regional.manifest.context.bbox.x,
      y: regional.manifest.context.bbox.y,
    },
    revision: 1,
  }
  regional.manifest.regional!.recipe.smartMask.maskRevision = 1
  regional.files['authored-mask.png'] = bytes
  regional.manifest.files['authored-mask.png'] = {
    byteSize: bytes.length,
    height: 1,
    sha256: digest(bytes),
    width: 1,
  }
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files), {
    code: 'SMART_PATCH_INPUT_INVALID',
  })
})

test('nonzero regional planes cannot retain INP after WORLD Smart mask moves outside', async () => {
  const { regional } = await fixture('inpaint')
  const mask = regional.manifest.context.mask
  assert.ok('bounds' in mask)
  mask.bounds = {
    ...mask.bounds,
    x: regional.manifest.context.bbox.x + regional.manifest.context.bbox.width + 1,
  }
  assert.doesNotThrow(() => parseFrozenSmartPatchInputV1(regional.manifest))
  await assert.rejects(parseSmartPatchInputMaterial(regional.manifest, regional.files), {
    code: 'SMART_PATCH_INPUT_INVALID',
  })
})
