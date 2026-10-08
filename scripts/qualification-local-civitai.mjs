/** Local bytes replace only CivitAI transport for developer qualification; no account token lookup. */
import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { officialEpsilonIdentity } from './noobai-noise-qualification.mjs'

export const localQualificationToken = 'imagegen-local-qualification-only-not-an-account-token'
const pinnedQualificationUrls = [
  officialEpsilonIdentity.origin.url,
  'https://civitai.com/api/download/models/2031703?fileId=1934353',
]

/**
 * Caller passes the production ModelDownloader constructor. The actual downloader still owns
 * public-address validation, authenticated-source admission, bounded staging and byte/hash checks.
 * Its transport is fully intercepted and checks the explicit fake token before opening local bytes.
 * A verified staged file is the only result; publication remains the caller's later operation.
 */
export async function stageLocalCivitaiQualification({
  ModelDownloader,
  source,
  stagingDirectory,
  onTransport = () => {},
}) {
  assert.ok(
    pinnedQualificationUrls.includes(source.url),
    'Local adoption must use a pinned exact qualification CivitAI file URL.',
  )
  assert.ok(path.isAbsolute(source.path) && path.normalize(source.path) === source.path)
  const entry = await lstat(source.path)
  assert.ok(entry.isFile() && !entry.isSymbolicLink())
  assert.equal(await realpath(source.path), source.path)
  assert.equal(entry.size, source.byteSize)
  let transportCalls = 0
  const downloader = new ModelDownloader({
    totalTimeoutMs: 180_000,
    resolveAddresses: async () => ['104.26.9.153'],
    transport: async (url, options) => {
      assert.equal(String(url), source.url)
      const authorization = new Headers(options.headers).get('authorization')
      assert.equal(
        authorization,
        `Bearer ${localQualificationToken}`,
        'Only the declared fake local token may enter the intercepted qualification transport.',
      )
      transportCalls++
      onTransport({ url: String(url), authorization })
      const sourceStream = createReadStream(source.path)
      return new Response(Readable.toWeb(sourceStream), {
        status: 200,
        headers: {
          'content-length': String(source.byteSize),
          'content-type': 'application/octet-stream',
        },
      })
    },
  })
  const verified = await downloader.download({
    source: 'civitai',
    bearerToken: localQualificationToken,
    stagingDirectory,
    url: source.url,
    expectedBytes: source.byteSize,
    expectedSha256: source.sha256,
  })
  assert.equal(verified.sha256, source.sha256)
  assert.equal(verified.sizeBytes, source.byteSize)
  assert.equal(transportCalls, 1)
  return {
    verified,
    transportCalls,
    credentialBoundary:
      'Explicit fake token used only in the fully intercepted local transport; no real account token lookup or network delivery.',
  }
}
