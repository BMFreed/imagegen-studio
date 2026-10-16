import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsSmartPatchLayerV1,
  type IgsSmartPatchVariantV1,
  projectRasterLayers,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { readIgsPackage } from './igs-package.js'
import { buildProjectPreview } from './project-preview.js'
import { compositionRasterLayers, withFrozenRasterComposition } from './project-raster-snapshot.js'
import { ProjectSession } from './project-session.js'
import { fixtureMaskPng, paintedPatchFixture } from './test-fixtures/project-mask.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'
import { createSourceOutputWorkerOwner } from './test-fixtures/source-output-worker.js'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const PYTHON = path.join(ROOT, 'worker-python/.venv/bin/python')
const execFileAsync = promisify(execFile)
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const BBOX = { height: 5, width: 7, x: -19, y: 31 }

/** Input literals and PNG encoding only; expected composed pixels are declared by each test. */
function variant(
  document: IgsProjectDocumentV1,
  parent: IgsSmartPatchLayerV1,
  rgba: readonly number[],
  bbox = BBOX,
): { bytes: Buffer; value: IgsSmartPatchVariantV1 } {
  const value = smartPatchVariantMetadataFixture('illustrious')
  const bytes = literalSmartPatchColorPng(7, 5, rgba, 4)
  value.bbox = { ...bbox }
  value.asset.bytes = bytes.length
  value.asset.sha256 = digest(bytes)
  const provenance = value.generationProvenance
  provenance.layerSourceContext.bbox = { ...bbox }
  provenance.layerSourceContext.layerId = parent.id
  provenance.layerSourceContext.sourceDocumentId = document.documentId
  provenance.executionResultContext.output.byteSize = bytes.length
  provenance.executionResultContext.output.sha256 = digest(bytes)
  provenance.executionResultContext.output.contributionAlpha8.sha256 = digest(
    Uint8Array.from(rgba.filter((_, index) => index % 4 === 3)),
  )
  return { bytes, value }
}

function solid(r: number, g: number, b: number, alpha = 255): number[] {
  return Array.from({ length: 35 }, () => [r, g, b, alpha]).flat()
}

function patchFixture(document: IgsProjectDocumentV1) {
  const mask = fixtureMaskPng()
  const patch = paintedPatchFixture(document, mask)
  const pixels = solid(30, 90, 150)
  pixels[3] = 64
  const active = variant(document, patch, pixels)
  const inactive = variant(document, patch, solid(240, 10, 20), {
    ...BBOX,
    x: 900,
    y: -800,
  })
  patch.rasterSubLayers = [active.value, inactive.value]
  patch.activeRasterSubLayerId = active.value.id
  const assets = new Map([
    [active.value.asset.path, active.bytes],
    [inactive.value.asset.path, inactive.bytes],
    [patch.mask.asset!.path, mask],
  ])
  return { active, assets, inactive, patch, pixels }
}

function raster(bytes: Buffer, name: string): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: 5,
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: 7,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: BBOX.x, y: BBOX.y },
    visible: true,
  }
}

/** Pillow only decodes already-produced PNG bytes; it does not produce expected output. */
async function rgba(bytes: Buffer): Promise<Buffer> {
  const { stderr, stdout } = await execFileAsync(
    PYTHON,
    [
      '-I',
      '-c',
      'import base64,io,sys; from PIL import Image; image=Image.open(io.BytesIO(base64.b64decode(sys.argv[1]))); image.load(); print(base64.b64encode(image.convert("RGBA").tobytes()).decode())',
      bytes.toString('base64'),
    ],
    { maxBuffer: 16_384, timeout: 5000 },
  )
  assert.equal(stderr, '')
  return Buffer.from(stdout.trim(), 'base64')
}

