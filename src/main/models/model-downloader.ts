import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { lstat, mkdir, open, unlink } from 'node:fs/promises'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import {
  ANIMA_BASE_1_0_CHECKPOINT,
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
} from './anima-manifest.js'

const MAX_REDIRECTS = 5
const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024 * 1024
const DEFAULT_HEADER_TIMEOUT_MS = 20_000
const DEFAULT_IDLE_TIMEOUT_MS = 60_000
const DEFAULT_TOTAL_TIMEOUT_MS = 24 * 60 * 60 * 1000
const SHA256 = /^[a-f\d]{64}$/i
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const ANIMA_SOURCE_URLS = new Set([
  ANIMA_BASE_1_0_CHECKPOINT.url,
  ANIMA_QWEN3_0_6B_ENCODER.url,
  ANIMA_QWEN_IMAGE_VAE.url,
])

const BLOCKED_IPV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_IPV4.addSubnet(address, prefix)
}

const GLOBAL_IPV6 = new BlockList()
GLOBAL_IPV6.addSubnet('2000::', 3, 'ipv6')
const BLOCKED_IPV6 = new BlockList()
BLOCKED_IPV6.addSubnet('2001:db8::', 32, 'ipv6')
BLOCKED_IPV6.addSubnet('2001:10::', 28, 'ipv6')

export type ModelDownloadSource = 'anima-huggingface' | 'civitai'

export interface ModelDownloadInput {
  /** Main-process token. Never pass this object through renderer IPC or a log. */
  readonly bearerToken?: string
  /** A source's exact byte size. CivitAI sizeKB estimates do not qualify. */
  readonly expectedBytes?: number | null
  readonly expectedSha256?: string | null
  readonly onProgress?: (progress: { downloadedBytes: number; totalBytes: number | null }) => void
  readonly signal?: AbortSignal
  readonly source: ModelDownloadSource
  /** App-owned private staging directory on the managed models filesystem. */
  readonly stagingDirectory: string
  /** A CivitAI file-specific URL or a pinned Anima manifest artifact URL. */
  readonly url: string
}

export interface VerifiedStagedModelFile {
  readonly sha256: string
  readonly sizeBytes: number
  readonly stagingPath: string
}

export type AddressResolver = (hostname: string) => Promise<readonly string[]>

export interface ModelDownloaderOptions {
  readonly headerTimeoutMs?: number
  readonly idleTimeoutMs?: number
  readonly resolveAddresses?: AddressResolver
  readonly totalTimeoutMs?: number
  /** Test seam. Production uses a TLS request pinned to the validated DNS address. */
  readonly transport?: typeof fetch
}

export class ModelDownloadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ModelDownloadError'
  }
}

/**
 * Downloads an exact source artifact into a private staging file. The caller owns publication:
 * atomic rename and SQLite registration must happen only after this method succeeds.
 */
export class ModelDownloader {
  private readonly headerTimeoutMs: number
  private readonly idleTimeoutMs: number
  private readonly resolveAddresses: AddressResolver
  private readonly totalTimeoutMs: number
  private readonly transport: typeof fetch | null

  constructor(options: ModelDownloaderOptions = {}) {
    this.transport = options.transport ?? null
    this.resolveAddresses = options.resolveAddresses ?? resolvePublicAddresses
    this.headerTimeoutMs = positiveTimeout(options.headerTimeoutMs, DEFAULT_HEADER_TIMEOUT_MS)
    this.idleTimeoutMs = positiveTimeout(options.idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS)
    this.totalTimeoutMs = positiveTimeout(options.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT_MS)
  }

