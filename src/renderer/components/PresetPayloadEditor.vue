<script setup lang="ts">
import type { BaseModelFamily, ModelCatalogItem } from '../../shared/api.js'
import { parsePresetApplicationPayload } from '../../shared/presets/preset-application.js'
import type {
  PresetPayload,
  PresetSectionKey,
  PresetWorkflow,
} from '../../shared/presets/preset-schema.js'
import { parsePresetDefinition, PRESET_SECTION_KEYS } from '../../shared/presets/preset-schema.js'
import {
  ANIMA_SAMPLING_METHOD_OPTIONS,
  isAnimaSamplingMethod,
} from '../../shared/projects/anima-sampling-method.js'
import { ILLUSTRIOUS_SCHEDULER_PAIRS } from '../../shared/projects/illustrious-scheduler.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import type { PromptEmbeddingSelection } from '../../shared/projects/prompt-embeddings.js'
import {
  embeddingSourcesFromCatalog,
  reconcilePromptEmbeddings,
  selectablePromptEmbeddingSources,
} from '../../shared/projects/prompt-embeddings.js'
import { sameResourceModel } from '../../shared/projects/resource-identity.js'

import { Trash as TrashIcon } from '@vicons/tabler'
import { NCard, NCheckbox, NCollapse, NSelect, NSwitch, NText, type SelectOption } from 'naive-ui'
import { computed, h, nextTick, ref, watch } from 'vue'

import type { EditablePresetPayload } from './preset-editor.js'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import PresetPayloadSection from '../../../docs/prototype-app/src/prototypes/presets/PresetPayloadSection.vue'
import PlainPromptEditor from './PlainPromptEditor.vue'
import {
  includePresetSection,
  presetNumericInputValid,
  presetResourceReference,
  sectionLabels,
} from './preset-editor.js'
import PresetNumberInput from './PresetNumberInput.vue'
import { savedModelAvailability } from './project-model-picker.js'
import { projectPromptLoraSources } from './project-prompt-context.js'
import ProjectModelOption from './ProjectModelOption.vue'
import { type AspectRatioState, resizeDimension } from './resolution-control.js'
import ResolutionControl from './ResolutionControl.vue'

