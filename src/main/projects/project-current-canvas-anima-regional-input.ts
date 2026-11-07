import {
  compileAnimaPromptWeighting,
  type CompiledAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import { GENERATION_BATCH_PROMPT_MAX_BYTES } from '../../shared/projects/generation-batch-plan.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import {
  activePromptEmbeddingRefs,
  type GenerationPrompt,
  type PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'

const MAX_REGIONS = 3
const MAX_AGGREGATE_TEXT_BYTES = 128 * 1024
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu

export interface CompiledCurrentCanvasAnimaRegionalPrompt {
  readonly polarity: 'negative' | 'positive'
  readonly prompt: CompiledAnimaPromptWeighting
  readonly sourceId: string
  readonly text: string
}

export class CurrentCanvasAnimaRegionalInputError extends Error {
  constructor(
    readonly code:
      'REGIONAL_ANIMA_INPUT_INVALID' | 'REGIONAL_ANIMA_LIMIT' | 'REGIONAL_ANIMA_UNSUPPORTED',
    message: string,
  ) {
    super(message)
    this.name = 'CurrentCanvasAnimaRegionalInputError'
  }
}

/**
 * Private companion to the existing captured recipe, not generation admission or a wire schema.
 * Invoke a61ac4fb's addRegionalGuidance.ts and Anima denoiser encode each positive source
 * separately. The existing compiler owns syntax and Unicode offsets. Empty blocks remain bound
 * sidecars, but Invoke's truthy-positive rule makes exact empty text non-emitting at the native
 * consumer.
 */
export function compileCurrentCanvasAnimaRegionalPrompts(
  recipe: CurrentCanvasRegionalRecipe,
): readonly CompiledCurrentCanvasAnimaRegionalPrompt[] {
  const data = object(recipe, 'recipe')
  if (data.family !== 'anima') {
    throw unsupported('Regional Anima input requires an original Anima Current Canvas recipe.')
  }
  if (Object.hasOwn(data, 'globalEmbeddings')) {
    throw unsupported('Regional Anima input cannot contain resolved textual-inversion resources.')
  }
  fields(data, [
    'bbox',
    'documentId',
    'documentRevision',
    'family',
    'globalPrompts',
    'item',
    'kind',
    'regions',
  ])
  if (data.kind !== 'current-canvas-regional-recipe') {
    throw invalid('The Current Canvas recipe kind is invalid.')
  }
  uuid(data.documentId, 'document')
  uuid(data.documentRevision, 'revision')
  const bbox = object(data.bbox, 'bbox')
  fields(bbox, ['height', 'width', 'x', 'y'])
  for (const axis of ['height', 'width'] as const) {
    if (!integer(bbox[axis], 64, 2048) || Number(bbox[axis]) % 8 !== 0) {
      throw invalid('Anima recipe dimensions must be supported multiples of eight.')
    }
  }
  if (
    !integer(bbox.x, -PROJECT_MASK_MAX_COORDINATE, PROJECT_MASK_MAX_COORDINATE) ||
    !integer(bbox.y, -PROJECT_MASK_MAX_COORDINATE, PROJECT_MASK_MAX_COORDINATE) ||
    Number(bbox.width) * Number(bbox.height) > 4_000_000
  ) {
    throw invalid('Anima recipe geometry exceeds the existing generation envelope.')
  }
  const item = object(data.item, 'concrete item')
  fields(item, ['iteration', 'promptPairIndex', 'prompts', 'seed'])
  if (
    !integer(item.seed, 0, 0xff_ff_ff_ff) ||
    !integer(item.iteration, 0) ||
    !integer(item.promptPairIndex, 0)
  ) {
    throw invalid('The concrete Anima item identity is invalid.')
  }
  const concrete = object(item.prompts, 'concrete prompts')
  fields(concrete, ['negative', 'positive'])
  const globals = object(data.globalPrompts, 'global prompts')
  fields(globals, ['negative', 'positive'])
  const positive = prompt(globals.positive, 'global positive')
  const negative = prompt(globals.negative, 'global negative')
  if (positive.text !== concrete.positive || negative.text !== concrete.negative) {
    throw invalid('The concrete Anima item and global prompt texts differ.')
  }
  if (!Array.isArray(data.regions)) {
    throw invalid('The regional Anima sources must be ordered.')
  }
  if (data.regions.length > MAX_REGIONS) {
    throw limit('Private Anima input supports at most three enabled regions.')
  }

  const pending: Omit<CompiledCurrentCanvasAnimaRegionalPrompt, 'prompt'>[] = [
    { polarity: 'positive', sourceId: 'current-canvas', text: positive.text },
    { polarity: 'negative', sourceId: 'current-canvas', text: negative.text },
  ]
  const ids = new Set<string>()
  let bytes = textBytes(positive.text) + textBytes(negative.text)
  for (const value of data.regions) {
    const region = object(value, 'region')
    if (Object.hasOwn(region, 'embeddings')) {
      throw unsupported('Regional Anima input cannot contain resolved embedding descriptors.')
    }
    if (Object.hasOwn(region, 'referenceImages')) {
      if (!Array.isArray(region.referenceImages) || region.referenceImages.length !== 0) {
        throw unsupported('Regional reference images are unsupported by this Anima input.')
      }
    }
    fields(
      region,
      ['coverage', 'maskId', 'maskRevision', 'negative', 'positive', 'regionId'],
      ['authoredPrompts', 'referenceImages'],
    )
    const sourceId = uuid(region.regionId, 'region')
    const maskId = uuid(region.maskId, 'mask')
    if (
      ids.has(sourceId) ||
      ids.has(maskId) ||
      sourceId === maskId ||
      !integer(region.maskRevision, 0)
    ) {
      throw invalid('Regional Anima source and mask ownership must be unique.')
    }
    ids.add(sourceId)
    ids.add(maskId)
    const coverage = object(region.coverage, 'coverage')
    fields(coverage, ['alpha', 'bounds', 'intersection', 'kind'])
    const bounds = object(coverage.bounds, 'coverage bounds')
    fields(bounds, ['height', 'width', 'x', 'y'])
    if (
      !(coverage.alpha instanceof Uint8Array) ||
      coverage.alpha.length !== Number(bbox.width) * Number(bbox.height) ||
      ['height', 'width', 'x', 'y'].some((key) => bounds[key] !== bbox[key]) ||
      !['covered', 'empty', 'intersecting-empty', 'outside'].includes(String(coverage.kind))
    ) {
      throw invalid('The regional Anima coverage does not match its captured bbox.')
    }
    const effectiveNegative = object(region.negative, 'regional negative')
    fields(effectiveNegative, ['prompt', 'source'])
    const localNegative = prompt(effectiveNegative.prompt, 'effective regional negative')
    if (localNegative.text !== '') {
      throw unsupported('Spatial Anima regional negative prompts are not qualified.')
    }
    const authored = Object.hasOwn(region, 'authoredPrompts')
      ? object(region.authoredPrompts, 'authored prompts')
      : undefined
    if (authored) {
      fields(authored, ['negative', 'positive', 'useGlobalNegativePrompt'])
      if (typeof authored.useGlobalNegativePrompt !== 'boolean') {
        throw invalid('The authored regional negative source is invalid.')
      }
    }
    if (effectiveNegative.source === 'current-canvas') {
      if (negative.text !== '' || (authored && authored.useGlobalNegativePrompt !== true)) {
        throw invalid('Inherited Anima regional negatives must match the empty global source.')
      }
    } else if (effectiveNegative.source === 'regional') {
      if (!authored || authored.useGlobalNegativePrompt !== false || authored.negative === null) {
        throw invalid('A local Anima regional negative requires its authored empty block.')
      }
      authoredPrompt(authored.negative, '', 'authored local negative')
    } else {
      throw invalid('The regional Anima negative source is invalid.')
    }
    if (region.positive === null) {
      if (authored && authored.positive !== null) {
        throw invalid('An absent positive source must match its authored block.')
      }
      continue
    }
    const regionalPositive = prompt(region.positive, 'regional positive')
    if (!authored || authored.positive === null) {
      throw invalid('A regional Anima positive requires its authored block.')
    }
    authoredPrompt(authored.positive, regionalPositive.text, 'authored positive')
    bytes += textBytes(regionalPositive.text)
    pending.push({ polarity: 'positive', sourceId, text: regionalPositive.text })
  }
  if (bytes > MAX_AGGREGATE_TEXT_BYTES) {
    throw limit('Private Anima regional text exceeds its aggregate byte ceiling.')
  }
  // No collaborator or partial sidecar is exposed while a later source is still being checked.
  return Object.freeze(
    pending.map((entry) =>
      Object.freeze({ ...entry, prompt: compileAnimaPromptWeighting(entry.text) }),
    ),
  )
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`The Anima ${label} is invalid.`)
  }
  return value as Record<string, unknown>
}