async function withCpu(
  run: (f: {
    root: string
    scratch: string
    worker: Awaited<ReturnType<typeof createSourceOutputWorkerOwner>>['clients'][number]
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-variant-composition-'))
  const scratch = path.join(root, 'scratch')
  await mkdir(scratch)
  const owner = await createSourceOutputWorkerOwner({ root, scratch })
  try {
    const worker = await owner.start(new AbortController().signal)
    await run({ root, scratch, worker })
  } finally {
    await owner.cleanup()
    await rm(root, { force: true, recursive: true })
  }
}

// Boundary: Main composition projection. Invariant: active frozen contributions occupy the
// owner's stack position, unaffected by editable Patch geometry. Controls: visibility/opacity and
// top-level Raster helper semantics. Mutations: flatten every variant or use the editable bbox.
test('Main composition keeps one frozen variant at the Patch stack position and preserves Raster-owner semantics', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Active composition' })
  const f = patchFixture(document)
  const above = raster(literalSmartPatchColorPng(7, 5, solid(200, 0, 0), 4), 'Above')
  const below = raster(literalSmartPatchColorPng(7, 5, solid(0, 200, 0), 4), 'Below')
  f.patch.opacity = 0.4
  f.patch.blendMode = 'multiply'
  f.patch.locked = true
  document.layers = [above, f.patch, below]
  assert.deepEqual(
    projectRasterLayers(document).map((layer) => layer.id),
    [above.id, below.id],
  )
  const contributions = compositionRasterLayers(document)
  assert.deepEqual(
    contributions.map((layer) => layer.id),
    [above.id, f.patch.id, below.id],
  )
  const active = contributions[1]
  assert.deepEqual(active.asset, f.active.value.asset)
  assert.deepEqual(active.transform, {
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    x: BBOX.x,
    y: BBOX.y,
  })
  assert.equal(active.opacity, 0.4)
  assert.equal(active.blendMode, 'multiply')
  assert.equal(active.locked, true)
  const before = structuredClone(active)
  f.patch.boundingBox = { height: 512, width: 1024, x: 8000, y: -6000 }
  f.patch.internalResolution = { height: 256, width: 512 }
  f.patch.mask = { asset: null, id: f.patch.mask.id, revision: f.patch.mask.revision + 1 }
  f.patch.maskSettings = { blur: 128, padding: 64 }
  f.patch.generationDraft.positivePrompt.text = 'edited after accepting pixels'
  assert.deepEqual(compositionRasterLayers(document)[1], before)
  assert.deepEqual(
    compositionRasterLayers(document, { beneathLayerId: f.patch.id }).map((layer) => layer.id),
    [below.id],
  )
  f.patch.visible = false
  assert.deepEqual(
    compositionRasterLayers(document).map((layer) => layer.id),
    [above.id, below.id],
  )
  f.patch.visible = true
  f.patch.opacity = 0
  assert.deepEqual(
    compositionRasterLayers(document).map((layer) => layer.id),
    [above.id, below.id],
  )
  assert.throws(() => compositionRasterLayers(document, { beneathLayerId: randomUUID() }))
})

// Boundary: actual Main snapshot -> JSONL CPU compose-target -> independent PNG readback.
// Invariant: regeneration includes the lower Patch's active contribution but neither this target
// nor any higher layer. Control: full stack remains opaque red. Mutation: ignore beneathLayerId.
test('actual CPU source includes only active lower Patch pixels and excludes the target and higher stack', async () => {
  await withCpu(async ({ root, scratch, worker }) => {
    const document = createEmptyProjectDocumentV1({ title: 'Below Patch source' })
    const target = patchFixture(document)
    const lower = patchFixture(document)
    lower.patch.opacity = 0.5
    const blueBytes = literalSmartPatchColorPng(7, 5, solid(0, 0, 255), 4)
    const blue = raster(blueBytes, 'Lower blue')
    const redBytes = literalSmartPatchColorPng(7, 5, solid(255, 0, 0), 4)
    const red = raster(redBytes, 'Higher red')
    document.layers = [red, target.patch, lower.patch, blue]
    const assets = new Map([
      ...target.assets,
      ...lower.assets,
      [blue.asset.path, blueBytes],
      [red.asset.path, redBytes],
    ])
    const capture = async (beneathLayerId?: string) =>
      withFrozenRasterComposition(
        {
          document,
          packagePath: path.join(root, 'unused-pending-only.igs'),
          pendingSource: (asset) => ({ bytes: assets.get(asset.path)! }),
          ...(beneathLayerId ? { scope: { beneathLayerId } } : {}),
          scratchBasePath: scratch,
          stagePrefix: 'test-source-',
        },
        async ({ layers, stagingRoot }) => {
          const result = await worker.composeTarget({
            bbox: BBOX,
            layers,
            stagingRoot,
            targetPngPath: path.join(stagingRoot, 'target.png'),
          })
          assert.equal(result.mode, 'img2img')
          return rgba(await readFile(result.composite.path))
        },
      )
    const expected = solid(15, 45, 203)
    expected.splice(0, 4, 4, 11, 242, 255)
    assert.equal((await capture(target.patch.id)).equals(Buffer.from(expected)), true)
    assert.equal((await capture()).equals(Buffer.from(solid(255, 0, 0))), true)
    assert.deepEqual(await readdir(scratch), [])
  })
})

// Boundary: actual CPU preview -> ProjectSession Save -> real ZIP loader -> saved-member snapshot.
// Invariant: Smart-only previews/bounds use frozen active pixels; all inactive assets survive Save.
// Controls: moved editable bbox/mask and changing which stored variant is active. Mutations: empty
// Raster-only detection, Patch bbox bounds, loss of inactive asset ownership.
test('Smart-only preview and Save preserve frozen world bounds and every stored variant across reopen', async () => {
  await withCpu(async ({ root, scratch, worker }) => {
    const roots = {
      placeholdersDir: path.join(ROOT, 'src/main/projects/placeholders'),
      scratchDir: scratch,
    }
    let session = await ProjectSession.create(path.join(root, 'variants.igs'), 'Variants', roots)
    const f = patchFixture(session.document)
    session.applyDocument({ ...session.document, layers: [f.patch] })
    const build = (pending = true) =>
      buildProjectPreview({
        document: session.document,
        packagePath: session.filePath,
        pendingSource: (asset) => (pending ? { bytes: f.assets.get(asset.path)! } : null),
        scratchBasePath: scratch,
        worker,
      })
    const preview = await build()
    assert.equal(preview.kind, 'rendered')
    if (preview.kind !== 'rendered') {
      assert.fail('A visible active Patch must produce a preview.')
    }
    assert.deepEqual(preview.preview.rect, BBOX)
    // Pillow's existing BICUBIC RGBA affine path quantizes this alpha64 pixel through
    // premultiplication: (30,90,150,64) becomes (31,91,151,64), even at identity scale.
    // An ordinary Raster with the same bytes must produce this same known full RGBA output.
    const expectedPixels = Buffer.from(f.pixels)
    expectedPixels.set([31, 91, 151, 64], 0)
    const sameRaster = raster(f.active.bytes, 'Identical ordinary Raster control')
    const ordinary = await buildProjectPreview({
      document: { ...session.document, layers: [sameRaster] },
      packagePath: session.filePath,
      pendingSource: () => ({ bytes: f.active.bytes }),
      scratchBasePath: scratch,
      worker,
    })
    if (ordinary.kind !== 'rendered') {
      assert.fail('The identical ordinary Raster control must render.')
    }
    const ordinaryPixels = await rgba(ordinary.preview.merged)
    assert.equal(ordinaryPixels.equals(expectedPixels), true, 'Ordinary Raster numeric control')
    const previewPixels = await rgba(preview.preview.merged)
    assert.equal(previewPixels.equals(ordinaryPixels), true, 'Patch/Raster full RGBA equivalence')
    assert.equal(
      previewPixels.equals(expectedPixels),
      true,
      `Frozen Patch numeric preview; first pixel ${JSON.stringify([...previewPixels.subarray(0, 4)])}`,
    )
    await session.save({
      assets: Object.fromEntries([...f.assets].map(([key, bytes]) => [key, { bytes }])),
      renderedPreview: preview.preview,
    })
    const saved = await readIgsPackage(session.filePath)
    assert.equal(saved.manifest.preview.status, 'rendered')
    assert.deepEqual(saved.manifest.preview.rect, BBOX)
    assert.equal(
      (await saved.readMember(f.inactive.value.asset.path)).equals(f.inactive.bytes),
      true,
    )

    const changed = structuredClone(session.document)
    const patch = changed.layers[0]
    assert.equal(patch.kind, 'smart-patch')
    if (patch.kind !== 'smart-patch') {
      assert.fail('The saved owner must remain a Smart Patch.')
    }
    patch.boundingBox = { height: 512, width: 1024, x: 8000, y: -6000 }
    patch.mask = { asset: null, id: patch.mask.id, revision: patch.mask.revision + 1 }
    patch.maskSettings = { blur: 128, padding: 64 }
    session.applyDocument(changed)
    await session.save()
    const fallback = await readIgsPackage(session.filePath)
    assert.equal(fallback.manifest.preview.status, 'unavailable')
    assert.deepEqual(fallback.manifest.preview.rect, BBOX)
    assert.equal(
      (await fallback.readMember(f.active.value.asset.path)).equals(f.active.bytes),
      true,
    )
    assert.equal(
      (await fallback.readMember(f.inactive.value.asset.path)).equals(f.inactive.bytes),
      true,
    )
    session = await ProjectSession.open(session.filePath, roots)
    const reopened = await build(false)
    assert.equal(reopened.kind, 'rendered')
    if (reopened.kind !== 'rendered') {
      assert.fail('Saved active pixels must remain previewable after editable geometry changes.')
    }
    assert.deepEqual(reopened.preview.rect, BBOX)
    assert.equal((await rgba(reopened.preview.merged)).equals(expectedPixels), true)

    const selected = structuredClone(session.document)
    const selectedPatch = selected.layers[0]
    if (selectedPatch.kind !== 'smart-patch') {
      assert.fail('The variant selector must still target a Smart Patch.')
    }
    selectedPatch.activeRasterSubLayerId = f.inactive.value.id
    session.applyDocument(selected)
    const neighbor = await build(false)
    assert.equal(neighbor.kind, 'rendered')
    if (neighbor.kind !== 'rendered') {
      assert.fail('The stored inactive neighbor must be selectable for composition.')
    }
    assert.deepEqual(neighbor.preview.rect, f.inactive.value.bbox)
    assert.equal(
      (await rgba(neighbor.preview.merged)).equals(Buffer.from(solid(240, 10, 20))),
      true,
    )
    assert.deepEqual(await readdir(scratch), [])
  })
})