const props = defineProps<{
  catalog: ModelCatalogItem[]
  catalogReady: boolean
  disabled: boolean
  fallbackModelFamily?: BaseModelFamily | null
  sectionRevisions?: Partial<Record<PresetSectionKey, number>>
  sections?: PresetSectionKey[]
  selectedSections?: PresetSectionKey[]
  workflow: PresetWorkflow
}>()
const payload = defineModel<EditablePresetPayload>({ required: true })
const emit = defineEmits<{
  dirtyRaw: [dirty: boolean]
  rawSections: [sections: PresetSectionKey[]]
  validity: [valid: boolean]
}>()
const expandedSections = defineModel<PresetSectionKey[]>('expandedSections', {
  default: () => ['prompt', 'model', 'loras'],
})
const editingNativeOnlySampling = ref(false)
watch(payload, () => {
  editingNativeOnlySampling.value = false
})
const visibleSections = computed(() =>
  (props.sections ?? PRESET_SECTION_KEYS).filter(
    (section) => section !== 'denoisingStrength' || props.workflow !== 'textToImage',
  ),
)
const family = computed(() =>
  props.selectedSections !== undefined && !props.selectedSections.includes('model')
    ? (props.fallbackModelFamily ?? null)
    : (payload.value.model?.baseModelFamily ?? props.fallbackModelFamily ?? null),
)
const nativeSampling = computed(
  () =>
    family.value === 'anima' ||
    (family.value === null &&
      (editingNativeOnlySampling.value || payload.value.sampling?.animaMethod !== undefined)),
)
const embeddingSources = computed(() =>
  props.catalogReady ? embeddingSourcesFromCatalog(props.catalog) : [],
)
const loraSources = computed(() =>
  projectPromptLoraSources(
    (payload.value.loras ?? []).filter(
      (lora): lora is NonNullable<PresetPayload['loras']>[number] => lora.weight !== null,
    ),
    props.catalog,
    props.catalogReady,
  ),
)
const seedPolicies = [
  { label: 'Random', value: 'random' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Reuse last project seed', value: 'reuse' },
]
const precisions = ['Auto', 'FP16', 'FP32'].map((value) => ({ label: value, value }))
const samplerOptions = computed(() =>
  retainedOptions(
    [...new Set(ILLUSTRIOUS_SCHEDULER_PAIRS.map((pair) => pair.sampler))],
    payload.value.sampling?.sampler,
  ),
)
const schedulerOptions = computed(() =>
  retainedOptions(
    [
      ...new Set(
        ILLUSTRIOUS_SCHEDULER_PAIRS.filter(
          (pair) =>
            payload.value.sampling?.sampler === undefined ||
            pair.sampler === payload.value.sampling.sampler,
        ).map((pair) => pair.scheduler),
      ),
    ],
    payload.value.sampling?.scheduler,
  ),
)

const numericValidity = ref<Record<string, boolean>>({})
const observedSectionRevisions = new Map<PresetSectionKey, number>()
const sizeAspect = ref<AspectRatioState>({ id: 'free', locked: false, value: 1 })
const sizeRaw = ref<Partial<Record<'height' | 'width', string>>>({})
const sizeFocused = ref<'height' | 'width' | null>(null)
watch(
  () => payload.value.size !== undefined,
  (included) => {
    if (!included) {
      sizeRaw.value = {}
      sizeFocused.value = null
    }
  },
  { flush: 'sync' },
)
const cfgRescaleValue = computed({
  get: () => payload.value.cfgRescale ?? null,
  set: (value: number | null) => {
    payload.value.cfgRescale = value
  },
})
const denoisingStrengthValue = computed({
  get: () => payload.value.denoisingStrength ?? null,
  set: (value: number | null) => {
    payload.value.denoisingStrength = value
  },
})
const availableNumericKeys = computed(() => {
  const keys: string[] = []
  if (payload.value.guidance) {
    keys.push('guidance.steps', 'guidance.cfgScale')
  }
  if (payload.value.size) {
    keys.push('size.width', 'size.height')
  }
  if (payload.value.seed?.policy === 'fixed') {
    keys.push('seed.value')
  }
  if (payload.value.cfgRescale !== undefined) {
    keys.push('cfgRescale')
  }
  if (payload.value.denoisingStrength !== undefined && props.workflow !== 'textToImage') {
    keys.push('denoisingStrength')
  }
  for (const [index, lora] of (payload.value.loras ?? []).entries()) {
    keys.push(loraNumericKey(lora, index))
  }
  return keys
})
watch(
  availableNumericKeys,
  (keys) => {
    const active = new Set(keys)
    numericValidity.value = Object.fromEntries(
      Object.entries(numericValidity.value).filter(([key]) => active.has(key)),
    )
  },
  { flush: 'sync' },
)
const validPayload = computed(() => {
  try {
    if (props.selectedSections !== undefined) {
      parsePresetApplicationPayload(payload.value, props.selectedSections)
      return true
    }
    parsePresetDefinition({
      description: '',
      favorite: false,
      name: 'Validation',
      payload: payload.value,
      tags: [],
      workflow: props.workflow,
    })
    return true
  } catch {
    return false
  }
})
const editorValid = computed(
  () =>
    validPayload.value &&
    availableNumericKeys.value.every(
      (key) =>
        (props.selectedSections !== undefined &&
          !props.selectedSections.includes(numericSection(key))) ||
        numericValidity.value[key] !== false,
    ),
)
watch(editorValid, (valid) => emit('validity', valid), { flush: 'sync', immediate: true })
watch(
  () => [
    ...new Set(
      Object.entries(numericValidity.value)
        .filter(([, valid]) => !valid)
        .map(([key]) => numericSection(key)),
    ),
  ],
  (sections) => {
    emit('dirtyRaw', sections.length > 0)
    emit('rawSections', sections)
  },
  { flush: 'sync', immediate: true },
)
watch(
  () => props.sectionRevisions,
  (revisions) => {
    for (const section of PRESET_SECTION_KEYS) {
      const revision = revisions?.[section] ?? 0
      if (revision !== (observedSectionRevisions.get(section) ?? 0)) {
        numericValidity.value = Object.fromEntries(
          Object.entries(numericValidity.value).filter(([key]) => numericSection(key) !== section),
        )
        if (section === 'size') {
          clearSizeRaw()
        }
      }
      observedSectionRevisions.set(section, revision)
    }
  },
  { deep: true, flush: 'sync' },
)
function numericSection(key: string): PresetSectionKey {
  return key.startsWith('[') ? 'loras' : (key.split('.')[0] as PresetSectionKey)
}

function setNumericValidity(key: string, valid: boolean) {
  numericValidity.value[key] = valid
}
function loraNumericKey(lora: NonNullable<EditablePresetPayload['loras']>[number], index: number) {
  return JSON.stringify([
    'lora-weight',
    lora.resource.localModelId,
    lora.resource.localVersionId,
    lora.resource.fileSha256,
    index,
  ])
}
function sizeDimension(
  event: Event,
): { dimension: 'height' | 'width'; input: HTMLInputElement } | null {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) {
    return null
  }
  const dimension =
    input.getAttribute('aria-label') === 'Preset width'
      ? 'width'
      : input.getAttribute('aria-label') === 'Preset height'
        ? 'height'
        : null
  return dimension ? { dimension, input } : null
}
function sizeFormat(dimension: 'height' | 'width', value: number | null) {
  const raw = sizeRaw.value[dimension]
  return raw !== undefined &&
    (sizeFocused.value === dimension || numericValidity.value[`size.${dimension}`] === false)
    ? raw
    : value === null
      ? ''
      : String(value)
}
function sizeFocus(event: Event) {
  sizeFocused.value = sizeDimension(event)?.dimension ?? null
}
function clearSizeRaw() {
  sizeRaw.value = {}
  setNumericValidity('size.width', true)
  setNumericValidity('size.height', true)
}
function sizeNumber(event: Event, settle = false) {
  if (sectionDisabled('size') && !settle) {
    return
  }
  const target = sizeDimension(event)
  if (!target || !payload.value.size) {
    return
  }
  const { dimension, input } = target
  const limits = { integer: true, max: IGS_SAFETY_CEILINGS.rasterDimension, min: 8 }
  if (settle) {
    sizeFocused.value = null
    const raw = sizeRaw.value[dimension]
    if (raw !== undefined && presetNumericInputValid(raw, Number(raw), limits)) {
      delete sizeRaw.value[dimension]
    }
  } else {
    sizeRaw.value[dimension] = input.value
    if (
      input.value.trim() === '' ||
      presetNumericInputValid(input.value, Number(input.value), limits)
    ) {
      payload.value.size = resizeDimension(
        payload.value.size,
        dimension,
        input.value.trim() === '' ? null : Number(input.value),
        sizeAspect.value,
        { ...limits, step: 8 },
      )
    }
  }
  const check = () => {
    if (!payload.value.size || !input.isConnected) {
      return
    }
    const raw = sizeRaw.value[dimension]
    setNumericValidity(
      `size.${dimension}`,
      presetNumericInputValid(
        raw !== undefined && numericValidity.value[`size.${dimension}`] === false
          ? raw
          : input.value,
        payload.value.size[dimension],
        limits,
      ),
    )
  }
  if (!settle) {
    check()
  }
  void nextTick().then(check)
}

