import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  IgsSchemaError,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  copyFile,
  type FileHandle,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

import { IgsPackageError, readIgsPackage, saveIgsPackage } from './igs-package.js'

// Real encoded 2x2 images. Preview production is injected by the caller, never faked by the ZIP layer.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const WEBP = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/q4X/0mzxNnibPkkf/OwbEu14AAA',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function pngWithChunk(png: Buffer, chunkType: string, payload: Buffer): Buffer {
  const type = Buffer.from(chunkType, 'ascii')
  const chunk = Buffer.alloc(12 + payload.length)
  chunk.writeUInt32BE(payload.length, 0)
  type.copy(chunk, 4)
  payload.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([type, payload])), 8 + payload.length)
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)])
}

function pngWithIcc(png: Buffer, profile: Buffer): Buffer {
  return pngWithChunk(
    png,
    'iCCP',
    Buffer.concat([Buffer.from('profile\0\0', 'ascii'), deflateSync(profile)]),
  )
}

function webpWithIcc(webp: Buffer, profile: Buffer): Buffer {
  const chunk = (type: string, payload: Buffer): Buffer => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32LE(payload.length, 4)
    return Buffer.concat([header, payload, Buffer.alloc(payload.length & 1)])
  }
  const extendedHeader = Buffer.alloc(10)
  extendedHeader[0] = 0x20 // ICC profile flag
  extendedHeader.writeUIntLE(1, 4, 3) // width minus one
  extendedHeader.writeUIntLE(1, 7, 3) // height minus one
  const payload = Buffer.concat([
    Buffer.from('WEBP'),
    chunk('VP8X', extendedHeader),
    chunk('ICCP', profile),
    webp.subarray(12),
  ])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(payload.length, 4)
  return Buffer.concat([riff, payload])
}

async function inTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-package-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function emptyInput(title = 'First Project') {
  return {
    preview: { merged: PNG, rect: null, status: 'empty' as const, thumbnail: WEBP },
    project: createEmptyProjectDocumentV1({ title }),
  }
}

function rasterProject(title = 'Raster Project'): IgsProjectDocumentV1 {
  const base = createEmptyProjectDocumentV1({ title })
  const id = randomUUID()
  return {
    ...base,
    layers: [
      {
        asset: {
          bytes: PNG.length,
          height: 2,
          path: `assets/layers/${id}.png`,
          sha256: sha256(PNG),
          width: 2,
        },
        blendMode: 'normal',
        id,
        kind: 'raster',
        locked: false,
        name: 'Base',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: true,
      },
    ],
  }
}

async function rawEntries(filePath: string): Promise<[string, Buffer][]> {
  const archive = await yauzl.openPromise(filePath, { autoClose: false, lazyEntries: true })
  const entries: [string, Buffer][] = []
  try {
    for await (const entry of archive.eachEntry()) {
      const chunks: Buffer[] = []
      for await (const chunk of await archive.openReadStreamPromise(entry)) {
        chunks.push(Buffer.from(chunk))
      }
      entries.push([entry.fileName, Buffer.concat(chunks)])
    }
  } finally {
    archive.close()
  }
  return entries
}

async function writeRawZip(
  filePath: string,
  entries: [string, Buffer, { mode?: number }?][],
): Promise<void> {
  const zip = new yazl.ZipFile()
  for (const [name, bytes, options] of entries) {
    zip.addBuffer(bytes, name, { compress: false, ...options })
  }
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(filePath))
}

