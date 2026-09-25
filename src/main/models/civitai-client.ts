import * as v from 'valibot'

const CIVITAI_ORIGIN = 'https://civitai.com'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_PREVIEW_BYTES = 1_000_000
const SHA256_PATTERN = /^[a-f0-9]{64}$/i

const FileSchema = v.object({
  downloadUrl: v.string(),
  hashes: v.optional(v.nullable(v.object({ SHA256: v.optional(v.string()) }))),
  id: v.number(),
  metadata: v.optional(v.nullable(v.object({ format: v.optional(v.string()) }))),
  name: v.string(),
  primary: v.optional(v.boolean()),
  sizeKB: v.optional(v.number()),
})

const VersionSchema = v.object({
  baseModel: v.optional(v.nullable(v.string())),
  files: v.optional(v.array(FileSchema)),
  id: v.number(),
  images: v.optional(v.nullable(v.array(v.object({ url: v.string() })))),
  modelId: v.number(),
  name: v.string(),
  trainedWords: v.optional(v.nullable(v.array(v.string()))),
})

const ModelSchema = v.object({
  creator: v.optional(v.nullable(v.object({ username: v.string() }))),
  description: v.optional(v.nullable(v.string())),
  id: v.number(),
  modelVersions: v.array(
    v.object({
      baseModel: v.optional(v.nullable(v.string())),
      id: v.number(),
      name: v.string(),
      publishedAt: v.optional(v.nullable(v.string())),
    }),
  ),
  name: v.string(),
  type: v.string(),
})

export type ModelResourceType = 'checkpoint' | 'embedding' | 'lora' | 'upscaler' | 'vae'
export type BaseModelFamily = 'anima' | 'illustrious'

export interface CivitaiVersionChoice {
  baseModel: string | null
  id: number
  name: string
  publishedAt?: string
}

export interface CivitaiFileChoice {
  downloadUrl: string
  fileId: number
  format: string | null
  name: string
  primary: boolean
  sha256: string | null
  sizeEstimateBytes: number | null
}

export type CivitaiImportPreview =
  | {
      author: string | null
      baseModel: string
      baseModelFamily: BaseModelFamily | null
      description: string | null
      files: CivitaiFileChoice[]
      kind: 'select-file'
      modelId: number
      modelName: string
      previewImageUrl: string | null
      resourceType: ModelResourceType
      trainedWords: string[]
      versionId: number
      versionName: string
    }
  | {
      author: string | null
      kind: 'select-version'
      modelId: number
      modelName: string
      resourceType: ModelResourceType
      versions: CivitaiVersionChoice[]
    }

export class CivitaiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CivitaiClientError'
  }
}

export class CivitaiClient {
  constructor(
    private readonly transport: typeof fetch = fetch,
    private readonly origin = CIVITAI_ORIGIN,
  ) {}