function toggleIncluded(section: PresetSectionKey, included: boolean) {
  if (props.disabled || props.selectedSections !== undefined) {
    return
  }
  if (included) {
    includePresetSection(payload.value, section)
    if (!expandedSections.value.includes(section)) {
      expandedSections.value.push(section)
    }
  } else {
    delete payload.value[section]
  }
}
function sectionDisabled(section: PresetSectionKey) {
  return (
    props.disabled ||
    (props.selectedSections !== undefined && !props.selectedSections.includes(section))
  )
}
function retainedOptions(values: string[], saved?: string) {
  const options: SelectOption[] = values.map((value) => ({ label: value, value }))
  if (saved !== undefined && !values.includes(saved)) {
    options.unshift({ disabled: true, label: `${saved} · unavailable`, value: saved })
  }
  return options
}
function choiceKey(resourceId: string, versionId: string, sha256: string) {
  return JSON.stringify([resourceId, versionId, sha256])
}
function savedChoice(resource: PresetPayload['model'] | PresetPayload['vae']) {
  return resource
    ? choiceKey(resource.localModelId, resource.localVersionId, resource.fileSha256)
    : null
}
function catalogChoices(kind: 'checkpoint' | 'lora' | 'vae') {
  return props.catalog
    .filter((resource) => resource.resourceType === kind)
    .flatMap((resource) =>
      resource.versions.map((version) => {
        const added =
          kind === 'lora' &&
          (payload.value.loras ?? []).some((lora) =>
            sameResourceModel(lora.resource, {
              civitaiModelId: resource.modelId,
              kind: 'lora',
              localModelId: resource.id,
            }),
          )
        const incompatible =
          kind !== 'checkpoint' && family.value !== null && version.baseModelFamily !== family.value
        const unsupported =
          kind === 'checkpoint'
            ? version.baseModelFamily === null
            : kind === 'vae' &&
              (version.baseModelFamily !== 'illustrious' || version.predictionType !== null)
        return {
          added,
          disabled:
            !props.catalogReady ||
            version.fileStatus !== 'ready' ||
            added ||
            incompatible ||
            unsupported,
          label: `${resource.name} · ${version.name}`,
          resource,
          status: added
            ? 'Added'
            : version.fileStatus !== 'ready'
              ? version.fileStatus
              : incompatible || unsupported
                ? 'Incompatible'
                : 'Installed',
          value: choiceKey(resource.id, version.id, version.sha256),
          version,
        }
      }),
    )
}
function resourceOptions(kind: 'checkpoint' | 'vae'): SelectOption[] {
  const options: SelectOption[] = catalogChoices(kind)
  const saved = kind === 'checkpoint' ? payload.value.model : payload.value.vae
  if (saved && savedModelAvailability(saved, props.catalog) !== 'ready') {
    const value = savedChoice(saved)!
    const existing = options.findIndex((option) => option.value === value)
    const missing = {
      disabled: true,
      label: `${saved.displayName} · ${saved.versionName} · unavailable`,
      value,
    }
    if (existing < 0) {
      options.unshift(missing)
    } else {
      options[existing] = missing
    }
  }
  if (kind === 'vae') {
    options.unshift({ label: 'Embedded VAE', value: 'embedded' })
  }
  return options
}
function renderResource(kind: 'checkpoint' | 'lora' | 'vae', option: SelectOption) {
  const entry = catalogChoices(kind).find((choice) => choice.value === option.value)
  return entry
    ? h(ProjectModelOption, {
        added: entry.added,
        defaultSelectable: false,
        hasReadyVersion: entry.version.fileStatus === 'ready',
        resource: entry.resource,
        statusLabel: entry.status,
        triggerPhrases: entry.version.trainedWords,
        version: entry.version,
      })
    : String(option.label)
}
function chooseResource(kind: 'checkpoint' | 'vae', value: string) {
  if (sectionDisabled(kind === 'checkpoint' ? 'model' : 'vae') || !props.catalogReady) {
    return
  }
  if (kind === 'vae' && value === 'embedded') {
    payload.value.vae = null
    return
  }
  const entry = catalogChoices(kind).find((choice) => choice.value === value && !choice.disabled)
  if (!entry) {
    return
  }
  if (kind === 'checkpoint') {
    const model = presetResourceReference(entry.resource, entry.version, 'checkpoint')
    payload.value.model = entry.version.noiseProfile
      ? { ...model, noiseProfile: { ...entry.version.noiseProfile.effective } }
      : model
  } else {
    payload.value.vae = presetResourceReference(entry.resource, entry.version, 'vae')
  }
}
function addLora(value: string) {
  if (sectionDisabled('loras') || !props.catalogReady) {
    return
  }
  const entry = catalogChoices('lora').find((choice) => choice.value === value && !choice.disabled)
  if (entry) {
    payload.value.loras?.push({
      enabled: true,
      resource: presetResourceReference(entry.resource, entry.version, 'lora'),
      weight: 1,
    })
  }
}
function resourceWarning(
  resource:
    | NonNullable<PresetPayload['loras']>[number]['resource']
    | NonNullable<PresetPayload['model']>
    | NonNullable<PresetPayload['vae']>,
) {
  if (!props.catalogReady) {
    return 'Resource availability has not been checked.'
  }
  const status = savedModelAvailability(resource, props.catalog)
  if (status !== 'ready') {
    return `Saved exact version is ${status === 'corrupt' ? 'corrupt' : status === 'unknown-family' ? 'of unknown compatibility' : 'unavailable'}. Its reference is preserved until replaced or removed.`
  }
  if (
    resource.kind !== 'checkpoint' &&
    family.value !== null &&
    resource.baseModelFamily !== family.value
  ) {
    return 'This saved resource is incompatible with the selected model. Its reference is preserved.'
  }
  return null
}
function updatePrompt(
  section: 'negativePrompt' | 'prompt',
  text: string,
  selection?: PromptEmbeddingSelection,
) {
  if (sectionDisabled(section)) {
    return
  }
  const current = payload.value[section]
  if (!current) {
    return
  }
  const sources = selectablePromptEmbeddingSources(embeddingSources.value, family.value)
  const source = selection
    ? sources.find(
        (candidate) =>
          candidate.resource.localModelId === selection.resourceId &&
          candidate.resource.localVersionId === selection.versionId &&
          candidate.token === selection.token,
      )
    : undefined
  if (selection && !source) {
    return
  }
  const next = reconcilePromptEmbeddings(
    JSON.parse(JSON.stringify({ ...current, text })),
    sources,
    source ? { resource: source.resource, token: source.token } : undefined,
  )
  payload.value[section] = {
    ...next,
    embeddingRefs: next.embeddingRefs.map((reference) => ({
      ...reference,
      resource: { ...reference.resource, kind: 'embedding' },
    })),
  }
}
function updateSampling(key: 'animaMethod' | 'sampler' | 'scheduler', value: string | null) {
  if (
    sectionDisabled('sampling') ||
    !payload.value.sampling ||
    (key === 'animaMethod' && value !== null && !isAnimaSamplingMethod(value))
  ) {
    return
  }
  const sampling = payload.value.sampling
  if (key === 'animaMethod') {
    editingNativeOnlySampling.value = true
    if (value === null) {
      delete sampling.animaMethod
    } else if (isAnimaSamplingMethod(value)) {
      sampling.animaMethod = value
    }
  } else if (value === null) {
    delete sampling[key]
  } else {
    sampling[key] = value
  }
}
function updateSeedPolicy(value: 'fixed' | 'random' | 'reuse') {
  if (sectionDisabled('seed')) {
    return
  }
  payload.value.seed =
    value === 'fixed'
      ? {
          policy: 'fixed',
          value: payload.value.seed?.policy === 'fixed' ? payload.value.seed.value : 0,
        }
      : { policy: value }
}
function unsupportedSection(section: PresetSectionKey) {
  return family.value === 'anima' && ['cfgRescale', 'vae', 'vaePrecision'].includes(section)
}
</script>

