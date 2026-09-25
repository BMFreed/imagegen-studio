import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { ANIMA_QWEN3_0_6B_ENCODER } from './anima-manifest.js'
import { ModelDownloader, ModelDownloadError, requestPinnedHttps } from './model-downloader.js'

const FILE_URL = 'https://civitai.com/api/download/models/7?fileId=701'
const PUBLIC_ADDRESSES = async () => ['1.1.1.1']
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex')

async function withStaging(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'igs-model-download-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function withLocalHttps(
  run: (url: URL, caPath: string) => Promise<void>,
  bindAddress = '127.0.0.2',
): Promise<void> {
  // These checked-in certificates belong only to this loopback test server.
  const [cert, key] = await Promise.all(
    ['downloader-server.pem', 'downloader-server.key'].map((name) =>
      readFile(new URL(`./test-fixtures/${name}`, import.meta.url), 'utf8'),
    ),
  )
  const server = createServer({ cert, key }, (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end('verified bytes')
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, bindAddress, resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    await run(
      new URL(`https://localhost:${address.port}/artifact`),
      fileURLToPath(new URL('./test-fixtures/downloader-ca.pem', import.meta.url)),
    )
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }
}

async function trustedRequest(
  url: URL,
  address: string,
  caPath: string,
  autoSelectFamily = true,
): Promise<unknown> {
  const harnessPath = fileURLToPath(
    new URL('./test-fixtures/pinned-https-child.ts', import.meta.url),
  )
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', harnessPath, url.href, address, String(autoSelectFamily)],
    {
      env: { ...process.env, NODE_EXTRA_CA_CERTS: caPath },
      timeout: 5000,
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk
  })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  assert.equal(exitCode, 0, stderr)
  return JSON.parse(stdout) as unknown
}

function fileResponse(content: string, length = Buffer.byteLength(content)): Response {
  return new Response(content, {
    headers: { 'content-length': String(length), 'content-type': 'application/octet-stream' },
  })
}

async function expectDownloadError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ModelDownloadError)
    assert.equal(error.code, code)
    assert.doesNotMatch(error.message, /civitai\.com|huggingface\.co|secret-token|signed-query/)
    return true
  })
}

test('real pinned HTTPS transport rejects an untrusted certificate', async () => {
  await withLocalHttps(async (url) => {
    await assert.rejects(requestPinnedHttps(url, {}, '127.0.0.2'), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(
        ['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        ),
      )
      return true
    })
  })
})

test('real pinned HTTPS transport reaches the checked IP while verifying the hostname', async () => {
  await withLocalHttps(async (url, caPath) => {
    for (const autoSelectFamily of [true, false]) {
      assert.deepEqual(await trustedRequest(url, '127.0.0.2', caPath, autoSelectFamily), {
        body: 'verified bytes',
        ok: true,
        status: 200,
      })
    }
    assert.deepEqual(await trustedRequest(url, '127.0.0.1', caPath), {
      code: 'ECONNREFUSED',
      ok: false,
    })
  })
})

test('a trusted CA does not authorize a different hostname', async () => {
  await withLocalHttps(async (url, caPath) => {
    url.hostname = 'other.example'
    assert.deepEqual(await trustedRequest(url, '127.0.0.2', caPath), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      ok: false,
    })
  })
})

test('real pinned HTTPS transport handles an IPv6 checked address', async () => {
  await withLocalHttps(async (url, caPath) => {
    assert.deepEqual(await trustedRequest(url, '::1', caPath), {
      body: 'verified bytes',
      ok: true,
      status: 200,
    })
  }, '::1')
})

test('streams and hashes the selected file, sending Bearer only to CivitAI before a CDN redirect', async () => {
  await withStaging(async (stagingDirectory) => {
    const requests: { auth: string | null; url: string }[] = []
    const transport: typeof fetch = async (url, options) => {
      requests.push({
        auth: new Headers(options?.headers).get('Authorization'),
        url: String(url),
      })
      if (requests.length === 1) {
        return new Response(null, {
          headers: { location: 'https://cdn.example.com/model?sig=signed-query' },
          status: 302,
        })
      }
      return fileResponse('verified bytes')
    }
    const progress: number[] = []
    const downloaded = await new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport,
    }).download({
      bearerToken: 'secret-token',
      expectedSha256: sha256('verified bytes'),
      onProgress: ({ downloadedBytes }) => progress.push(downloadedBytes),
      source: 'civitai',
      stagingDirectory,
      url: FILE_URL,
    })

    assert.deepEqual(requests, [
      { auth: 'Bearer secret-token', url: FILE_URL },
      { auth: null, url: 'https://cdn.example.com/model?sig=signed-query' },
    ])
    assert.equal(await readFile(downloaded.stagingPath, 'utf8'), 'verified bytes')
    assert.equal(downloaded.sha256, sha256('verified bytes'))
    assert.equal(downloaded.sizeBytes, 14)
    assert.deepEqual(progress, [14])
    assert.equal((await stat(downloaded.stagingPath)).mode & 0o777, 0o600)
  })
})

