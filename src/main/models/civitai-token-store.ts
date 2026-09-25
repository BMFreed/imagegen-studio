import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

/** The Electron methods used here, separated so the filesystem boundary can be tested. */
export interface SafeStorageAdapter {
  decryptStringAsync: (encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>
  encryptStringAsync: (plainText: string) => Promise<Buffer>
  getSelectedStorageBackend: () => string
  isAsyncEncryptionAvailable: () => Promise<boolean>
}

export type TokenStorageUnavailableReason =
  'backend-error' | 'basic_text' | 'encryption-unavailable' | 'unknown'

export type TokenStorageAvailability =
  | { available: false; backend?: string; reason: TokenStorageUnavailableReason }
  | { available: true; backend: string }

export type CivitaiTokenStoreStatus =
  | { backend: string; kind: 'missing' | 'stored' | 'unreadable' }
  | { backend?: string; kind: 'unavailable'; reason: TokenStorageUnavailableReason }

export type CivitaiTokenStoreErrorCode =
  | 'TOKEN_INVALID'
  | 'TOKEN_SECURE_STORAGE_UNAVAILABLE'
  | 'TOKEN_STORAGE_FAILED'
  | 'TOKEN_TOO_LONG'
  | 'TOKEN_UNREADABLE'

const errorMessages: Record<CivitaiTokenStoreErrorCode, string> = {
  TOKEN_INVALID: 'The CivitAI token is empty or malformed.',
  TOKEN_SECURE_STORAGE_UNAVAILABLE: 'Secure CivitAI token storage is unavailable.',
  TOKEN_STORAGE_FAILED: 'The CivitAI token could not be saved or removed.',
  TOKEN_TOO_LONG: 'The CivitAI token is too long.',
  TOKEN_UNREADABLE: 'The saved CivitAI token could not be read.',
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
type AtomicRename = (from: string, to: string) => Promise<void>

/**
 * Main-process-only local ciphertext storage. The caller validates the token with CivitAI before
 * saveToken; this class deliberately has no network access.
 */
export class CivitaiTokenStore {
  private readonly directory: string
  private readonly filePath: string
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly safeStorage: SafeStorageAdapter,
    appDataRoot: string,
    private readonly atomicRename: AtomicRename = rename,
  ) {
    this.directory = path.join(appDataRoot, 'secrets')
    this.filePath = path.join(this.directory, 'civitai-token.bin')
  }

  async getAvailability(): Promise<TokenStorageAvailability> {
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

    try {
      if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
        return { available: false, backend, reason: 'encryption-unavailable' }
      }
    } catch {
      return { available: false, backend, reason: 'encryption-unavailable' }
    }
    return { available: true, backend }
  }

  getStatus(): Promise<CivitaiTokenStoreStatus> {
    return this.enqueue(async () => {
      const availability = await this.getAvailability()
      if (!availability.available) {
        return { backend: availability.backend, kind: 'unavailable', reason: availability.reason }
      }
      try {
        const token = await this.readTokenUnlocked()
        return { backend: availability.backend, kind: token === null ? 'missing' : 'stored' }
      } catch (error) {
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

  saveToken(token: string): Promise<void> {
    return this.enqueue(async () => {
      validateCivitaiToken(token)
      await this.requireSecureStorage()
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

  private async readTokenUnlocked(): Promise<string | null> {
    await this.requireSecureStorage()
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

    if (ciphertext.length === 0) {
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
    if (!(await this.getAvailability()).available) {
      throw new CivitaiTokenStoreError('TOKEN_SECURE_STORAGE_UNAVAILABLE')
    }
  }

  private async writeCiphertext(ciphertext: Buffer): Promise<void> {
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}
