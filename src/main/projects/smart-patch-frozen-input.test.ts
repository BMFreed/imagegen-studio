import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'

import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'

import { decodeDerivedProjectMaskPng, encodeProjectMaskPng } from './project-mask.js'
import {
  captureSmartPatchInputMaterial,
  parseFrozenSmartPatchInputV1,
  parseSmartPatchInputMaterial,
  type SmartPatchInputMaterial,
} from './smart-patch-frozen-input.js'
import {
  literalPreparedSmartPatchInputMaterial,
  literalSmartPatchColorPng,
  literalSmartPatchNumericPng,
  literalSmartPatchPreparedInput,
} from './test-fixtures/smart-patch-input-material.js'

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
// Frozen old/new sidecars are literal evidence, independent of the selected compiler default.
const legacyFragmentPrompt = {
  cleanedText: 'a,b',
  spans: [{ end: 3, start: 0, weight: 2 }],
  version: 'anima-prompt-weighting-v1' as const,
}
const currentFragmentPrompt = {
  cleanedText: 'a , b',
  spans: [
    { end: 1, start: 0, weight: 2 },
    { end: 2, start: 1, weight: 1 },
    { end: 3, start: 2, weight: 2 },
    { end: 4, start: 3, weight: 1 },
    { end: 5, start: 4, weight: 2 },
  ],
  version: 'anima-prompt-weighting-v1' as const,
}