test('Save, portable copy, reopen, edit and Save again use the real ZIP loader', async () => {
  await inTemporaryDirectory(async (directory) => {
    const originalPath = path.join(directory, 'original.igs')
    const copiedPath = path.join(directory, 'copied.igs')
    const first = emptyInput()
    const committed = await saveIgsPackage(originalPath, first)
    assert.equal(committed.directorySynced, true)
    const firstOpen = await readIgsPackage(originalPath)
    assert.deepEqual(firstOpen.project, first.project)
    assert.equal(firstOpen.manifest.preview.status, 'empty')
    assert.deepEqual(await firstOpen.readMember('preview/thumbnail.webp'), WEBP)
    await copyFile(originalPath, copiedPath)
    assert.deepEqual((await readIgsPackage(copiedPath)).project, first.project)

    const second: IgsProjectDocumentV1 = {
      ...first.project,
      documentRevision: randomUUID(),
      generationDraft: {
        ...first.project.generationDraft,
        positivePrompt: { embeddingRefs: [], text: 'new draft' },
      },
      primaryBbox: { height: 768, width: 1536, x: -2048, y: 240 },
    }
    await saveIgsPackage(originalPath, {
      preview: first.preview,
      project: second,
    })
    assert.deepEqual((await readIgsPackage(originalPath)).project, second)
    assert.deepEqual((await readIgsPackage(copiedPath)).project, first.project)
    await assert.rejects(firstOpen.readMember('preview/merged.png'), {
      code: 'PACKAGE_CHANGED',
    })
  })
})

test('worker-unavailable raster Save keeps exact asset bytes and both required previews', async () => {
  await inTemporaryDirectory(async (directory) => {
    const project = rasterProject()
    const sourcePath = path.join(directory, 'source.png')
    const targetPath = path.join(directory, 'raster.igs')
    await writeFile(sourcePath, PNG)
    const layer = project.layers[0]
    await saveIgsPackage(targetPath, {
      assets: { [layer.asset.path]: { sourcePath } },
      preview: {
        merged: PNG,
        rect: { height: 2, width: 2, x: 0, y: 0 },
        status: 'unavailable',
        thumbnail: WEBP,
      },
      project,
    })
    const opened = await readIgsPackage(targetPath)
    assert.equal(opened.manifest.preview.status, 'unavailable')
    assert.deepEqual(opened.project.layers, project.layers)
    assert.deepEqual(await opened.readMember(layer.asset.path), PNG)
    assert.deepEqual(await opened.readMember('preview/merged.png'), PNG)
    const extractedPath = path.join(directory, 'extracted.png')
    await opened.extractMemberToFile(layer.asset.path, extractedPath)
    assert.deepEqual(await readFile(extractedPath), PNG)
    const capped = await readIgsPackage(targetPath, { limits: { readMemberBytes: PNG.length - 1 } })
    await assert.rejects(capped.readMember(layer.asset.path), { code: 'PACKAGE_LIMIT' })
    const streamedPath = path.join(directory, 'streamed.png')
    await capped.extractMemberToFile(layer.asset.path, streamedPath)
    assert.deepEqual(await readFile(streamedPath), PNG)
  })
})

test('rendered preview pixels may be downsampled from a much larger world-space rect', async () => {
  await inTemporaryDirectory(async (directory) => {
    const base = rasterProject()
    const secondId = randomUUID()
    const secondPath = `assets/layers/${secondId}.png`
    const project: IgsProjectDocumentV1 = {
      ...base,
      layers: [
        { ...base.layers[0], transform: { ...base.layers[0].transform, x: -500_000 } },
        {
          ...base.layers[0],
          asset: { ...base.layers[0].asset, path: secondPath },
          id: secondId,
          transform: { ...base.layers[0].transform, x: 500_000 },
        },
      ],
    }
    const target = path.join(directory, 'wide.igs')
    const worldRect = { height: 2, width: 1_000_002, x: -500_000, y: 0 }
    await saveIgsPackage(target, {
      assets: {
        [project.layers[0].asset.path]: { bytes: PNG },
        [secondPath]: { bytes: PNG },
      },
      preview: { merged: PNG, rect: worldRect, status: 'rendered', thumbnail: WEBP },
      project,
    })
    const reopened = await readIgsPackage(target)
    assert.deepEqual(reopened.manifest.preview.rect, worldRect)
    assert.deepEqual(await reopened.readMember('preview/merged.png'), PNG)
  })
})

