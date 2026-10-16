import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsSmartPatchLayerV1,
  type IgsSmartPatchVariantV1,
  projectAssetReferences,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { test } from 'node:test'
import { crc32 } from 'node:zlib'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

import { readIgsPackage, saveIgsPackage, verifySmartPatchVariantPng } from './igs-package.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const WEBP = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * Literal image fixtures only. The actual package writer/loader and immutable-output verifier
 * remain real.
 */
function input(family: 'anima' | 'illustrious') {
  const document = createEmptyProjectDocumentV1({ title: 'Owned variants, explicit Save' })
  const variants = [
    smartPatchVariantMetadataFixture(family),
    smartPatchVariantMetadataFixture(family),
  ]
  const id = randomUUID()
  const images = variants.map((variant, index) => {
    const alpha = Uint8Array.from(
      { length: 35 },
      (_, offset) => [0, 64, 128, 255][(offset + index) % 4],
    )
    const bytes = literalSmartPatchColorPng(
      7,
      5,
      Array.from(alpha, (value) => [index * 64 + 32, 96, 128, value]).flat(),
      4,
    )
    setVariantImage(variant, bytes)
    variant.generationProvenance.executionResultContext.output.contributionAlpha8.sha256 =
      digest(alpha)
    variant.generationProvenance.layerSourceContext.layerId = id
    variant.generationProvenance.layerSourceContext.sourceDocumentId = document.documentId
    return bytes
  })
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: variants[1].id,
    blendMode: 'normal',
    boundingBox: { height: 256, width: 384, x: 100, y: 200 },
    generationDraft: structuredClone(document.generationDraft),
    id,
    internalResolution: { height: 512, width: 768 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 9 },
    name: 'Both variants retained',
    opacity: 1,
    rasterSubLayers: variants,
    visible: true,
  }
  document.layers = [patch]
  return {
    assets: Object.fromEntries(
      variants.map((variant, index) => [variant.asset.path, { bytes: images[index] }]),
    ),
    images,
    patch,
    preview: {
      merged: images[1],
      rect: { ...variants[1].bbox },
      status: 'rendered' as const,
      thumbnail: WEBP,
    },
    project: document,
  }
}

function setVariantImage(variant: IgsSmartPatchVariantV1, bytes: Buffer): void {
  variant.asset.bytes = bytes.length
  variant.asset.sha256 = digest(bytes)
  variant.generationProvenance.executionResultContext.output.byteSize = bytes.length
  variant.generationProvenance.executionResultContext.output.sha256 = digest(bytes)
}

async function inDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-patch-variants-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function entries(filePath: string): Promise<[string, Buffer][]> {
  const archive = await yauzl.openPromise(filePath, { autoClose: false, lazyEntries: true })
  try {
    const members: [string, Buffer][] = []
    for await (const entry of archive.eachEntry()) {
      const parts: Buffer[] = []
      for await (const part of await archive.openReadStreamPromise(entry)) {
        parts.push(Buffer.from(part))
      }
      members.push([entry.fileName, Buffer.concat(parts)])
    }
    return members
  } finally {
    archive.close()
  }
}

async function writeZip(filePath: string, members: [string, Buffer][]): Promise<void> {
  const zip = new yazl.ZipFile()
  for (const [name, bytes] of members) {
    zip.addBuffer(bytes, name, { compress: false })
  }
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(filePath))
}

function withoutChunk(bytes: Buffer, type: string): Buffer {
  const parts = [bytes.subarray(0, 8)]
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const next = offset + 12 + bytes.readUInt32BE(offset)
    if (bytes.toString('ascii', offset + 4, offset + 8) !== type) {
      parts.push(bytes.subarray(offset, next))
    }
    offset = next
  }
  return Buffer.concat(parts)
}

