import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { KWalletBootstrapResult } from './kwallet-bootstrap.js'

/** The Electron methods used here, separated so the filesystem boundary can be tested. */
export interface SafeStorageAdapter {
  decryptStringAsync: (encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>
  encryptStringAsync: (plainText: string) => Promise<Buffer>
  getSelectedStorageBackend: () => string
  isAsyncEncryptionAvailable: () => Promise<boolean>
}

export type TokenStorageUnavailableReason =
  'backend-error' | 'basic_text' | 'encryption-timeout' | 'encryption-unavailable' | 'unknown'

export type TokenStorageAvailability =
  | { available: false; backend?: string; reason: TokenStorageUnavailableReason }
  | { available: true; backend: string }

export type CivitaiTokenStoreStatus =
  | { backend: string; kind: 'missing' | 'stored' | 'unreadable' }
  | { backend?: string; kind: 'unavailable'; reason: TokenStorageUnavailableReason }

export type CivitaiTokenStoreErrorCode =
  | 'TOKEN_INVALID'
  | 'TOKEN_SAVE_IN_PROGRESS'
  | 'TOKEN_SECURE_STORAGE_TIMEOUT'
  | 'TOKEN_SECURE_STORAGE_UNAVAILABLE'
  | 'TOKEN_STORAGE_FAILED'
  | 'TOKEN_TOO_LONG'
  | 'TOKEN_UNREADABLE'
  | 'TOKEN_WALLET_SETUP_CANCELED'
  | 'TOKEN_WALLET_SETUP_TIMEOUT'
  | 'TOKEN_WALLET_SETUP_UNAVAILABLE'

export const CIVITAI_STORAGE_TIMEOUT_DETAIL =
  'Secure storage did not respond. Open or unlock your system keyring, then restart ImageGen Studio before retrying.'

const errorMessages: Record<CivitaiTokenStoreErrorCode, string> = {
  TOKEN_INVALID: 'The CivitAI token is empty or malformed.',
  TOKEN_SAVE_IN_PROGRESS: 'A CivitAI token save is already in progress.',
  TOKEN_SECURE_STORAGE_TIMEOUT: CIVITAI_STORAGE_TIMEOUT_DETAIL,
  TOKEN_SECURE_STORAGE_UNAVAILABLE: 'Secure CivitAI token storage is unavailable.',
  TOKEN_STORAGE_FAILED: 'The CivitAI token could not be saved or removed.',
  TOKEN_TOO_LONG: 'The CivitAI token is too long.',
  TOKEN_UNREADABLE: 'The saved CivitAI token could not be read.',
  TOKEN_WALLET_SETUP_CANCELED: 'KWallet setup was canceled. Save again to retry.',
  TOKEN_WALLET_SETUP_TIMEOUT:
    'KWallet setup timed out. Close the system dialog if it is still open, then Save again.',
  TOKEN_WALLET_SETUP_UNAVAILABLE:
    'Studio could not prepare KWallet. Open or create your default wallet in KDE Wallet Manager, then retry Save.',
}

const walletSetupErrors: Record<
  Exclude<KWalletBootstrapResult, 'ready'>,
  CivitaiTokenStoreErrorCode
> = {
  canceled: 'TOKEN_WALLET_SETUP_CANCELED',
  timeout: 'TOKEN_WALLET_SETUP_TIMEOUT',
  unavailable: 'TOKEN_WALLET_SETUP_UNAVAILABLE',
}

export class CivitaiTokenStoreError extends Error {
  readonly code: CivitaiTokenStoreErrorCode

  constructor(code: CivitaiTokenStoreErrorCode) {
    super(errorMessages[code])
    this.name = 'CivitaiTokenStoreError'
    this.code = code
  }
}

/** An IPC input bound, not a claim about CivitAI's token format or length. */
export const MAX_CIVITAI_TOKEN_BYTES = 4096
const MAX_CIPHERTEXT_BYTES = 16 * 1024
const WALLET_RESPONSE_TIMEOUT_MS = 60_000
const LINUX_FIXED_KEY_PREFIX = Buffer.from('v10')
type AtomicRename = (from: string, to: string) => Promise<void>

/**
 * Main-process-only local ciphertext storage. The caller supplies CivitAI validation to the
 * serialized Save; this class deliberately has no network access of its own.
 */
export class CivitaiTokenStore {
  private availabilityProbe?: Promise<boolean | 'timeout'>
  private readonly directory: string
  private readonly filePath: string
  private nativeAvailabilityRequested = false
  private pending: Promise<void> = Promise.resolve()
  private saving = false

  constructor(
    private readonly safeStorage: SafeStorageAdapter,
    appDataRoot: string,
    private readonly atomicRename: AtomicRename = rename,
    private readonly prepareKWallet?: () => Promise<KWalletBootstrapResult>,
  ) {
    this.directory = path.join(appDataRoot, 'secrets')
    this.filePath = path.join(this.directory, 'civitai-token.bin')
  }

