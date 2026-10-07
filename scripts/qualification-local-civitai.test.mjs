/** Actual Main ModelDownloader admission/staging with 100 local bytes and intercepted transport. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { tsImport } from 'tsx/esm/api'

import { officialEpsilonIdentity } from './noobai-noise-qualification.mjs'
import {
  localQualificationToken,
  stageLocalCivitaiQualification,
} from './qualification-local-civitai.mjs'

const { ModelDownloader } = await tsImport(
  '../src/main/models/model-downloader.ts',
  import.meta.url,
)

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-local-civitai-'))
  const bytes = Buffer.from(Array.from({ length: 100 }, (_, index) => (index * 17 + 1) % 256))
  const sourcePath = path.join(root, 'transport-byte-fixture.bin')
  const stagingDirectory = path.join(root, 'owned-staging')
  await fs.writeFile(sourcePath, bytes)
  const source = {
    path: sourcePath,
    url: officialEpsilonIdentity.origin.url,
    byteSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  try {
    await run({ root, bytes, source, stagingDirectory })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('local adoption enters actual authenticated Main downloader and returns exact verified staged bytes', async () => {
  await fixture(async ({ bytes, source, stagingDirectory }) => {
    const observed = []
    const { verified, transportCalls, credentialBoundary } = await stageLocalCivitaiQualification({
      ModelDownloader,
      source,
      stagingDirectory,
      onTransport: (event) => observed.push(event),
    })
    assert.equal(transportCalls, 1)
    assert.deepEqual(observed, [
      {
        url: officialEpsilonIdentity.origin.url,
        authorization: `Bearer ${localQualificationToken}`,
      },
    ])
    assert.equal(verified.sizeBytes, 100)
    assert.equal(verified.sha256, source.sha256)
    assert.ok(
      (await fs.readFile(verified.stagingPath)).equals(bytes),
      'Actual downloader must retain all exact local payload bytes.',
    )
    assert.ok((await fs.readFile(source.path)).equals(bytes), 'Read-only source must remain exact.')
    assert.deepEqual(await fs.readdir(stagingDirectory), [path.basename(verified.stagingPath)])
    assert.match(credentialBoundary, /no real account token lookup/)
  })
})

test('wrong hash is a real downloader refusal and removes its partial staging file', async () => {
  await fixture(async ({ bytes, source, stagingDirectory }) => {
    await assert.rejects(
      stageLocalCivitaiQualification({
        ModelDownloader,
        source: { ...source, sha256: '0'.repeat(64) },
        stagingDirectory,
      }),
      (error) => {
        assert.equal(error.code, 'DOWNLOAD_HASH_MISMATCH')
        return true
      },
    )
    assert.deepEqual(await fs.readdir(stagingDirectory), [])
    assert.ok((await fs.readFile(source.path)).equals(bytes))
  })
})

test('unpinned file URL refuses before creating staging or invoking any transport', async () => {
  await fixture(async ({ source, stagingDirectory }) => {
    let calls = 0
    await assert.rejects(
      stageLocalCivitaiQualification({
        ModelDownloader,
        source: { ...source, url: 'https://civitai.com/api/download/models/other' },
        stagingDirectory,
        onTransport: () => calls++,
      }),
      /pinned exact epsilon/,
    )
    assert.equal(calls, 0)
    await assert.rejects(fs.lstat(stagingDirectory), { code: 'ENOENT' })
  })
})
