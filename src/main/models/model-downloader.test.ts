import type { ServerResponse } from 'node:http'

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { LAMA_OUTPAINT_ARTIFACT } from '../runtime/lama-manifest.js'
import { ANIMA_QWEN3_0_6B_ENCODER } from './anima-manifest.js'
import {
  ModelDownloader,
  ModelDownloadError,
  type ModelDownloadInput,
  requestPinnedHttps,
} from './model-downloader.js'

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
  respond: (response: ServerResponse) => void = (response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end('verified bytes')
  },
): Promise<void> {
  // These checked-in certificates belong only to this loopback test server.
  const [cert, key] = await Promise.all(
    ['downloader-server.pem', 'downloader-server.key'].map((name) =>
      readFile(new URL(`./test-fixtures/${name}`, import.meta.url), 'utf8'),
    ),
  )
  const server = createServer({ cert, key }, (_request, response) => {
    respond(response)
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

async function unreadTrustedRequest(
  url: URL,
  caPath: string,
  beforeConsuming: () => Promise<void>,
): Promise<unknown> {
  const harnessPath = fileURLToPath(
    new URL('./test-fixtures/pinned-https-child.ts', import.meta.url),
  )
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', harnessPath, url.href, '127.0.0.2', 'true', 'unread'],
    {
      env: { ...process.env, NODE_EXTRA_CA_CERTS: caPath },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      timeout: 10_000,
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk
  })
  const exited = new Promise<number | null>((resolve) => {
    child.once('close', resolve)
  })
  const ready = new Promise<unknown>((resolve, reject) => {
    child.once('message', resolve)
    child.once('error', reject)
    child.once('close', (code) => {
      reject(new Error(`HTTPS child exited before unread handshake (${code}): ${stderr}`))
    })
  })
  try {
    assert.deepEqual(await ready, { kind: 'response-unread', status: 200 })
    await beforeConsuming()
    await new Promise<void>((resolve, reject) => {
      child.send({ kind: 'consume' }, (error) => (error ? reject(error) : resolve()))
    })
    assert.equal(await exited, 0, stderr)
    return JSON.parse(stdout) as unknown
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
    await exited
  }
}

function fileResponse(content: string, length = Buffer.byteLength(content)): Response {
  return new Response(content, {
    headers: { 'content-length': String(length), 'content-type': 'application/octet-stream' },
  })
}

function lamaDownload(stagingDirectory: string): ModelDownloadInput {
  return {
    expectedBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
    expectedSha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    source: 'invoke-lama',
    stagingDirectory,
    url: LAMA_OUTPAINT_ARTIFACT.url,
  }
}

/** Network substitute only: actual downloader hashes/writes bounded synthetic chunks. */
function syntheticBinaryResponse(byteSize: number, contentLength?: number): Response {
  const chunk = new Uint8Array(64 * 1024)
  let remaining = byteSize
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(stream) {
        if (remaining === 0) {
          stream.close()
          return
        }
        const length = Math.min(remaining, chunk.byteLength)
        stream.enqueue(chunk.subarray(0, length))
        remaining -= length
      },
    }),
    {
      headers: {
        ...(contentLength === undefined ? {} : { 'content-length': String(contentLength) }),
        'content-type': 'application/octet-stream',
      },
    },
  )
}

async function expectDownloadError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ModelDownloadError)
    assert.equal(error.code, code)
    assert.doesNotMatch(
      error.message,
      /civitai\.com|huggingface\.co|github\.com|githubusercontent\.com|secret-token|signed-query/,
    )
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