  async getAvailability(): Promise<TokenStorageAvailability> {
    const selected = this.getSelectedBackendAvailability()
    if (!selected.available) {
      return selected
    }

    const availability = await this.probeAsyncAvailability()
    if (availability === 'timeout') {
      return { available: false, backend: selected.backend, reason: 'encryption-timeout' }
    }
    if (!availability) {
      return { available: false, backend: selected.backend, reason: 'encryption-unavailable' }
    }
    return selected
  }

  getStatus(): Promise<CivitaiTokenStoreStatus> {
    return this.enqueue(async () => {
      // The asynchronous provider can ask to open a wallet. A passive read only
      // needs it when the token file may actually exist.
      const absent = await this.isTokenFileAbsent()
      const availability = absent
        ? this.getSelectedBackendAvailability()
        : await this.getAvailability()
      if (!availability.available) {
        return { backend: availability.backend, kind: 'unavailable', reason: availability.reason }
      }
      if (absent) {
        return { backend: availability.backend, kind: 'missing' }
      }
      try {
        const token = await this.readTokenUnlocked()
        return { backend: availability.backend, kind: token === null ? 'missing' : 'stored' }
      } catch (error) {
        if (
          error instanceof CivitaiTokenStoreError &&
          error.code === 'TOKEN_SECURE_STORAGE_TIMEOUT'
        ) {
          return {
            backend: availability.backend,
            kind: 'unavailable',
            reason: 'encryption-timeout',
          }
        }
        if (
          error instanceof CivitaiTokenStoreError &&
          error.code === 'TOKEN_SECURE_STORAGE_UNAVAILABLE'
        ) {
          const current = await this.getAvailability()
          if (!current.available) {
            return { backend: current.backend, kind: 'unavailable', reason: current.reason }
          }
        }
        return { backend: availability.backend, kind: 'unreadable' }
      }
    })
  }

  readToken(): Promise<string | null> {
    return this.enqueue(() => this.readTokenUnlocked())
  }

  removeToken(): Promise<void> {
    return this.enqueue(async () => {
      // Removal remains possible even when the OS key store is unavailable.
      if (!(await this.inspectDirectory(false))) {
        return
      }
      try {
        await unlink(this.filePath)
      } catch (error) {
        if (!isMissing(error)) {
          throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
        }
      }
    })
  }