  async previewImageDataUrl(input: string | null): Promise<string | null> {
    if (!input) {
      return null
    }
    let url: URL
    try {
      url = new URL(input)
    } catch {
      return null
    }
    if (
      url.protocol !== 'https:' ||
      !['civitai.com', 'image.civitai.com'].includes(url.hostname) ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null
    }
    try {
      const response = await this.transport(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const mimeType = response.headers.get('content-type')?.split(';')[0]
      if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType ?? '')) {
        return null
      }
      const reader = response.body?.getReader()
      if (!reader) {
        return null
      }
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const part = await reader.read()
        if (part.done) {
          break
        }
        total += part.value.byteLength
        if (total > MAX_PREVIEW_BYTES) {
          await reader.cancel()
          return null
        }
        chunks.push(part.value)
      }
      return `data:${mimeType};base64,${Buffer.concat(chunks).toString('base64')}`
    } catch {
      return null
    }
  }

  async previewImport(input: string, token: string): Promise<CivitaiImportPreview> {
    const { modelId, versionId } = parseCivitaiModelUrl(input)
    const rawModel = await this.getJson(`/api/v1/models/${modelId}`, token)
    const model = v.safeParse(ModelSchema, rawModel)
    if (!model.success || model.output.id !== modelId) {
      throw new CivitaiClientError(
        'CIVITAI_INVALID_RESPONSE',
        'CivitAI returned invalid model metadata.',
      )
    }
    const type = resourceType(model.output.type)
    const common = {
      author: model.output.creator?.username ?? null,
      modelId,
      modelName: model.output.name,
      resourceType: type,
    }

    if (versionId === null) {
      return {
        ...common,
        kind: 'select-version',
        versions: model.output.modelVersions.map((version) => ({
          baseModel: version.baseModel ?? null,
          id: version.id,
          name: version.name,
          ...(version.publishedAt ? { publishedAt: version.publishedAt } : {}),
        })),
      }
    }

    if (!model.output.modelVersions.some((version) => version.id === versionId)) {
      throw new CivitaiClientError(
        'CIVITAI_VERSION_MISMATCH',
        'This version is not part of the model.',
      )
    }
    const rawVersion = await this.getJson(`/api/v1/model-versions/${versionId}`, token)
    const version = v.safeParse(VersionSchema, rawVersion)
    if (!version.success || version.output.id !== versionId || version.output.modelId !== modelId) {
      throw new CivitaiClientError(
        'CIVITAI_VERSION_MISMATCH',
        'CivitAI returned a different model version.',
      )
    }
    const files = availableFiles(version.output.files ?? [], type)
    if (files.length === 0) {
      throw new CivitaiClientError(
        'CIVITAI_NO_SUPPORTED_FILE',
        'This version has no supported file.',
      )
    }
    return {
      ...common,
      baseModel: version.output.baseModel ?? (type === 'upscaler' ? 'Any' : ''),
      baseModelFamily: type === 'upscaler' ? null : baseModelFamily(version.output.baseModel ?? ''),
      description: model.output.description ?? null,
      files,
      kind: 'select-file',
      previewImageUrl: version.output.images?.[0]?.url ?? null,
      trainedWords: version.output.trainedWords ?? [],
      versionId,
      versionName: version.output.name,
    }
  }

  async validateToken(token: string): Promise<void> {
    await this.getJson('/api/v1/me', token)
  }

  private async getJson(path: string, token: string): Promise<unknown> {
    let response: Response
    try {
      response = await this.transport(new URL(path, this.origin), {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new CivitaiClientError('CIVITAI_NETWORK_ERROR', 'CivitAI could not be reached.')
    }
    if (!response.ok) {
      const messages: Record<number, [string, string]> = {
        401: ['CIVITAI_INVALID_TOKEN', 'The CivitAI token is invalid.'],
        403: ['CIVITAI_ACCESS_DENIED', 'This CivitAI resource is not available to this account.'],
        404: ['CIVITAI_NOT_FOUND', 'The CivitAI model or version was not found.'],
        429: ['CIVITAI_RATE_LIMITED', 'CivitAI is rate limiting requests. Try again later.'],
      }
      const [code, message] = messages[response.status] ?? [
        'CIVITAI_REQUEST_FAILED',
        'CivitAI could not complete the request.',
      ]
      throw new CivitaiClientError(code, message)
    }
    try {
      return await response.json()
    } catch {
      throw new CivitaiClientError('CIVITAI_INVALID_RESPONSE', 'CivitAI returned invalid metadata.')
    }
  }
}

export function parseCivitaiModelUrl(input: string): { modelId: number; versionId: number | null } {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new CivitaiClientError('CIVITAI_INVALID_URL', 'Enter a CivitAI model URL.')
  }
  if (
    url.protocol !== 'https:' ||
    !['civitai.com', 'www.civitai.com'].includes(url.hostname) ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new CivitaiClientError(
      'CIVITAI_INVALID_URL',
      'Only HTTPS CivitAI model URLs are supported.',
    )
  }
  const match = /^\/models\/(\d+)(?:\/[^/]+)?\/?$/.exec(url.pathname)
  if (!match) {
    throw new CivitaiClientError('CIVITAI_INVALID_URL', 'Enter a CivitAI model page URL.')
  }
  const modelId = Number(match[1])
  const rawVersionId = url.searchParams.get('modelVersionId')
  const versionId = rawVersionId === null ? null : Number(rawVersionId)
  if (
    !Number.isSafeInteger(modelId) ||
    modelId < 1 ||
    (versionId !== null && (!Number.isSafeInteger(versionId) || versionId < 1))
  ) {
    throw new CivitaiClientError(
      'CIVITAI_INVALID_URL',
      'The CivitAI model or version ID is invalid.',
    )
  }
  return { modelId, versionId }
}

