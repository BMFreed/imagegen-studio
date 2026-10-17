import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsSmartPatchGenerationProvenanceV1,
  type IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  assessSmartPatchVariantState,
  assessStoredSmartPatchVariantForLayer,
  assessStoredSmartPatchVariants,
  assessStoredSmartPatchVariantState,
  type SmartPatchVariantChangedInput,
} from './project-smart-patch-variant-state.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

type Family = 'anima' | 'illustrious'
type Draft = IgsProjectDocumentV1['generationDraft']

/** Declared metadata only: these pure rules do not claim pixel capture or an accepted document. */
function fixture(family: Family = 'illustrious') {
  const provenance = smartPatchVariantMetadataFixture(family).generationProvenance
  const baseline = provenance.layerSourceContext
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...baseline.bbox },
    generationDraft: structuredClone(baseline.generationDraft),
    id: baseline.layerId,
    internalResolution: { ...baseline.internalResolution },
    kind: 'smart-patch',
    locked: false,
    mask: structuredClone(baseline.mask),
    name: 'Current owner',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  const document = {
    ...createEmptyProjectDocumentV1({
      documentId: baseline.sourceDocumentId,
      title: 'Independent current Project snapshot',
    }),
    layers: [patch],
  }
  return { document, patch, provenance, source: { ...baseline.sourceTarget } }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} frozen authoring and independently supplied current source identity are ready`, () => {
    const f = fixture(family)
    assert.notEqual(
      f.document.documentRevision,
      f.provenance.layerSourceContext.sourceDocumentRevision,
    )
    assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, f.source), {
      blockedBy: [],
      changedInputs: [],
      status: 'ready',
    })
    assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document), {
      blockedBy: [],
      changedInputs: [],
      status: 'unverified',
    })
  })
}

test('changed source pixels stale a variant even when the Project revision is unchanged', () => {
  const f = fixture()
  f.document.documentRevision = f.provenance.layerSourceContext.sourceDocumentRevision
  const source = { ...f.source, sha256: '8'.repeat(64) }
  assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, source), {
    blockedBy: [],
    changedInputs: ['source-composite'],
    status: 'outdated',
  })
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'ready')
})

test('unrelated Project edits, presentation and Fit-only padding do not stale a variant', () => {
  const f = fixture()
  f.document.title = 'Renamed Project'
  f.document.documentRevision = randomUUID()
  f.document.primaryBbox = { height: 512, width: 768, x: 400, y: -9 }
  f.document.generationDraft.positivePrompt.text = 'unrelated normal prompt'
  f.document.lastActualSeedSnapshot = 123
  f.patch.name = 'Renamed Patch'
  f.patch.opacity = 0.25
  f.patch.blendMode = 'multiply'
  f.patch.maskSettings = { blur: 16, padding: 500 }
  f.patch.coherenceSettings = { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' }
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'ready')
})

const ownedChanges: {
  axis: SmartPatchVariantChangedInput
  change: (patch: IgsSmartPatchLayerV1) => void
  name: string
}[] = [
  {
    axis: 'mask',
    change: (patch) => {
      patch.mask.revision += 1
    },
    name: 'mask revision',
  },
  {
    axis: 'mask',
    change: (patch) => {
      if (patch.mask.asset) {
        patch.mask.bounds.x += 1
      }
    },
    name: 'mask geometry',
  },
  {
    axis: 'bbox',
    change: (patch) => {
      patch.boundingBox.x += 1
    },
    name: 'bbox position',
  },
  {
    axis: 'internal-resolution',
    change: (patch) => {
      patch.internalResolution.width = 128
    },
    name: 'internal resolution',
  },
  {
    axis: 'mask-blur',
    change: (patch) => {
      patch.maskSettings = { blur: 17, padding: 8 }
    },
    name: 'resolved blur',
  },
  {
    axis: 'coherence',
    change: (patch) => {
      patch.coherenceSettings = { edgeSize: 16, minimumDenoise: 0, mode: 'Box Blur' }
    },
    name: 'coherence profile',
  },
  {
    axis: 'generation-draft',
    change: (patch) => {
      patch.generationDraft.positivePrompt.text = 'changed authored prompt'
    },
    name: 'authored prompt',
  },
  {
    axis: 'generation-draft',
    change: (patch) => {
      patch.generationDraft.seed.value = 1
    },
    name: 'fixed seed zero',
  },
]
for (const row of ownedChanges) {
  test(`Smart Patch staleness detects changed ${row.name} without document revision changes`, () => {
    const f = fixture()
    const before = structuredClone(f.provenance)
    row.change(f.patch)
    assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, f.source), {
      blockedBy: [],
      changedInputs: [row.axis],
      status: 'outdated',
    })
    assert.deepEqual(f.provenance, before, 'assessment never rewrites the frozen baseline')
    const unverified = assessSmartPatchVariantState(f.provenance, f.document)
    assert.equal(unverified.status, 'unverified')
    assert.deepEqual(unverified.changedInputs, [row.axis])
  })
}

test('locked and hidden target block Add independently without a current pixel capture', () => {
  for (const state of ['locked', 'hidden', 'both'] as const) {
    const f = fixture()
    f.patch.locked = state !== 'hidden'
    f.patch.visible = state === 'locked'
    assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document), {
      blockedBy: state === 'both' ? ['locked', 'hidden'] : [state],
      changedInputs: [],
      status: 'blocked',
    })
  }
})

test('absent, wrong-kind and other-document targets remain orphaned without retargeting', () => {
  const missing = fixture()
  missing.document.layers = []
  const otherDocument = fixture()
  otherDocument.document.documentId = randomUUID()
  const wrongKind = fixture()
  const rasterId = wrongKind.patch.id
  const rasterDocument: IgsProjectDocumentV1 = {
    ...wrongKind.document,
    layers: [
      {
        asset: {
          bytes: 96,
          height: 5,
          path: `assets/layers/${rasterId}.png`,
          sha256: '9'.repeat(64),
          width: 7,
        },
        blendMode: 'normal',
        id: rasterId,
        kind: 'raster',
        locked: false,
        name: 'An unrelated Raster now has the old identity',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: true,
      },
    ],
  }
  for (const [provenance, document] of [
    [missing.provenance, missing.document],
    [otherDocument.provenance, otherDocument.document],
    [wrongKind.provenance, rasterDocument],
  ] as const) {
    assert.deepEqual(assessSmartPatchVariantState(provenance, document), {
      blockedBy: [],
      changedInputs: [],
      status: 'orphaned',
    })
  }
})

test('actual current source metadata must be bounded and correlated to the current bbox', () => {
  const f = fixture()
  for (const source of [
    { ...f.source, height: f.source.height + 1 },
    { ...f.source, width: 0 },
    { ...f.source, byteSize: 0 },
    { ...f.source, sha256: 'not-a-sha' },
    { ...f.source, path: '/not-an-identity.png' },
  ]) {
    assert.throws(() => assessSmartPatchVariantState(f.provenance, f.document, source))
  }
  f.patch.boundingBox.width += 1
  assert.throws(() => assessSmartPatchVariantState(f.provenance, f.document, f.source))
  const changed = assessSmartPatchVariantState(f.provenance, f.document, {
    ...f.source,
    width: f.patch.boundingBox.width,
  })
  assert.equal(changed.status, 'outdated')
  assert.deepEqual(changed.changedInputs, ['bbox', 'source-composite'])
})

function lora(draft: Draft, hash: string, enabled = true): Draft['loras'][number] {
  assert.ok(draft.model)
  return {
    enabled,
    resource: { ...draft.model, fileSha256: hash.repeat(64), kind: 'lora', predictionType: null },
    weight: 0.5,
  }
}

function withDrafts(
  f: ReturnType<typeof fixture>,
  edit: (baseline: Draft, current: Draft) => void,
) {
  edit(f.provenance.layerSourceContext.generationDraft, f.patch.generationDraft)
  return assessSmartPatchVariantState(f.provenance, f.document, f.source)
}

test('resource display labels and registry relinking do not change exact generation inputs', () => {
  const f = fixture()
  const before = structuredClone(f.provenance)
  assert.ok(f.patch.generationDraft.model)
  Object.assign(f.patch.generationDraft.model, {
    civitaiFileId: 12,
    civitaiModelId: 34,
    civitaiVersionId: 56,
    displayName: 'New display label',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    versionName: 'New version label',
  })
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'ready')
  f.patch.generationDraft.model.fileSha256 = '7'.repeat(64)
  assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, f.source).changedInputs, [
    'generation-draft',
  ])
  assert.deepEqual(f.provenance, before)
})

test('disabled LoRAs and dormant seed values do not stale effective generation inputs', () => {
  const f = fixture()
  const state = withDrafts(f, (baseline, current) => {
    baseline.loras = [lora(baseline, '6', false)]
    current.loras = [{ ...lora(current, '7', false), weight: -10 }]
    baseline.seed = { policy: 'random', value: 0 }
    current.seed = { policy: 'random', value: 123 }
  })
  assert.equal(state.status, 'ready')
})

test('enabled LoRA weights and ordered stacks affect variant staleness', () => {
  const f = fixture()
  withDrafts(f, (baseline, current) => {
    baseline.loras = [lora(baseline, '6'), lora(baseline, '7')]
    current.loras = structuredClone(baseline.loras)
  })
  f.patch.generationDraft.loras.reverse()
  assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, f.source).changedInputs, [
    'generation-draft',
  ])
  f.patch.generationDraft.loras.reverse()
  f.patch.generationDraft.loras[0].weight = 0.25
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'outdated')
})

test('unused embedding sidecars are dormant while an active literal binding affects the result', () => {
  const f = fixture()
  assert.ok(f.patch.generationDraft.model)
  const embedding = {
    resource: {
      ...f.patch.generationDraft.model,
      fileSha256: '6'.repeat(64),
      kind: 'embedding' as const,
      predictionType: null,
    },
    token: '<unused>',
  }
  f.patch.generationDraft.positivePrompt.embeddingRefs.push(embedding)
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'ready')
  withDrafts(f, (baseline, current) => {
    baseline.positivePrompt.text = '<unused>'
    current.positivePrompt.text = '<unused>'
  })
  assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, f.source).changedInputs, [
    'generation-draft',
  ])
})

test('effective missing defaults match explicit defaults without mutating legacy inputs', () => {
  const f = fixture()
  const state = withDrafts(f, (baseline, current) => {
    delete baseline.cfgRescale
    delete baseline.vaePrecision
    delete baseline.dynamicPrompt
    current.cfgRescale = 0
    current.vaePrecision = 'Auto'
    current.dynamicPrompt = { maxPrompts: 100, seedBehavior: 'per-iteration' }
  })
  assert.equal(state.status, 'ready')
  assert.equal('cfgRescale' in f.provenance.layerSourceContext.generationDraft, false)
  assert.equal('maskSettings' in f.patch, false)
  assert.equal('coherenceSettings' in f.patch, false)
})

test('Anima ignores dormant SD sampler settings but detects native method and unsupported advanced edits', () => {
  const f = fixture('anima')
  f.patch.generationDraft.sampling.sampler = 'DPM++ 2M'
  f.patch.generationDraft.sampling.scheduler = 'Karras'
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'ready')
  f.patch.generationDraft.sampling.animaMethod = 'heun'
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'outdated')
  f.patch.generationDraft.sampling.animaMethod = 'euler'
  f.patch.generationDraft.clipSkip = 2
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'outdated')
})

test('transparent-source txt2img ignores the dormant denoising strength', () => {
  const f = fixture()
  // A literal standalone txt2img metadata control; no actual mode inference is claimed here.
  const provenance = f.provenance as Extract<
    IgsSmartPatchGenerationProvenanceV1,
    { kind: 'illustrious-smart-patch' }
  >
  const { denoisingStrength: _strength, ...sampling } = provenance.generationConfiguration
    .sampling as { denoisingStrength?: number } & typeof provenance.generationConfiguration.sampling
  provenance.generationConfiguration = {
    ...provenance.generationConfiguration,
    mode: 'txt2img',
    sampling,
  }
  provenance.layerSourceContext.preparedInputs.modelSource = null
  f.patch.generationDraft.sampling.denoisingStrength = 0.9
  assert.equal(assessSmartPatchVariantState(provenance, f.document, f.source).status, 'ready')
})

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} stored freshness follows an explicit copied owner without rewriting lineage`, () => {
    const f = fixture(family)
    const provenanceBefore = structuredClone(f.provenance)
    f.document.documentId = randomUUID()
    f.patch.id = randomUUID()
    f.patch.mask.id = randomUUID()
    if (f.patch.mask.asset !== null) {
      f.patch.mask.asset.path = `assets/masks/${f.patch.mask.id}/${f.patch.mask.asset.sha256}.png`
    }
    const documentBefore = structuredClone(f.document)
    assert.deepEqual(
      assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source),
      { changedInputs: [], sourceVerified: true, status: 'ready' },
    )
    assert.equal(
      assessSmartPatchVariantState(f.provenance, f.document, f.source).status,
      'orphaned',
    )
    assert.deepEqual(f.provenance, provenanceBefore)
    assert.deepEqual(f.document, documentBefore)
  })
}

