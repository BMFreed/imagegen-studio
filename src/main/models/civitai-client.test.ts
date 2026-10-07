import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CivitaiClient, CivitaiClientError, parseCivitaiModelUrl } from './civitai-client.js'

const model = {
  creator: { username: 'artist' },
  description: 'A checkpoint',
  id: 42,
  modelVersions: [
    { baseModel: 'Illustrious', id: 7, name: 'v1' },
    { baseModel: 'Illustrious', id: 8, name: 'v2' },
  ],
  name: 'Portrait Model',
  type: 'Checkpoint',
}

const version = {
  baseModel: 'Illustrious',
  files: [
    {
      downloadUrl: 'https://civitai.com/api/download/models/7?fileId=701',
      hashes: { SHA256: 'a'.repeat(64) },
      id: 701,
      metadata: { format: 'SafeTensor' },
      name: 'full.safetensors',
      primary: true,
      sizeKB: 10.5,
    },
    {
      // Linked files can originate from another version. Identity comes from fileId + SHA.
      downloadUrl: 'https://civitai.com/api/download/models/6?fileId=702',
      hashes: { SHA256: 'b'.repeat(64) },
      id: 702,
      name: 'pruned.safetensors',
      sizeKB: 5,
    },
  ],
  id: 7,
  images: [],
  modelId: 42,
  name: 'v1',
  trainedWords: ['portrait'],
}

function fixtureTransport(
  versionBody: unknown = version,
  modelBody: unknown = model,
): {
  calls: { authorization: string | null; pathname: string; redirect: RequestRedirect | undefined }[]
  fetcher: typeof fetch
} {
  const calls: {
    authorization: string | null
    pathname: string
    redirect: RequestRedirect | undefined
  }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push({
      authorization: new Headers(init?.headers).get('Authorization'),
      pathname: url.pathname,
      redirect: init?.redirect,
    })
    const body = url.pathname === '/api/v1/models/42' ? modelBody : versionBody
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }
  return { calls, fetcher }
}

test('URL parser only accepts a canonical CivitAI model page and explicit numeric version', () => {
  assert.deepEqual(
    parseCivitaiModelUrl('https://civitai.com/models/42/portrait?modelVersionId=7'),
    {
      modelId: 42,
      versionId: 7,
    },
  )
  for (const input of [
    'http://civitai.com/models/42',
    'https://civitai.com.evil.test/models/42',
    'https://user:secret@civitai.com/models/42',
    'https://civitai.com/api/download/models/7',
    'https://civitai.com/models/42?modelVersionId=not-a-number',
  ]) {
    assert.throws(() => parseCivitaiModelUrl(input), { code: 'CIVITAI_INVALID_URL' })
  }
})

test('a model URL without version requires explicit version selection', async () => {
  const { calls, fetcher } = fixtureTransport()
  const result = await new CivitaiClient(fetcher).previewImport(
    'https://civitai.com/models/42',
    'token',
  )
  assert.equal(result.kind, 'select-version')
  if (result.kind === 'select-version') {
    assert.deepEqual(
      result.versions.map((choice) => choice.id),
      [7, 8],
    )
  }
  assert.deepEqual(
    calls.map((call) => call.pathname),
    ['/api/v1/models/42'],
  )
  assert.equal(calls[0]?.authorization, 'Bearer token')
  assert.equal(calls[0]?.redirect, 'error')
})

test('version choices retain CivitAI publication dates for release-order comparisons', async () => {
  const { fetcher } = fixtureTransport(version, {
    ...model,
    modelVersions: [
      { ...model.modelVersions[0], publishedAt: '2025-01-01T00:00:00.000Z' },
      { ...model.modelVersions[1], publishedAt: '2025-02-01T00:00:00.000Z' },
    ],
  })
  const result = await new CivitaiClient(fetcher).previewImport(
    'https://civitai.com/models/42',
    'token',
  )
  assert.equal(result.kind, 'select-version')
  if (result.kind === 'select-version') {
    assert.deepEqual(
      result.versions.map((choice) => choice.publishedAt),
      ['2025-01-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z'],
    )
  }
})

test('preview preserves exact file IDs and file-specific URLs on a multi-file version', async () => {
  const { calls, fetcher } = fixtureTransport()
  const result = await new CivitaiClient(fetcher).previewImport(
    'https://civitai.com/models/42?modelVersionId=7',
    'token',
  )
  assert.equal(result.kind, 'select-file')
  if (result.kind === 'select-file') {
    assert.equal(result.baseModelFamily, 'illustrious')
    assert.deepEqual(
      result.files.map((file) => file.fileId),
      [701, 702],
    )
    assert.equal(result.files[0]?.sha256, 'a'.repeat(64))
    assert.equal(
      result.files[1]?.downloadUrl,
      'https://civitai.com/api/download/models/6?fileId=702',
    )
  }
  assert.deepEqual(
    calls.map((call) => call.pathname),
    ['/api/v1/models/42', '/api/v1/model-versions/7'],
  )
})