function fields(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw invalid('The private Anima input contains missing or unsupported fields.')
  }
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw invalid(`The Anima ${label} identity is invalid.`)
  }
  return value
}

function integer(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  )
}

function prompt(value: unknown, label: string): GenerationPrompt {
  const data = object(value, label)
  fields(data, ['embeddingRefs', 'text'])
  if (!Array.isArray(data.embeddingRefs) || data.embeddingRefs.length !== 0) {
    throw unsupported('Anima regional input cannot consume textual-inversion references.')
  }
  textBytes(data.text)
  return { embeddingRefs: [], text: data.text as string }
}

function authoredPrompt(value: unknown, expected: string, label: string): void {
  const data = object(value, label)
  fields(data, ['embeddingRefs', 'text'])
  if (data.text !== expected || !Array.isArray(data.embeddingRefs)) {
    throw invalid('The effective and authored Anima prompt sources differ.')
  }
  for (const ref of data.embeddingRefs) {
    if (typeof object(ref, 'authored embedding reference').token !== 'string') {
      throw invalid('An authored Anima embedding reference is invalid.')
    }
  }
  if (
    activePromptEmbeddingRefs(expected, data.embeddingRefs as PromptEmbeddingRef[]).length !== 0
  ) {
    throw unsupported('Anima regional input cannot consume active authored embedding references.')
  }
}

function textBytes(value: unknown): number {
  if (typeof value !== 'string') {
    throw invalid('Regional Anima input requires concrete text.')
  }
  if (value.length > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw limit('Private Anima input exceeds the existing 16 KiB per-text ceiling.')
  }
  if (Buffer.from(value, 'utf8').toString('utf8') !== value || /[{}]/u.test(value)) {
    throw invalid('Regional Anima input requires valid, concrete static Unicode text.')
  }
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw limit('Private Anima input exceeds the existing 16 KiB per-text ceiling.')
  }
  return bytes
}

function invalid(message: string): CurrentCanvasAnimaRegionalInputError {
  return new CurrentCanvasAnimaRegionalInputError('REGIONAL_ANIMA_INPUT_INVALID', message)
}

function unsupported(message: string): CurrentCanvasAnimaRegionalInputError {
  return new CurrentCanvasAnimaRegionalInputError('REGIONAL_ANIMA_UNSUPPORTED', message)
}

function limit(message: string): CurrentCanvasAnimaRegionalInputError {
  return new CurrentCanvasAnimaRegionalInputError('REGIONAL_ANIMA_LIMIT', message)
}
