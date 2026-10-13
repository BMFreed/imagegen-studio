import * as v from 'valibot'

import type { ModelCatalogItem } from '../api.js'
import type { IgsProjectDocumentV1 } from '../projects/project-schema.js'

import { equalIllustriousNoiseProfiles } from '../projects/illustrious-noise-profile.js'
import { sameExactPromptEmbedding } from '../projects/prompt-embeddings.js'
import { sameResourceModel } from '../projects/resource-identity.js'
import {
  parsePresetPayload,
  PRESET_SECTION_KEYS,
  type PresetPayload,
  type PresetSectionKey,
} from './preset-schema.js'

export type PresetApplicationTarget = Pick<IgsProjectDocumentV1, 'generationDraft' | 'primaryBbox'>
export interface PresetApplicationRequest {
  documentId: string
  payload: PresetPayload
  selectedSections: PresetSectionKey[]
  sourcePresetId: string
}

export interface PresetApplicationDiagnostic {
  blocking: boolean
  code:
    | 'CATALOG_UNAVAILABLE'
    | 'EMBEDDING_AMBIGUOUS'
    | 'POLICY_ADVISORY_MISMATCH'
    | 'RESOURCE_CORRUPT'
    | 'RESOURCE_DUPLICATE'
    | 'RESOURCE_FAMILY_MISMATCH'
    | 'RESOURCE_FAMILY_UNKNOWN'
    | 'RESOURCE_MISSING'
    | 'SETTING_INACTIVE'
    | 'SETTING_UNSUPPORTED'
  message: string
  resource?: Resource
  section: PresetSectionKey
}

type Resource = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

const SelectionSchema = v.pipe(
  v.array(v.picklist(PRESET_SECTION_KEYS)),
  v.minLength(1),
  v.maxLength(PRESET_SECTION_KEYS.length),
  v.check((keys) => new Set(keys).size === keys.length, 'Select each preset section once.'),
)
const EnvelopeSchema = v.strictObject({
  documentId: v.pipe(v.string(), v.uuid()),
  payload: v.unknown(),
  selectedSections: SelectionSchema,
  sourcePresetId: v.pipe(v.string(), v.uuid()),
})

export function includedPresetSections(payload: PresetPayload): PresetSectionKey[] {
  return PRESET_SECTION_KEYS.filter((section) => payload[section] !== undefined)
}

/** Unselected invalid temporary fields are outside the Apply command, not a persistence failure. */
export function parsePresetApplicationPayload(
  input: unknown,
  selectedSections: readonly PresetSectionKey[],
): PresetPayload {
  const selection = v.parse(SelectionSchema, selectedSections)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Preset settings must be an object.')
  }
  const selected: Record<string, unknown> = {}
  for (const section of selection) {
    if (
      !Object.hasOwn(input, section) ||
      (input as Record<string, unknown>)[section] === undefined
    ) {
      throw new Error(`The selected ${section} section is not included.`)
    }
    selected[section] = (input as Record<string, unknown>)[section]
  }
  return parsePresetPayload(selected)
}

export function parsePresetApplication(input: unknown): PresetApplicationRequest {
  const envelope = v.parse(EnvelopeSchema, input)
  return {
    ...envelope,
    payload: parsePresetApplicationPayload(envelope.payload, envelope.selectedSections),
  }
}

export function effectivePresetModelFamily(
  current: PresetApplicationTarget,
  payload: PresetPayload,
  selectedSections: readonly PresetSectionKey[],
): Resource['baseModelFamily'] {
  return selectedSections.includes('model') && payload.model !== undefined
    ? (payload.model?.baseModelFamily ?? null)
    : (current.generationDraft.model?.baseModelFamily ?? null)
}