function cloneMaterial(input: SmartPatchInputMaterial): SmartPatchInputMaterial {
  return {
    files: Object.fromEntries(
      Object.entries(input.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
    ),
    manifest: structuredClone(input.manifest),
  }
}

function replacePlane(
  material: SmartPatchInputMaterial,
  name: keyof SmartPatchInputMaterial['manifest']['files'],
  bytes: Buffer,
): void {
  material.files[name] = Buffer.from(bytes)
  material.manifest.files[name] = {
    ...material.manifest.files[name]!,
    byteSize: bytes.length,
    sha256: digest(bytes),
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    test(`literal ${family} ${mode} material captures strict fixed input roles and reloads without transient paths`, async () => {
      const material = await literalPreparedSmartPatchInputMaterial(family, mode)
      const names = [
        'source.png',
        'latent-keep-mask.png',
        'final-contribution-mask.png',
        ...(mode === 'txt2img' ? [] : ['model-source.png']),
        ...(mode === 'inpaint' ? ['authored-mask.png'] : []),
      ].sort()
      assert.deepEqual(Object.keys(material.files).sort(), names)
      assert.deepEqual(Object.keys(material.manifest.files).sort(), names)
      const reopened = await parseSmartPatchInputMaterial(
        JSON.parse(JSON.stringify(material.manifest)),
        material.files,
      )
      assert.deepEqual(reopened, material)
      assert.equal(reopened.manifest.mode, mode)
      assert.equal(reopened.manifest.items[0].family, family)
      assert.equal(
        reopened.manifest.animaPromptInterpretation,
        family === 'anima' ? ANIMA_PROMPT_INTERPRETATION : undefined,
      )
      assert.equal('animaPromptInterpretation' in reopened.manifest, family === 'anima')
      assert.equal('animaPromptInterpretation' in reopened.manifest.context, false)
      assert.equal(reopened.manifest.context.bbox.x, -9)
      assert.equal(reopened.manifest.context.bbox.width, 128)
      assert.equal(reopened.manifest.context.internalResolution.width, 64)
      const json = JSON.stringify(reopened.manifest)
      assert.ok(!json.includes('/operation-stage'))
      assert.ok(!json.includes('requestId'))
      assert.ok(!json.includes('pngPath'))
      assert.ok(
        json.includes('/managed/'),
        'Exact private model paths remain operational identities',
      )
      for (const name of names) {
        assert.equal(
          digest(reopened.files[name]),
          reopened.manifest.files[name as keyof typeof reopened.manifest.files]?.sha256,
        )
        assert.notEqual(reopened.files[name], material.files[name])
      }
      if (mode === 'inpaint') {
        const keep = decodeDerivedProjectMaskPng(
          reopened.files['latent-keep-mask.png'],
          reopened.manifest.files['latent-keep-mask.png'],
        )
        const alpha = decodeDerivedProjectMaskPng(
          reopened.files['final-contribution-mask.png'],
          reopened.manifest.files['final-contribution-mask.png'],
        )
        assert.ok(keep.every((value) => value === 255))
        assert.equal(reopened.manifest.latentMaskHasCoverage, false)
        assert.equal(alpha[515], 255)
        assert.equal(alpha.filter((value) => value > 0).length, 1)
      }
    })
  }
}

for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
  test(`Anima ${mode} material retains declared fragment joining and absent-marker legacy signs on reload`, async () => {
    const { executions, prepared } = literalSmartPatchPreparedInput('anima', mode)
    const execution = executions[0]
    if (execution.request.family !== 'anima') {
      assert.fail('fixture family')
    }
    execution.item.prompts = { negative: '(a,b)2', positive: '(a,b)2' }
    prepared.context.generationDraft.positivePrompt.text = '(a,b)2'
    prepared.context.generationDraft.negativePrompt.text = '(a,b)2'
    execution.request.inference = {
      ...execution.request.inference,
      prompts: {
        negative: structuredClone(currentFragmentPrompt),
        positive: structuredClone(currentFragmentPrompt),
      },
    }
    const material = await captureSmartPatchInputMaterial(prepared, executions)
    assert.equal(material.manifest.animaPromptInterpretation, ANIMA_PROMPT_INTERPRETATION)
    assert.equal('animaPromptInterpretation' in material.manifest.context, false)
    assert.deepEqual(material.manifest.items[0].inference.prompts, {
      negative: currentFragmentPrompt,
      positive: currentFragmentPrompt,
    })
    const legacy = cloneMaterial(material)
    delete legacy.manifest.animaPromptInterpretation
    const legacyEntry = legacy.manifest.items[0]
    if (legacyEntry.family !== 'anima') {
      assert.fail('fixture family')
    }
    legacyEntry.inference = {
      ...legacyEntry.inference,
      prompts: {
        negative: structuredClone(legacyFragmentPrompt),
        positive: structuredClone(legacyFragmentPrompt),
      },
    }
    const reopened = await parseSmartPatchInputMaterial(
      JSON.parse(JSON.stringify(legacy.manifest)),
      legacy.files,
    )
    assert.deepEqual(reopened, legacy)
    assert.equal('animaPromptInterpretation' in reopened.manifest, false)

    const refused = (
      source: SmartPatchInputMaterial,
      change: (changed: SmartPatchInputMaterial['manifest']) => void,
    ) => {
      const changed = cloneMaterial(source)
      change(changed.manifest)
      assert.throws(() => parseFrozenSmartPatchInputV1(changed.manifest), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    }
    refused(material, (manifest) => {
      delete manifest.animaPromptInterpretation
    })
    refused(legacy, (manifest) => {
      manifest.animaPromptInterpretation = ANIMA_PROMPT_INTERPRETATION
    })
    refused(material, (manifest) => {
      Object.assign(manifest, { animaPromptInterpretation: 'unknown-fragments-v2' })
    })
    refused(legacy, (manifest) => {
      Object.assign(manifest.context, { animaPromptInterpretation: ANIMA_PROMPT_INTERPRETATION })
    })
    for (const polarity of ['positive', 'negative'] as const) {
      for (const [source, replacement] of [
        [legacy, currentFragmentPrompt],
        [material, legacyFragmentPrompt],
      ] as const) {
        refused(source, (manifest) => {
          const entry = manifest.items[0]
          if (entry.family !== 'anima') {
            assert.fail('fixture family')
          }
          entry.inference = {
            ...entry.inference,
            prompts: { ...entry.inference.prompts, [polarity]: structuredClone(replacement) },
          }
        })
      }
      refused(legacy, (manifest) => {
        const entry = manifest.items[0]
        if (entry.family !== 'anima') {
          assert.fail('fixture family')
        }
        entry.inference = {
          ...entry.inference,
          prompts: {
            ...entry.inference.prompts,
            [polarity]: { ...legacyFragmentPrompt, spans: [{ end: 3, start: 0, weight: 3 }] },
          },
        }
      })
      const oldSidecar = structuredClone(execution)
      if (oldSidecar.request.family !== 'anima') {
        assert.fail('fixture family')
      }
      oldSidecar.request.inference = {
        ...oldSidecar.request.inference,
        prompts: {
          ...oldSidecar.request.inference.prompts,
          [polarity]: structuredClone(legacyFragmentPrompt),
        },
      }
      await assert.rejects(captureSmartPatchInputMaterial(prepared, [oldSidecar]), {
        code: 'SMART_PATCH_INPUT_INVALID',
      })
    }
    prepared.context.generationDraft.positivePrompt.text = 'later authoring'
    execution.item.prompts.positive = 'later concrete prompt'
    assert.deepEqual(
      await parseSmartPatchInputMaterial(material.manifest, material.files),
      material,
    )
    assert.deepEqual(await parseSmartPatchInputMaterial(legacy.manifest, legacy.files), legacy)
  })
}

test('Illustrious material keeps the old schema and refuses an Anima-only interpretation marker', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious')
  assert.equal('animaPromptInterpretation' in material.manifest, false)
  assert.deepEqual(parseFrozenSmartPatchInputV1(material.manifest), material.manifest)
  assert.throws(
    () =>
      parseFrozenSmartPatchInputV1({
        ...material.manifest,
        animaPromptInterpretation: ANIMA_PROMPT_INTERPRETATION,
      }),
    { code: 'SMART_PATCH_INPUT_INVALID' },
  )
})

