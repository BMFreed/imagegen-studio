import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CivitaiTokenStore,
  MAX_CIVITAI_TOKEN_BYTES,
  type SafeStorageAdapter,
} from './civitai-token-store.js'

class TestSafeStorage implements SafeStorageAdapter {
  backend = 'gnome_libsecret'
  decryptCalls = 0
  encryptCalls = 0
  encryptionAvailable = true
  failDecrypt = false
  failEncrypt = false
  shouldReEncrypt = false
  private readonly key = randomBytes(32)

  async decryptStringAsync(
    encrypted: Buffer,
  ): Promise<{ result: string; shouldReEncrypt: boolean }> {
    this.decryptCalls += 1
    if (this.failDecrypt) {
      throw new Error('simulated OS key-store error')
    }
    const iv = encrypted.subarray(0, 12)
    const body = encrypted.subarray(12, -16)
    const tag = encrypted.subarray(-16)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return {
      result: decipher.update(body, undefined, 'utf8') + decipher.final('utf8'),
      shouldReEncrypt: this.shouldReEncrypt,
    }
  }

  async encryptStringAsync(plainText: string): Promise<Buffer> {
    this.encryptCalls += 1
    if (this.failEncrypt) {
      throw new Error('simulated OS key-store error')
    }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    return Buffer.concat([
      iv,
      cipher.update(plainText, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ])
  }

  getSelectedStorageBackend(): string {
    return this.backend
  }

  async isAsyncEncryptionAvailable(): Promise<boolean> {
    return this.encryptionAvailable
  }
}

async function withDataRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'imagegen-civitai-token-'))
  try {
    await run(root)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

const tokenPath = (root: string): string => path.join(root, 'secrets', 'civitai-token.bin')

test('basic_text and unknown backends refuse token use without creating a secret file', async () => {
  for (const backend of ['basic_text', 'unknown']) {
    await withDataRoot(async (root) => {
      const safeStorage = new TestSafeStorage()
      safeStorage.backend = backend
      const store = new CivitaiTokenStore(safeStorage, root)

      assert.deepEqual(await store.getAvailability(), {
        available: false,
        backend,
        reason: backend,
      })
      assert.equal((await store.getStatus()).kind, 'unavailable')
      await assert.rejects(store.saveToken('valid-looking-token'), {
        code: 'TOKEN_SECURE_STORAGE_UNAVAILABLE',
      })
      await assert.rejects(store.readToken(), { code: 'TOKEN_SECURE_STORAGE_UNAVAILABLE' })
      assert.equal(safeStorage.encryptCalls, 0)
      assert.equal(safeStorage.decryptCalls, 0)
      await assert.rejects(stat(tokenPath(root)), { code: 'ENOENT' })
      await store.removeToken()
    })
  }
})

test('an unavailable async key store refuses persistence even with a named backend', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    safeStorage.encryptionAvailable = false
    const store = new CivitaiTokenStore(safeStorage, root)

    assert.deepEqual(await store.getAvailability(), {
      available: false,
      backend: 'gnome_libsecret',
      reason: 'encryption-unavailable',
    })
    await assert.rejects(store.saveToken('valid-looking-token'), {
      code: 'TOKEN_SECURE_STORAGE_UNAVAILABLE',
    })
    assert.equal(safeStorage.encryptCalls, 0)
    await assert.rejects(stat(tokenPath(root)), { code: 'ENOENT' })
  })
})

test('encrypted token survives store recreation and removal clears only ciphertext', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    const store = new CivitaiTokenStore(safeStorage, root)
    assert.deepEqual(await store.getStatus(), { backend: 'gnome_libsecret', kind: 'missing' })

    const token = 'civitai_example_secret_value'
    await store.saveToken(token)
    const ciphertext = await readFile(tokenPath(root))
    assert.ok(!ciphertext.includes(Buffer.from(token)))
    assert.equal((await stat(tokenPath(root))).mode & 0o777, 0o600)
    assert.equal((await stat(path.dirname(tokenPath(root)))).mode & 0o777, 0o700)

    const reopened = new CivitaiTokenStore(safeStorage, root)
    assert.deepEqual(await reopened.getStatus(), { backend: 'gnome_libsecret', kind: 'stored' })
    assert.equal(await reopened.readToken(), token)

    safeStorage.backend = 'basic_text'
    assert.equal((await reopened.getStatus()).kind, 'unavailable')
    await assert.rejects(reopened.readToken(), { code: 'TOKEN_SECURE_STORAGE_UNAVAILABLE' })
    assert.deepEqual(await readFile(tokenPath(root)), ciphertext)
    await reopened.removeToken()
    await assert.rejects(stat(tokenPath(root)), { code: 'ENOENT' })
    safeStorage.backend = 'gnome_libsecret'
    assert.deepEqual(await reopened.getStatus(), { backend: 'gnome_libsecret', kind: 'missing' })
  })
})