test('stored freshness remains inspectable while its owner is hidden or locked', () => {
  const f = fixture()
  f.patch.locked = true
  f.patch.visible = false
  assert.deepEqual(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source),
    { changedInputs: [], sourceVerified: true, status: 'ready' },
  )
  f.patch.generationDraft.positivePrompt.text = 'new owned input'
  assert.deepEqual(assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id), {
    changedInputs: ['generation-draft'],
    sourceVerified: false,
    status: 'outdated',
  })
  assert.equal(assessSmartPatchVariantState(f.provenance, f.document, f.source).status, 'blocked')
})

test('stored matching authoring is unverified until actual current source is supplied', () => {
  const f = fixture()
  assert.deepEqual(assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id), {
    changedInputs: [],
    sourceVerified: false,
    status: 'unverified',
  })
  assert.deepEqual(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, {
      ...f.source,
      sha256: '8'.repeat(64),
    }),
    { changedInputs: ['source-composite'], sourceVerified: true, status: 'outdated' },
  )
  assert.equal(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source).status,
    'ready',
  )
})

test('stored freshness ignores unrelated document revisions, presentation and Fit-only padding', () => {
  const f = fixture()
  f.document.documentRevision = randomUUID()
  f.document.title = 'Another Project title'
  f.document.generationDraft.positivePrompt.text = 'normal Canvas authoring'
  f.document.primaryBbox.x += 100
  f.document.lastActualSeedSnapshot = 12
  f.patch.name = 'Renamed current owner'
  f.patch.opacity = 0.25
  f.patch.blendMode = 'screen'
  f.patch.maskSettings = { blur: 16, padding: 400 }
  assert.deepEqual(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source),
    { changedInputs: [], sourceVerified: true, status: 'ready' },
  )
})

