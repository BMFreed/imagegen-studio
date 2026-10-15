import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'

import {
  SmartPatchInputBundleError,
  SmartPatchInputBundleRepository,
} from './project-smart-patch-input-bundle.js'
import { parseSmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import { literalPreparedSmartPatchInputMaterial } from './test-fixtures/smart-patch-input-material.js'

const executeFile = promisify(execFile)
const REPOSITORY_MODULE = pathToFileURL(
  path.join(import.meta.dirname, 'project-smart-patch-input-bundle.ts'),
).href
const FIXTURE_MODULE = pathToFileURL(
  path.join(import.meta.dirname, 'test-fixtures/smart-patch-input-material.ts'),
).href
const repositoryRoot = (dataRoot: string): string =>
  path.join(dataRoot, 'generation-prepared-inputs', 'smart-patch')
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function fixture(
  run: (input: { dataRoot: string; root: string }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-durable-input-'))
  const dataRoot = path.join(root, 'app')
  await mkdir(dataRoot, { mode: 0o700 })
  try {
    await run({ dataRoot, root })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function materialSummary(material: SmartPatchInputMaterial) {
  return {
    bbox: material.manifest.context.bbox,
    files: Object.fromEntries(
      Object.entries(material.files).map(([name, bytes]) => [name, sha256(bytes)]),
    ),
    internalResolution: material.manifest.context.internalResolution,
    mode: material.manifest.mode,
    seeds: material.manifest.items.map((entry) => entry.item.seed),
  }
}

/**
 * Change literal source RGB and rebuild its actual PNG CRC/zlib, keeping length/hash preconditions
 * explicit.
 */
function differentValidSameSizePng(png: Buffer): Buffer {
  const chunks: { data: Buffer; name: string }[] = []
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset)
    chunks.push({
      data: png.subarray(offset + 8, offset + 8 + size),
      name: png.toString('ascii', offset + 4, offset + 8),
    })
    offset += size + 12
  }
  const header = chunks.find((chunk) => chunk.name === 'IHDR')!.data
  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  assert.equal(header[9], 6, 'The declared literal source fixture is RGBA')
  const original = inflateSync(
    Buffer.concat(chunks.filter((chunk) => chunk.name === 'IDAT').map((chunk) => chunk.data)),
  )
  assert.equal(chunks.filter((chunk) => chunk.name === 'IDAT').length, 1)
  for (let row = 0; row < height; row++) {
    assert.equal(
      original[row * (width * 4 + 1)],
      0,
      'The input fixture encoder uses literal filter-zero rows',
    )
  }
  const encode = (name: string, data: Buffer): Buffer => {
    const bytes = Buffer.alloc(data.length + 12)
    bytes.writeUInt32BE(data.length, 0)
    bytes.write(name, 4, 'ascii')
    data.copy(bytes, 8)
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
    return bytes
  }
  for (let delta = 1; delta < 256; delta++) {
    const changed = Buffer.from(original)
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        changed[row * (width * 4 + 1) + 1 + column * 4] ^= delta
      }
    }
    const candidate = Buffer.concat([
      png.subarray(0, 8),
      ...chunks.map((chunk) =>
        encode(chunk.name, chunk.name === 'IDAT' ? deflateSync(changed, { level: 0 }) : chunk.data),
      ),
    ])
    if (candidate.length === png.length && !candidate.equals(png)) {
      return candidate
    }
  }
  assert.fail(
    'The bounded literal fixture must provide a different valid PNG of the same byte size',
  )
}

