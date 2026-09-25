import { setDefaultAutoSelectFamily } from 'node:net'

import { requestPinnedHttps } from '../model-downloader.js'

const [url, address, autoSelectFamily] = process.argv.slice(2)
if (!url || !address || !['false', 'true'].includes(autoSelectFamily)) {
  throw new Error('Invalid local HTTPS test arguments')
}

setDefaultAutoSelectFamily(autoSelectFamily === 'true')

try {
  const response = await requestPinnedHttps(new URL(url), {}, address)
  process.stdout.write(
    `${JSON.stringify({ body: await response.text(), ok: true, status: response.status })}\n`,
  )
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ code: (error as NodeJS.ErrnoException).code ?? null, ok: false })}\n`,
  )
}
