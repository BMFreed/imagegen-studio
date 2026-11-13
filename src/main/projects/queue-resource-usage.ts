import { activePromptEmbeddingRefs } from '../../shared/projects/prompt-embeddings.js'

import path from 'node:path'

import type { FrozenQueuedGenerationV1 } from './generation-queue.js'
import type { FrozenQueuedRegionalOperationalV1 } from './regional-queued-generation.js'
import type { FrozenQueuedSmartPatchV1 } from './smart-patch-queued-generation.js'

import { GenerationQueueError, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import { parseFrozenQueuedRegionalOperationalV1 } from './regional-queued-generation.js'
import {
  isSmartPatchQueueOperation,
  parseFrozenQueuedSmartPatchV1,
} from './smart-patch-queued-generation.js'

/** Retiring a binding and removing its unshared physical bytes are separate effects. */
export interface QueuedResourceRemovalTarget {
  resourceId: string
  unsharedPaths: readonly string[]
  versionIds: readonly string[]
}

export interface QueuedResourceUse {
  localModelId?: string
  localVersionId?: string
  managedPath: string
  sha256: string
}

export type QueuedResourcePayload =
  FrozenQueuedGenerationV1 | FrozenQueuedRegionalOperationalV1 | FrozenQueuedSmartPatchV1

/**
 * Project only resources consumed by the strict frozen operation. Invoke's captured queue/delete
 * claim is adapted at the existing Studio queue owner; this projection neither resolves today's
 * models nor guesses usage from raw JSON or display labels. Regional callers must supply
 * independently qualified owned-sidecar uses, including an empty array for Anima, so local TI can
 * never silently disappear from inspection.
 */
export function queuePayloadResourceUses(
  input: QueuedResourcePayload,
  regionalUses?: readonly QueuedResourceUse[],
): QueuedResourceUse[] {
  if (regionalUses !== undefined && !Array.isArray(regionalUses)) {
    invalid()
  }
  const uses: QueuedResourceUse[] = []
  if (isSmartPatchQueueOperation(input?.kind)) {
    const payload = parseFrozenQueuedSmartPatchV1(input)
    const draft = payload.context.generationDraft
    const selected = payload.item
    const enabledLoras = draft.loras.filter((entry) => entry.enabled)
    // Both regional metadata owners reject consumed local/global TI references:
    // Illustrious validateSources and Anima compileRecipeSources/consumedPrompt.
    if (selected.family === 'anima') {
      addExact(uses, draft.model!, selected.inference.model.checkpoint)
      addFile(uses, selected.inference.model.qwen3Encoder)
      addFile(uses, selected.inference.model.vae)
    } else {
      addExact(uses, draft.model!, selected.inference.checkpoint)
      if (selected.inference.vae) {
        addExact(uses, draft.vae!, selected.inference.vae)
      }
      for (const sign of ['positive', 'negative'] as const) {
        const refs = activePromptEmbeddingRefs(
          selected.item.prompts[sign],
          draft[sign === 'positive' ? 'positivePrompt' : 'negativePrompt'].embeddingRefs,
        )
        for (const [index, file] of (selected.inference.embeddings?.[sign] ?? []).entries()) {
          const reference = refs[index]
          if (!reference || reference.token !== file.token) {
            invalid()
          }
          addExact(uses, reference.resource, file)
        }
      }
    }
    for (const [index, file] of (selected.inference.loras ?? []).entries()) {
      const reference = enabledLoras[index]?.resource
      if (!reference) {
        invalid()
      }
      addExact(uses, reference, file)
    }
  } else {
    const regional = isRegionalKind(input?.kind)
    if (regional && regionalUses === undefined) {
      invalid()
    }
    const json = JSON.stringify(input)
    const payload = regional
      ? parseFrozenQueuedRegionalOperationalV1(json)
      : parseFrozenGenerationPayloadV1(json)
    switch (payload.kind) {
      case 'anima-img2img':
      case 'anima-outpaint':
      case 'anima-regional-img2img':
      case 'anima-regional-outpaint':
      case 'anima-regional-txt2img':
      case 'anima-txt2img': {
        const { loras, model } = payload.context
        addExact(uses, model.checkpoint.reference, {
          path: model.checkpoint.managedPath,
          sha256: model.checkpoint.reference.fileSha256,
        })
        for (const component of [model.qwen3Encoder, model.vae]) {
          uses.push({
            localModelId: component.localModelId,
            localVersionId: component.localVersionId,
            managedPath: component.managedPath,
            sha256: component.sha256,
          })
        }
        for (const lora of loras) {
          addExact(uses, lora.reference, {
            path: lora.managedPath,
            sha256: lora.reference.fileSha256,
          })
        }
        break
      }
      default: {
        const context = payload.context
        addExact(uses, context.model.reference, {
          path: context.model.managedPath,
          sha256: context.model.reference.fileSha256,
        })
        for (const lora of context.loras ?? []) {
          addExact(uses, lora.reference, {
            path: lora.managedPath,
            sha256: lora.reference.fileSha256,
          })
        }
        if (context.vae) {
          addExact(uses, context.vae.reference, {
            path: context.vae.managedPath,
            sha256: context.vae.reference.fileSha256,
          })
        }
        for (const sign of ['positive', 'negative'] as const) {
          for (const embedding of context.embeddings?.[sign] ?? []) {
            addExact(uses, embedding.reference, {
              path: embedding.managedPath,
              sha256: embedding.reference.fileSha256,
            })
          }
        }
      }
    }
    if (regional) {
      uses.push(...structuredClone(regionalUses!))
    }
  }
  const unique = new Map<string, QueuedResourceUse>()
  for (const use of uses) {
    if (
      !use ||
      typeof use !== 'object' ||
      typeof use.managedPath !== 'string' ||
      typeof use.sha256 !== 'string' ||
      !path.isAbsolute(use.managedPath) ||
      path.resolve(use.managedPath) !== use.managedPath ||
      use.managedPath.includes('\0') ||
      !/^[a-f0-9]{64}$/.test(use.sha256) ||
      (use.localModelId === undefined) !== (use.localVersionId === undefined) ||
      (use.localModelId !== undefined &&
        (typeof use.localModelId !== 'string' ||
          !use.localModelId ||
          typeof use.localVersionId !== 'string' ||
          !use.localVersionId))
    ) {
      invalid()
    }
    const detached = { ...use }
    unique.set(
      JSON.stringify([
        use.localModelId ?? null,
        use.localVersionId ?? null,
        use.managedPath,
        use.sha256,
      ]),
      detached,
    )
  }
  return [...unique.values()]
}

function addExact(
  uses: QueuedResourceUse[],
  reference: { fileSha256: string; localModelId: string; localVersionId: string },
  file: { path: string; sha256: string },
): void {
  if (!reference || reference.fileSha256 !== file.sha256) {
    invalid()
  }
  uses.push({
    localModelId: reference.localModelId,
    localVersionId: reference.localVersionId,
    managedPath: file.path,
    sha256: file.sha256,
  })
}

function addFile(uses: QueuedResourceUse[], file: { path: string; sha256: string }): void {
  uses.push({ managedPath: file.path, sha256: file.sha256 })
}

function isRegionalKind(kind: unknown): boolean {
  return (
    kind === 'illustrious-regional' ||
    kind === 'illustrious-regional-txt2img' ||
    kind === 'illustrious-regional-img2img' ||
    kind === 'illustrious-regional-outpaint' ||
    kind === 'anima-regional-txt2img' ||
    kind === 'anima-regional-img2img' ||
    kind === 'anima-regional-outpaint'
  )
}

function invalid(): never {
  throw new GenerationQueueError(
    'QUEUE_INPUT_INVALID',
    'The frozen queue resource usage is invalid or incomplete.',
  )
}