test('published input bundle reloads exact detached pixels/metadata with private files and no queue owner', async () => {
  await fixture(async ({ dataRoot }) => {
    const queueRoot = path.join(dataRoot, 'generation-inputs')
    await mkdir(queueRoot, { mode: 0o700 })
    await writeFile(path.join(queueRoot, 'ordinary-owner'), 'preserved', { mode: 0o600 })
    const material = await literalPreparedSmartPatchInputMaterial()
    const expected = materialSummary(material)
    const published = await new SmartPatchInputBundleRepository(dataRoot).publish(material)
    const directory = path.join(repositoryRoot(dataRoot), published.id)
    assert.deepEqual(materialSummary(published), expected)
    assert.equal(
      published.manifestSha256,
      sha256(await readFile(path.join(directory, 'manifest.json'))),
    )
    assert.equal((await lstat(directory)).mode & 0o7777, 0o700)
    assert.equal((await lstat(repositoryRoot(dataRoot))).mode & 0o7777, 0o700)
    assert.equal((await lstat(path.dirname(repositoryRoot(dataRoot)))).mode & 0o7777, 0o700)
    assert.deepEqual(
      (await readdir(directory)).sort(),
      [...Object.keys(material.files), 'manifest.json'].sort(),
    )
    for (const name of await readdir(directory)) {
      assert.equal((await lstat(path.join(directory, name))).mode & 0o7777, 0o600)
    }
    const fresh = await new SmartPatchInputBundleRepository(dataRoot).load(published.id)
    assert.deepEqual(materialSummary(fresh), expected)
    fresh.files['source.png'].fill(0)
    fresh.manifest.context.bbox.x = 999
    assert.deepEqual(
      materialSummary(await new SmartPatchInputBundleRepository(dataRoot).load(published.id)),
      expected,
    )
    assert.equal(await readFile(path.join(queueRoot, 'ordinary-owner'), 'utf8'), 'preserved')
    assert.deepEqual(await readdir(repositoryRoot(dataRoot)), [published.id])
  })
})

test('publish captures caller buffers and metadata before its first asynchronous boundary', async () => {
  await fixture(async ({ dataRoot }) => {
    const material = await literalPreparedSmartPatchInputMaterial()
    const expected = structuredClone(materialSummary(material))
    const pending = new SmartPatchInputBundleRepository(dataRoot).publish(material)
    material.manifest.context.bbox.x = 900
    material.manifest.items[0].item.seed = 99
    for (const bytes of Object.values(material.files)) {
      bytes.fill(0)
    }
    assert.deepEqual(materialSummary(await pending), expected)
  })
})

test('a fresh physical Node process reloads completed input publication without the original owner', async () => {
  await fixture(async ({ dataRoot }) => {
    const publishOnce = async () => {
      const material = await literalPreparedSmartPatchInputMaterial('anima', 'inpaint')
      const published = await new SmartPatchInputBundleRepository(dataRoot).publish(material)
      return {
        expected: materialSummary(published),
        id: published.id,
        manifestSha256: published.manifestSha256,
      }
    }
    const committed = await publishOnce()
    const script = `
      import { createHash } from 'node:crypto';
      const { SmartPatchInputBundleRepository } = await import(process.argv[3]);
      const value = await new SmartPatchInputBundleRepository(process.argv[1]).load(process.argv[2]);
      const hash = bytes => createHash('sha256').update(bytes).digest('hex');
      process.stdout.write(JSON.stringify({
        id: value.id, manifestSha256: value.manifestSha256,
        summary: {
          bbox: value.manifest.context.bbox,
          files: Object.fromEntries(Object.entries(value.files).map(([name, bytes]) => [name, hash(bytes)])),
          internalResolution: value.manifest.context.internalResolution,
          mode: value.manifest.mode,
          seeds: value.manifest.items.map(entry => entry.item.seed),
        },
      }));
    `
    const running = executeFile(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        script,
        dataRoot,
        committed.id,
        REPOSITORY_MODULE,
      ],
      { maxBuffer: 64 * 1024, timeout: 15_000 },
    )
    const result = await running
    assert.equal(
      running.child.exitCode,
      0,
      'The real loader child physically exits before fixture cleanup',
    )
    assert.deepEqual(JSON.parse(result.stdout), {
      id: committed.id,
      manifestSha256: committed.manifestSha256,
      summary: committed.expected,
    })
  })
})