test('native pinned HTTPS applies byte backpressure before an unread consumer then delivers exact bytes', async () => {
  const totalBytes = 16 * 1024 * 1024
  const chunk = Buffer.alloc(64 * 1024, 0x5a)
  const expectedDigest = createHash('sha256')
  for (let offset = 0; offset < totalBytes; offset += chunk.byteLength) {
    expectedDigest.update(chunk)
  }
  let writtenBytes = 0
  let waitingForDrain = false
  let serverEnded = false
  let serverActivity = () => {}
  let activeResponse: ServerResponse | undefined
  await withLocalHttps(
    async (url, caPath) => {
      try {
        const result = await unreadTrustedRequest(url, caPath, async () => {
          // Observe a stable native write/drain stall while the child is explicitly forbidden
          // to acquire a body reader. A full-file Web queue lets the server finish instead.
          await new Promise<void>((resolve, reject) => {
            let stableTimer: ReturnType<typeof setTimeout> | undefined
            const cleanup = () => {
              clearTimeout(stableTimer)
              clearTimeout(deadline)
              serverActivity = () => {}
            }
            const finish = () => {
              cleanup()
              resolve()
            }
            const deadline = setTimeout(() => {
              cleanup()
              reject(new Error('Native HTTPS sender did not reach a stable backpressure state'))
            }, 4000)
            serverActivity = () => {
              clearTimeout(stableTimer)
              if (serverEnded) {
                finish()
              } else if (waitingForDrain) {
                stableTimer = setTimeout(finish, 750)
              }
            }
            serverActivity()
          })
          assert.ok(
            waitingForDrain,
            `Sender completed before consumer approval at ${writtenBytes} bytes`,
          )
          assert.ok(!serverEnded, 'Unread native transport buffered the complete artifact')
          assert.ok(writtenBytes > 0 && writtenBytes < totalBytes)
        })
        assert.deepEqual(result, {
          byteSize: totalBytes,
          ok: true,
          sha256: expectedDigest.digest('hex'),
          status: 200,
        })
        assert.equal(writtenBytes, totalBytes)
        assert.equal(serverEnded, true)
      } finally {
        activeResponse?.destroy()
      }
    },
    '127.0.0.2',
    (response) => {
      activeResponse = response
      response.writeHead(200, {
        'content-length': String(totalBytes),
        'content-type': 'application/octet-stream',
      })
      const pump = () => {
        while (writtenBytes < totalBytes) {
          writtenBytes += chunk.byteLength
          if (!response.write(chunk)) {
            waitingForDrain = true
            response.once('drain', () => {
              waitingForDrain = false
              pump()
            })
            serverActivity()
            return
          }
        }
        serverEnded = true
        response.end()
        serverActivity()
      }
      pump()
    },
  )
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

test('LaMa source and exact identity are admitted before any storage, DNS or transport work', async (t) => {
  const invalidInputs: { name: string; override: Partial<ModelDownloadInput> }[] = [
    { name: 'CivitAI URL', override: { url: FILE_URL } },
    { name: 'Anima URL', override: { url: ANIMA_QWEN3_0_6B_ENCODER.url } },
    {
      name: 'different GitHub artifact',
      override: { url: LAMA_OUTPAINT_ARTIFACT.url.replace('big-lama.pt', 'different.pt') },
    },
    { name: 'added query', override: { url: `${LAMA_OUTPAINT_ARTIFACT.url}?download=1` } },
    { name: 'added fragment', override: { url: `${LAMA_OUTPAINT_ARTIFACT.url}#weights` } },
    { name: 'absent size', override: { expectedBytes: undefined } },
    { name: 'null size', override: { expectedBytes: null } },
    { name: 'different size', override: { expectedBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes - 1 } },
    { name: 'absent SHA', override: { expectedSha256: undefined } },
    { name: 'null SHA', override: { expectedSha256: null } },
    { name: 'different SHA', override: { expectedSha256: '0'.repeat(64) } },
    { name: 'CivitAI Bearer', override: { bearerToken: 'secret-token' } },
    { name: 'empty Bearer', override: { bearerToken: '' } },
    { name: 'CivitAI source', override: { bearerToken: 'secret-token', source: 'civitai' } },
    { name: 'Anima source', override: { source: 'anima-huggingface' } },
  ]
  for (const scenario of invalidInputs) {
    await t.test(scenario.name, async () => {
      await withStaging(async (stagingDirectory) => {
        let resolutions = 0
        let requests = 0
        const downloader = new ModelDownloader({
          resolveAddresses: async () => {
            resolutions++
            return await PUBLIC_ADDRESSES()
          },
          transport: async () => {
            requests++
            return fileResponse('abc')
          },
        })
        const unopenedDirectory = join(stagingDirectory, 'not-created')
        await expectDownloadError(
          downloader.download({ ...lamaDownload(unopenedDirectory), ...scenario.override }),
          'DOWNLOAD_INVALID_SOURCE',
        )
        assert.equal(resolutions, 0)
        assert.equal(requests, 0)
        assert.deepEqual(await readdir(stagingDirectory), [])
      })
    })
  }
})

test('LaMa follows only GitHub release hosts without authorization and checks the streamed exact size', async () => {
  await withStaging(async (stagingDirectory) => {
    const requests: {
      authorization: string | null
      credentials: string | undefined
      url: string
    }[] = []
    const resolvedHosts: string[] = []
    const redirects = [
      `${LAMA_OUTPAINT_ARTIFACT.url}?download=1`,
      'https://release-assets.githubusercontent.com/github-production-release-asset/1/big-lama.pt?sig=signed-query',
    ]
    const downloader = new ModelDownloader({
      resolveAddresses: async (hostname) => {
        resolvedHosts.push(hostname)
        return await PUBLIC_ADDRESSES()
      },
      transport: async (url, options) => {
        requests.push({
          authorization: new Headers(options?.headers).get('Authorization'),
          credentials: options?.credentials,
          url: String(url),
        })
        const location = redirects[requests.length - 1]
        return location
          ? new Response(null, { headers: { location }, status: 302 })
          : fileResponse('abc', LAMA_OUTPAINT_ARTIFACT.sizeBytes)
      },
    })
    let progress: { downloadedBytes: number; totalBytes: number | null } | undefined
    await expectDownloadError(
      downloader.download({
        ...lamaDownload(stagingDirectory),
        onProgress: (value) => {
          progress = value
        },
      }),
      'DOWNLOAD_SIZE_MISMATCH',
    )
    assert.deepEqual(
      requests,
      [LAMA_OUTPAINT_ARTIFACT.url, ...redirects].map((url) => ({
        authorization: null,
        credentials: 'omit',
        url,
      })),
    )
    assert.deepEqual(resolvedHosts, [
      'github.com',
      'github.com',
      'release-assets.githubusercontent.com',
    ])
    assert.deepEqual(progress, { downloadedBytes: 3, totalBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes })
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('LaMa refuses unlisted, credentialed and unsafe redirects before another request', async (t) => {
  const redirects = [
    { code: 'DOWNLOAD_UNSAFE_DESTINATION', location: 'https://cdn.example.com/big-lama.pt' },
    {
      code: 'DOWNLOAD_UNSAFE_DESTINATION',
      location: 'https://objects.githubusercontent.com/big-lama.pt',
    },
    {
      code: 'DOWNLOAD_UNSAFE_DESTINATION',
      location: 'https://release-assets.githubusercontent.com.evil.example/file',
    },
    { code: 'DOWNLOAD_UNSAFE_DESTINATION', location: 'https://github.com.evil.example/file' },
    { code: 'DOWNLOAD_UNSAFE_DESTINATION', location: 'https://127.0.0.1/big-lama.pt' },
    { code: 'DOWNLOAD_UNSAFE_DESTINATION', location: 'https://github.com./big-lama.pt' },
    {
      code: 'DOWNLOAD_INVALID_URL',
      location: 'http://release-assets.githubusercontent.com/big-lama.pt',
    },
    { code: 'DOWNLOAD_INVALID_URL', location: 'https://secret-token@github.com/big-lama.pt' },
    { code: 'DOWNLOAD_INVALID_URL', location: 'https://github.com:8443/big-lama.pt' },
  ]
  for (const scenario of redirects) {
    await t.test(scenario.location, async () => {
      await withStaging(async (stagingDirectory) => {
        let requests = 0
        let resolutions = 0
        const downloader = new ModelDownloader({
          resolveAddresses: async () => {
            resolutions++
            return await PUBLIC_ADDRESSES()
          },
          transport: async () => {
            requests++
            return new Response(null, { headers: { location: scenario.location }, status: 302 })
          },
        })
        await expectDownloadError(
          downloader.download(lamaDownload(stagingDirectory)),
          scenario.code,
        )
        assert.equal(requests, 1)
        assert.equal(resolutions, 1)
        assert.deepEqual(await readdir(stagingDirectory), [])
      })
    })
  }
})

test('an allowed LaMa release host still requires exclusively public resolved addresses', async () => {
  await withStaging(async (stagingDirectory) => {
    let requests = 0
    const downloader = new ModelDownloader({
      resolveAddresses: async (hostname) =>
        hostname === 'github.com' ? await PUBLIC_ADDRESSES() : ['1.1.1.1', '192.168.1.20'],
      transport: async () => {
        requests++
        return new Response(null, {
          headers: { location: 'https://release-assets.githubusercontent.com/big-lama.pt' },
          status: 302,
        })
      },
    })
    await expectDownloadError(
      downloader.download(lamaDownload(stagingDirectory)),
      'DOWNLOAD_UNSAFE_DESTINATION',
    )
    assert.equal(requests, 1)
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('LaMa exact-size synthetic streamed bytes cannot substitute for the pinned weights', async () => {
  await withStaging(async (stagingDirectory) => {
    let downloadedBytes = 0
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () =>
        syntheticBinaryResponse(LAMA_OUTPAINT_ARTIFACT.sizeBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes),
    })
    await expectDownloadError(
      downloader.download({
        ...lamaDownload(stagingDirectory),
        onProgress: (progress) => {
          assert.ok(progress.downloadedBytes > downloadedBytes)
          assert.equal(progress.totalBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
          downloadedBytes = progress.downloadedBytes
        },
      }),
      'DOWNLOAD_HASH_MISMATCH',
    )
    assert.equal(downloadedBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('LaMa bounds an unadvertised streamed body by the exact manifest size and cleans partial bytes', async () => {
  await withStaging(async (stagingDirectory) => {
    let downloadedBytes = 0
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => syntheticBinaryResponse(LAMA_OUTPAINT_ARTIFACT.sizeBytes + 1),
    })
    await expectDownloadError(
      downloader.download({
        ...lamaDownload(stagingDirectory),
        onProgress: (progress) => {
          downloadedBytes = progress.downloadedBytes
        },
      }),
      'DOWNLOAD_TOO_LARGE',
    )
    assert.ok(downloadedBytes > 0 && downloadedBytes <= LAMA_OUTPAINT_ARTIFACT.sizeBytes)
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('LaMa header size mismatch is refused before reading or writing body bytes', async () => {
  await withStaging(async (stagingDirectory) => {
    let progressCalls = 0
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => fileResponse('abc', LAMA_OUTPAINT_ARTIFACT.sizeBytes + 1),
    })
    await expectDownloadError(
      downloader.download({
        ...lamaDownload(stagingDirectory),
        onProgress: () => {
          progressCalls++
        },
      }),
      'DOWNLOAD_SIZE_MISMATCH',
    )
    assert.equal(progressCalls, 0)
    assert.deepEqual(await readdir(stagingDirectory), [])
  })
})

test('LaMa transport failure and cancellation clean private partial files without exposing source details', async (t) => {
  await t.test('transport error', async () => {
    await withStaging(async (stagingDirectory) => {
      const downloader = new ModelDownloader({
        resolveAddresses: PUBLIC_ADDRESSES,
        transport: async () => {
          throw new Error(`secret-token at ${LAMA_OUTPAINT_ARTIFACT.url}`)
        },
      })
      await expectDownloadError(
        downloader.download(lamaDownload(stagingDirectory)),
        'DOWNLOAD_FAILED',
      )
      assert.deepEqual(await readdir(stagingDirectory), [])
    })
  })
  await t.test('cancel after first written chunk', async () => {
    await withStaging(async (stagingDirectory) => {
      const controller = new AbortController()
      let progressCalls = 0
      const downloader = new ModelDownloader({
        resolveAddresses: PUBLIC_ADDRESSES,
        transport: async () => syntheticBinaryResponse(LAMA_OUTPAINT_ARTIFACT.sizeBytes),
      })
      await expectDownloadError(
        downloader.download({
          ...lamaDownload(stagingDirectory),
          onProgress: () => {
            progressCalls++
            controller.abort()
          },
          signal: controller.signal,
        }),
        'DOWNLOAD_CANCELED',
      )
      assert.equal(progressCalls, 1)
      assert.deepEqual(await readdir(stagingDirectory), [])
    })
  })
  await t.test('DNS failure', async () => {
    await withStaging(async (stagingDirectory) => {
      let requests = 0
      const downloader = new ModelDownloader({
        resolveAddresses: async () => {
          throw new Error('secret-token DNS failed')
        },
        transport: async () => {
          requests++
          return fileResponse('abc')
        },
      })
      await expectDownloadError(
        downloader.download(lamaDownload(stagingDirectory)),
        'DOWNLOAD_NETWORK_ERROR',
      )
      assert.equal(requests, 0)
      assert.deepEqual(await readdir(stagingDirectory), [])
    })
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
