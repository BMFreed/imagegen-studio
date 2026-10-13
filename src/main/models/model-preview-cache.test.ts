import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay, setImmediate as nextTurn } from 'node:timers/promises'

import type { ProjectWorkerClient, VerifiedWorkerImage } from '../projects/worker-client.js'

import { ModelPreviewCache, type ModelPreviewCacheOptions } from './model-preview-cache.js'

const SOURCE_URL = 'https://image.civitai.com/one/source.png'
const SECOND_URL = 'https://image.civitai.com/two/source.png'
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
type Worker = Pick<ProjectWorkerClient, 'createResourcePreview'>
type Input = Parameters<Worker['createResourcePreview']>[0]

async function withFixture(
  run: (fixture: {
    directory: string
    options: ModelPreviewCacheOptions
    preview: Buffer
    source: Buffer
    thumbnail: Buffer
    worker: Worker
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-model-preview-'))
  try {
    const source = await readFile(new URL('../projects/placeholders/empty.png', import.meta.url))
    const thumbnail = await readFile(
      new URL('../projects/test-fixtures/candidate-thumbnail-64x64.webp', import.meta.url),
    )
    const preview = await readFile(
      new URL('../projects/test-fixtures/candidate-thumbnail-256x128.webp', import.meta.url),
    )
    const worker: Worker = {
      createResourcePreview: async (input) => {
        assert.equal(input.previewMaxSide, 512)
        assert.equal(input.thumbnailMaxSide, 96)
        assert.equal(input.inputSha256, sha256(source))
        assert.deepEqual(await readFile(input.inputPath), source)
        await writeFile(input.previewWebpPath, preview)
        await writeFile(input.thumbnailWebpPath, thumbnail)
        return {
          preview: image(input.previewWebpPath, preview, 256, 128),
          thumbnail: image(input.thumbnailWebpPath, thumbnail, 64, 64),
        }
      },
    }
    const options: ModelPreviewCacheOptions = {
      cacheRoot: path.join(directory, 'cache'),
      fetchSource: async () => `data:image/png;base64,${source.toString('base64')}`,
      scratchRoot: path.join(directory, 'scratch'),
      withWorker: async (use) => use(worker),
    }
    await run({ directory, options, preview, source, thumbnail, worker })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function image(
  filePath: string,
  bytes: Buffer,
  width: number,
  height: number,
): VerifiedWorkerImage {
  return {
    byteSize: bytes.length,
    colorSpace: 'srgb',
    height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    path: filePath,
    sha256: sha256(bytes),
    width,
  }
}

function cacheDirectory(options: ModelPreviewCacheOptions): string {
  return path.join(options.cacheRoot, 'model-resource-previews-v1')
}

async function entry(
  options: ModelPreviewCacheOptions,
  url = SOURCE_URL,
): Promise<{ entryPath: string; metadata: Record<string, unknown>; metadataPath: string }> {
  const metadataPath = path.join(cacheDirectory(options), `${sha256(Buffer.from(url))}.json`)
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>
  return {
    entryPath: path.join(cacheDirectory(options), String(metadata.entryName)),
    metadata,
    metadataPath,
  }
}

// Production boundary: Main cache -> real files/stream validation -> fresh offline service.
// The worker collaborator supplies actual pinned WebP media, not assertions defined by the test.
test('verified worker previews survive reopen offline and retain bounded source bytes', async () => {
  await withFixture(async ({ options, preview, source, thumbnail }) => {
    const initial = await new ModelPreviewCache(options).get(SOURCE_URL)
    assert.deepEqual(initial, {
      previewDataUrl: `data:image/webp;base64,${preview.toString('base64')}`,
      thumbnailDataUrl: `data:image/webp;base64,${thumbnail.toString('base64')}`,
    })
    const saved = await entry(options)
    assert.deepEqual(await readFile(path.join(saved.entryPath, 'source.bin')), source)
    assert.equal(saved.metadata.sourceUrlSha256, sha256(Buffer.from(SOURCE_URL)))
    assert.equal(JSON.stringify(saved.metadata).includes(SOURCE_URL), false)
    const reopened = new ModelPreviewCache({
      ...options,
      fetchSource: async () => {
        throw new Error('offline source must not be fetched')
      },
      withWorker: async () => {
        throw new Error('offline cache must not acquire the worker')
      },
    })
    assert.deepEqual(await reopened.get(SOURCE_URL), initial)
    assert.deepEqual(await readdir(options.scratchRoot), [])
  })
})

test('concurrent reads coalesce one source fetch and one worker request', async () => {
  await withFixture(async ({ options, worker }) => {
    let fetched = 0
    let worked = 0
    const cache = new ModelPreviewCache({
      ...options,
      fetchSource: async (url) => {
        fetched++
        return options.fetchSource(url)
      },
      withWorker: async (use) => {
        worked++
        return use(worker)
      },
    })
    const results = await Promise.all([
      cache.get(SOURCE_URL),
      cache.get(SOURCE_URL),
      cache.get(SOURCE_URL),
    ])
    assert.ok(results[0])
    assert.deepEqual(results[0], results[1])
    assert.deepEqual(results[1], results[2])
    assert.equal(fetched, 1)
    assert.equal(worked, 1)
  })
})

test('two source URLs never share another identity’s published cache entry', async () => {
  await withFixture(async ({ options }) => {
    const cache = new ModelPreviewCache(options)
    assert.ok(await cache.get(SOURCE_URL))
    const offline = new ModelPreviewCache({ ...options, withWorker: async () => null })
    assert.equal(await offline.read(SECOND_URL), null)
    assert.ok(await cache.get(SECOND_URL))
    const first = await entry(options)
    const second = await entry(options, SECOND_URL)
    assert.notEqual(first.entryPath, second.entryPath)
    assert.notEqual(first.metadata.sourceUrlSha256, second.metadata.sourceUrlSha256)
  })
})

test('missing worker does not fetch a source and bounded backoff expires despite intervening reads', async () => {
  await withFixture(async ({ options, worker }) => {
    let now = 1000
    let available = false
    let fetched = 0
    let acquired = 0
    const cache = new ModelPreviewCache({
      ...options,
      canBuild: async () => available,
      fetchSource: async (url) => {
        fetched++
        return options.fetchSource(url)
      },
      now: () => now,
      withWorker: async (use) => {
        acquired++
        return available ? use(worker) : null
      },
    })
    assert.equal(await cache.get(SOURCE_URL), null)
    assert.equal(fetched, 0)
    available = true
    now += 29_000
    assert.equal(await cache.get(SOURCE_URL), null)
    assert.equal(acquired, 0)
    now += 1001
    assert.ok(await cache.get(SOURCE_URL))
    assert.equal(acquired, 1)
    assert.equal(fetched, 1)
  })
})

test('untrusted source URL is refused before fetch or worker acquisition', async () => {
  await withFixture(async ({ options }) => {
    let fetched = 0
    let acquired = 0
    const cache = new ModelPreviewCache({
      ...options,
      fetchSource: async () => {
        fetched++
        return null
      },
      withWorker: async () => {
        acquired++
        return null
      },
    })
    for (const url of [
      'https://internal.local/a.png',
      'http://image.civitai.com/a.png',
      'https://user:password@image.civitai.com/a.png',
      'https://image.civitai.com:8443/a.png',
    ]) {
      assert.equal(await cache.get(url), null)
    }
    assert.equal(fetched, 0)
    assert.equal(acquired, 0)
  })
})

for (const invalidSource of [
  'data:image/png;base64,not-base64',
  'data:image/png;base64,aGVsbG8=',
  `data:image/png;base64,${Buffer.alloc(1_000_001).toString('base64')}`,
]) {
  test(`invalid or oversized source does not reach the worker (${invalidSource.length} chars)`, async () => {
    await withFixture(async ({ options }) => {
      let worked = 0
      const cache = new ModelPreviewCache({
        ...options,
        fetchSource: async () => invalidSource,
        withWorker: async (use) =>
          use({
            createResourcePreview: async () => {
              worked++
              throw new Error('must not process invalid source')
            },
          }),
      })
      assert.equal(await cache.get(SOURCE_URL), null)
      assert.equal(worked, 0)
      assert.deepEqual(await readdir(options.cacheRoot).catch(() => []), [])
    })
  })
}

for (const fault of [
  'throw',
  'hash',
  'dimensions',
  'profile',
  'path',
  'source-change',
  'malformed-media',
] as const) {
  test(`worker failure/dishonest ${fault} cannot publish metadata or leave scratch payload`, async () => {
    await withFixture(async ({ options, worker }) => {
      const cache = new ModelPreviewCache({
        ...options,
        withWorker: async (use) =>
          use({
            createResourcePreview: async (input: Input) => {
              if (fault === 'throw') {
                throw new Error('worker unavailable')
              }
              const output = await worker.createResourcePreview(input)
              if (fault === 'hash') {
                output.preview.sha256 = '0'.repeat(64)
              }
              if (fault === 'dimensions') {
                output.preview.width = 255
              }
              if (fault === 'profile') {
                output.preview.iccSha256 = '0'.repeat(64)
              }
              if (fault === 'path') {
                output.preview.path = path.join(options.cacheRoot, 'outside.webp')
              }
              if (fault === 'source-change') {
                await writeFile(input.inputPath, 'different source')
              }
              if (fault === 'malformed-media') {
                const invalid = Buffer.from('not a WebP')
                await writeFile(input.previewWebpPath, invalid)
                output.preview.byteSize = invalid.length
                output.preview.sha256 = sha256(invalid)
              }
              return output
            },
          }),
      })
      assert.equal(await cache.get(SOURCE_URL), null)
      assert.deepEqual(await readdir(options.cacheRoot).catch(() => []), [])
      assert.deepEqual(await readdir(options.scratchRoot), [])
    })
  })
}

test('corrupt derivative is refused offline and regenerated from cached source without network', async () => {
  await withFixture(async ({ options, worker }) => {
    const baseline = await new ModelPreviewCache(options).get(SOURCE_URL)
    const saved = await entry(options)
    await writeFile(path.join(saved.entryPath, 'preview.webp'), 'corrupt')
    const offline = new ModelPreviewCache({ ...options, withWorker: async () => null })
    assert.equal(await offline.read(SOURCE_URL), null)
    const rebuild = new ModelPreviewCache({
      ...options,
      fetchSource: async () => {
        throw new Error('cached source must be reused')
      },
      withWorker: async (use) => use(worker),
    })
    assert.deepEqual(await rebuild.get(SOURCE_URL), baseline)
    assert.notEqual((await entry(options)).entryPath, saved.entryPath)
    await assert.rejects(readFile(path.join(saved.entryPath, 'source.bin')), { code: 'ENOENT' })
  })
})

test('cache media is validated even when tampered hash and length match metadata', async () => {
  await withFixture(async ({ options }) => {
    assert.ok(await new ModelPreviewCache(options).get(SOURCE_URL))
    const saved = await entry(options)
    const invalid = Buffer.from('invalid WebP but matching metadata hash')
    await writeFile(path.join(saved.entryPath, 'preview.webp'), invalid)
    saved.metadata.preview = {
      byteSize: invalid.length,
      height: 128,
      sha256: sha256(invalid),
      width: 256,
    }
    await writeFile(saved.metadataPath, JSON.stringify(saved.metadata))
    assert.equal(
      await new ModelPreviewCache({ ...options, withWorker: async () => null }).read(SOURCE_URL),
      null,
    )
  })
})

test('cache metadata cannot navigate outside its URL namespace', async () => {
  await withFixture(async ({ options }) => {
    assert.ok(await new ModelPreviewCache(options).get(SOURCE_URL))
    const saved = await entry(options)
    saved.metadata.entryName = '../../outside'
    await writeFile(saved.metadataPath, JSON.stringify(saved.metadata))
    assert.equal(
      await new ModelPreviewCache({ ...options, withWorker: async () => null }).read(SOURCE_URL),
      null,
    )
  })
})

test('symlink cache ancestor does not receive external writes', async () => {
  await withFixture(async ({ directory, options }) => {
    const external = path.join(directory, 'external')
    await mkdir(external)
    await symlink(external, options.cacheRoot)
    assert.equal(await new ModelPreviewCache(options).get(SOURCE_URL), null)
    assert.deepEqual(await readdir(external), [])
  })
})

test('symlink cached source/metadata/media refuses offline reads', async () => {
  for (const member of ['source.bin', 'preview.webp', 'metadata.json']) {
    await withFixture(async ({ directory, options }) => {
      assert.ok(await new ModelPreviewCache(options).get(SOURCE_URL))
      const saved = await entry(options)
      const target =
        member === 'metadata.json' ? saved.metadataPath : path.join(saved.entryPath, member)
      const external = path.join(directory, 'external')
      await writeFile(external, await readFile(target))
      await rm(target)
      await symlink(external, target)
      assert.equal(
        await new ModelPreviewCache({ ...options, withWorker: async () => null }).read(SOURCE_URL),
        null,
      )
    })
  }
})

test('operational read neither builds an uncached image nor delays the next explicit build', async () => {
  await withFixture(async ({ options, worker }) => {
    let fetched = 0
    let worked = 0
    const cache = new ModelPreviewCache({
      ...options,
      fetchSource: async (url) => {
        fetched++
        return options.fetchSource(url)
      },
      withWorker: async (use) => {
        worked++
        return use(worker)
      },
    })
    assert.equal(await cache.read(SOURCE_URL), null)
    assert.equal(fetched, 0)
    assert.equal(worked, 0)
    assert.ok(await cache.get(SOURCE_URL))
    assert.equal(fetched, 1)
    assert.equal(worked, 1)
  })
})

test('new builds serialize their network work outside the worker lease and cached reads bypass them', async () => {
  await withFixture(async ({ options, worker }) => {
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let fetched = 0
    let worked = 0
    let fetching = 0
    let peak = 0
    const cache = new ModelPreviewCache({
      ...options,
      fetchSource: async (url) => {
        fetched++
        fetching++
        peak = Math.max(peak, fetching)
        try {
          if (url === SOURCE_URL) {
            enter()
            await gate
          }
          return await options.fetchSource(url)
        } finally {
          fetching--
        }
      },
      withWorker: async (use) => {
        assert.equal(fetching, 0, 'network download must not run within the image-worker lease')
        worked++
        return use(worker)
      },
    })
    const cachedUrl = 'https://image.civitai.com/already/published.png'
    const cached = await cache.get(cachedUrl)
    assert.ok(cached)
    fetched = 0
    worked = 0
    const first = cache.get(SOURCE_URL)
    let second: Promise<unknown> | null = null
    try {
      await Promise.race([
        entered,
        delay(1000).then(() => {
          throw new Error('source fetch did not start')
        }),
      ])
      second = cache.get(SECOND_URL)
      for (let turn = 0; turn < 5; turn++) {
        await nextTurn()
      }
      assert.equal(fetched, 1)
      assert.equal(worked, 0)
      assert.deepEqual(
        await Promise.race([cache.get(cachedUrl), delay(1000).then(() => null)]),
        cached,
      )
    } finally {
      release()
      await Promise.all([first, second])
    }
    assert.equal(fetched, 2)
    assert.equal(worked, 2)
    assert.equal(peak, 1)
    assert.ok(await cache.read(SOURCE_URL))
    assert.ok(await cache.read(SECOND_URL))
  })
})

test('worker bytes with an altered ICC profile are refused even when the claimed file hash matches', async () => {
  await withFixture(async ({ options, worker }) => {
    const cache = new ModelPreviewCache({
      ...options,
      withWorker: async (use) =>
        use({
          createResourcePreview: async (input) => {
            const output = await worker.createResourcePreview(input)
            const bytes = await readFile(input.previewWebpPath)
            const icc = bytes.indexOf(Buffer.from('ICCP'))
            assert.ok(icc >= 12)
            bytes[icc + 8] = bytes[icc + 8] ^ 1
            await writeFile(input.previewWebpPath, bytes)
            output.preview.sha256 = sha256(bytes)
            return output
          },
        }),
    })
    assert.equal(await cache.get(SOURCE_URL), null)
    assert.deepEqual(await readdir(options.cacheRoot).catch(() => []), [])
  })
})