test('material capture owns buffers, context and concrete items before its first async PNG read', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  const source = Buffer.from(prepared.source.bytes)
  const expectedRequest = structuredClone(executions[0].request)
  const pending = captureSmartPatchInputMaterial(prepared, executions)
  prepared.source.bytes.fill(0)
  prepared.conditioning.finalContributionMask.bytes.fill(0)
  prepared.context.bbox.x = 999
  prepared.context.generationDraft.positivePrompt.text = 'later draft'
  executions[0].item.seed = 77
  executions[0].item.prompts.positive = 'later concrete prompt'
  if (executions[0].request.family === 'illustrious') {
    executions[0].request.inference.sampling.seed = 77
  }
  const material = await pending
  assert.ok(material.files['source.png'].equals(source))
  assert.equal(material.manifest.context.bbox.x, -9)
  assert.equal(material.manifest.items[0].item.seed, 0)
  assert.deepEqual(material.manifest.items[0].inference, expectedRequest.inference)
  const another = await parseSmartPatchInputMaterial(material.manifest, material.files)
  material.files['source.png'].fill(0)
  material.manifest.context.bbox.x = 333
  assert.ok(another.files['source.png'].equals(source))
  assert.equal(another.manifest.context.bbox.x, -9)
})

test('private read-only material retains hidden locked context without granting generation permission', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  prepared.context.locked = true
  prepared.context.visible = false
  const material = await captureSmartPatchInputMaterial(prepared, executions)
  assert.equal(material.manifest.context.locked, true)
  assert.equal(material.manifest.context.visible, false)
})

test('fresh material rejects an altered valid RGB PNG against its retained exact identity', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious', 'img2img')
  const altered = cloneMaterial(material)
  const validChanged = literalSmartPatchColorPng(
    64,
    64,
    Array.from({ length: 64 * 64 }, () => [33, 64, 96]).flat(),
    3,
  )
  assert.equal(
    validChanged.length,
    material.files['model-source.png'].length,
    'Stored-deflate controls retain truthful original byte size',
  )
  assert.notEqual(digest(validChanged), material.manifest.files['model-source.png']?.sha256)
  altered.files['model-source.png'] = validChanged
  await assert.rejects(
    parseSmartPatchInputMaterial(altered.manifest, altered.files),
    /exact byte identity/,
  )
  assert.deepEqual(await parseSmartPatchInputMaterial(material.manifest, material.files), material)
})