  async download(input: ModelDownloadInput): Promise<VerifiedStagedModelFile> {
    const initialUrl = validateInitialUrl(input)
    const expectedHash = validateExpectedHash(input.expectedSha256)
    const expectedBytes = validateExpectedBytes(input.expectedBytes)
    if (input.signal?.aborted) {
      throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
    }

    try {
      await mkdir(input.stagingDirectory, { mode: 0o700, recursive: true })
      const stagingDirectory = await lstat(input.stagingDirectory)
      if (!stagingDirectory.isDirectory() || stagingDirectory.isSymbolicLink()) {
        throw new ModelDownloadError(
          'DOWNLOAD_INVALID_STAGING',
          'The staging directory is invalid.',
        )
      }
    } catch (error) {
      if (error instanceof ModelDownloadError) {
        throw error
      }
      throw new ModelDownloadError(
        'DOWNLOAD_STORAGE_ERROR',
        'The staging directory is unavailable.',
      )
    }

    const stagingPath = join(input.stagingDirectory, `${randomUUID()}.part`)
    const controller = new AbortController()
    let timeout: 'header' | 'idle' | 'total' | null = null
    const externalAbort = () => controller.abort()
    input.signal?.addEventListener('abort', externalAbort, { once: true })
    if (input.signal?.aborted) {
      controller.abort()
    }
    const totalTimer = setTimeout(() => {
      timeout = 'total'
      controller.abort()
    }, this.totalTimeoutMs)

    try {
      let currentUrl = initialUrl
      let response: Response | null = null

      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
        const validatedAddress = await this.assertPublicDestination(currentUrl, controller.signal)
        if (controller.signal.aborted) {
          throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
        }

        const headerTimer = setTimeout(() => {
          timeout = 'header'
          controller.abort()
        }, this.headerTimeoutMs)
        try {
          const requestOptions: RequestInit = {
            credentials: 'omit',
            headers: requestHeaders(input, currentUrl),
            redirect: 'manual',
            signal: controller.signal,
          }
          response = await raceAbort(
            this.transport
              ? this.transport(currentUrl, requestOptions)
              : requestPinnedHttps(currentUrl, requestOptions, validatedAddress),
            controller.signal,
          )
        } finally {
          clearTimeout(headerTimer)
        }

        if (!REDIRECT_STATUSES.has(response.status)) {
          break
        }
        if (redirect === MAX_REDIRECTS) {
          throw new ModelDownloadError(
            'DOWNLOAD_TOO_MANY_REDIRECTS',
            'The download redirected too many times.',
          )
        }
        const location = response.headers.get('location')
        if (!location) {
          throw new ModelDownloadError(
            'DOWNLOAD_INVALID_REDIRECT',
            'The download redirect is invalid.',
          )
        }
        const nextUrl = parseSafeUrl(location, currentUrl)
        await response.body?.cancel().catch(() => undefined)
        currentUrl = nextUrl
      }

      if (!response || response.status !== 200) {
        throw httpError(response?.status)
      }
      if (!response.body) {
        throw new ModelDownloadError(
          'DOWNLOAD_INVALID_RESPONSE',
          'The download has no file content.',
        )
      }
      const contentEncoding = response.headers.get('content-encoding')
      if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
        throw new ModelDownloadError(
          'DOWNLOAD_INVALID_RESPONSE',
          'The download encoding is unsupported.',
        )
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (/^(text\/|application\/(?:json|xml|xhtml\+xml))/.test(contentType)) {
        throw new ModelDownloadError(
          'DOWNLOAD_INVALID_RESPONSE',
          'The download did not contain a model file.',
        )
      }
      const contentLength = parseContentLength(response.headers.get('content-length'))
      if (contentLength !== null && contentLength > MAX_DOWNLOAD_BYTES) {
        throw new ModelDownloadError(
          'DOWNLOAD_TOO_LARGE',
          'The model file exceeds the download limit.',
        )
      }
      if (expectedBytes !== null && contentLength !== null && expectedBytes !== contentLength) {
        throw new ModelDownloadError(
          'DOWNLOAD_SIZE_MISMATCH',
          'The model file size does not match.',
        )
      }

      const maxBytes = expectedBytes ?? MAX_DOWNLOAD_BYTES
      const totalBytes = expectedBytes ?? contentLength
      const hash = createHash('sha256')
      let downloadedBytes = 0
      const file = await open(stagingPath, 'wx', 0o600)
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const resetIdleTimer = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          timeout = 'idle'
          controller.abort()
        }, this.idleTimeoutMs)
      }

      try {
        reader = response.body.getReader()
        resetIdleTimer()
        while (true) {
          if (controller.signal.aborted) {
            throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
          }
          const part = await raceAbort(reader.read(), controller.signal)
          resetIdleTimer()
          if (part.done) {
            break
          }
          downloadedBytes += part.value.byteLength
          if (downloadedBytes > maxBytes) {
            throw new ModelDownloadError(
              'DOWNLOAD_TOO_LARGE',
              'The model file exceeds the download limit.',
            )
          }
          hash.update(part.value)
          let offset = 0
          while (offset < part.value.byteLength) {
            const { bytesWritten } = await file.write(
              part.value,
              offset,
              part.value.byteLength - offset,
            )
            if (bytesWritten < 1) {
              throw new ModelDownloadError(
                'DOWNLOAD_STORAGE_ERROR',
                'The model file could not be stored.',
              )
            }
            offset += bytesWritten
          }
          input.onProgress?.({ downloadedBytes, totalBytes })
        }

        if (downloadedBytes === 0) {
          throw new ModelDownloadError('DOWNLOAD_INVALID_RESPONSE', 'The download was empty.')
        }
        if (
          (expectedBytes !== null && downloadedBytes !== expectedBytes) ||
          (contentLength !== null && downloadedBytes !== contentLength)
        ) {
          throw new ModelDownloadError(
            'DOWNLOAD_SIZE_MISMATCH',
            'The model file size does not match.',
          )
        }
        const sha256 = hash.digest('hex')
        if (expectedHash !== null && expectedHash !== sha256) {
          throw new ModelDownloadError(
            'DOWNLOAD_HASH_MISMATCH',
            'The model file hash does not match.',
          )
        }
        await file.sync()
        if (controller.signal.aborted) {
          throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
        }
        return { sha256, sizeBytes: downloadedBytes, stagingPath }
      } finally {
        clearTimeout(idleTimer)
        await reader?.cancel().catch(() => undefined)
        reader?.releaseLock()
        await file.close()
      }
    } catch (error) {
      await unlink(stagingPath).catch(() => undefined)
      if (input.signal?.aborted) {
        throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
      }
      if (timeout !== null) {
        throw new ModelDownloadError('DOWNLOAD_TIMEOUT', 'The download timed out.')
      }
      if (error instanceof ModelDownloadError) {
        throw error
      }
      throw new ModelDownloadError('DOWNLOAD_FAILED', 'The model file could not be downloaded.')
    } finally {
      clearTimeout(totalTimer)
      input.signal?.removeEventListener('abort', externalAbort)
      controller.abort()
    }
  }

  private async assertPublicDestination(url: URL, signal: AbortSignal): Promise<string> {
    const hostname = url.hostname.replaceAll(/^\[|\]$/g, '')
    if (
      hostname.endsWith('.') ||
      !hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|lan)$/.test(hostname) ||
      isIP(hostname) !== 0
    ) {
      throw new ModelDownloadError(
        'DOWNLOAD_UNSAFE_DESTINATION',
        'The download destination is unsafe.',
      )
    }
    let addresses: readonly string[]
    try {
      addresses = await raceAbort(this.resolveAddresses(hostname), signal)
    } catch {
      throw new ModelDownloadError(
        'DOWNLOAD_NETWORK_ERROR',
        'The download destination is unavailable.',
      )
    }
    if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
      throw new ModelDownloadError(
        'DOWNLOAD_UNSAFE_DESTINATION',
        'The download destination is unsafe.',
      )
    }
    return addresses[0]
  }
}

