import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { test } from 'node:test'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { projectAcceptedResults } from './project-accepted-results.js'
import { animaFixturePng } from './test-fixtures/anima-batch.js'
import { acceptedOutpaintProvenanceFixture } from './test-fixtures/outpaint-provenance.js'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function fixture(family: 'anima' | 'illustrious') {
  const project = createEmptyProjectDocumentV1({
    primaryBbox: { height: 64, width: 64, x: -7, y: 12 },
    title: 'Outpaint package',
  })
  const source = await animaFixturePng(128)
  const image = await animaFixturePng(255)
  const provenance = acceptedOutpaintProvenanceFixture(
    family,
    project,
    source,
    image,
    project.primaryBbox,
  )
  const id = randomUUID()
  const assetPath = `assets/layers/${id}.png`
  project.layers = [
    {
      asset: { bytes: image.length, height: 64, path: assetPath, sha256: sha(image), width: 64 },
      blendMode: 'normal',
      generationProvenance: provenance,
      id,
      kind: 'raster',
      locked: false,
      name: 'Contribution',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 12 },
      visible: true,
    },
  ]
  const preview = {
    merged: image,
    rect: project.primaryBbox,
    status: 'rendered' as const,
    thumbnail: await readFile(path.resolve('src/main/projects/placeholders/empty.webp')),
  }
  return { assetPath, image, preview, project, provenance }
}

/** Forge coherent ZIP/member hashes so the test reaches actual alpha identity validation. */
async function rewriteArchive(
  filePath: string,
  outputPath: string,
  assetPath: string,
  image: Buffer,
) {
  const archive = await yauzl.openPromise(filePath, { autoClose: false, lazyEntries: true })
  const members = new Map<string, Buffer>()
  try {
    for await (const entry of archive.eachEntry()) {
      const chunks: Buffer[] = []
      for await (const chunk of await archive.openReadStreamPromise(entry)) {
        chunks.push(Buffer.from(chunk))
      }
      members.set(entry.fileName, Buffer.concat(chunks))
    }
  } finally {
    archive.close()
  }
  const document = JSON.parse(members.get('project.json')!.toString())
  const layer = document.layers[0]
  members.set(assetPath, image)
  layer.asset.bytes = image.length
  layer.asset.sha256 = sha(image)
  layer.generationProvenance.executionResultContext.output.byteSize = image.length
  layer.generationProvenance.executionResultContext.output.sha256 = sha(image)
  members.set('project.json', Buffer.from(JSON.stringify(document)))
  const manifest = JSON.parse(members.get('manifest.json')!.toString())
  for (const member of manifest.members) {
    const bytes = members.get(member.path)!
    member.bytes = bytes.length
    member.sha256 = sha(bytes)
  }
  members.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  const output = new yazl.ZipFile()
  for (const [name, bytes] of members) {
    output.addBuffer(bytes, name, { compress: false })
  }
  output.end()
  await pipeline(output.outputStream, createWriteStream(outputPath, { flags: 'wx' }))
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} real Save/reopen/portable-copy retains exact outpaint provenance and RGBA without source/recovery files`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'igs-outpaint-portable-'))
    try {
      const f = await fixture(family)
      const original = structuredClone(f.project)
      const filePath = path.join(root, 'original.igs')
      await saveIgsPackage(filePath, {
        assets: { [f.assetPath]: { bytes: f.image } },
        preview: f.preview,
        project: f.project,
      })
      const saved = await readIgsPackage(filePath)
      assert.deepEqual(saved.project, original)
      assert.deepEqual(await saved.readMember(f.assetPath), f.image)
      assert.equal(saved.manifest.members.length, 4)
      assert.equal(
        saved.manifest.members.some((member) => /source|target|mask|lama/.test(member.path)),
        false,
      )
      const copied = path.join(root, 'portable.igs')
      await copyFile(filePath, copied)
      const portable = await readIgsPackage(copied)
      assert.deepEqual(portable.project.layers[0].generationProvenance, f.provenance)
      assert.equal(projectAcceptedResults('portable-project', portable.project)[0]?.width, 64)
      assert.equal(
        projectAcceptedResults('portable-project', portable.project)[0]?.seed,
        f.provenance.generationConfiguration.sampling.actualSeed,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test(`${family} actual package reader and staged Save refuse coherent wrong contribution-alpha metadata before replacing saved bytes`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'igs-outpaint-alpha-refusal-'))
    try {
      const f = await fixture(family)
      const filePath = path.join(root, 'saved.igs')
      const input = {
        assets: { [f.assetPath]: { bytes: f.image } },
        preview: f.preview,
        project: f.project,
      }
      await saveIgsPackage(filePath, input)
      const original = await readFile(filePath)
      const bad = structuredClone(f.project)
      const provenance = bad.layers[0].generationProvenance!
      assert.ok(provenance.kind === 'anima-outpaint' || provenance.kind === 'illustrious-outpaint')
      provenance.executionResultContext.output.contributionAlpha8.sha256 = sha(
        Buffer.alloc(64 * 64),
      )
      await assert.rejects(saveIgsPackage(filePath, { ...input, project: bad }), {
        code: 'MEMBER_MISMATCH',
      })
      assert.deepEqual(await readFile(filePath), original)
      assert.equal(
        (await readdir(root)).some((name) => name.endsWith('.tmp')),
        false,
      )
      const forged = path.join(root, 'coherent-tamper.igs')
      await rewriteArchive(filePath, forged, f.assetPath, await animaFixturePng(0))
      await assert.rejects(readIgsPackage(forged), { code: 'MEMBER_MISMATCH' })
      assert.deepEqual((await readIgsPackage(filePath)).project, f.project)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}