test('NoobAI version selection retains source labels and the selected checkpoint maps to Illustrious', async () => {
  const sourceModel = {
    ...model,
    modelVersions: [
      { baseModel: 'NoobAI', id: 7, name: 'v-pred derivative' },
      { baseModel: 'Anima', id: 8, name: 'Anima derivative' },
      { baseModel: 'Pony', id: 9, name: 'unsupported derivative' },
    ],
  }
  const { calls, fetcher } = fixtureTransport({ ...version, baseModel: 'NoobAI' }, sourceModel)
  const client = new CivitaiClient(fetcher)
  const choices = await client.previewImport('https://civitai.com/models/42', 'token')
  assert.equal(choices.kind, 'select-version')
  if (choices.kind !== 'select-version') {
    throw new Error('Expected explicit version selection.')
  }
  assert.deepEqual(choices.versions, sourceModel.modelVersions)
  assert.deepEqual(
    calls.map((call) => call.pathname),
    ['/api/v1/models/42'],
  )

  const selected = await client.previewImport(
    'https://civitai.com/models/42?modelVersionId=7',
    'token',
  )
  assert.equal(selected.kind, 'select-file')
  if (selected.kind !== 'select-file') {
    throw new Error('Expected the selected checkpoint file.')
  }
  assert.equal(selected.baseModel, 'NoobAI')
  assert.equal(selected.baseModelFamily, 'illustrious')
  assert.equal(selected.resourceType, 'checkpoint')
  assert.equal(selected.modelId, 42)
  assert.equal(selected.versionId, 7)
  assert.deepEqual(selected.trainedWords, ['portrait'])
  assert.deepEqual(
    selected.files.map((file) => file.fileId),
    [701, 702],
  )
  assert.equal(selected.files[0]?.sha256, 'a'.repeat(64))
  assert.equal(selected.files[0]?.sizeEstimateBytes, 10_752)
  assert.equal(
    selected.files[1]?.downloadUrl,
    'https://civitai.com/api/download/models/6?fileId=702',
  )
  assert.deepEqual(
    calls.map((call) => call.pathname),
    ['/api/v1/models/42', '/api/v1/models/42', '/api/v1/model-versions/7'],
  )
})

test('NoobAI LoRA and embedding previews use Illustrious without rewriting source metadata', async () => {
  for (const [type, expectedType] of [
    ['LORA', 'lora'],
    ['TextualInversion', 'embedding'],
  ]) {
    const { fetcher } = fixtureTransport({ ...version, baseModel: 'NoobAI' }, { ...model, type })
    const selected = await new CivitaiClient(fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    )
    assert.equal(selected.kind, 'select-file')
    if (selected.kind !== 'select-file') {
      throw new Error('Expected a derivative file preview.')
    }
    assert.equal(selected.baseModel, 'NoobAI')
    assert.equal(selected.baseModelFamily, 'illustrious')
    assert.equal(selected.resourceType, expectedType)
    assert.deepEqual(selected.trainedWords, version.trainedWords)
    assert.equal(selected.files[0]?.sha256, 'a'.repeat(64))
  }
})

test('NoobAI family mapping does not admit an unsupported resource type', async () => {
  const { calls, fetcher } = fixtureTransport(
    { ...version, baseModel: 'NoobAI' },
    { ...model, type: 'LoCon' },
  )
  await assert.rejects(
    new CivitaiClient(fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    ),
    { code: 'CIVITAI_UNSUPPORTED_TYPE' },
  )
  assert.deepEqual(
    calls.map((call) => call.pathname),
    ['/api/v1/models/42'],
  )
})

test('upscaler preview accepts checkpoint files without a generation model family', async () => {
  for (const sourceFamily of [null, 'Other', 'NoobAI']) {
    const upscalerModel = {
      ...model,
      modelVersions: [{ baseModel: sourceFamily, id: 7, name: 'v1' }],
      type: 'Upscaler',
    }
    const upscalerVersion = {
      ...version,
      baseModel: sourceFamily,
      files: [
        {
          ...version.files[0],
          metadata: { format: 'SafeTensor' },
          name: 'RealESRGAN_x4.pth',
        },
        {
          ...version.files[1],
          downloadUrl: 'https://civitai.com/api/download/models/7?fileId=702',
          name: 'RealESRGAN_x2.pt',
        },
        {
          ...version.files[1],
          downloadUrl: 'https://civitai.com/api/download/models/7?fileId=703',
          id: 703,
          metadata: { format: 'SafeTensor' },
          name: 'Upscaler.safetensors',
        },
        {
          ...version.files[1],
          downloadUrl: 'https://civitai.com/api/download/models/7?fileId=704',
          id: 704,
          name: 'Unsupported.ckpt',
        },
      ],
    }
    const { fetcher } = fixtureTransport(upscalerVersion, upscalerModel)
    const result = await new CivitaiClient(fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    )
    assert.equal(result.kind, 'select-file')
    if (result.kind === 'select-file') {
      assert.equal(result.resourceType, 'upscaler')
      assert.equal(result.baseModel, sourceFamily ?? 'Any')
      assert.equal(result.baseModelFamily, null)
      assert.deepEqual(
        result.files.map(({ fileId, format, name }) => ({ fileId, format, name })),
        [
          { fileId: 701, format: 'PyTorch', name: 'RealESRGAN_x4.pth' },
          { fileId: 702, format: 'PyTorch', name: 'RealESRGAN_x2.pt' },
          { fileId: 703, format: 'SafeTensor', name: 'Upscaler.safetensors' },
        ],
      )
    }
  }
})