test('restored exact mask bytes and geometry do not stale stored output when edit revision changes', () => {
  const f = fixture()
  const before = structuredClone(f.provenance)
  f.patch.mask.revision += 2
  assert.deepEqual(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source),
    { changedInputs: [], sourceVerified: true, status: 'ready' },
  )
  assert.deepEqual(assessSmartPatchVariantState(f.provenance, f.document, f.source).changedInputs, [
    'mask',
  ])
  assert.deepEqual(f.provenance, before)
})

for (const row of ownedChanges.filter(({ name }) => name !== 'mask revision')) {
  test(`stored changed ${row.name} is outdated even before source verification`, () => {
    const f = fixture()
    const before = structuredClone(f.provenance)
    row.change(f.patch)
    assert.deepEqual(assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id), {
      changedInputs: [row.axis],
      sourceVerified: false,
      status: 'outdated',
    })
    assert.deepEqual(f.provenance, before)
  })
}

test('stored changed mask content and dimensions are detected independently of revision', () => {
  const f = fixture()
  assert.ok(f.patch.mask.asset)
  f.patch.mask.asset.sha256 = '4'.repeat(64)
  f.patch.mask.asset.path = `assets/masks/${f.patch.mask.id}/${f.patch.mask.asset.sha256}.png`
  assert.deepEqual(assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id), {
    changedInputs: ['mask'],
    sourceVerified: false,
    status: 'outdated',
  })
  f.patch.mask = structuredClone(f.provenance.layerSourceContext.mask)
  assert.ok(f.patch.mask.asset)
  f.patch.mask.asset.width += 1
  f.patch.mask.bounds.width += 1
  assert.deepEqual(assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id), {
    changedInputs: ['mask'],
    sourceVerified: false,
    status: 'outdated',
  })
})