test('referenced ICC bytes survive Save, reopen and streaming extraction; missing bytes fail Open', async () => {
  await inTemporaryDirectory(async (directory) => {
    const base = rasterProject('ICC Project')
    const profileBytes = Buffer.alloc(128)
    profileBytes.writeUInt32BE(profileBytes.length, 0)
    profileBytes.write('acsp', 36, 'ascii')
    const profilePath = `assets/profiles/${sha256(profileBytes)}.icc`
    const project: IgsProjectDocumentV1 = {
      ...base,
      layers: base.layers.map((layer) => ({
        ...layer,
        sourceIccProfile: {
          bytes: profileBytes.length,
          path: profilePath,
          sha256: sha256(profileBytes),
        },
      })),
    }
    const target = path.join(directory, 'icc.igs')
    await saveIgsPackage(target, {
      assets: {
        [profilePath]: { bytes: profileBytes },
        [project.layers[0].asset.path]: { bytes: PNG },
      },
      preview: {
        merged: PNG,
        rect: { height: 2, width: 2, x: 0, y: 0 },
        status: 'unavailable',
        thumbnail: WEBP,
      },
      project,
    })
    const opened = await readIgsPackage(target)
    assert.equal(opened.project.colorSpace, 'srgb')
    assert.deepEqual(await opened.readMember(profilePath), profileBytes)
    const extracted = path.join(directory, 'source.icc')
    await opened.extractMemberToFile(profilePath, extracted)
    assert.deepEqual(await readFile(extracted), profileBytes)

    const entries = await rawEntries(target)
    const missingPath = path.join(directory, 'missing-profile.igs')
    await writeRawZip(
      missingPath,
      entries.filter(([name]) => name !== profilePath),
    )
    await assert.rejects(readIgsPackage(missingPath))
    const corruptPath = path.join(directory, 'corrupt-profile.igs')
    await writeRawZip(
      corruptPath,
      entries.map(([name, bytes]) => [
        name,
        name === profilePath ? Buffer.from(bytes).fill(1, 50, 51) : bytes,
      ]),
    )
    await assert.rejects(readIgsPackage(corruptPath), { code: 'MEMBER_MISMATCH' })
  })
})

test('Save and Open reject raster PNG and WebP with an embedded AdobeRGB profile', async () => {
  await inTemporaryDirectory(async (directory) => {
    const pinnedProfile = await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
    const adobeProfile = await readFile(
      path.resolve('worker-python/tests/fixtures/AdobeRGB1998.icc'),
    )
    for (const [extension, original, attach] of [
      ['png', PNG, pngWithIcc],
      ['webp', WEBP, webpWithIcc],
    ] as const) {
      const correct = attach(original, pinnedProfile)
      const wrong = attach(original, adobeProfile)
      const base = rasterProject()
      const assetPath = base.layers[0].asset.path.replace(/\.png$/, `.${extension}`)
      const project: IgsProjectDocumentV1 = {
        ...base,
        layers: [
          {
            ...base.layers[0],
            asset: {
              ...base.layers[0].asset,
              bytes: correct.length,
              path: assetPath,
              sha256: sha256(correct),
            },
          },
        ],
      }
      const preview = {
        merged: PNG,
        rect: { height: 2, width: 2, x: 0, y: 0 },
        status: 'unavailable' as const,
        thumbnail: WEBP,
      }
      const validPath = path.join(directory, `valid-${extension}.igs`)
      await saveIgsPackage(validPath, {
        assets: { [assetPath]: { bytes: correct } },
        preview,
        project,
      })
      assert.deepEqual(await (await readIgsPackage(validPath)).readMember(assetPath), correct)

      await assert.rejects(
        saveIgsPackage(path.join(directory, `wrong-${extension}.igs`), {
          assets: { [assetPath]: { bytes: wrong } },
          preview,
          project: {
            ...project,
            layers: [
              {
                ...project.layers[0],
                asset: { ...project.layers[0].asset, bytes: wrong.length, sha256: sha256(wrong) },
              },
            ],
          },
        }),
        { code: 'INVALID_IMAGE' },
      )

      const altered = await rawEntries(validPath)
      const manifest = JSON.parse(
        altered.find(([name]) => name === 'manifest.json')![1].toString(),
      ) as {
        members: { bytes: number; path: string; sha256: string }[]
      }
      const document = JSON.parse(
        altered.find(([name]) => name === 'project.json')![1].toString(),
      ) as IgsProjectDocumentV1
      const member = manifest.members.find((entry) => entry.path === assetPath)!
      member.bytes = wrong.length
      member.sha256 = sha256(wrong)
      document.layers[0].asset.bytes = wrong.length
      document.layers[0].asset.sha256 = sha256(wrong)
      const forgedPath = path.join(directory, `forged-${extension}.igs`)
      await writeRawZip(
        forgedPath,
        altered.map(([name, bytes]) => [
          name,
          name === assetPath
            ? wrong
            : name === 'manifest.json'
              ? Buffer.from(JSON.stringify(manifest))
              : name === 'project.json'
                ? Buffer.from(JSON.stringify(document))
                : bytes,
        ]),
      )
      await assert.rejects(readIgsPackage(forgedPath), { code: 'INVALID_IMAGE' })
    }
  })
})

