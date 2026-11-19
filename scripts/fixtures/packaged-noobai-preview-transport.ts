import assert from 'node:assert/strict'
import { appendFileSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const cases = [
  {
    author: 'L_A_X',
    fileId: 928_571,
    fileName: 'noobai-eps.safetensors',
    modelId: 833_294,
    modelName: 'NoobAI EPS',
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
    sizeBytes: 6_938_040_416,
    versionId: 1_022_833,
    versionName: 'EPS 1.1',
  },
  {
    author: 'Knightus_Ai',
    fileId: 2_566_634,
    fileName: 'cyberfalafel-v.safetensors',
    modelId: 1_147_756,
    modelName: 'Cyberfalafel V',
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    sizeBytes: 6_938_040_794,
    versionId: 2_679_856,
    versionName: 'V 1.2',
  },
]

const syntheticToken = 'owned-noobai-preview-qualification-only'

/** Packager-only collaborators. These ports never send network requests. */
export function createNoobaiPreviewTransport(dataRoot: string) {
  const root = path.join(
    os.homedir(),
    '.codex/artifacts/imagegen-studio/runs/packaged-noobai-preview',
  )
  const relative = path.relative(root, dataRoot)
  assert.match(relative, /^\d{8}(?:-r\d+)?\/controlled\/data\/imagegen-studio$/)
  assert.equal(realpathSync(dataRoot), dataRoot)
  const log = path.join(dataRoot, 'noobai-preview-transport.ndjson')
  const record = (kind: 'body' | 'metadata', input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://civitai.com')
    appendFileSync(log, `${JSON.stringify({ kind, path: url.pathname })}\n`, { mode: 0o600 })
    return url
  }

  const metadata: typeof fetch = async (input, options) => {
    const url = record('metadata', input)
    assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${syntheticToken}`)
    assert.equal(url.search, '')
    if (url.pathname === '/api/v1/me') {
      return Response.json({ id: 1 })
    }

    for (const item of cases) {
      const version = { baseModel: 'NoobAI', id: item.versionId, name: item.versionName }
      if (url.pathname === `/api/v1/models/${item.modelId}`) {
        return Response.json({
          creator: { username: item.author },
          id: item.modelId,
          modelVersions: [version],
          name: item.modelName,
          type: 'Checkpoint',
        })
      }
      if (url.pathname === `/api/v1/model-versions/${item.versionId}`) {
        const file = {
          downloadUrl: `https://civitai.com/api/download/models/${item.versionId}?fileId=${item.fileId}`,
          hashes: { SHA256: item.sha256 },
          id: item.fileId,
          metadata: { format: 'SafeTensor' },
          name: item.fileName,
          primary: false,
          sizeKB: item.sizeBytes / 1024,
        }
        return Response.json({
          ...version,
          files: [
            {
              ...file,
              downloadUrl: `https://civitai.com/api/download/models/${item.versionId}?fileId=1`,
              hashes: { SHA256: 'a'.repeat(64) },
              id: 1,
              name: 'other-precision.safetensors',
              primary: true,
              sizeKB: 1024,
            },
            file,
          ],
          modelId: item.modelId,
        })
      }
    }
    throw new Error('Unexpected qualification metadata route.')
  }

  const body: typeof fetch = async (input) => {
    record('body', input)
    throw new Error('Preview qualification does not admit a body transfer.')
  }

  return { body, metadata }
}