<template>
  <NCard aria-label="Preset generation settings" class="payload-card" size="small">
    <NCollapse v-model:expandedNames="expandedSections" displayDirective="show">
      <PresetPayloadSection
        v-for="section of visibleSections"
        :key="`${section}:${sectionRevisions?.[section] ?? 0}`"
        :contentVisible="payload[section] !== undefined"
        :data-preset-section="section"
        :name="section"
        :title="sectionLabels[section]"
      >
        <template v-slot:context><slot name="section-context" :section /></template>
        <template v-slot:actions><slot name="section-actions" :section /></template>
        <template v-slot:control>
          <slot name="section-control" :section>
            <NCheckbox
              :aria-label="`Include ${sectionLabels[section]}`"
              :aria-labelledby="undefined"
              :checked="payload[section] !== undefined"
              :disabled="sectionDisabled(section)"
              @update:checked="toggleIncluded(section, $event)"
            >
              Included
            </NCheckbox>
          </slot>
        </template>
        <template v-slot:empty>
          <NText depth="3">Not included. Current project settings will be kept.</NText>
        </template>

        <PlainPromptEditor
          v-if="(section === 'prompt' || section === 'negativePrompt') && payload[section]"
          :ariaLabel="section === 'prompt' ? 'Preset prompt' : 'Preset negative prompt'"
          :disabled="sectionDisabled(section)"
          :embeddingCatalogReady="catalogReady"
          :embeddingRefs="payload[section]!.embeddingRefs"
          :embeddingSources
          :embeddingTokens="payload[section]!.embeddingRefs.map((reference) => reference.token)"
          :loraSources
          :modelFamily="family"
          :modelValue="payload[section]!.text"
          :polarity="section === 'prompt' ? 'positive' : 'negative'"
          @selectEmbedding="
            (selection, text) =>
              updatePrompt(section as 'prompt' | 'negativePrompt', text, selection)
          "
          @update:modelValue="updatePrompt(section as 'prompt' | 'negativePrompt', $event)"
        />

        <div v-else-if="section === 'model'" class="field-stack">
          <label>
            <NText depth="3">Model &amp; version</NText>
            <NSelect
              aria-label="Preset model"
              :disabled="sectionDisabled(section) || !catalogReady"
              filterable
              :options="resourceOptions('checkpoint')"
              placeholder="Choose an installed exact version"
              :renderLabel="(option) => renderResource('checkpoint', option)"
              :value="savedChoice(payload.model)"
              :virtualScroll="false"
              @update:value="chooseResource('checkpoint', $event)"
            />
          </label>
          <NText v-if="payload.model" depth="3">
            {{ payload.model.baseModelFamily ?? 'Unknown family' }}
            <template v-if="payload.model.predictionType">
              · {{ payload.model.predictionType }}
            </template>
            <template v-if="payload.model.noiseProfile">
              · ZTSNR {{ payload.model.noiseProfile.rescaleBetasZeroSnr ? 'on' : 'off' }} ·
              {{ payload.model.noiseProfile.timestepSpacing }}
            </template>
          </NText>
          <p
            v-if="payload.model && resourceWarning(payload.model)"
            class="setting-warning"
            role="status"
          >
            {{ resourceWarning(payload.model) }}
          </p>
          <NText v-else-if="!payload.model" key="n-text-2" depth="3">
            Choose a model before saving this included section.
          </NText>
          <NText
            v-if="payload.model?.predictionType || payload.model?.noiseProfile"
            key="n-text-3"
            depth="3"
          >
            Saved compatibility values are advisory. Model Manager owns the exact checkpoint policy.
          </NText>
        </div>

        <div v-else-if="section === 'loras'" class="field-stack">
          <NSelect
            aria-label="Add preset LoRA"
            :disabled="sectionDisabled(section) || !catalogReady"
            filterable
            :options="catalogChoices('lora')"
            placeholder="Add LoRA"
            :renderLabel="(option) => renderResource('lora', option)"
            :value="null"
            :virtualScroll="false"
            @update:value="addLora"
          />
          <NText v-if="!payload.loras?.length" depth="3">
            No LoRAs. Applying this included section clears the current stack.
          </NText>
          <article
            v-for="(lora, index) of payload.loras"
            :key="`${lora.resource.localModelId}:${lora.resource.localVersionId}:${index}`"
            :aria-label="`Preset LoRA ${lora.resource.displayName}`"
            class="lora-row"
          >
            <div class="lora-heading">
              <NSwitch
                v-model:value="lora.enabled"
                :aria-label="`Enable preset LoRA ${lora.resource.displayName}`"
                :disabled="sectionDisabled(section)"
                size="small"
              />
              <div class="resource-name">
                <strong>{{ lora.resource.displayName }}</strong>
                <NText depth="3">{{ lora.resource.versionName }}</NText>
              </div>
              <IconButton
                compact
                :disabled="sectionDisabled(section)"
                :icon="TrashIcon"
                :label="`Remove preset LoRA ${lora.resource.displayName}`"
                @click="payload.loras!.splice(index, 1)"
              />
            </div>
            <label class="weight-field">
              <NText depth="3">Weight</NText>
              <PresetNumberInput
                v-model="lora.weight"
                :disabled="sectionDisabled(section)"
                :label="`Preset ${lora.resource.displayName} weight`"
                :showButton="false"
                :step="0.1"
                @validity="setNumericValidity(loraNumericKey(lora, index), $event)"
              />
            </label>
            <p v-if="resourceWarning(lora.resource)" class="setting-warning" role="status">
              {{ resourceWarning(lora.resource) }}
            </p>
          </article>
        </div>

        <ResolutionControl
          v-else-if="section === 'size' && payload.size"
          v-model="payload.size"
          v-model:aspectRatio="sizeAspect"
          :disabled="sectionDisabled(section)"
          :heightFormat="(value) => sizeFormat('height', value)"
          heightLabel="Preset height"
          :max="IGS_SAFETY_CEILINGS.rasterDimension"
          :min="8"
          swapLabel="Swap preset width and height"
          :widthFormat="(value) => sizeFormat('width', value)"
          widthLabel="Preset width"
          @blur.capture="sizeNumber($event, true)"
          @commit="clearSizeRaw"
          @focus.capture="sizeFocus"
          @input="sizeNumber($event)"
        />

        <div v-else-if="section === 'sampling' && payload.sampling" class="field-stack">
          <label v-if="nativeSampling">
            <NText depth="3">Anima method</NText>
            <NSelect
              aria-label="Preset Anima method"
              clearable
              :disabled="sectionDisabled(section)"
              :options="ANIMA_SAMPLING_METHOD_OPTIONS"
              placeholder="Choose method"
              :value="payload.sampling.animaMethod ?? null"
              @update:value="updateSampling('animaMethod', $event)"
            />
          </label>
          <div v-else class="two-column-fields">
            <label>
              <NText depth="3">Sampler</NText>
              <NSelect
                aria-label="Preset sampler"
                clearable
                :disabled="sectionDisabled(section)"
                :options="samplerOptions"
                placeholder="Choose sampler"
                :value="payload.sampling.sampler ?? null"
                @update:value="updateSampling('sampler', $event)"
              />
            </label>
            <label>
              <NText depth="3">Scheduler</NText>
              <NSelect
                aria-label="Preset scheduler"
                clearable
                :disabled="sectionDisabled(section)"
                :options="schedulerOptions"
                placeholder="Choose scheduler"
                :value="payload.sampling.scheduler ?? null"
                @update:value="updateSampling('scheduler', $event)"
              />
            </label>
          </div>
          <p
            v-if="
              nativeSampling &&
              (payload.sampling.sampler !== undefined || payload.sampling.scheduler !== undefined)
            "
            class="setting-warning"
            role="status"
          >
            Saved sampler/scheduler values are preserved. Anima uses its native method.
          </p>
        </div>

        <div v-else-if="section === 'guidance' && payload.guidance" class="two-column-fields">
          <label>
            <NText depth="3">Steps</NText>
            <PresetNumberInput
              v-model="payload.guidance.steps"
              :disabled="sectionDisabled(section)"
              integer
              label="Preset steps"
              :min="1"
              @validity="setNumericValidity('guidance.steps', $event)"
            />
          </label>
          <label>
            <NText depth="3">CFG</NText>
            <PresetNumberInput
              v-model="payload.guidance.cfgScale"
              :disabled="sectionDisabled(section)"
              label="Preset CFG"
              :min="0"
              :step="0.1"
              @validity="setNumericValidity('guidance.cfgScale', $event)"
            />
          </label>
        </div>

        <div
          v-else-if="unsupportedSection(section) && section !== 'cfgRescale'"
          class="field-stack"
        >
          <NText>
            {{
              section === 'vae'
                ? (payload.vae?.displayName ?? 'Embedded VAE')
                : section === 'vaePrecision'
                  ? payload.vaePrecision
                  : payload.cfgRescale
            }}
          </NText>
          <p class="setting-warning" role="status">
            {{
              section === 'vae'
                ? 'Anima uses its pinned companion VAE.'
                : `${sectionLabels[section]} is not an Anima setting.`
            }}
            {{
              selectedSections === undefined
                ? 'The saved section is preserved until you uncheck Included.'
                : 'The temporary section is preserved until Reset or deselection.'
            }}
          </p>
        </div>

        <div v-else-if="section === 'cfgRescale'" key="cfg-rescale" class="field-stack">
          <PresetNumberInput
            v-show="!unsupportedSection(section)"
            v-model="cfgRescaleValue"
            :disabled="sectionDisabled(section) || unsupportedSection(section)"
            label="Preset CFG Rescale"
            :max="1"
            :min="0"
            :step="0.05"
            @validity="setNumericValidity('cfgRescale', $event)"
          />
          <template v-if="unsupportedSection(section)">
            <NText>{{ payload.cfgRescale }}</NText>
            <p class="setting-warning" role="status">
              CFG Rescale is not an Anima setting.
              {{
                selectedSections === undefined
                  ? 'The saved section is preserved until you uncheck Included.'
                  : 'The temporary section is preserved until Reset or deselection.'
              }}
            </p>
          </template>
        </div>
        <PresetNumberInput
          v-else-if="section === 'denoisingStrength'"
          key="denoising-strength"
          v-model="denoisingStrengthValue"
          :disabled="sectionDisabled(section)"
          label="Preset denoising strength"
          :max="1"
          :min="0"
          :step="0.05"
          @validity="setNumericValidity('denoisingStrength', $event)"
        />

        <div v-else-if="section === 'seed' && payload.seed" class="field-stack">
          <label>
            <NText depth="3">Seed policy</NText>
            <NSelect
              aria-label="Preset seed policy"
              :disabled="sectionDisabled(section)"
              :options="seedPolicies"
              :value="payload.seed.policy"
              @update:value="updateSeedPolicy"
            />
          </label>
          <label v-if="payload.seed.policy === 'fixed'">
            <NText depth="3">Seed value</NText>
            <PresetNumberInput
              v-model="payload.seed.value"
              :disabled="sectionDisabled(section)"
              integer
              label="Preset seed value"
              :max="0xffffffff"
              :min="0"
              @validity="setNumericValidity('seed.value', $event)"
            />
          </label>
          <NText depth="3">
            Seed is included only by choice. Reuse reads the target project's last completed seed.
          </NText>
        </div>

        <div v-else-if="section === 'vae'" class="field-stack">
          <NSelect
            aria-label="Preset VAE"
            :disabled="sectionDisabled(section) || !catalogReady"
            filterable
            :options="resourceOptions('vae')"
            :renderLabel="(option) => renderResource('vae', option)"
            :value="payload.vae === null ? 'embedded' : savedChoice(payload.vae)"
            :virtualScroll="false"
            @update:value="chooseResource('vae', $event)"
          />
          <p
            v-if="payload.vae && resourceWarning(payload.vae)"
            class="setting-warning"
            role="status"
          >
            {{ resourceWarning(payload.vae) }}
          </p>
        </div>
        <NSelect
          v-else-if="section === 'vaePrecision'"
          v-model:value="payload.vaePrecision"
          aria-label="Preset VAE precision"
          :disabled="sectionDisabled(section)"
          :options="precisions"
        />
      </PresetPayloadSection>
    </NCollapse>
  </NCard>
</template>

<style scoped>
.field-stack,
.two-column-fields label {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.field-stack {
  gap: 12px;
}
.two-column-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.lora-row {
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.lora-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.resource-name {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.weight-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px;
  align-items: center;
  gap: 8px;
}
.setting-warning {
  margin: 0;
  color: var(--status-warning-text);
  font-size: var(--app-font-size-meta);
}
</style>