test('profileless PNG preview rejects contradictory color signaling', async () => {
  await inTemporaryDirectory(async (directory) => {
    const gamma = Buffer.alloc(4)
    gamma.writeUInt32BE(100_000)
    const chromaticity = Buffer.alloc(32)
    ;[31_270, 32_900, 64_000, 33_000, 21_000, 71_000, 15_000, 6000].forEach((value, index) =>
      chromaticity.writeUInt32BE(value, index * 4),
    )
    for (const [chunkType, payload] of [
      ['gAMA', gamma],
      ['cHRM', chromaticity],
      ['sRGB', Buffer.from([4])],
      ['cICP', Buffer.from([12, 13, 0, 1])],
    ] as const) {
      const input = emptyInput()
      await assert.rejects(
        saveIgsPackage(path.join(directory, `${chunkType}.igs`), {
          ...input,
          preview: { ...input.preview, merged: pngWithChunk(PNG, chunkType, payload) },
        }),
        { code: 'INVALID_IMAGE' },
      )
    }

    const baselinePath = path.join(directory, 'baseline.igs')
    await saveIgsPackage(baselinePath, emptyInput())
    const entries = await rawEntries(baselinePath)
    const conflictingPreview = pngWithChunk(PNG, 'cICP', Buffer.from([12, 13, 0, 1]))
    const manifest = JSON.parse(
      entries.find(([name]) => name === 'manifest.json')![1].toString(),
    ) as {
      members: { bytes: number; path: string; sha256: string }[]
    }
    const previewRef = manifest.members.find((member) => member.path === 'preview/merged.png')!
    previewRef.bytes = conflictingPreview.length
    previewRef.sha256 = sha256(conflictingPreview)
    const forgedPath = path.join(directory, 'forged-cicp.igs')
    await writeRawZip(
      forgedPath,
      entries.map(([name, bytes]) => [
        name,
        name === 'preview/merged.png'
          ? conflictingPreview
          : name === 'manifest.json'
            ? Buffer.from(JSON.stringify(manifest))
            : bytes,
      ]),
    )
    await assert.rejects(readIgsPackage(forgedPath), { code: 'INVALID_IMAGE' })
  })
})

test('profileless PNG preview accepts sRGB-compatible color signaling', async () => {
  await inTemporaryDirectory(async (directory) => {
    const gamma = Buffer.alloc(4)
    gamma.writeUInt32BE(45_455)
    const chromaticity = Buffer.alloc(32)
    const coordinates = [31_270, 32_900, 64_000, 33_000, 30_000, 60_000, 15_000, 6000]
    coordinates.forEach((value, index) => chromaticity.writeUInt32BE(value, index * 4))
    for (const [chunkType, payload] of [
      ['gAMA', gamma],
      ['cHRM', chromaticity],
      ['sRGB', Buffer.from([0])],
      ['cICP', Buffer.from([1, 13, 0, 1])],
    ] as const) {
      const input = emptyInput()
      const merged = pngWithChunk(PNG, chunkType, payload)
      const filePath = path.join(directory, `${chunkType}.igs`)
      await saveIgsPackage(filePath, {
        ...input,
        preview: { ...input.preview, merged },
      })
      assert.deepEqual(
        await (await readIgsPackage(filePath)).readMember('preview/merged.png'),
        merged,
      )
    }
  })
})