function withSplitIdat(bytes: Buffer, count: number): Buffer {
  const chunks = [bytes.subarray(0, 8)]
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const next = offset + 12 + length
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      const payload = bytes.subarray(offset + 8, offset + 8 + length)
      for (let index = 0; index < count; index++) {
        const part = payload.subarray(
          Math.floor((index * length) / count),
          Math.floor(((index + 1) * length) / count),
        )
        const type = Buffer.from('IDAT')
        const chunk = Buffer.alloc(12 + part.length)
        chunk.writeUInt32BE(part.length)
        type.copy(chunk, 4)
        part.copy(chunk, 8)
        chunk.writeUInt32BE(crc32(Buffer.concat([type, part])), part.length + 8)
        chunks.push(chunk)
      }
    } else {
      chunks.push(bytes.subarray(offset, next))
    }
    offset = next
  }
  return Buffer.concat(chunks)
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} real .igs Save/copy/reopen retains inactive images and frozen placement after authored Patch edits`, async () => {
    await inDirectory(async (directory) => {
      const target = path.join(directory, 'project.igs')
      const source = input(family)
      const frozen = structuredClone(source.patch.rasterSubLayers)
      await saveIgsPackage(target, source)
      const opened = await readIgsPackage(target)
      assert.deepEqual(opened.project, source.project)
      assert.deepEqual(opened.manifest.preview, { rect: source.preview.rect, status: 'rendered' })
      assert.equal(
        opened.manifest.members.filter(({ path }) => path.startsWith('assets/layers/')).length,
        2,
      )
      for (const [index, variant] of frozen.entries()) {
        assert.equal(
          (await opened.readMember(variant.asset.path)).equals(source.images[index]),
          true,
          'Every active and inactive image must survive portable Save',
        )
      }
      const copy = path.join(directory, 'portable.igs')
      await copyFile(target, copy)
      source.patch.boundingBox = { height: 512, width: 768, x: -500, y: 400 }
      source.patch.maskSettings = { blur: 0, padding: 50 }
      source.patch.activeRasterSubLayerId = frozen[0].id
      source.project.documentRevision = randomUUID()
      await saveIgsPackage(target, source)
      const reopened = await readIgsPackage(target)
      assert.deepEqual(reopened.project, source.project)
      assert.deepEqual((reopened.project.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers, frozen)
      assert.equal(
        (await readIgsPackage(copy)).project.documentRevision,
        opened.project.documentRevision,
      )
      assert.equal(projectAssetReferences(reopened.project).length, 2)
    })
  })

  test(`${family} real Save refuses an omitted inactive image and leaves previous portable bytes untouched`, async () => {
    await inDirectory(async (directory) => {
      const target = path.join(directory, 'project.igs')
      const source = input(family)
      await saveIgsPackage(target, source)
      const before = await readFile(target)
      const assets = { ...source.assets }
      delete assets[source.patch.rasterSubLayers[0].asset.path]
      await assert.rejects(saveIgsPackage(target, { ...source, assets }), {
        code: 'MEMBER_MISMATCH',
      })
      assert.equal(
        (await readFile(target)).equals(before),
        true,
        'Failed Save must preserve the committed archive',
      )
      assert.deepEqual((await readIgsPackage(target)).project, source.project)
      assert.deepEqual(await readdir(directory), ['project.igs'])
    })
  })

  test(`${family} real Save rejects truthfully rehashed inactive RGBA with false immutable alpha and keeps committed archive`, async () => {
    await inDirectory(async (directory) => {
      const target = path.join(directory, 'project.igs')
      const source = input(family)
      await saveIgsPackage(target, source)
      const before = await readFile(target)
      const inactive = source.patch.rasterSubLayers[0]
      const changed = literalSmartPatchColorPng(
        7,
        5,
        Array.from({ length: 35 }, () => [32, 96, 128, 255]).flat(),
        4,
      )
      setVariantImage(inactive, changed)
      source.assets[inactive.asset.path] = { bytes: changed }
      await assert.rejects(saveIgsPackage(target, source), { code: 'MEMBER_MISMATCH' })
      assert.equal(
        (await readFile(target)).equals(before),
        true,
        'False contribution alpha must not replace a valid archive',
      )
      assert.deepEqual(await readdir(directory), ['project.igs'])
    })
  })

  test(`${family} actual loader rejects forged alpha provenance even when project and ZIP member hashes are internally consistent`, async () => {
    await inDirectory(async (directory) => {
      const target = path.join(directory, 'project.igs')
      const forged = path.join(directory, 'forged.igs')
      const source = input(family)
      await saveIgsPackage(target, source)
      const members = await entries(target)
      const rawProject = JSON.parse(
        members.find(([name]) => name === 'project.json')![1].toString('utf8'),
      ) as IgsProjectDocumentV1
      const patch = rawProject.layers[0] as IgsSmartPatchLayerV1
      patch.rasterSubLayers[0].generationProvenance.executionResultContext.output.contributionAlpha8.sha256 =
        '0'.repeat(64)
      const json = Buffer.from(JSON.stringify(rawProject))
      const manifest = JSON.parse(
        members.find(([name]) => name === 'manifest.json')![1].toString('utf8'),
      ) as { members: { bytes: number; path: string; sha256: string }[] }
      const projectMember = manifest.members.find(({ path }) => path === 'project.json')!
      projectMember.bytes = json.length
      projectMember.sha256 = digest(json)
      await writeZip(
        forged,
        members.map(([name, bytes]) => [
          name,
          name === 'project.json'
            ? json
            : name === 'manifest.json'
              ? Buffer.from(JSON.stringify(manifest))
              : bytes,
        ]),
      )
      await assert.rejects(readIgsPackage(forged), { code: 'MEMBER_MISMATCH' })
      assert.deepEqual((await readIgsPackage(target)).project, source.project)
    })
  })
}

test('portable variant verifier requires actual canonical ICC and RGBA', async () => {
  const source = input('illustrious')
  const variant = source.patch.rasterSubLayers[0]
  await verifySmartPatchVariantPng(variant, source.images[0])
  const missingIcc = withoutChunk(source.images[0], 'iCCP')
  setVariantImage(variant, missingIcc)
  await assert.rejects(verifySmartPatchVariantPng(variant, missingIcc), { code: 'INVALID_IMAGE' })
  const rgb = literalSmartPatchColorPng(
    7,
    5,
    Array.from({ length: 35 }, () => [32, 96, 128]).flat(),
    3,
  )
  setVariantImage(variant, rgb)
  await assert.rejects(verifySmartPatchVariantPng(variant, rgb), { code: 'INVALID_IMAGE' })
})

test('portable variant verifier accepts 256 IDAT chunks and refuses the 257th before bounded alpha decoding', async () => {
  const source = input('illustrious')
  const variant = source.patch.rasterSubLayers[0]
  const allowed = withSplitIdat(source.images[0], 256)
  setVariantImage(variant, allowed)
  await verifySmartPatchVariantPng(variant, allowed)
  const refused = withSplitIdat(source.images[0], 257)
  setVariantImage(variant, refused)
  await assert.rejects(verifySmartPatchVariantPng(variant, refused), { code: 'INVALID_IMAGE' })
})

test('portable variant verifier refuses hash and dimension mismatches independently of immutable alpha', async () => {
  const source = input('illustrious')
  const variant = source.patch.rasterSubLayers[0]
  const wrongHash = Buffer.from(source.images[0])
  wrongHash[wrongHash.length - 1] ^= 1
  await assert.rejects(verifySmartPatchVariantPng(variant, wrongHash), { code: 'MEMBER_MISMATCH' })
  const wrongSize = literalSmartPatchColorPng(
    5,
    7,
    Array.from({ length: 35 }, () => [32, 96, 128, 255]).flat(),
    4,
  )
  setVariantImage(variant, wrongSize)
  await assert.rejects(verifySmartPatchVariantPng(variant, wrongSize), { code: 'INVALID_IMAGE' })
})
