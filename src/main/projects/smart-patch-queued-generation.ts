import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'

import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { SmartPatchInputBundle } from './project-smart-patch-input-bundle.js'
import type {
  FrozenSmartPatchInputItemV1,
  FrozenSmartPatchInputV1,
} from './smart-patch-frozen-input.js'

import {
  parseFrozenSmartPatchInputV1,
  SMART_PATCH_INPUT_MANIFEST_MAX_BYTES,
} from './smart-patch-frozen-input.js'

export type SmartPatchQueueOperation = 'anima-smart-patch' | 'illustrious-smart-patch'

export type FrozenQueuedSmartPatchV1 = FrozenQueuedSmartPatchFields &
  (
    | {
        item: Extract<FrozenSmartPatchInputItemV1, { family: 'anima' }>
        kind: 'anima-smart-patch'
      }
    | {
        item: Extract<FrozenSmartPatchInputItemV1, { family: 'illustrious' }>
        kind: 'illustrious-smart-patch'
      }
  )

interface FrozenQueuedSmartPatchFields {
  animaPromptInterpretation?: typeof ANIMA_PROMPT_INTERPRETATION
  bundle: { id: string; itemIndex: number; manifestSha256: string }
  context: FrozenSmartPatchInputV1['context']
  files: FrozenSmartPatchInputV1['files']
  latentMaskHasCoverage: boolean
  mode: FrozenSmartPatchInputV1['mode']
  regional?: FrozenSmartPatchInputV1['regional']
  schemaVersion: 1
  sourceAlpha: FrozenSmartPatchInputV1['sourceAlpha']
}

export class SmartPatchQueuedGenerationError extends Error {
  readonly code = 'QUEUE_INPUT_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'SmartPatchQueuedGenerationError'
  }
}

const queuedSchema = v.strictObject({
  animaPromptInterpretation: v.optional(v.literal(ANIMA_PROMPT_INTERPRETATION)),
  bundle: v.strictObject({
    id: v.pipe(v.string(), v.uuid()),
    itemIndex: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(31)),
    manifestSha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  }),
  context: v.unknown(),
  files: v.unknown(),
  item: v.unknown(),
  kind: v.picklist(['anima-smart-patch', 'illustrious-smart-patch']),
  latentMaskHasCoverage: v.unknown(),
  mode: v.unknown(),
  regional: v.optional(v.unknown()),
  schemaVersion: v.literal(1),
  sourceAlpha: v.unknown(),
})

export function isSmartPatchQueueOperation(input: unknown): input is SmartPatchQueueOperation {
  return input === 'anima-smart-patch' || input === 'illustrious-smart-patch'
}

/** Strict operational metadata; actual fixed-role PNG verification belongs to the bundle owner. */
export function parseFrozenQueuedSmartPatchV1(input: unknown): FrozenQueuedSmartPatchV1 {
  let snapshot: unknown
  try {
    snapshot = structuredClone(input)
    if (
      Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > SMART_PATCH_INPUT_MANIFEST_MAX_BYTES
    ) {
      refuse('The frozen Smart Patch queue payload exceeds its byte limit.')
    }
  } catch (error) {
    if (error instanceof SmartPatchQueuedGenerationError) {
      throw error
    }
    refuse('The frozen Smart Patch queue payload is not JSON metadata.')
  }
  const parsed = v.safeParse(queuedSchema, snapshot)
  if (!parsed.success) {
    refuse('The frozen Smart Patch queue payload is invalid.')
  }
  const queued = parsed.output
  let manifest: FrozenSmartPatchInputV1
  try {
    manifest = parseFrozenSmartPatchInputV1({
      ...(queued.animaPromptInterpretation !== undefined
        ? { animaPromptInterpretation: queued.animaPromptInterpretation }
        : {}),
      ...(Object.hasOwn(queued, 'regional') ? { regional: queued.regional } : {}),
      context: queued.context,
      files: queued.files,
      items: [queued.item],
      kind: 'smart-patch-frozen-input',
      latentMaskHasCoverage: queued.latentMaskHasCoverage,
      mode: queued.mode,
      schemaVersion: 1,
      sourceAlpha: queued.sourceAlpha,
    })
  } catch {
    refuse('The frozen Smart Patch queue item differs from its input contract.')
  }
  if (manifest.context.locked || !manifest.context.visible) {
    refuse('Smart Patch queue admission requires an unlocked visible target.')
  }
  const item = manifest.items[0]
  if (queued.kind !== `${item.family}-smart-patch`) {
    refuse('The Smart Patch queue operation and concrete model family disagree.')
  }
  return {
    ...(manifest.animaPromptInterpretation !== undefined
      ? { animaPromptInterpretation: manifest.animaPromptInterpretation }
      : {}),
    ...(manifest.regional !== undefined ? { regional: manifest.regional } : {}),
    bundle: { ...queued.bundle },
    context: manifest.context,
    files: manifest.files,
    item,
    kind: queued.kind,
    latentMaskHasCoverage: manifest.latentMaskHasCoverage,
    mode: manifest.mode,
    schemaVersion: 1,
    sourceAlpha: manifest.sourceAlpha,
  } as FrozenQueuedSmartPatchV1
}

/** Bind one concrete item to the exact committed bundle, without transient execution paths. */
export function buildFrozenQueuedSmartPatchV1(
  bundle: SmartPatchInputBundle,
  itemIndex: number,
): FrozenQueuedSmartPatchV1 {
  if (!Number.isSafeInteger(itemIndex) || itemIndex < 0 || itemIndex > 31) {
    refuse('The Smart Patch queue item index is invalid.')
  }
  let manifest: FrozenSmartPatchInputV1
  try {
    manifest = parseFrozenSmartPatchInputV1(bundle.manifest)
  } catch {
    refuse('The Smart Patch input bundle metadata is invalid.')
  }
  const item = manifest.items[itemIndex]
  if (!item) {
    refuse('The selected Smart Patch item is absent from its frozen bundle.')
  }
  return parseFrozenQueuedSmartPatchV1({
    ...(manifest.animaPromptInterpretation !== undefined
      ? { animaPromptInterpretation: manifest.animaPromptInterpretation }
      : {}),
    ...(manifest.regional !== undefined ? { regional: manifest.regional } : {}),
    bundle: { id: bundle.id, itemIndex, manifestSha256: bundle.manifestSha256 },
    context: manifest.context,
    files: manifest.files,
    item,
    kind: `${item.family}-smart-patch`,
    latentMaskHasCoverage: manifest.latentMaskHasCoverage,
    mode: manifest.mode,
    schemaVersion: 1,
    sourceAlpha: manifest.sourceAlpha,
  })
}

/** A valid self-contained row must still agree with the independently reloaded bundle. */
export function assertQueuedSmartPatchBundle(
  payload: FrozenQueuedSmartPatchV1,
  bundle: SmartPatchInputBundle,
): void {
  const captured = parseFrozenQueuedSmartPatchV1(payload)
  const expected = buildFrozenQueuedSmartPatchV1(bundle, captured.bundle.itemIndex)
  if (!isDeepStrictEqual(captured, expected)) {
    refuse('The queued Smart Patch input no longer matches its exact bundle item.')
  }
}

function refuse(message: string): never {
  throw new SmartPatchQueuedGenerationError(message)
}