test('createOnly preserves an existing unrelated Project at the same path', async () => {
  await inTemporaryDirectory(async (directory) => {
    const targetPath = path.join(directory, 'new.igs')
    const original = emptyInput('Existing')
    await saveIgsPackage(targetPath, original, { createOnly: true })
    const originalBytes = await readFile(targetPath)
    await assert.rejects(saveIgsPackage(targetPath, emptyInput('Second'), { createOnly: true }), {
      code: 'EEXIST',
    })
    assert.deepEqual(await readFile(targetPath), originalBytes)
    assert.deepEqual((await readIgsPackage(targetPath)).project, original.project)
    assert.deepEqual(await readdir(directory), ['new.igs'])
  })
})

test('interrupted validated Save leaves previous file readable and removes temporary archive', async () => {
  await inTemporaryDirectory(async (directory) => {
    const targetPath = path.join(directory, 'save.igs')
    const first = emptyInput('Saved document')
    await saveIgsPackage(targetPath, first)
    const originalBytes = await readFile(targetPath)
    const second = emptyInput('Unsaved document')
    await assert.rejects(
      saveIgsPackage(targetPath, second, {
        beforeRename: async () => {
          throw new Error('injected interruption before commit')
        },
      }),
      /injected interruption/,
    )
    assert.deepEqual(await readFile(targetPath), originalBytes)
    assert.deepEqual((await readIgsPackage(targetPath)).project, first.project)
    assert.deepEqual(await readdir(directory), ['save.igs'])
  })
})

test('Save syncs validated ZIP before commit and its directory after commit', async () => {
  await inTemporaryDirectory(async (directory) => {
    const targetPath = path.join(directory, 'save.igs')
    const first = emptyInput('First saved document')
    await saveIgsPackage(targetPath, first)
    const originalBytes = await readFile(targetPath)

    // The Save durability contract requires a staged-file flush before rename and a directory
    // flush after rename. Observe the real writer's handles without replacing its filesystem.
    const inspectionHandle = await open(directory, 'r')
    const syncPrototype = Object.getPrototypeOf(inspectionHandle) as FileHandle
    await inspectionHandle.close()
    const originalSync = syncPrototype.sync
    const syncEvents: ('directory' | 'file')[] = []
    let failSync: 'directory' | 'file' | null = null
    syncPrototype.sync = async function (this: FileHandle): Promise<void> {
      const stats = await this.stat()
      const kind = stats.isDirectory() ? 'directory' : 'file'
      syncEvents.push(kind)
      if (kind === failSync) {
        throw new Error(`injected ${kind} sync failure`)
      }
      await originalSync.call(this)
    }
    try {
      const second = emptyInput('Second saved document')
      const committed = await saveIgsPackage(targetPath, second, {
        beforeRename: async () => {
          assert.deepEqual(syncEvents, ['file'])
          assert.deepEqual(await readFile(targetPath), originalBytes)
        },
      })
      assert.equal(committed.directorySynced, true)
      assert.deepEqual(syncEvents, ['file', 'directory'])
      assert.deepEqual((await readIgsPackage(targetPath)).project, second.project)

      syncEvents.length = 0
      failSync = 'file'
      const secondBytes = await readFile(targetPath)
      await assert.rejects(
        saveIgsPackage(targetPath, emptyInput('Rejected')),
        /injected file sync failure/,
      )
      assert.deepEqual(syncEvents, ['file'])
      assert.deepEqual(await readFile(targetPath), secondBytes)
      assert.deepEqual(await readdir(directory), ['save.igs'])

      syncEvents.length = 0
      failSync = 'directory'
      const third = emptyInput('Committed, directory sync failed')
      const committedWithoutDirectorySync = await saveIgsPackage(targetPath, third)
      assert.deepEqual(syncEvents, ['file', 'directory'])
      assert.equal(committedWithoutDirectorySync.directorySynced, false)
      assert.deepEqual((await readIgsPackage(targetPath)).project, third.project)
    } finally {
      syncPrototype.sync = originalSync
    }
  })
})