/** Uses the checked IP for the socket while TLS SNI and certificate checks still use the hostname. */
function requestPinnedHttps(url: URL, options: RequestInit, address: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        agent: false,
        headers: Object.fromEntries(new Headers(options.headers)),
        lookup: (_hostname, _lookupOptions, callback) => callback(null, address, isIP(address)),
        method: 'GET',
        rejectUnauthorized: true,
        servername: url.hostname,
        signal: options.signal ?? undefined,
      },
      (incoming) => {
        try {
          if (
            incoming.statusCode === undefined ||
            incoming.statusCode < 200 ||
            incoming.statusCode > 599
          ) {
            throw new Error('Invalid download response')
          }
          const headers = new Headers()
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) {
                headers.append(name, item)
              }
            } else if (value !== undefined) {
              headers.set(name, value)
            }
          }
          const noBody = [204, 205, 304].includes(incoming.statusCode)
          resolve(
            new Response(noBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
              headers,
              status: incoming.statusCode,
            }),
          )
        } catch (error) {
          incoming.destroy()
          reject(error)
        }
      },
    )
    request.once('error', reject)
    request.end()
  })
}

async function resolvePublicAddresses(hostname: string): Promise<readonly string[]> {
  const addresses = await lookup(hostname, { all: true })
  return addresses.map((item) => item.address)
}