test('stored inspection refuses absent owners and invalid or incorrectly sized source identities', () => {
  const f = fixture()
  assert.throws(() => assessStoredSmartPatchVariantState(f.provenance, f.document, randomUUID()))
  for (const source of [
    { ...f.source, height: f.source.height + 1 },
    { ...f.source, width: 0 },
    { ...f.source, byteSize: 0 },
    { ...f.source, sha256: 'invalid-source' },
    { ...f.source, path: '/not-a-portable-identity.png' },
  ]) {
    assert.throws(() =>
      assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, source),
    )
  }
  f.patch.boundingBox.width += 1
  assert.throws(() =>
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source),
  )
  assert.deepEqual(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, {
      ...f.source,
      width: f.patch.boundingBox.width,
    }),
    { changedInputs: ['bbox', 'source-composite'], sourceVerified: true, status: 'outdated' },
  )
})

test('stored draft freshness retains dormant-input and exact resource relinking semantics', () => {
  const f = fixture('anima')
  assert.ok(f.patch.generationDraft.model)
  Object.assign(f.patch.generationDraft.model, {
    displayName: 'Relinked display name',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
  })
  f.patch.generationDraft.loras.push(lora(f.patch.generationDraft, '6', false))
  f.patch.generationDraft.sampling.sampler = 'DPM++ 2M'
  f.patch.generationDraft.sampling.scheduler = 'Karras'
  assert.equal(
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source).status,
    'ready',
  )
  f.patch.generationDraft.sampling.animaMethod = 'heun'
  assert.deepEqual(assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id), {
    changedInputs: ['generation-draft'],
    sourceVerified: false,
    status: 'outdated',
  })
})