test('actual loader rejects an unsupported schema separately from malformed members', async () => {
  await inTemporaryDirectory(async (directory) => {
    const target = path.join(directory, 'good.igs')
    await saveIgsPackage(target, emptyInput())
    const entries = await rawEntries(target)
    const altered = entries.map(([name, bytes]) =>
      name === 'manifest.json'
        ? ([
            name,
            Buffer.from(
              JSON.stringify({ ...JSON.parse(bytes.toString('utf8')), schemaVersion: 2 }),
            ),
          ] as const)
        : ([name, bytes] as const),
    )
    const unsupported = path.join(directory, 'unsupported.igs')
    await writeRawZip(
      unsupported,
      altered.map(([name, bytes]) => [name, bytes]),
    )
    await assert.rejects(readIgsPackage(unsupported), (error: unknown) => {
      assert.ok(error instanceof IgsSchemaError)
      assert.equal(error.code, 'UNSUPPORTED_SCHEMA')
      return true
    })
    const futureWithNewMember = path.join(directory, 'future.igs')
    await writeRawZip(futureWithNewMember, [
      ...altered.map(([name, bytes]) => [name, bytes] as [string, Buffer]),
      ['assets/future.bin', Buffer.from('future version member')],
    ])
    await assert.rejects(readIgsPackage(futureWithNewMember), {
      code: 'UNSUPPORTED_SCHEMA',
    })
  })
})

test('hash mismatch, missing preview and unlisted member are rejected on reopen', async () => {
  await inTemporaryDirectory(async (directory) => {
    const target = path.join(directory, 'good.igs')
    await saveIgsPackage(target, emptyInput())
    const entries = await rawEntries(target)
    const corrupt = path.join(directory, 'corrupt.igs')
    await writeRawZip(
      corrupt,
      entries.map(([name, bytes]) => [
        name,
        name === 'preview/merged.png' ? Buffer.from(bytes).fill(0, 40, 41) : bytes,
      ]),
    )
    await assert.rejects(readIgsPackage(corrupt), (error: unknown) => {
      assert.ok(error instanceof IgsPackageError)
      assert.ok(['INVALID_IMAGE', 'MEMBER_MISMATCH'].includes(error.code))
      return true
    })

    const missing = path.join(directory, 'missing.igs')
    await writeRawZip(
      missing,
      entries.filter(([name]) => name !== 'preview/thumbnail.webp'),
    )
    await assert.rejects(readIgsPackage(missing))

    const unknown = path.join(directory, 'unknown.igs')
    await writeRawZip(unknown, [...entries, ['assets/other.txt', Buffer.from('no')]])
    await assert.rejects(readIgsPackage(unknown), { code: 'UNSAFE_ENTRY' })
  })
})

test('malformed ZIP is an invalid package while a missing file stays a filesystem error', async () => {
  await inTemporaryDirectory(async (directory) => {
    const malformedPath = path.join(directory, 'malformed.igs')
    await writeFile(malformedPath, Buffer.from('not a ZIP archive'))
    await assert.rejects(readIgsPackage(malformedPath), (error: unknown) => {
      assert.ok(error instanceof IgsPackageError)
      assert.equal(error.code, 'INVALID_PACKAGE')
      return true
    })

    await assert.rejects(readIgsPackage(path.join(directory, 'absent.igs')), (error: unknown) => {
      assert.equal((error as NodeJS.ErrnoException).code, 'ENOENT')
      assert.equal(error instanceof IgsPackageError, false)
      return true
    })
  })
})

test('matching manifest digest cannot disguise truncated PNG or WebP preview data', async () => {
  await inTemporaryDirectory(async (directory) => {
    const target = path.join(directory, 'good.igs')
    await saveIgsPackage(target, emptyInput())
    const original = await rawEntries(target)
    for (const memberPath of ['preview/merged.png', 'preview/thumbnail.webp']) {
      const damaged = original.map(
        ([name, bytes]) =>
          [name, name === memberPath ? bytes.subarray(0, -4) : bytes] as [string, Buffer],
      )
      const replacement = damaged.find(([name]) => name === memberPath)![1]
      const manifestEntry = damaged.find(([name]) => name === 'manifest.json')!
      const manifest = JSON.parse(manifestEntry[1].toString('utf8')) as {
        members: { bytes: number; path: string; sha256: string }[]
      }
      const ref = manifest.members.find((member) => member.path === memberPath)!
      ref.bytes = replacement.length
      ref.sha256 = sha256(replacement)
      manifestEntry[1] = Buffer.from(JSON.stringify(manifest))
      const damagedPath = path.join(directory, `${path.basename(memberPath)}.igs`)
      await writeRawZip(damagedPath, damaged)
      await assert.rejects(readIgsPackage(damagedPath), { code: 'INVALID_IMAGE' })
    }
  })
})