test('actual same-size valid changed PNG with old metadata is rejected on reload, original neighbor reloads', async () => {
  await fixture(async ({ dataRoot }) => {
    const material = await literalPreparedSmartPatchInputMaterial()
    const original = Buffer.from(material.files['source.png'])
    const changed = differentValidSameSizePng(original)
    const validManifest = structuredClone(material.manifest)
    validManifest.files['source.png'].sha256 = sha256(changed)
    await assert.doesNotReject(
      parseSmartPatchInputMaterial(validManifest, { ...material.files, 'source.png': changed }),
      'The altered payload is a valid actual image; only the durable identity is stale',
    )
    const published = await new SmartPatchInputBundleRepository(dataRoot).publish(material)
    const file = path.join(repositoryRoot(dataRoot), published.id, 'source.png')
    await writeFile(file, changed)
    await assert.rejects(new SmartPatchInputBundleRepository(dataRoot).load(published.id), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
    assert.ok(
      (await readFile(file)).equals(changed),
      'Refusal never rewrites or deletes corrupt/replaced input',
    )
    await writeFile(file, original)
    const restored = await new SmartPatchInputBundleRepository(dataRoot).load(published.id)
    assert.ok(restored.files['source.png'].equals(original))
  })
})

for (const boundary of ['file', 'directory', 'publication'] as const) {
  test(`precommit ${boundary} boundary fault removes only the reservation's own files`, async () => {
    await fixture(async ({ dataRoot }) => {
      const id = randomUUID()
      const fault = new Error(`Controlled precommit ${boundary} boundary fault`)
      const repository = new SmartPatchInputBundleRepository(dataRoot, {
        createId: () => id,
        ...(boundary === 'file'
          ? {
              beforeFileSync: async () => {
                throw fault
              },
            }
          : {}),
        ...(boundary === 'directory'
          ? {
              beforeDirectorySync: async ({ phase }) => {
                if (phase === 'prepared') {
                  throw fault
                }
              },
            }
          : {}),
        ...(boundary === 'publication'
          ? {
              beforeManifestPublication: async () => {
                throw fault
              },
            }
          : {}),
      })
      await assert.rejects(repository.publish(await literalPreparedSmartPatchInputMaterial()), {
        code: 'SMART_PATCH_INPUT_STORAGE_FAILURE',
      })
      assert.deepEqual(await readdir(repositoryRoot(dataRoot)), [])
      assert.equal(existsSync(path.join(dataRoot, 'generation-inputs')), false)
    })
  })
}

for (const boundary of ['published', 'parent-sync'] as const) {
  test(`postcommit ${boundary} fault retains the valid published bundle and reports uncertainty`, async () => {
    await fixture(async ({ dataRoot }) => {
      const id = randomUUID()
      const material = await literalPreparedSmartPatchInputMaterial()
      const expected = materialSummary(material)
      const repository = new SmartPatchInputBundleRepository(dataRoot, {
        createId: () => id,
        ...(boundary === 'published'
          ? {
              afterManifestPublication: async () => {
                throw new Error('Controlled postpublication failure')
              },
            }
          : {}),
        ...(boundary === 'parent-sync'
          ? {
              beforeDirectorySync: async ({ phase }) => {
                if (phase === 'commit-parent') {
                  throw new Error('Controlled committed parent fsync failure')
                }
              },
            }
          : {}),
      })
      await assert.rejects(repository.publish(material), (error: unknown) => {
        assert.ok(error instanceof SmartPatchInputBundleError)
        assert.equal(error.code, 'SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN')
        assert.equal(error.identity?.id, id)
        assert.equal(
          error.identity?.manifestSha256,
          sha256(Buffer.from(JSON.stringify(material.manifest))),
        )
        return true
      })
      assert.deepEqual(
        (await readdir(path.join(repositoryRoot(dataRoot), id))).sort(),
        [...Object.keys(material.files), 'manifest.json'].sort(),
        'A committed bundle must retain every input after uncertain durability',
      )
      const fresh = await new SmartPatchInputBundleRepository(dataRoot).load(id)
      assert.deepEqual(materialSummary(fresh), expected)
      assert.deepEqual(await readdir(repositoryRoot(dataRoot)), [id])
    })
  })
}

test('physical process exit immediately after the commit link retains an uncertain crash window without sweeping', async () => {
  await fixture(async ({ dataRoot }) => {
    const id = randomUUID()
    const script = `
      const { SmartPatchInputBundleRepository } = await import(process.argv[3]);
      const { literalPreparedSmartPatchInputMaterial } = await import(process.argv[4]);
      await new SmartPatchInputBundleRepository(process.argv[1], {
        createId: () => process.argv[2],
        afterManifestPublication: async () => process.exit(79),
      }).publish(await literalPreparedSmartPatchInputMaterial());
      process.exit(80);
    `
    const running = executeFile(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        script,
        dataRoot,
        id,
        REPOSITORY_MODULE,
        FIXTURE_MODULE,
      ],
      { maxBuffer: 64 * 1024, timeout: 15_000 },
    )
    await assert.rejects(running, { code: 79 })
    assert.equal(
      running.child.exitCode,
      79,
      'The loader cannot race a live crashed-publisher child',
    )
    const manifest = path.join(repositoryRoot(dataRoot), id, 'manifest.json')
    assert.equal((await lstat(manifest)).nlink, 2)
    const before = (await readdir(repositoryRoot(dataRoot))).sort()
    assert.equal(
      before.length,
      2,
      'The commit marker and its own sibling temporary inode remain retained',
    )
    await assert.rejects(new SmartPatchInputBundleRepository(dataRoot).load(id), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
    assert.deepEqual((await readdir(repositoryRoot(dataRoot))).sort(), before)
    assert.ok(existsSync(manifest))
    // This deliberately interrupted window requires future exact reconciliation, not broad cleanup.
  })
})

test('exclusive reservation never replaces an existing foreign empty directory or an existing bundle', async () => {
  await fixture(async ({ dataRoot }) => {
    const material = await literalPreparedSmartPatchInputMaterial()
    const existing = await new SmartPatchInputBundleRepository(dataRoot).publish(material)
    const foreignId = randomUUID()
    const foreign = path.join(repositoryRoot(dataRoot), foreignId)
    await mkdir(foreign, { mode: 0o700 })
    const identity = await lstat(foreign, { bigint: true })
    await assert.rejects(
      new SmartPatchInputBundleRepository(dataRoot, { createId: () => foreignId }).publish(
        material,
      ),
      { code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE' },
    )
    assert.equal((await lstat(foreign, { bigint: true })).ino, identity.ino)
    assert.deepEqual(await readdir(foreign), [])
    await assert.rejects(
      new SmartPatchInputBundleRepository(dataRoot, { createId: () => existing.id }).publish(
        material,
      ),
      { code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE' },
    )
    assert.deepEqual(
      materialSummary(await new SmartPatchInputBundleRepository(dataRoot).load(existing.id)),
      materialSummary(material),
    )
  })
})

test('foreign files introduced before commit survive exact rollback and keep the uncertain reservation', async () => {
  await fixture(async ({ dataRoot }) => {
    const id = randomUUID()
    const repository = new SmartPatchInputBundleRepository(dataRoot, {
      beforeManifestPublication: async ({ bundlePath }) => {
        await writeFile(path.join(bundlePath, 'foreign.txt'), 'foreign bytes', { mode: 0o600 })
      },
      createId: () => id,
    })
    await assert.rejects(repository.publish(await literalPreparedSmartPatchInputMaterial()), {
      code: 'SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN',
    })
    const directory = path.join(repositoryRoot(dataRoot), id)
    assert.deepEqual(await readdir(directory), ['foreign.txt'])
    assert.equal(await readFile(path.join(directory, 'foreign.txt'), 'utf8'), 'foreign bytes')
  })
})

test('replacement of a prepared file before commit is retained rather than deleted by rollback', async () => {
  await fixture(async ({ dataRoot, root }) => {
    const id = randomUUID()
    const moved = path.join(root, 'original-source.png')
    const repository = new SmartPatchInputBundleRepository(dataRoot, {
      beforeManifestPublication: async ({ bundlePath }) => {
        const target = path.join(bundlePath, 'source.png')
        await rename(target, moved)
        await writeFile(target, 'foreign replacement', { mode: 0o600 })
      },
      createId: () => id,
    })
    await assert.rejects(repository.publish(await literalPreparedSmartPatchInputMaterial()), {
      code: 'SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN',
    })
    const directory = path.join(repositoryRoot(dataRoot), id)
    assert.deepEqual(await readdir(directory), ['source.png'])
    assert.equal(await readFile(path.join(directory, 'source.png'), 'utf8'), 'foreign replacement')
    assert.ok((await readFile(moved)).length > 0)
  })
})

test('replacement of the reservation directory before commit never becomes recursive cleanup input', async () => {
  await fixture(async ({ dataRoot, root }) => {
    const id = randomUUID()
    const moved = path.join(root, 'moved-reservation')
    const repository = new SmartPatchInputBundleRepository(dataRoot, {
      beforeManifestPublication: async ({ bundlePath }) => {
        await rename(bundlePath, moved)
        await mkdir(bundlePath, { mode: 0o700 })
        await writeFile(path.join(bundlePath, 'foreign.txt'), 'foreign directory', { mode: 0o600 })
      },
      createId: () => id,
    })
    await assert.rejects(repository.publish(await literalPreparedSmartPatchInputMaterial()), {
      code: 'SMART_PATCH_INPUT_PUBLICATION_UNCERTAIN',
    })
    assert.equal(
      await readFile(path.join(repositoryRoot(dataRoot), id, 'foreign.txt'), 'utf8'),
      'foreign directory',
    )
    assert.ok((await readdir(moved)).includes('source.png'))
  })
})

test('exact discard checks the manifest identity and preserves neighbors and ordinary queue data', async () => {
  await fixture(async ({ dataRoot }) => {
    const repository = new SmartPatchInputBundleRepository(dataRoot)
    const material = await literalPreparedSmartPatchInputMaterial()
    const first = await repository.publish(material)
    const neighbor = await repository.publish(material)
    await assert.rejects(repository.discard(first.id, 'f'.repeat(64)), {
      code: 'SMART_PATCH_INPUT_INVALID',
    })
    assert.deepEqual(materialSummary(await repository.load(first.id)), materialSummary(material))
    await repository.discard(first.id, first.manifestSha256)
    assert.equal(existsSync(path.join(repositoryRoot(dataRoot), first.id)), false)
    assert.deepEqual(materialSummary(await repository.load(neighbor.id)), materialSummary(material))
    assert.deepEqual(await readdir(repositoryRoot(dataRoot)), [neighbor.id])
  })
})

for (const name of ['manifest.json', 'source.png'] as const) {
  test(`exact discard preserves same-inode changed ${name} after qualification instead of deleting stale ownership`, async () => {
    await fixture(async ({ dataRoot }) => {
      const material = await literalPreparedSmartPatchInputMaterial()
      const published = await new SmartPatchInputBundleRepository(dataRoot).publish(material)
      const directory = path.join(repositoryRoot(dataRoot), published.id)
      const filePath = path.join(directory, name)
      const original = await readFile(filePath)
      const before = await lstat(filePath, { bigint: true })
      const membersBefore = (await readdir(directory)).sort()
      let changed!: Buffer
      let entered = false
      const repository = new SmartPatchInputBundleRepository(dataRoot, {
        beforeDiscardCommit: async () => {
          entered = true
          if (name === 'source.png') {
            changed = differentValidSameSizePng(original)
          } else {
            const manifest = JSON.parse(
              original.toString('utf8'),
            ) as SmartPatchInputMaterial['manifest']
            manifest.context.bbox.x++
            changed = Buffer.from(JSON.stringify(manifest))
          }
          assert.equal(
            changed.length,
            original.length,
            'The real in-place overwrite preserves byte size',
          )
          assert.notEqual(sha256(changed), sha256(original))
          await writeFile(filePath, changed)
          const after = await lstat(filePath, { bigint: true })
          assert.equal(after.dev, before.dev)
          assert.equal(after.ino, before.ino, 'The file is overwritten in place, not replaced')
          assert.equal(after.size, before.size)
          assert.ok(after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs)
        },
      })
      await assert.rejects(repository.discard(published.id, published.manifestSha256), {
        code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
      })
      assert.equal(entered, true, 'The fault occurs after actual complete input qualification')
      assert.ok(
        (await readFile(filePath)).equals(changed),
        'Exact discard must preserve the changed actual bytes',
      )
      assert.deepEqual(
        (await readdir(directory)).sort(),
        membersBefore,
        'No commit marker or payload is removed on stale ownership',
      )
      assert.ok(existsSync(path.join(directory, 'manifest.json')))
      await writeFile(filePath, original)
      await new SmartPatchInputBundleRepository(dataRoot).discard(
        published.id,
        published.manifestSha256,
      )
      assert.equal(
        existsSync(directory),
        false,
        'A freshly qualified unchanged neighbor still discards normally',
      )
    })
  })
}

test('load and discard refuse foreign or missing members without deleting any retained bytes', async () => {
  await fixture(async ({ dataRoot }) => {
    const repository = new SmartPatchInputBundleRepository(dataRoot)
    const published = await repository.publish(await literalPreparedSmartPatchInputMaterial())
    const directory = path.join(repositoryRoot(dataRoot), published.id)
    const foreign = path.join(directory, 'foreign.txt')
    await writeFile(foreign, 'never owned by this bundle', { mode: 0o600 })
    await assert.rejects(repository.load(published.id), {
      code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
    })
    await assert.rejects(repository.discard(published.id), {
      code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
    })
    assert.equal(await readFile(foreign, 'utf8'), 'never owned by this bundle')
    await unlink(foreign)
    await unlink(path.join(directory, 'source.png'))
    await assert.rejects(repository.load(published.id), {
      code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
    })
    assert.ok(existsSync(path.join(directory, 'manifest.json')))
  })
})

test('symlinked storage ancestors or member paths cannot cross the prepared-input root', async () => {
  await fixture(async ({ dataRoot, root }) => {
    const outside = path.join(root, 'outside')
    await mkdir(outside, { mode: 0o700 })
    await symlink(outside, path.join(dataRoot, 'generation-prepared-inputs'))
    await assert.rejects(
      new SmartPatchInputBundleRepository(dataRoot).publish(
        await literalPreparedSmartPatchInputMaterial(),
      ),
      { code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE' },
    )
    assert.deepEqual(await readdir(outside), [])
    await unlink(path.join(dataRoot, 'generation-prepared-inputs'))
    const repository = new SmartPatchInputBundleRepository(dataRoot)
    const published = await repository.publish(await literalPreparedSmartPatchInputMaterial())
    const source = path.join(repositoryRoot(dataRoot), published.id, 'source.png')
    const original = await readFile(source)
    const external = path.join(outside, 'source.png')
    await writeFile(external, original, { mode: 0o600 })
    await unlink(source)
    await symlink(external, source)
    await assert.rejects(repository.load(published.id), {
      code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
    })
    await assert.rejects(repository.discard(published.id), {
      code: 'SMART_PATCH_INPUT_STORAGE_UNSAFE',
    })
    assert.ok((await readFile(external)).equals(original))
  })
})

test('hard-linked payloads and unsafe file permissions are rejected rather than repaired silently', async () => {
  await fixture(async ({ dataRoot, root }) => {
    const repository = new SmartPatchInputBundleRepository(dataRoot)
    const published = await repository.publish(await literalPreparedSmartPatchInputMaterial())
    const source = path.join(repositoryRoot(dataRoot), published.id, 'source.png')
    const external = path.join(root, 'external-hardlink.png')
    await link(source, external)
    await assert.rejects(repository.load(published.id), { code: 'SMART_PATCH_INPUT_INVALID' })
    await assert.rejects(repository.discard(published.id), { code: 'SMART_PATCH_INPUT_INVALID' })
    assert.ok(existsSync(external))
    await unlink(external)
    await chmod(source, 0o644)
    await assert.rejects(repository.load(published.id), { code: 'SMART_PATCH_INPUT_INVALID' })
    assert.equal((await lstat(source)).mode & 0o777, 0o644)
  })
})

for (const malformed of ['metadata', 'oversized', 'traversal'] as const) {
  test(`fresh load refuses ${malformed} manifest without a cleanup sweep`, async () => {
    await fixture(async ({ dataRoot }) => {
      const repository = new SmartPatchInputBundleRepository(dataRoot)
      const published = await repository.publish(await literalPreparedSmartPatchInputMaterial())
      const manifestPath = path.join(repositoryRoot(dataRoot), published.id, 'manifest.json')
      const original = await readFile(manifestPath)
      const manifest = JSON.parse(original.toString('utf8')) as Record<string, unknown>
      if (malformed === 'metadata') {
        manifest.unexpected = true
      }
      if (malformed === 'traversal') {
        manifest.files = { '../source.png': published.manifest.files['source.png'] }
      }
      const bytes =
        malformed === 'oversized'
          ? Buffer.alloc(128 * 1024 + 1, 32)
          : Buffer.from(JSON.stringify(manifest))
      await writeFile(manifestPath, bytes)
      await assert.rejects(repository.load(published.id), { code: 'SMART_PATCH_INPUT_INVALID' })
      assert.ok((await readFile(manifestPath)).equals(bytes))
      await writeFile(manifestPath, original)
      assert.equal((await repository.load(published.id)).manifestSha256, published.manifestSha256)
    })
  })
}

test('incomplete reservations stay untouched across new repository owners and unrelated publication', async () => {
  await fixture(async ({ dataRoot }) => {
    const repository = new SmartPatchInputBundleRepository(dataRoot)
    const healthy = await repository.publish(await literalPreparedSmartPatchInputMaterial())
    const id = randomUUID()
    const incomplete = path.join(repositoryRoot(dataRoot), id)
    await mkdir(incomplete, { mode: 0o700 })
    await writeFile(path.join(incomplete, 'source.png'), 'retained incomplete data', {
      mode: 0o600,
    })
    await assert.rejects(new SmartPatchInputBundleRepository(dataRoot).load(id), {
      code: 'SMART_PATCH_INPUT_NOT_FOUND',
    })
    await assert.rejects(new SmartPatchInputBundleRepository(dataRoot).discard(id), {
      code: 'SMART_PATCH_INPUT_NOT_FOUND',
    })
    const second = await new SmartPatchInputBundleRepository(dataRoot).publish(
      await literalPreparedSmartPatchInputMaterial(),
    )
    assert.notEqual(second.id, healthy.id)
    assert.equal(
      await readFile(path.join(incomplete, 'source.png'), 'utf8'),
      'retained incomplete data',
    )
    for (const invalid of ['../outside', '', 'not-a-uuid']) {
      await assert.rejects(repository.load(invalid), { code: 'SMART_PATCH_INPUT_INVALID' })
      await assert.rejects(repository.discard(invalid), { code: 'SMART_PATCH_INPUT_INVALID' })
    }
  })
})
