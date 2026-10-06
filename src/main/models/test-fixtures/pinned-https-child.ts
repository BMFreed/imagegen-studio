import { createHash } from 'node:crypto'
import { setDefaultAutoSelectFamily } from 'node:net'

import { requestPinnedHttps } from '../model-downloader.js'

const [url, address, autoSelectFamily, mode] = process.argv.slice(2)
if (
  !url ||
  !address ||
  !['false', 'true'].includes(autoSelectFamily) ||
  (mode !== undefined && mode !== 'unread')
) {
  throw new Error('Invalid local HTTPS test arguments')
}

setDefaultAutoSelectFamily(autoSelectFamily === 'true')

try {
  const response = await requestPinnedHttps(new URL(url), {}, address)
  if (mode === 'unread') {
    if (!response.body || !process.send) {
      throw new Error('The native streaming test requires a response body and IPC channel')
    }
    const consumerAllowed = new Promise<void>((resolve, reject) => {
      process.once('message', (message: unknown) => {
        if (
          message !== null &&
          typeof message === 'object' &&
          'kind' in message &&
          message.kind === 'consume'
        ) {
          resolve()
        } else {
          reject(new Error('Invalid native streaming test control message'))
        }
      })
      process.once('disconnect', () => reject(new Error('Native streaming test disconnected')))
    })
    process.send({ kind: 'response-unread', status: response.status })
    await consumerAllowed
    const reader = response.body.getReader()
    const digest = createHash('sha256')
    let byteSize = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) {
          break
        }
        byteSize += part.value.byteLength
        digest.update(part.value)
      }
    } finally {
      reader.releaseLock()
    }
    process.stdout.write(
      `${JSON.stringify({ byteSize, ok: true, sha256: digest.digest('hex'), status: response.status })}\n`,
    )
  } else {
    process.stdout.write(
      `${JSON.stringify({ body: await response.text(), ok: true, status: response.status })}\n`,
    )
  }
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ code: (error as NodeJS.ErrnoException).code ?? null, ok: false })}\n`,
  )
} finally {
  if (process.connected && process.disconnect) {
    process.disconnect()
  }
}
