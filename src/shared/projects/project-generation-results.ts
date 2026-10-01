import type { ProjectGenerationResultsSnapshot } from '../api.js'

import { IGS_SAFETY_CEILINGS } from './project-schema.js'

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const resultPathPattern =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/
const thumbnailPathPattern =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{64})\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/

/** Preload's typed boundary rejects malformed candidate metadata before reaching the renderer. */
export function isProjectGenerationResultsSnapshot(
  value: unknown,
): value is ProjectGenerationResultsSnapshot {
  return (
    isRecord(value) &&
    typeof value.recoveryUnavailable === 'boolean' &&
    Array.isArray(value.unfinishedSiblingJobIds) &&
    value.unfinishedSiblingJobIds.length <= IGS_SAFETY_CEILINGS.archiveEntries &&
    value.unfinishedSiblingJobIds.every(
      (id: unknown) => typeof id === 'string' && uuidPattern.test(id),
    ) &&
    new Set(value.unfinishedSiblingJobIds).size === value.unfinishedSiblingJobIds.length &&
    (value.lastActualSeed === null ||
      (typeof value.lastActualSeed === 'number' &&
        Number.isSafeInteger(value.lastActualSeed) &&
        value.lastActualSeed >= 0 &&
        value.lastActualSeed <= 0xff_ff_ff_ff)) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(
      (candidate: unknown) =>
        isRecord(candidate) &&
        typeof candidate.candidateId === 'string' &&
        uuidPattern.test(candidate.candidateId) &&
        typeof candidate.queueItemId === 'string' &&
        uuidPattern.test(candidate.queueItemId) &&
        typeof candidate.stagingSessionId === 'string' &&
        uuidPattern.test(candidate.stagingSessionId) &&
        typeof candidate.completedAt === 'string' &&
        Number.isSafeInteger(candidate.completionOrder) &&
        (candidate.completionOrder as number) > 0 &&
        typeof candidate.actualSeed === 'number' &&
        Number.isSafeInteger(candidate.actualSeed) &&
        candidate.actualSeed >= 0 &&
        candidate.actualSeed <= 0xff_ff_ff_ff &&
        typeof candidate.sourceDocumentMismatch === 'boolean' &&
        isBbox(candidate.bbox) &&
        isResultImageUrl(candidate.imageUrl, candidate) &&
        (candidate.thumbnailUrl === undefined ||
          isResultThumbnailUrl(candidate.thumbnailUrl, candidate)),
    ) &&
    (!value.recoveryUnavailable ||
      (value.candidates.length === 0 &&
        value.lastActualSeed === null &&
        value.unfinishedSiblingJobIds.length === 0))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isResultImageUrl(value: unknown, candidate: Record<string, unknown>): boolean {
  if (typeof value !== 'string' || !value.startsWith('igs-staging://asset/')) {
    return false
  }
  try {
    const url = new URL(value)
    const match = resultPathPattern.exec(url.pathname)
    return (
      url.protocol === 'igs-staging:' &&
      url.hostname === 'asset' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.hash === '' &&
      url.search === '' &&
      match !== null &&
      match[2] === candidate.stagingSessionId &&
      match[3] === candidate.candidateId
    )
  } catch {
    return false
  }
}

function isBbox(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  const { height, width, x, y } = value
  return (
    typeof x === 'number' &&
    Number.isSafeInteger(x) &&
    Math.abs(x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    typeof y === 'number' &&
    Number.isSafeInteger(y) &&
    Math.abs(y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    typeof width === 'number' &&
    Number.isSafeInteger(width) &&
    width >= 1 &&
    width <= IGS_SAFETY_CEILINGS.rasterDimension &&
    typeof height === 'number' &&
    Number.isSafeInteger(height) &&
    height >= 1 &&
    height <= IGS_SAFETY_CEILINGS.rasterDimension
  )
}

function isResultThumbnailUrl(value: unknown, candidate: Record<string, unknown>): boolean {
  if (typeof value !== 'string' || typeof candidate.imageUrl !== 'string') {
    return false
  }
  try {
    const url = new URL(value)
    const image = new URL(candidate.imageUrl)
    const match = thumbnailPathPattern.exec(url.pathname)
    return (
      url.protocol === 'igs-staging:' &&
      url.hostname === 'thumbnail' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.hash === '' &&
      url.search === '' &&
      match !== null &&
      match[2] === candidate.stagingSessionId &&
      match[3] === candidate.candidateId &&
      image.pathname.startsWith(`/${match[1]}/${match[2]}/${match[3]}/${match[4]}/`)
    )
  } catch {
    return false
  }
}
