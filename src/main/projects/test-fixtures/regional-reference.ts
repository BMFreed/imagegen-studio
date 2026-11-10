import { REGIONAL_REFERENCE_INFERENCE_PROFILE } from '../../../shared/projects/regional-reference-inference.js'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { RegionalWorkerInput } from '../regional-worker-request.js'

/** Tiny literal original PNG; transport fixtures do not claim trained-model qualification. */
export const REFERENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  'base64',
)
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const fixtureResources = {
  adapter: Buffer.from('literal adapter transport fixture'),
  visionConfig: Buffer.from('{}'),
  visionModel: Buffer.from('literal vision transport fixture'),
}

export function attachRegionalReferences(
  input: RegionalWorkerInput,
  resourcesRoot: string,
  count = 2,
): void {
  input.compositionProfile = 'invoke-canvas-v1'
  input.globalNegativeCoverage = { kind: 'everywhere' }
  input.globalPositiveCoverage = { kind: 'everywhere' }
  input.positivePooledSourceId = 'current-canvas'
  input.negativePooledSourceId = 'current-canvas'
  input.request.job.vaePrecision = 'FP16'
  const region = input.recipe.regions[0]
  region.referenceImages = Array.from({ length: count }, () => {
    const id = randomUUID()
    return {
      asset: {
        bytes: REFERENCE_PNG.length,
        height: 1,
        path: `assets/regional-references/${id}/${digest(REFERENCE_PNG)}.png`,
        sha256: digest(REFERENCE_PNG),
        width: 1,
      },
      id,
      name: 'Reference transport fixture',
      sourceFormat: 'PNG' as const,
      thumbnail: {
        bytes: 7,
        height: 1,
        path: `assets/regional-references/${id}/${'a'.repeat(64)}.webp`,
        sha256: 'a'.repeat(64),
        width: 1,
      },
    }
  })
  input.references = {
    images: region.referenceImages.map((reference) => ({
      image: {
        bytes: new Uint8Array(REFERENCE_PNG),
        byteSize: reference.asset.bytes,
        height: 1,
        sha256: reference.asset.sha256,
        width: 1,
      },
      referenceId: reference.id,
      regionId: region.regionId,
    })),
    profile: REGIONAL_REFERENCE_INFERENCE_PROFILE,
    resources: Object.fromEntries(
      Object.entries(fixtureResources).map(([role, bytes]) => [
        role,
        {
          byteSize: bytes.length,
          path: path.join(resourcesRoot, `${role}.fixture`),
          sha256: digest(bytes),
        },
      ]),
    ) as NonNullable<RegionalWorkerInput['references']>['resources'],
  }
}

export async function writeRegionalReferenceResourceFixtures(resourcesRoot: string): Promise<void> {
  await mkdir(resourcesRoot, { mode: 0o700, recursive: true })
  for (const [role, bytes] of Object.entries(fixtureResources)) {
    await writeFile(path.join(resourcesRoot, `${role}.fixture`), bytes, { flag: 'wx', mode: 0o600 })
  }
}
