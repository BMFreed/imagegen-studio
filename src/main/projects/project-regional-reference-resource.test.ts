import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceReferenceImageV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { parseProjectLayerImageUrl } from './project-layer-resource.js'
import { parseProjectRegionalMaskImageUrl } from './project-regional-mask-resource.js'
import {
  parseProjectRegionalReferenceThumbnailUrl,
  projectRegionalReferenceThumbnailUrl,
  resolveProjectRegionalReferenceThumbnail,
  streamSavedProjectRegionalReferenceThumbnail,
  streamStagedProjectRegionalReferenceThumbnail,
} from './project-regional-reference-resource.js'
import { ProjectSession } from './project-session.js'
import { acceptedOutputPngFixture } from './test-fixtures/accepted-provenance.js'

const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex')

test('regional reference capabilities bind their full tuple and never fall back to Raster or mask namespaces', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Resource capabilities' })
  const referenceId = randomUUID()
  const thumbnail = {
    bytes: 1000,
    height: 64,
    path: `assets/regional-references/${referenceId}/${'b'.repeat(64)}.webp`,
    sha256: 'b'.repeat(64),
    width: 64,
  }
  const regionId = randomUUID()
  document.regionalGuidance = [
    {
      enabled: false,
      id: regionId,
      locked: true,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Locked disabled owner',
      overlayOpacity: 0,
      referenceImages: [
        {
          asset: {
            ...thumbnail,
            path: `assets/regional-references/${referenceId}/${'b'.repeat(64)}.png`,
          },
          id: referenceId,
          name: 'Image',
          sourceFormat: 'PNG',
          thumbnail,
        },
      ],
    },
  ]
  const request = {
    documentRevision: document.documentRevision,
    referenceId,
    regionId,
    tabId: `project-v1-${'a'.repeat(64)}`,
    thumbnailSha256: thumbnail.sha256,
  }
  const url = projectRegionalReferenceThumbnailUrl(request)
  assert.deepEqual(parseProjectRegionalReferenceThumbnailUrl(url), request)
  assert.deepEqual(resolveProjectRegionalReferenceThumbnail(document, request), thumbnail)
  for (const changed of [
    { ...request, documentRevision: randomUUID() },
    { ...request, regionId: randomUUID() },
    { ...request, referenceId: randomUUID() },
    { ...request, thumbnailSha256: 'c'.repeat(64) },
  ]) {
    assert.equal(resolveProjectRegionalReferenceThumbnail(document, changed), null)
    assert.equal(
      parseProjectRegionalReferenceThumbnailUrl(
        projectRegionalReferenceThumbnailUrl(changed).replace(
          /\/[^/]+\.webp$/,
          new URL(url).pathname.slice(new URL(url).pathname.lastIndexOf('/')),
        ),
      ),
      null,
    )
  }
  for (const changed of [
    `${url}?path=/outside`,
    `${url}#fragment`,
    url.replace('://regional-reference/', '://asset/'),
    url.replace(request.tabId, `project-v1-${'c'.repeat(64)}`),
  ]) {
    assert.equal(parseProjectRegionalReferenceThumbnailUrl(changed), null)
  }
  assert.equal(parseProjectLayerImageUrl(url), null)
  assert.equal(parseProjectRegionalMaskImageUrl(url), null)
})

test('regional saved/staged thumbnail streams retain exact bounded bytes and reject wrong owners or corruption', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-regional-reference-resource-'))
  try {
    const png = await acceptedOutputPngFixture(64, 64)
    const webp = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
    )
    const session = await ProjectSession.create(path.join(root, 'Project.igs'), 'Thumbnails', {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    })
    const id = randomUUID()
    const reference: IgsRegionalGuidanceReferenceImageV1 = {
      asset: {
        bytes: png.length,
        height: 64,
        path: `assets/regional-references/${id}/${digest(png)}.png`,
        sha256: digest(png),
        width: 64,
      },
      id,
      name: 'Image',
      sourceFormat: 'PNG',
      thumbnail: {
        bytes: webp.length,
        height: 64,
        path: `assets/regional-references/${id}/${digest(webp)}.webp`,
        sha256: digest(webp),
        width: 64,
      },
    }
    session.applyDocument({
      ...session.document,
      regionalGuidance: [
        {
          enabled: true,
          id: randomUUID(),
          locked: false,
          mask: { asset: null, id: randomUUID(), revision: 0 },
          name: 'Region',
          overlayOpacity: 0.5,
          referenceImages: [reference],
        },
      ],
    })
    await session.save({
      assets: {
        [reference.asset.path]: { bytes: png },
        [reference.thumbnail.path]: { bytes: webp },
      },
    })
    const staged = path.join(root, 'thumbnail.webp')
    await writeFile(staged, webp)
    for (const response of [
      await streamSavedProjectRegionalReferenceThumbnail(session.filePath, reference.thumbnail),
      await streamStagedProjectRegionalReferenceThumbnail({ bytes: webp }, reference.thumbnail),
      await streamStagedProjectRegionalReferenceThumbnail(
        { sourcePath: staged },
        reference.thumbnail,
      ),
    ]) {
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/webp')
      assert.ok(Buffer.from(await response.arrayBuffer()).equals(webp))
    }
    assert.equal(
      (
        await streamSavedProjectRegionalReferenceThumbnail(session.filePath, {
          ...reference.thumbnail,
          path: reference.thumbnail.path.replace(id, randomUUID()),
        })
      ).status,
      404,
    )
    await assert.rejects(
      streamStagedProjectRegionalReferenceThumbnail({ bytes: png }, reference.thumbnail),
    )
    await assert.rejects(
      streamStagedProjectRegionalReferenceThumbnail(
        { bytes: webp },
        { ...reference.thumbnail, width: 63 },
      ),
    )
    await assert.rejects(
      streamStagedProjectRegionalReferenceThumbnail(
        { bytes: webp },
        { ...reference.thumbnail, bytes: 128_001 },
      ),
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