test('failed replacement preserves the previous ciphertext and leaves no temporary file', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    const store = new CivitaiTokenStore(safeStorage, root)
    await store.saveToken('first-token')
    const previous = await readFile(tokenPath(root))

    safeStorage.failEncrypt = true
    await assert.rejects(store.saveToken('replacement-token'), { code: 'TOKEN_STORAGE_FAILED' })
    safeStorage.failEncrypt = false
    assert.deepEqual(await readFile(tokenPath(root)), previous)
    assert.equal(await store.readToken(), 'first-token')
    assert.deepEqual(await readdir(path.dirname(tokenPath(root))), ['civitai-token.bin'])

    safeStorage.failDecrypt = true
    assert.deepEqual(await store.getStatus(), { backend: 'gnome_libsecret', kind: 'unreadable' })
    await assert.rejects(store.readToken(), { code: 'TOKEN_UNREADABLE' })
    assert.deepEqual(await readFile(tokenPath(root)), previous)
  })
})

test('input bounds reject blank, control-character, and oversized tokens before encryption', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    const store = new CivitaiTokenStore(safeStorage, root)
    await assert.rejects(store.saveToken(' \t '), { code: 'TOKEN_INVALID' })
    await assert.rejects(store.saveToken('token\nnext'), { code: 'TOKEN_INVALID' })
    await assert.rejects(store.saveToken('t'.repeat(MAX_CIVITAI_TOKEN_BYTES + 1)), {
      code: 'TOKEN_TOO_LONG',
    })
    assert.equal(safeStorage.encryptCalls, 0)
    await assert.rejects(stat(tokenPath(root)), { code: 'ENOENT' })
  })
})

test('failed atomic replacement leaves the old token and removes the temporary file', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    const initial = new CivitaiTokenStore(safeStorage, root)
    await initial.saveToken('old-token')
    const previous = await readFile(tokenPath(root))

    const failing = new CivitaiTokenStore(safeStorage, root, async () => {
      throw new Error('simulated rename failure')
    })
    await assert.rejects(failing.saveToken('new-token'), { code: 'TOKEN_STORAGE_FAILED' })
    assert.deepEqual(await readFile(tokenPath(root)), previous)
    assert.deepEqual(await readdir(path.dirname(tokenPath(root))), ['civitai-token.bin'])
    assert.equal(await initial.readToken(), 'old-token')
  })
})

test('a symlinked token file is never read and atomic save replaces only the link', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    const store = new CivitaiTokenStore(safeStorage, root)
    const outside = path.join(root, 'outside.bin')
    await writeFile(outside, 'unrelated data')
    await mkdir(path.dirname(tokenPath(root)), { mode: 0o700 })
    await symlink(outside, tokenPath(root))

    assert.deepEqual(await store.getStatus(), { backend: 'gnome_libsecret', kind: 'unreadable' })
    await assert.rejects(store.readToken(), { code: 'TOKEN_UNREADABLE' })
    await store.saveToken('safe-token')
    assert.equal(await store.readToken(), 'safe-token')
    assert.equal(await readFile(outside, 'utf8'), 'unrelated data')
  })
})

test('key rotation rewrites ciphertext atomically while keeping the token readable', async () => {
  await withDataRoot(async (root) => {
    const safeStorage = new TestSafeStorage()
    const store = new CivitaiTokenStore(safeStorage, root)
    await store.saveToken('rotating-token')
    const previous = await readFile(tokenPath(root))

    safeStorage.shouldReEncrypt = true
    assert.equal(await store.readToken(), 'rotating-token')
    assert.notDeepEqual(await readFile(tokenPath(root)), previous)
    safeStorage.shouldReEncrypt = false
    assert.equal(await store.readToken(), 'rotating-token')
  })
})