/** Pure authoring projection. Main owns validation, file verification and one undo publication. */
export function applyPresetSections(
  current: PresetApplicationTarget,
  payload: PresetPayload,
  selectedSections: readonly PresetSectionKey[],
): PresetApplicationTarget {
  const selected = parsePresetApplicationPayload(payload, selectedSections)
  const next: PresetApplicationTarget = {
    generationDraft: clone(current.generationDraft),
    primaryBbox: clone(current.primaryBbox),
  }
  const draft = next.generationDraft
  if (selected.prompt !== undefined) {
    draft.positivePrompt = clone(selected.prompt)
  }
  if (selected.negativePrompt !== undefined) {
    draft.negativePrompt = clone(selected.negativePrompt)
  }
  if (selected.model !== undefined) {
    // Noise policy belongs to Model Manager; strict .igs references retain only their advisory type.
    const { noiseProfile: _noiseProfile, ...resource } = selected.model
    draft.model = clone(resource)
  }
  if (selected.loras !== undefined) {
    draft.loras = clone(selected.loras)
  }
  if (selected.size !== undefined) {
    next.primaryBbox.width = selected.size.width
    next.primaryBbox.height = selected.size.height
  }
  if (selected.sampling !== undefined) {
    for (const key of ['sampler', 'scheduler', 'animaMethod'] as const) {
      const value = selected.sampling[key]
      if (value !== undefined) {
        if (key === 'animaMethod') {
          draft.sampling.animaMethod = selected.sampling.animaMethod
        } else {
          draft.sampling[key] = value
        }
      }
    }
  }
  if (selected.guidance !== undefined) {
    draft.sampling.steps = selected.guidance.steps
    draft.sampling.cfgScale = selected.guidance.cfgScale
  }
  if (selected.cfgRescale !== undefined) {
    draft.cfgRescale = selected.cfgRescale
  }
  if (selected.denoisingStrength !== undefined) {
    draft.sampling.denoisingStrength = selected.denoisingStrength
  }
  if (selected.seed !== undefined) {
    draft.seed = {
      policy: selected.seed.policy,
      value: selected.seed.policy === 'fixed' ? selected.seed.value : null,
    }
  }
  if (selected.vae !== undefined) {
    draft.vae = clone(selected.vae)
  }
  if (selected.vaePrecision !== undefined) {
    draft.vaePrecision = selected.vaePrecision
  }
  return next
}