  saveToken(token: string, validateWithProvider?: (token: string) => Promise<void>): Promise<void> {
    if (this.saving) {
      return Promise.reject(new CivitaiTokenStoreError('TOKEN_SAVE_IN_PROGRESS'))
    }
    this.saving = true
    return this.enqueue(async () => {
      validateCivitaiToken(token)
      await this.prepareWalletForSave()
      await this.requireSecureStorage()
      if (validateWithProvider) {
        await validateWithProvider(token)
        await this.requireSecureStorage()
      }
      let ciphertext: Buffer
      try {
        ciphertext = await this.safeStorage.encryptStringAsync(token)
      } catch {
        throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
      }
      if (
        !Buffer.isBuffer(ciphertext) ||
        ciphertext.length === 0 ||
        ciphertext.length > MAX_CIPHERTEXT_BYTES
      ) {
        throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
      }
      await this.requireSecureStorage()
      await this.writeCiphertext(ciphertext)
    }).finally(() => {
      this.saving = false
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation)
    this.pending = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private getSelectedBackendAvailability(): TokenStorageAvailability {
    let backend: string
    try {
      backend = this.safeStorage.getSelectedStorageBackend()
    } catch {
      return { available: false, reason: 'backend-error' }
    }

    if (backend === 'basic_text') {
      return { available: false, backend, reason: 'basic_text' }
    }
    if (!backend || backend === 'unknown') {
      return { available: false, backend, reason: 'unknown' }
    }
    return { available: true, backend }
  }

  private async inspectDirectory(create: boolean): Promise<boolean> {
    if (create) {
      try {
        await mkdir(this.directory, { mode: 0o700 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
          throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
        }
      }
    }
    try {
      const info = await lstat(this.directory)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
      }
      if (create && (info.mode & 0o077) !== 0) {
        throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
      }
      return true
    } catch (error) {
      if (isMissing(error) && !create) {
        return false
      }
      if (error instanceof CivitaiTokenStoreError) {
        throw error
      }
      throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
    }
  }

  private async isTokenFileAbsent(): Promise<boolean> {
    try {
      if (!(await this.inspectDirectory(false))) {
        return true
      }
      await lstat(this.filePath)
      return false
    } catch (error) {
      return isMissing(error)
    }
  }

  private async prepareWalletForSave(): Promise<void> {
    if (!this.prepareKWallet || this.nativeAvailabilityRequested) {
      return
    }
    const selected = this.getSelectedBackendAvailability()
    if (
      !selected.available ||
      selected.backend !== 'kwallet6' ||
      !(await this.isTokenFileAbsent())
    ) {
      return
    }
    const result = await this.prepareKWallet()
    if (result !== 'ready') {
      throw new CivitaiTokenStoreError(walletSetupErrors[result])
    }
  }

  private probeAsyncAvailability(): Promise<boolean | 'timeout'> {
    if (this.availabilityProbe) {
      return this.availabilityProbe
    }
    this.nativeAvailabilityRequested = true
    const native = Promise.resolve()
      .then(() => this.safeStorage.isAsyncEncryptionAvailable())
      .catch(() => false)
    let timer: ReturnType<typeof setTimeout>
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), WALLET_RESPONSE_TIMEOUT_MS)
    })
    this.availabilityProbe = Promise.race([native, deadline])
    // Electron queues calls against one native encryptor request. Keep the expired result
    // until that request settles so retry cannot queue callbacks or resume an expired Save.
    void native.then(() => {
      clearTimeout(timer)
      this.availabilityProbe = undefined
    })
    return this.availabilityProbe
  }

  private async readTokenUnlocked(): Promise<string | null> {
    if (!this.getSelectedBackendAvailability().available) {
      throw new CivitaiTokenStoreError('TOKEN_SECURE_STORAGE_UNAVAILABLE')
    }
    if (!(await this.inspectDirectory(false))) {
      return null
    }

    let ciphertext: Buffer
    try {
      const handle = await open(this.filePath, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const info = await handle.stat()
        if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > MAX_CIPHERTEXT_BYTES) {
          throw new CivitaiTokenStoreError('TOKEN_UNREADABLE')
        }
        ciphertext = await handle.readFile()
      } finally {
        await handle.close()
      }
    } catch (error) {
      if (isMissing(error)) {
        return null
      }
      throw new CivitaiTokenStoreError('TOKEN_UNREADABLE')
    }

    if (ciphertext.length === 0 || usesLinuxFixedKey(ciphertext)) {
      throw new CivitaiTokenStoreError('TOKEN_UNREADABLE')
    }
    await this.requireSecureStorage()
    let decrypted: { result: string; shouldReEncrypt: boolean }
    try {
      decrypted = await this.safeStorage.decryptStringAsync(ciphertext)
    } catch {
      throw new CivitaiTokenStoreError('TOKEN_UNREADABLE')
    }
    try {
      validateCivitaiToken(decrypted.result)
    } catch {
      throw new CivitaiTokenStoreError('TOKEN_UNREADABLE')
    }
    await this.requireSecureStorage()

    if (decrypted.shouldReEncrypt) {
      let rotatedCiphertext: Buffer
      try {
        rotatedCiphertext = await this.safeStorage.encryptStringAsync(decrypted.result)
      } catch {
        throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
      }
      if (
        !Buffer.isBuffer(rotatedCiphertext) ||
        rotatedCiphertext.length === 0 ||
        rotatedCiphertext.length > MAX_CIPHERTEXT_BYTES
      ) {
        throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
      }
      await this.requireSecureStorage()
      await this.writeCiphertext(rotatedCiphertext)
    }
    return decrypted.result
  }

  private async requireSecureStorage(): Promise<void> {
    const availability = await this.getAvailability()
    if (!availability.available) {
      throw new CivitaiTokenStoreError(
        availability.reason === 'encryption-timeout'
          ? 'TOKEN_SECURE_STORAGE_TIMEOUT'
          : 'TOKEN_SECURE_STORAGE_UNAVAILABLE',
      )
    }
  }

  private async writeCiphertext(ciphertext: Buffer): Promise<void> {
    if (usesLinuxFixedKey(ciphertext)) {
      throw new CivitaiTokenStoreError('TOKEN_SECURE_STORAGE_UNAVAILABLE')
    }
    await this.inspectDirectory(true)
    const temporaryPath = path.join(this.directory, `.civitai-token.${randomUUID()}.tmp`)
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(temporaryPath, 'wx', 0o600)
      await handle.writeFile(ciphertext)
      await handle.sync()
      await handle.close()
      handle = undefined
      await this.atomicRename(temporaryPath, this.filePath)
    } catch {
      throw new CivitaiTokenStoreError('TOKEN_STORAGE_FAILED')
    } finally {
      if (handle) {
        await handle.close().catch(() => undefined)
      }
      await unlink(temporaryPath).catch(() => undefined)
    }
  }
}

export function validateCivitaiToken(token: unknown): asserts token is string {
  if (typeof token !== 'string' || token.trim().length === 0 || /[\x00-\x1F\x7F]/.test(token)) {
    throw new CivitaiTokenStoreError('TOKEN_INVALID')
  }
  if (Buffer.byteLength(token, 'utf8') > MAX_CIVITAI_TOKEN_BYTES) {
    throw new CivitaiTokenStoreError('TOKEN_TOO_LONG')
  }
}

function usesLinuxFixedKey(ciphertext: Buffer): boolean {
  // Chromium's Linux POSIX fallback uses a fixed key, even if Electron reports
  // a selected keyring backend and resolves its async availability check.
  return (
    process.platform === 'linux' &&
    ciphertext.subarray(0, LINUX_FIXED_KEY_PREFIX.length).equals(LINUX_FIXED_KEY_PREFIX)
  )
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}