test('numeric alpha cannot silently disagree with stored latent coverage or lose original world core', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  const noCore = cloneMaterial(material)
  replacePlane(
    noCore,
    'final-contribution-mask.png',
    literalSmartPatchNumericPng(new Uint8Array(128 * 128), 128, 128),
  )
  await assert.rejects(
    parseSmartPatchInputMaterial(noCore.manifest, noCore.files),
    /world edit core/,
  )
  const falseCoverage = cloneMaterial(material)
  falseCoverage.manifest.latentMaskHasCoverage = true
  await assert.rejects(
    parseSmartPatchInputMaterial(falseCoverage.manifest, falseCoverage.files),
    /KEEP policy/,
  )
  assert.equal(
    (await parseSmartPatchInputMaterial(material.manifest, material.files)).manifest
      .latentMaskHasCoverage,
    false,
  )
})

test('ordinary source-only modes require all-zero KEEP and full world contribution', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious', 'img2img')
  const wrongKeep = cloneMaterial(material)
  replacePlane(
    wrongKeep,
    'latent-keep-mask.png',
    literalSmartPatchNumericPng(new Uint8Array(64).fill(255), 8, 8),
  )
  wrongKeep.manifest.latentMaskHasCoverage = false
  await assert.rejects(
    parseSmartPatchInputMaterial(wrongKeep.manifest, wrongKeep.files),
    /KEEP policy/,
  )
  const wrongAlpha = cloneMaterial(material)
  replacePlane(
    wrongAlpha,
    'final-contribution-mask.png',
    literalSmartPatchNumericPng(new Uint8Array(128 * 128).fill(64), 128, 128),
  )
  await assert.rejects(
    parseSmartPatchInputMaterial(wrongAlpha.manifest, wrongAlpha.files),
    /world edit core/,
  )
})

test('strict actual PNG checks reject truthful wrong topology and numeric color metadata', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('illustrious', 'img2img')
  const wrongTopology = cloneMaterial(material)
  replacePlane(
    wrongTopology,
    'model-source.png',
    literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 64 * 64 }, () => [32, 64, 96, 255]).flat(),
      4,
    ),
  )
  await assert.rejects(
    parseSmartPatchInputMaterial(wrongTopology.manifest, wrongTopology.files),
    /topology/,
  )
  const coloredMask = cloneMaterial(material)
  replacePlane(
    coloredMask,
    'latent-keep-mask.png',
    literalSmartPatchColorPng(8, 8, Array.from({ length: 64 }, () => [255, 255, 255, 0]).flat(), 4),
  )
  await assert.rejects(parseSmartPatchInputMaterial(coloredMask.manifest, coloredMask.files))
})

test('whole authored mask keeps its existing 4096-side limit independently of the 2048 world limit', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  const alpha = new Uint8Array(4096)
  alpha[0] = alpha[4095] = 1
  const bytes = encodeProjectMaskPng(alpha, 4096, 1)
  const id = prepared.context.mask.id
  prepared.context.mask = {
    asset: {
      bytes: bytes.length,
      height: 1,
      path: `assets/masks/${id}/${digest(bytes)}.png`,
      sha256: digest(bytes),
      width: 4096,
    },
    bounds: { height: 1, width: 4096, x: -6, y: 17 },
    id,
    revision: 2,
  }
  prepared.maskPngBytes = bytes
  const material = await captureSmartPatchInputMaterial(prepared, executions)
  assert.equal(material.manifest.files['authored-mask.png']?.width, 4096)
  assert.equal(material.manifest.files['source.png'].width, 128)
})

test('a verified whole authored mask outside bbox keeps source-only IMG without deleting original mask', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput('illustrious', 'img2img')
  const bytes = encodeProjectMaskPng(Uint8Array.of(255), 1, 1)
  const id = prepared.context.mask.id
  prepared.context.mask = {
    asset: {
      bytes: bytes.length,
      height: 1,
      path: `assets/masks/${id}/${digest(bytes)}.png`,
      sha256: digest(bytes),
      width: 1,
    },
    bounds: { height: 1, width: 1, x: 9999, y: -9999 },
    id,
    revision: 1,
  }
  prepared.maskPngBytes = bytes
  const material = await captureSmartPatchInputMaterial(prepared, executions)
  assert.equal(material.manifest.mode, 'img2img')
  assert.ok(material.files['authored-mask.png'].equals(bytes))
})