/** Checks only copied sections, using the explicitly selected model or the current model. */
export function presetApplicationDiagnostics(input: {
  catalog: readonly ModelCatalogItem[] | null
  current: PresetApplicationTarget
  payload: PresetPayload
  selectedSections: readonly PresetSectionKey[]
}): PresetApplicationDiagnostic[] {
  const { catalog, current, payload, selectedSections } = input
  const family = effectivePresetModelFamily(current, payload, selectedSections)
  const diagnostics: PresetApplicationDiagnostic[] = []
  const add = (
    section: PresetSectionKey,
    code: PresetApplicationDiagnostic['code'],
    message: string,
    resource?: Resource,
    blocking = true,
  ) =>
    diagnostics.push({
      blocking,
      code,
      message,
      resource: resource ? clone(resource) : undefined,
      section,
    })
  function inspect(section: PresetSectionKey, resource: Resource) {
    if (catalog === null) {
      add(section, 'CATALOG_UNAVAILABLE', 'Resource availability could not be checked.', resource)
      return
    }
    const item = catalog.find(
      (candidate) =>
        candidate.id === resource.localModelId && candidate.resourceType === resource.kind,
    )
    const version = item?.versions.find((candidate) => candidate.id === resource.localVersionId)
    if (
      !item ||
      !version ||
      item.modelId !== resource.civitaiModelId ||
      version.civitaiVersionId !== resource.civitaiVersionId ||
      version.civitaiFileId !== resource.civitaiFileId ||
      version.sha256 !== resource.fileSha256 ||
      version.baseModelFamily !== resource.baseModelFamily ||
      version.fileStatus === 'missing'
    ) {
      add(
        section,
        'RESOURCE_MISSING',
        `${resource.displayName} · ${resource.versionName}: exact version unavailable.`,
        resource,
      )
      return
    }
    if (version.fileStatus === 'corrupt') {
      add(
        section,
        'RESOURCE_CORRUPT',
        `${resource.displayName} · ${resource.versionName}: file needs repair.`,
        resource,
      )
      return
    }
    if (resource.baseModelFamily === null) {
      add(
        section,
        'RESOURCE_FAMILY_UNKNOWN',
        `${resource.displayName}: model family is unknown.`,
        resource,
      )
    } else if (
      resource.kind !== 'checkpoint' &&
      family !== null &&
      family !== resource.baseModelFamily
    ) {
      add(
        section,
        'RESOURCE_FAMILY_MISMATCH',
        `${resource.displayName} is incompatible with the selected ${family} model.`,
        resource,
      )
    }
    if (resource.kind === 'checkpoint' && version.dependencyIssues.length > 0) {
      add(
        section,
        'RESOURCE_MISSING',
        `${resource.displayName}: required model components are unavailable.`,
        resource,
      )
    }
    if (
      (resource.kind !== 'checkpoint' || resource.baseModelFamily === 'anima') &&
      resource.predictionType !== null
    ) {
      add(
        section,
        'SETTING_UNSUPPORTED',
        `${resource.displayName} does not use a checkpoint prediction type.`,
        resource,
      )
    }
    return version
  }
  for (const section of selectedSections) {
    switch (section) {
      case 'cfgRescale': {
        if (family === 'anima' && payload.cfgRescale !== undefined && payload.cfgRescale !== 0) {
          add(section, 'SETTING_UNSUPPORTED', 'Anima does not support nonzero CFG Rescale.')
        }
        break
      }
      case 'loras': {
        const loras = payload.loras ?? []
        for (const [index, lora] of loras.entries()) {
          inspect(section, lora.resource)
          if (
            loras
              .slice(0, index)
              .some((previous) => sameResourceModel(previous.resource, lora.resource))
          ) {
            add(
              section,
              'RESOURCE_DUPLICATE',
              `${lora.resource.displayName} is included more than once.`,
              lora.resource,
            )
          }
        }
        break
      }
      case 'model': {
        if (payload.model === undefined) {
          break
        }
        const version = inspect(section, payload.model)
        if (version && payload.model.baseModelFamily === 'illustrious') {
          if (payload.model.predictionType !== version.predictionType) {
            add(
              section,
              'POLICY_ADVISORY_MISMATCH',
              'The saved prediction type differs from Model Manager. Generation uses the current exact-file setting; Apply does not change it.',
              payload.model,
              false,
            )
          }
          if (
            payload.model.noiseProfile &&
            version.noiseProfile &&
            !equalIllustriousNoiseProfiles(
              payload.model.noiseProfile,
              version.noiseProfile.effective,
            )
          ) {
            add(
              section,
              'POLICY_ADVISORY_MISMATCH',
              'The saved noise profile differs from Model Manager. Generation uses the current ZTSNR and timestep spacing; Apply does not change them.',
              payload.model,
              false,
            )
          }
        }
        break
      }
      case 'negativePrompt':
      case 'prompt': {
        const refs = payload[section]?.embeddingRefs ?? []
        for (const [index, ref] of refs.entries()) {
          inspect(section, ref.resource)
          if (
            refs
              .slice(0, index)
              .some(
                (previous) =>
                  previous.token === ref.token &&
                  !sameExactPromptEmbedding(previous.resource, ref.resource),
              )
          ) {
            add(
              section,
              'EMBEDDING_AMBIGUOUS',
              `The ${ref.token} token refers to more than one embedding.`,
              ref.resource,
            )
          }
        }
        if (family === 'anima' && refs.length > 0) {
          add(section, 'SETTING_UNSUPPORTED', 'Anima does not support prompt embeddings.')
        }
        break
      }
      case 'sampling': {
        if (
          family === 'anima' &&
          (payload.sampling?.sampler !== undefined || payload.sampling?.scheduler !== undefined)
        ) {
          add(
            section,
            'SETTING_INACTIVE',
            'Illustrious sampler and scheduler values are retained but not used by Anima.',
            undefined,
            false,
          )
        } else if (family === 'illustrious' && payload.sampling?.animaMethod !== undefined) {
          add(
            section,
            'SETTING_INACTIVE',
            'The Anima method is retained but not used by Illustrious.',
            undefined,
            false,
          )
        }
        break
      }
      case 'vae': {
        if (payload.vae != null) {
          inspect(section, payload.vae)
          if (family === 'anima') {
            add(
              section,
              'SETTING_UNSUPPORTED',
              'Anima uses its pinned companion VAE; external VAE selection is unsupported.',
            )
          }
        }
        break
      }
      case 'vaePrecision': {
        if (
          family === 'anima' &&
          payload.vaePrecision !== undefined &&
          payload.vaePrecision !== 'Auto'
        ) {
          add(section, 'SETTING_UNSUPPORTED', 'Anima does not support manual VAE precision.')
        }
        break
      }
    }
  }
  return diagnostics
}

function clone<T>(value: T): T {
  // These public JSON contracts can also be passed by a Vue consumer as reactive proxies.
  return JSON.parse(JSON.stringify(value)) as T
}