test('bulk stored inspection assesses each owned variant in order against the same current owner', () => {
  const f = fixture()
  const matching = smartPatchVariantMetadataFixture('illustrious')
  matching.generationProvenance = structuredClone(f.provenance)
  const otherFamily = smartPatchVariantMetadataFixture('anima')
  f.patch.rasterSubLayers = [matching, otherFamily]
  f.patch.activeRasterSubLayerId = otherFamily.id
  const before = structuredClone(f.document)
  assert.deepEqual(assessStoredSmartPatchVariants(f.document, f.patch.id, f.source), [
    { changedInputs: [], id: matching.id, sourceVerified: true, status: 'ready' },
    {
      changedInputs: ['generation-draft'],
      id: otherFamily.id,
      sourceVerified: true,
      status: 'outdated',
    },
  ])
  assert.deepEqual(assessStoredSmartPatchVariants(f.document, f.patch.id), [
    { changedInputs: [], id: matching.id, sourceVerified: false, status: 'unverified' },
    {
      changedInputs: ['generation-draft'],
      id: otherFamily.id,
      sourceVerified: false,
      status: 'outdated',
    },
  ])
  assert.deepEqual(f.document, before)
})

test('bulk stored inspection preserves empty owners and rejects invalid members or source inputs', () => {
  const f = fixture()
  assert.deepEqual(assessStoredSmartPatchVariants(f.document, f.patch.id, f.source), [])
  assert.throws(() => assessStoredSmartPatchVariants(f.document, randomUUID()))
  assert.throws(() =>
    assessStoredSmartPatchVariants(f.document, f.patch.id, { ...f.source, width: 0 }),
  )
  const invalid = smartPatchVariantMetadataFixture('illustrious')
  invalid.asset.sha256 = 'changed-image-identity'
  f.patch.rasterSubLayers = [invalid]
  f.patch.activeRasterSubLayerId = invalid.id
  assert.throws(() => assessStoredSmartPatchVariants(f.document, f.patch.id, f.source))
})

test('validated-owner projection shares strict stored semantics without requiring a full document', () => {
  const f = fixture('anima')
  const provenanceBefore = structuredClone(f.provenance)
  f.patch.id = randomUUID()
  f.patch.locked = true
  f.patch.visible = false
  const before = structuredClone(f.patch)
  assert.deepEqual(
    assessStoredSmartPatchVariantForLayer(f.provenance, f.patch, f.source),
    assessStoredSmartPatchVariantState(f.provenance, f.document, f.patch.id, f.source),
  )
  f.patch.coherenceSettings = { edgeSize: 18, minimumDenoise: 0, mode: 'Gaussian Blur' }
  assert.deepEqual(assessStoredSmartPatchVariantForLayer(f.provenance, f.patch), {
    changedInputs: ['coherence'],
    sourceVerified: false,
    status: 'outdated',
  })
  const invalid = structuredClone(f.provenance)
  invalid.layerSourceContext.sourceTarget.sha256 = 'invalid-provenance'
  assert.throws(() => assessStoredSmartPatchVariantForLayer(invalid, before, f.source))
  assert.throws(() =>
    assessStoredSmartPatchVariantForLayer(f.provenance, before, { ...f.source, height: 0 }),
  )
  assert.deepEqual(f.provenance, provenanceBefore)
})