function requestHeaders(input: ModelDownloadInput, url: URL): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/octet-stream' }
  if (input.source === 'civitai' && url.origin === 'https://civitai.com') {
    headers.Authorization = `Bearer ${input.bearerToken}`
  }
  return headers
}

function validateInitialUrl(input: ModelDownloadInput): URL {
  const url = parseSafeUrl(input.url)
  if (input.source === 'civitai') {
    if (
      url.origin !== 'https://civitai.com' ||
      !/^\/api\/download\/models\/\d+$/.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) => key.toLowerCase().includes('token')) ||
      !input.bearerToken?.trim()
    ) {
      throw new ModelDownloadError('DOWNLOAD_INVALID_SOURCE', 'The CivitAI file source is invalid.')
    }
  } else if (input.source === 'anima-huggingface') {
    if (
      url.origin !== 'https://huggingface.co' ||
      !ANIMA_SOURCE_URLS.has(url.toString()) ||
      input.bearerToken
    ) {
      throw new ModelDownloadError('DOWNLOAD_INVALID_SOURCE', 'The Anima file source is invalid.')
    }
  } else {
    throw new ModelDownloadError('DOWNLOAD_INVALID_SOURCE', 'The model file source is invalid.')
  }
  return url
}

function parseSafeUrl(input: string, base?: URL): URL {
  let url: URL
  try {
    url = new URL(input, base)
  } catch {
    throw new ModelDownloadError('DOWNLOAD_INVALID_URL', 'The model file URL is invalid.')
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) {
    throw new ModelDownloadError('DOWNLOAD_INVALID_URL', 'The model file URL must be HTTPS.')
  }
  return url
}

function validateExpectedHash(input: string | null | undefined): string | null {
  if (input == null) {
    return null
  }
  if (!SHA256.test(input)) {
    throw new ModelDownloadError('DOWNLOAD_INVALID_EXPECTATION', 'The expected hash is invalid.')
  }
  return input.toLowerCase()
}

function validateExpectedBytes(input: number | null | undefined): number | null {
  if (input == null) {
    return null
  }
  if (!Number.isSafeInteger(input) || input < 1 || input > MAX_DOWNLOAD_BYTES) {
    throw new ModelDownloadError(
      'DOWNLOAD_INVALID_EXPECTATION',
      'The expected file size is invalid.',
    )
  }
  return input
}

function parseContentLength(input: string | null): number | null {
  if (input === null) {
    return null
  }
  if (!/^\d+$/.test(input)) {
    throw new ModelDownloadError(
      'DOWNLOAD_INVALID_RESPONSE',
      'The download size header is invalid.',
    )
  }
  const value = Number(input)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ModelDownloadError(
      'DOWNLOAD_INVALID_RESPONSE',
      'The download size header is invalid.',
    )
  }
  return value
}

function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error('Download aborted'))
  }
  let rejectAbort: ((reason: Error) => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const listener = () => rejectAbort?.(new Error('Download aborted'))
  signal.addEventListener('abort', listener, { once: true })
  return Promise.race([operation, aborted]).finally(() => {
    signal.removeEventListener('abort', listener)
  })
}

function positiveTimeout(input: number | undefined, fallback: number): number {
  return typeof input === 'number' &&
    Number.isSafeInteger(input) &&
    input > 0 &&
    input <= 2_147_483_647
    ? input
    : fallback
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    return !BLOCKED_IPV4.check(address, 'ipv4')
  }
  if (family === 6) {
    return GLOBAL_IPV6.check(address, 'ipv6') && !BLOCKED_IPV6.check(address, 'ipv6')
  }
  return false
}

function httpError(status: number | undefined): ModelDownloadError {
  if (status === 401) {
    return new ModelDownloadError(
      'DOWNLOAD_UNAUTHORIZED',
      'The source rejected the download token.',
    )
  }
  if (status === 403) {
    return new ModelDownloadError(
      'DOWNLOAD_ACCESS_DENIED',
      'This model file is unavailable to this account.',
    )
  }
  if (status === 404) {
    return new ModelDownloadError('DOWNLOAD_NOT_FOUND', 'The selected model file was not found.')
  }
  return new ModelDownloadError('DOWNLOAD_HTTP_ERROR', 'The model source did not serve the file.')
}