test('effective checkpoint prediction and noise profile survive independently from the advisory draft prediction', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  const request = executions[0].request
  assert.equal(request.family, 'illustrious')
  if (request.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  request.inference.sampling.noiseProfile!.rescaleBetasZeroSnr = true
  request.inference.sampling.noiseProfile!.timestepSpacing = 'trailing'
  const material = await captureSmartPatchInputMaterial(prepared, executions)
  assert.equal(material.manifest.context.generationDraft.model?.predictionType, 'epsilon')
  const item = material.manifest.items[0]
  if (item.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  assert.equal(item.inference.checkpoint.predictionType, 'v_prediction')
  assert.equal(item.inference.sampling.noiseProfile?.rescaleBetasZeroSnr, true)
  assert.equal(item.inference.sampling.noiseProfile?.timestepSpacing, 'trailing')
})

function ref(
  kind: 'embedding' | 'lora' | 'vae',
  sha256: string,
): NonNullable<IgsProjectDocumentV1['generationDraft']['model']> {
  return {
    baseModelFamily: 'illustrious',
    civitaiFileId: kind === 'lora' ? null : 1,
    civitaiModelId: kind === 'lora' ? null : 2,
    civitaiVersionId: kind === 'lora' ? null : 3,
    displayName: kind,
    fileSha256: sha256,
    kind,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: null,
    versionName: 'exact',
  }
}

test('ordered active LoRAs, concrete effective embeddings and exact external VAE are checked without resource file reads', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  const request = executions[0].request
  if (request.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  const disabled = ref('lora', 'f'.repeat(64))
  const first = ref('lora', 'd'.repeat(64))
  const second = ref('lora', 'e'.repeat(64))
  prepared.context.generationDraft.loras = [
    { enabled: true, resource: first, weight: -0.5 },
    { enabled: false, resource: disabled, weight: 9 },
    { enabled: true, resource: second, weight: 1 },
  ]
  request.inference.loras = [
    { byteSize: 1, path: '/managed/first.safetensors', sha256: first.fileSha256, weight: -0.5 },
    { byteSize: 2, path: '/managed/second.safetensors', sha256: second.fileSha256, weight: 1 },
  ]
  const embedding = ref('embedding', '1'.repeat(64))
  prepared.context.generationDraft.positivePrompt.embeddingRefs = [
    { resource: embedding, token: '<detail>' },
  ]
  executions[0].item.prompts.positive = 'portrait <detail>'
  request.inference.prompts.positive = 'portrait <detail>'
  request.inference.embeddings = {
    negative: [],
    positive: [
      {
        byteSize: 4,
        path: '/managed/embedding.safetensors',
        sha256: embedding.fileSha256,
        token: '<detail>',
      },
    ],
  }
  const vae = ref('vae', '2'.repeat(64))
  prepared.context.generationDraft.vae = vae
  request.inference.vae = {
    byteSize: 5,
    path: '/managed/external-vae.safetensors',
    sha256: vae.fileSha256,
  }
  const material = await captureSmartPatchInputMaterial(prepared, executions)
  assert.equal(material.manifest.context.generationDraft.loras.length, 3)
  const reordered = cloneMaterial(material)
  const entry = reordered.manifest.items[0]
  if (entry.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  entry.inference.loras?.reverse()
  assert.throws(() => parseFrozenSmartPatchInputV1(reordered.manifest), /LoRA order/)
  const missingEmbedding = cloneMaterial(material)
  const missing = missingEmbedding.manifest.items[0]
  if (missing.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  delete missing.inference.embeddings
  assert.throws(
    () => parseFrozenSmartPatchInputV1(missingEmbedding.manifest),
    /effective embeddings/,
  )
})

test('inactive authored embeddings need no concrete wire entry and expanded text may differ from authored text', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  prepared.context.generationDraft.positivePrompt.text = '{<detail>|plain}'
  prepared.context.generationDraft.positivePrompt.embeddingRefs = [
    { resource: ref('embedding', '1'.repeat(64)), token: '<detail>' },
  ]
  executions[0].item.prompts.positive = 'plain'
  const request = executions[0].request
  if (request.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  request.inference.prompts.positive = 'plain'
  const material = await captureSmartPatchInputMaterial(prepared, executions)
  assert.equal(material.manifest.items[0].item.prompts.positive, 'plain')
  assert.equal(material.manifest.context.generationDraft.positivePrompt.text, '{<detail>|plain}')
})

test('concrete seed drift is refused while an untouched native Anima plan remains green', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('anima')
  const drift = cloneMaterial(material)
  drift.manifest.items[0].item.seed = 1
  assert.throws(() => parseFrozenSmartPatchInputV1(drift.manifest), /sampling interpretation/)
  assert.deepEqual(await parseSmartPatchInputMaterial(material.manifest, material.files), material)
})

test('Anima compiled prompt spans must match concrete raw text rather than just pass compiled syntax validation', async () => {
  const material = await literalPreparedSmartPatchInputMaterial('anima')
  const changed = cloneMaterial(material)
  const entry = changed.manifest.items[0]
  if (entry.family !== 'anima') {
    assert.fail('fixture family')
  }
  entry.inference = {
    ...entry.inference,
    prompts: {
      ...entry.inference.prompts,
      positive: compileAnimaPromptWeighting('different valid weighted text'),
    },
  }
  assert.throws(() => parseFrozenSmartPatchInputV1(changed.manifest), /sampling interpretation/)
})

test('32 concrete items may vary seed without rewriting fixed authored seed and no 33rd item is admitted', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput('anima', 'img2img')
  const first = executions[0]
  const entries = Array.from({ length: 32 }, (_, index) => {
    const request: SmartPatchExecutionRequest = structuredClone(first.request)
    if (request.family !== 'anima') {
      assert.fail('fixture family')
    }
    const sampling = compileAnimaFlowSamplingPlan({
      guidanceScale: 4,
      height: 64,
      mode: 'img2img',
      scheduler: 'euler',
      seed: index === 31 ? 0xff_ff_ff_ff : index,
      steps: 3,
      strength: 0.5,
      width: 64,
    })
    request.inference = { ...request.inference, sampling }
    return {
      item: { ...structuredClone(first.item), seed: index === 31 ? 0xff_ff_ff_ff : index },
      request,
    }
  })
  const material = await captureSmartPatchInputMaterial(prepared, entries)
  assert.equal(material.manifest.items.length, 32)
  assert.equal(material.manifest.items[31].item.seed, 0xff_ff_ff_ff)
  assert.equal(material.manifest.context.generationDraft.seed.value, 0)
  await assert.rejects(
    captureSmartPatchInputMaterial(prepared, [...entries, entries[0]]),
    /manifest/,
  )
  await assert.rejects(captureSmartPatchInputMaterial(prepared, []), /manifest/)
})

test('strict metadata refuses unknown keys, missing files and role-bound geometry before file consumption', async () => {
  const material = await literalPreparedSmartPatchInputMaterial()
  const manifest = { ...material.manifest, requestId: randomUUID() }
  assert.throws(() => parseFrozenSmartPatchInputV1(manifest), /manifest/)
  const changed = cloneMaterial(material)
  changed.manifest.files['latent-keep-mask.png'].width = 7
  assert.throws(() => parseFrozenSmartPatchInputV1(changed.manifest), /owned context/)
  const missing = cloneMaterial(material)
  delete missing.files['source.png']
  await assert.rejects(parseSmartPatchInputMaterial(missing.manifest, missing.files), /roles/)
  const extra = cloneMaterial(material)
  extra.files['../escape.png'] = Buffer.from('unowned')
  await assert.rejects(parseSmartPatchInputMaterial(extra.manifest, extra.files), /roles/)
})

test('a late concrete item cannot change the shared exact checkpoint policy', async () => {
  const { executions, prepared } = literalSmartPatchPreparedInput()
  const another = structuredClone(executions[0])
  if (another.request.family !== 'illustrious') {
    assert.fail('fixture family')
  }
  another.request.inference.checkpoint.predictionType = 'epsilon'
  await assert.rejects(
    captureSmartPatchInputMaterial(prepared, [executions[0], another]),
    /shared resources/,
  )
  assert.equal(
    (await captureSmartPatchInputMaterial(prepared, executions)).manifest.items.length,
    1,
  )
})