test('a short response fails the Content-Length check and leaves no staging file', async () => {
  await withStaging(async (stagingDirectory) => {
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => fileResponse('abc', 4),
    })
    await expectDownloadError(
      downloader.download({
        bearerToken: 'secret-token',
        source: 'civitai',
        stagingDirectory,
        url: FILE_URL,
      }),
      'DOWNLOAD_SIZE_MISMATCH',
    )
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('a mismatched expected hash rejects the file and cleans staging', async () => {
  await withStaging(async (stagingDirectory) => {
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => fileResponse('abc'),
    })
    await expectDownloadError(
      downloader.download({
        bearerToken: 'secret-token',
        expectedSha256: '0'.repeat(64),
        source: 'civitai',
        stagingDirectory,
        url: FILE_URL,
      }),
      'DOWNLOAD_HASH_MISMATCH',
    )
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('cancel after first progress signal stops the job and removes the partial file', async () => {
  await withStaging(async (stagingDirectory) => {
    const signal = new AbortController()
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new TextEncoder().encode('part one'))
              stream.enqueue(new TextEncoder().encode('part two'))
              stream.close()
            },
          }),
          { headers: { 'content-type': 'application/octet-stream' } },
        ),
    })
    await expectDownloadError(
      downloader.download({
        bearerToken: 'secret-token',
        onProgress: () => signal.abort(),
        signal: signal.signal,
        source: 'civitai',
        stagingDirectory,
        url: FILE_URL,
      }),
      'DOWNLOAD_CANCELED',
    )
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('refuses local, private-DNS and non-HTTPS redirects before another request', async () => {
  for (const location of [
    'https://127.0.0.1/file',
    'https://internal.example.com/file',
    'https://localhost/file',
    'http://cdn.example.com/file',
  ]) {
    await withStaging(async (stagingDirectory) => {
      let requests = 0
      const downloader = new ModelDownloader({
        resolveAddresses: async (hostname) =>
          hostname === 'internal.example.com' ? ['192.168.1.20'] : ['1.1.1.1'],
        transport: async () => {
          requests++
          return new Response(null, { headers: { location }, status: 302 })
        },
      })
      await expectDownloadError(
        downloader.download({
          bearerToken: 'secret-token',
          source: 'civitai',
          stagingDirectory,
          url: FILE_URL,
        }),
        location.startsWith('http:') ? 'DOWNLOAD_INVALID_URL' : 'DOWNLOAD_UNSAFE_DESTINATION',
      )
      assert.equal(requests, 1)
      assert.deepEqual(await readdir(stagingDirectory), [])
    })
  }
})

test('a pinned Anima URL downloads without CivitAI authorization; arbitrary HF paths are refused', async () => {
  await withStaging(async (stagingDirectory) => {
    let authorization: string | null = 'not-read'
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async (_url, options) => {
        authorization = new Headers(options?.headers).get('Authorization')
        return fileResponse('abc')
      },
    })
    const result = await downloader.download({
      expectedBytes: 3,
      expectedSha256: sha256('abc'),
      source: 'anima-huggingface',
      stagingDirectory,
      url: ANIMA_QWEN3_0_6B_ENCODER.url,
    })
    assert.equal(authorization, null)
    assert.equal(result.sizeBytes, 3)
    await expectDownloadError(
      downloader.download({
        source: 'anima-huggingface',
        stagingDirectory,
        url: 'https://huggingface.co/other/repo/resolve/main/file',
      }),
      'DOWNLOAD_INVALID_SOURCE',
    )
  })
})

test('header timeout is reported without exposing the file URL or token', async () => {
  await withStaging(async (stagingDirectory) => {
    const downloader = new ModelDownloader({
      headerTimeoutMs: 10,
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('secret-token')))
        }),
    })
    await expectDownloadError(
      downloader.download({
        bearerToken: 'secret-token',
        source: 'civitai',
        stagingDirectory,
        url: FILE_URL,
      }),
      'DOWNLOAD_TIMEOUT',
    )
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('an idle body times out and cleans a partially written file', async () => {
  await withStaging(async (stagingDirectory) => {
    const downloader = new ModelDownloader({
      idleTimeoutMs: 10,
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new TextEncoder().encode('partial'))
            },
          }),
        ),
    })
    await expectDownloadError(
      downloader.download({
        bearerToken: 'secret-token',
        source: 'civitai',
        stagingDirectory,
        url: FILE_URL,
      }),
      'DOWNLOAD_TIMEOUT',
    )
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('a file beyond the unknown-size safety cap is refused before staging', async () => {
  await withStaging(async (stagingDirectory) => {
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => fileResponse('abc', 32 * 1024 * 1024 * 1024 + 1),
    })
    await expectDownloadError(
      downloader.download({
        bearerToken: 'secret-token',
        source: 'civitai',
        stagingDirectory,
        url: FILE_URL,
      }),
      'DOWNLOAD_TOO_LARGE',
    )
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})