test('checkpoint imports still exclude pickle files and unsupported model families', async () => {
  for (const baseModel of ['Illustrious', 'NoobAI']) {
    const pickleOnly = fixtureTransport({
      ...version,
      baseModel,
      files: [{ ...version.files[0], name: 'checkpoint.pth' }],
    })
    await assert.rejects(
      new CivitaiClient(pickleOnly.fetcher).previewImport(
        'https://civitai.com/models/42?modelVersionId=7',
        'token',
      ),
      { code: 'CIVITAI_NO_SUPPORTED_FILE' },
      baseModel,
    )
  }

  for (const type of ['Checkpoint', 'LORA', 'TextualInversion']) {
    for (const baseModel of [
      'Other',
      'SDXL',
      'SDXL 1.0',
      'Pony',
      'NoobAI XL',
      'noobai',
      'NoobAI ',
    ]) {
      const unsupportedFamily = fixtureTransport({ ...version, baseModel }, { ...model, type })
      await assert.rejects(
        new CivitaiClient(unsupportedFamily.fetcher).previewImport(
          'https://civitai.com/models/42?modelVersionId=7',
          'token',
        ),
        { code: 'CIVITAI_UNSUPPORTED_FAMILY' },
        `${type}: ${baseModel}`,
      )
    }
  }
})

test('standalone VAE preview maps only Illustrious and SDXL 1.0 applicability while retaining source labels', async () => {
  for (const baseModel of ['Illustrious', 'SDXL 1.0']) {
    const { fetcher } = fixtureTransport({ ...version, baseModel }, { ...model, type: 'VAE' })
    const preview = await new CivitaiClient(fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    )
    assert.equal(preview.kind, 'select-file')
    if (preview.kind === 'select-file') {
      assert.equal(preview.resourceType, 'vae')
      assert.equal(preview.baseModelFamily, 'illustrious')
      assert.equal(preview.baseModel, baseModel)
      assert.deepEqual(
        preview.files.map((file) => file.name),
        ['full.safetensors', 'pruned.safetensors'],
      )
    }
  }
  for (const baseModel of ['Anima', 'NoobAI', 'SD 1.5', 'SDXL', 'Pony', 'Other', '', null]) {
    const { fetcher } = fixtureTransport({ ...version, baseModel }, { ...model, type: 'VAE' })
    await assert.rejects(
      new CivitaiClient(fetcher).previewImport(
        'https://civitai.com/models/42?modelVersionId=7',
        'token',
      ),
      { code: 'CIVITAI_UNSUPPORTED_FAMILY' },
      String(baseModel),
    )
  }
})

test('VAE applicability mapping never admits SDXL 1.0 checkpoints, LoRAs or embeddings', async () => {
  for (const type of ['Checkpoint', 'LORA', 'TextualInversion']) {
    const { fetcher } = fixtureTransport({ ...version, baseModel: 'SDXL 1.0' }, { ...model, type })
    await assert.rejects(
      new CivitaiClient(fetcher).previewImport(
        'https://civitai.com/models/42?modelVersionId=7',
        'token',
      ),
      { code: 'CIVITAI_UNSUPPORTED_FAMILY' },
      type,
    )
  }
  const { fetcher } = fixtureTransport(
    { ...version, files: [{ ...version.files[0], name: 'pickle-vae.pt' }] },
    { ...model, type: 'VAE' },
  )
  await assert.rejects(
    new CivitaiClient(fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    ),
    { code: 'CIVITAI_NO_SUPPORTED_FILE' },
  )
})

test('mismatched version or untrusted file URL fails before installation', async () => {
  const mismatch = fixtureTransport({ ...version, modelId: 99 })
  await assert.rejects(
    new CivitaiClient(mismatch.fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    ),
    { code: 'CIVITAI_VERSION_MISMATCH' },
  )

  const untrusted = fixtureTransport({
    ...version,
    files: [{ ...version.files[0], downloadUrl: 'https://127.0.0.1/file' }],
  })
  await assert.rejects(
    new CivitaiClient(untrusted.fetcher).previewImport(
      'https://civitai.com/models/42?modelVersionId=7',
      'token',
    ),
    { code: 'CIVITAI_INVALID_FILE_URL' },
  )
})

test('token validation uses authenticated /me and normalizes 401', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://civitai.com/api/v1/me')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer bad-token')
    return new Response('{}', { status: 401 })
  }
  await assert.rejects(new CivitaiClient(fetcher).validateToken('bad-token'), (error) => {
    assert.ok(error instanceof CivitaiClientError)
    return error.code === 'CIVITAI_INVALID_TOKEN'
  })
})

test('untrusted preview images are not fetched', async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error('fetch must not be called')
  }
  const dataUrl = await new CivitaiClient(fetcher).previewImageDataUrl(
    'https://internal.example.local/secret',
  )
  assert.equal(dataUrl, null)
})