export function supportedModelFileExtension(
  resourceType: ModelResourceType,
  fileName: string,
): '.pt' | '.pth' | '.safetensors' | null {
  const extension = /\.(safetensors|pth|pt)$/i.exec(fileName)?.[0].toLowerCase()
  if (extension === '.safetensors') {
    return extension
  }
  return resourceType === 'upscaler' && (extension === '.pth' || extension === '.pt')
    ? extension
    : null
}

function resourceType(input: string): ModelResourceType {
  const types: Record<string, ModelResourceType> = {
    Checkpoint: 'checkpoint',
    LORA: 'lora',
    TextualInversion: 'embedding',
    Upscaler: 'upscaler',
    VAE: 'vae',
  }
  const value = types[input]
  if (!value) {
    throw new CivitaiClientError('CIVITAI_UNSUPPORTED_TYPE', 'This resource type is not supported.')
  }
  return value
}

function baseModelFamily(input: string): BaseModelFamily {
  if (input === 'Illustrious') {
    return 'illustrious'
  }
  if (input === 'Anima') {
    return 'anima'
  }
  throw new CivitaiClientError(
    'CIVITAI_UNSUPPORTED_FAMILY',
    'The first release supports Illustrious and Anima resources.',
  )
}

function selectedFileUrl(input: string, fileId: number, hasSha256: boolean): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new CivitaiClientError('CIVITAI_INVALID_FILE_URL', 'The source file URL is invalid.')
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'civitai.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.searchParams.has('token') ||
    !/^\/api\/download\/models\/\d+$/.test(url.pathname)
  ) {
    throw new CivitaiClientError('CIVITAI_INVALID_FILE_URL', 'The source file URL is not trusted.')
  }
  const selectedIds = url.searchParams.getAll('fileId')
  if (
    selectedIds.length > 1 ||
    (selectedIds.length === 1 && selectedIds[0] !== String(fileId)) ||
    (selectedIds.length === 0 && !hasSha256)
  ) {
    throw new CivitaiClientError(
      'CIVITAI_INVALID_FILE_URL',
      'The source file URL does not identify the selected file.',
    )
  }
  return url.toString()
}

function availableFiles(
  files: v.InferOutput<typeof FileSchema>[],
  resourceType: ModelResourceType,
): CivitaiFileChoice[] {
  return files
    .filter((file) => supportedModelFileExtension(resourceType, file.name) !== null)
    .map((file) => {
      if (!Number.isSafeInteger(file.id) || file.id < 1) {
        throw new CivitaiClientError(
          'CIVITAI_INVALID_RESPONSE',
          'CivitAI returned an invalid file ID.',
        )
      }
      const rawSha256 = file.hashes?.SHA256
      if (rawSha256 !== undefined && !SHA256_PATTERN.test(rawSha256)) {
        throw new CivitaiClientError(
          'CIVITAI_INVALID_RESPONSE',
          'CivitAI returned an invalid SHA-256.',
        )
      }
      const sizeEstimateBytes =
        file.sizeKB !== undefined && Number.isFinite(file.sizeKB) && file.sizeKB > 0
          ? Math.round(file.sizeKB * 1024)
          : null
      return {
        downloadUrl: selectedFileUrl(file.downloadUrl, file.id, rawSha256 !== undefined),
        fileId: file.id,
        format:
          resourceType === 'upscaler' &&
          supportedModelFileExtension(resourceType, file.name) !== '.safetensors'
            ? 'PyTorch'
            : (file.metadata?.format ?? null),
        name: file.name,
        primary: file.primary === true,
        sha256: rawSha256?.toLowerCase() ?? null,
        sizeEstimateBytes,
      }
    })
}