test('ZIP traversal, absolute, backslash, duplicate, symlink and encrypted entries are refused', async () => {
  await inTemporaryDirectory(async (directory) => {
    const target = path.join(directory, 'good.igs')
    await saveIgsPackage(target, emptyInput())
    const entries = await rawEntries(target)
    const unsafeEntries = [
      ['../x.txt', 'safe.txt'],
      ['/x/a.txt', 'safe.txt'],
      [String.raw`a\b.txt`, 'safe.txt'],
    ] as const
    for (const [unsafeName, safeName] of unsafeEntries) {
      const unsafe = path.join(directory, `${Buffer.from(unsafeName).toString('hex')}.igs`)
      // yazl deliberately rejects unsafe names; patch equal-length local and central filenames.
      await writeRawZip(unsafe, [...entries, [safeName, Buffer.from('x')]])
      const bytes = await readFile(unsafe)
      const replacement = Buffer.from(unsafeName)
      const original = Buffer.from(safeName)
      let cursor = 0
      while ((cursor = bytes.indexOf(original, cursor)) >= 0) {
        replacement.copy(bytes, cursor)
        cursor += original.length
      }
      await writeFile(unsafe, bytes)
      await assert.rejects(readIgsPackage(unsafe))
    }

    const duplicate = path.join(directory, 'duplicate.igs')
    await writeRawZip(duplicate, [...entries, entries[0]])
    await assert.rejects(readIgsPackage(duplicate), { code: 'UNSAFE_ENTRY' })

    const symlink = path.join(directory, 'symlink.igs')
    await writeRawZip(symlink, [
      ...entries,
      ['assets/other.txt', Buffer.from('destination'), { mode: 0o12_0777 }],
    ])
    await assert.rejects(readIgsPackage(symlink))

    const encrypted = path.join(directory, 'encrypted.igs')
    await writeRawZip(encrypted, entries)
    const encryptedBytes = await readFile(encrypted)
    // General-purpose bit 0 in both local and central headers denotes encryption.
    for (let i = 0; i + 12 < encryptedBytes.length; i++) {
      if (encryptedBytes.readUInt32LE(i) === 0x04_03_4b_50) {
        encryptedBytes.writeUInt16LE(encryptedBytes.readUInt16LE(i + 6) | 1, i + 6)
      } else if (encryptedBytes.readUInt32LE(i) === 0x02_01_4b_50) {
        encryptedBytes.writeUInt16LE(encryptedBytes.readUInt16LE(i + 8) | 1, i + 8)
      }
    }
    await writeFile(encrypted, encryptedBytes)
    await assert.rejects(readIgsPackage(encrypted))
  })
})

test('entry count, JSON, aggregate and image-dimension safety ceilings reject over-limit packages', async () => {
  await inTemporaryDirectory(async (directory) => {
    const target = path.join(directory, 'good.igs')
    await saveIgsPackage(target, emptyInput())
    await assert.rejects(readIgsPackage(target, { limits: { archiveEntries: 4 } }), {
      code: 'PACKAGE_LIMIT',
    })
    await assert.rejects(readIgsPackage(target, { limits: { projectJsonBytes: 10 } }), {
      code: 'PACKAGE_LIMIT',
    })
    await assert.rejects(readIgsPackage(target, { limits: { thumbnailBytes: WEBP.length - 1 } }), {
      code: 'PACKAGE_LIMIT',
    })
    await assert.rejects(readIgsPackage(target, { limits: { archiveUncompressedBytes: 100 } }), {
      code: 'PACKAGE_LIMIT',
    })
    await assert.rejects(readIgsPackage(target, { limits: { rasterDimension: 1 } }), {
      code: 'PACKAGE_LIMIT',
    })
  })
})
