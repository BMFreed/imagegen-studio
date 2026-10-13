<script setup lang="ts">
import type { ModelCatalogItem } from '../../shared/api.js'
import type { PresetApplicationTarget } from '../../shared/presets/preset-application.js'
import {
  includedPresetSections,
  parsePresetApplicationPayload,
  presetApplicationDiagnostics,
} from '../../shared/presets/preset-application.js'
import type {
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
} from '../../shared/presets/preset-schema.js'
import { ANIMA_SAMPLING_METHOD_OPTIONS } from '../../shared/projects/anima-sampling-method.js'

import { ArrowsMaximize, Edit as EditIcon, InfoCircle, Refresh, X } from '@vicons/tabler'
import {
  NAlert,
  NButton,
  NCheckbox,
  NIcon,
  NModal,
  NScrollbar,
  NTag,
  NText,
  NTooltip,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'

import type { ModelManagerFocus } from './model-manager-focus.js'
import type { EditablePresetPayload } from './preset-editor.js'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'
import { sectionLabels, workflowLabels } from './preset-editor.js'
import { presetDiagnosticModelRows } from './preset-model-handoff.js'
import PresetPayloadEditor from './PresetPayloadEditor.vue'

const props = defineProps<{
  busy: boolean
  catalog: ModelCatalogItem[]
  catalogReady: boolean
  current: PresetApplicationTarget
  error: string | null
  projectName: string
  source: PresetRecord
  suspended: boolean
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{
  apply: [value: { payload: PresetPayload; selectedSections: PresetSectionKey[] }]
  editOriginal: [id: string]
  manageModels: [focus: ModelManagerFocus]
  suspended: []
}>()
const modalRoot = ref<HTMLDivElement | null>(null)
let handoffTrigger: HTMLElement | null = null
let handoffActionKey: string | null = null
const draft = ref<EditablePresetPayload>(clone(props.source.payload))
const selectedSections = ref<PresetSectionKey[]>(initialSelection())
const expandedSections = ref<PresetSectionKey[]>([])
const sectionRevisions = ref<Partial<Record<PresetSectionKey, number>>>({})
const editorValid = ref(true)
const dirtyRaw = ref(false)
const rawSections = ref<PresetSectionKey[]>([])
const editOriginalConfirm = ref(false)
const sections = computed(() => includedPresetSections(props.source.payload))
const allSelected = computed(
  () =>
    sections.value.length > 0 &&
    sections.value.every((section) => selectedSections.value.includes(section)),
)
const canonical = computed(() => {
  try {
    return parsePresetApplicationPayload(draft.value, selectedSections.value)
  } catch {
    return null
  }
})
const diagnostics = computed(() =>
  canonical.value
    ? presetApplicationDiagnostics({
        catalog: props.catalogReady ? props.catalog : null,
        current: props.current,
        payload: canonical.value,
        selectedSections: selectedSections.value,
      })
    : [],
)
const diagnosticRows = computed(() => presetDiagnosticModelRows(diagnostics.value))
const changedSections = computed(() =>
  sections.value.filter((section) => !equal(draft.value[section], props.source.payload[section])),
)
const applicationDraftDirty = computed(
  () =>
    dirtyRaw.value ||
    changedSections.value.length > 0 ||
    !equal([...selectedSections.value].sort(), [...initialSelection()].sort()),
)
const canApply = computed(
  () =>
    !props.busy &&
    editorValid.value &&
    canonical.value !== null &&
    !diagnostics.value.some((item) => item.blocking),
)

watch(
  () => [show.value, props.source.id],
  () => {
    if (!show.value) {
      handoffTrigger = null
      handoffActionKey = null
      return
    }
    handoffTrigger = null
    handoffActionKey = null
    draft.value = clone(props.source.payload)
    selectedSections.value = initialSelection()
    expandedSections.value = []
    sectionRevisions.value = {}
    editorValid.value = true
    dirtyRaw.value = false
    rawSections.value = []
    editOriginalConfirm.value = false
  },
)
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
function equal(a: unknown, b: unknown) {
  const serialize = (value: unknown) =>
    JSON.stringify(value, (_key, nested: unknown) =>
      nested !== null && typeof nested === 'object' && !Array.isArray(nested)
        ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
        : nested,
    )
  return serialize(a) === serialize(b)
}
function initialSelection() {
  return includedPresetSections(props.source.payload).filter(
    (section) => section !== 'size' && section !== 'seed',
  )
}
function setSelected(section: PresetSectionKey, selected: boolean) {
  if (props.busy) {
    return
  }
  selectedSections.value = selected
    ? [...new Set([...selectedSections.value, section])]
    : selectedSections.value.filter((item) => item !== section)
}
function resetSection(section: PresetSectionKey) {
  if (props.busy) {
    return
  }
  const next = clone(draft.value)
  Reflect.set(next, section, clone(props.source.payload[section]))
  draft.value = next
  sectionRevisions.value[section] = (sectionRevisions.value[section] ?? 0) + 1
}
function resetAll() {
  if (props.busy) {
    return
  }
  draft.value = clone(props.source.payload)
  for (const section of sections.value) {
    sectionRevisions.value[section] = (sectionRevisions.value[section] ?? 0) + 1
  }
}
function close() {
  if (!props.busy) {
    editOriginalConfirm.value = false
    show.value = false
  }
}
function requestEditOriginal() {
  if (props.busy) {
    return
  }
  if (applicationDraftDirty.value) {
    editOriginalConfirm.value = true
  } else {
    openOriginal()
  }
}
function openOriginal() {
  if (props.busy) {
    return
  }
  editOriginalConfirm.value = false
  show.value = false
  emit('editOriginal', props.source.id)
}
function apply() {
  if (canApply.value && canonical.value) {
    emit('apply', {
      payload: clone(canonical.value),
      selectedSections: [...selectedSections.value],
    })
  }
}
function requestModels(
  focus: ModelManagerFocus | null,
  actionKey: string | null,
  event: MouseEvent,
) {
  if (!focus || props.busy || props.suspended || editOriginalConfirm.value) {
    return
  }
  handoffTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  handoffActionKey = actionKey
  emit('manageModels', focus)
}
function afterLeave() {
  if (show.value && props.suspended) {
    emit('suspended')
  }
}
function afterEnter() {
  if (!handoffActionKey || !show.value || props.suspended) {
    return
  }
  const restoredAction = Array.from(
    modalRoot.value?.querySelectorAll<HTMLButtonElement>('[data-preset-model-action]') ?? [],
  ).find((button) => button.dataset.presetModelAction === handoffActionKey && !button.disabled)
  const target =
    handoffTrigger?.isConnected &&
    modalRoot.value?.contains(handoffTrigger) &&
    !handoffTrigger.hasAttribute('disabled') &&
    handoffTrigger.dataset.presetModelAction === handoffActionKey
      ? handoffTrigger
      : (restoredAction ??
        modalRoot.value?.querySelector<HTMLButtonElement>(
          'button[aria-label="Close Apply Preset"]',
        ))
  handoffTrigger = null
  handoffActionKey = null
  target?.focus({ preventScroll: true })
}
function currentValue(section: PresetSectionKey): unknown {
  const { generationDraft: current, primaryBbox } = props.current
  switch (section) {
    case 'cfgRescale': {
      return current.cfgRescale
    }
    case 'denoisingStrength': {
      return current.sampling.denoisingStrength
    }
    case 'guidance': {
      return current.sampling
    }
    case 'loras': {
      return current.loras
    }
    case 'model': {
      return current.model
    }
    case 'negativePrompt': {
      return current.negativePrompt
    }
    case 'prompt': {
      return current.positivePrompt
    }
    case 'sampling': {
      return current.sampling
    }
    case 'seed': {
      return current.seed
    }
    case 'size': {
      return { height: primaryBbox.height, width: primaryBbox.width }
    }
    case 'vae': {
      return current.vae
    }
    case 'vaePrecision': {
      return current.vaePrecision
    }
  }
}
function summary(section: PresetSectionKey, value: unknown): string {
  if (value === undefined) {
    return 'Not set'
  }
  if (value === null) {
    return section === 'vae' ? 'Embedded VAE' : 'None'
  }
  if (section === 'prompt' || section === 'negativePrompt') {
    const prompt = value as NonNullable<PresetPayload['prompt']>
    return prompt.text.trim() || 'Empty prompt'
  }
  if (section === 'model' || section === 'vae') {
    const resource = value as NonNullable<PresetPayload['model']>
    return `${resource.displayName} · ${resource.versionName}`
  }
  if (section === 'loras') {
    const loras = value as NonNullable<EditablePresetPayload['loras']>
    return loras.length
      ? loras
          .map(
            (lora) =>
              `${lora.resource.displayName} ${lora.weight ?? 'unfinished'}${lora.enabled ? '' : ' (disabled)'}`,
          )
          .join(', ')
      : 'No LoRAs'
  }
  if (section === 'size') {
    const size = value as NonNullable<EditablePresetPayload['size']>
    return `${size.width ?? '—'} × ${size.height ?? '—'}`
  }
  if (section === 'guidance') {
    const guidance = value as NonNullable<EditablePresetPayload['guidance']>
    return `${guidance.steps ?? '—'} steps · CFG ${guidance.cfgScale ?? '—'}`
  }
  if (section === 'sampling') {
    const sampling = value as NonNullable<PresetPayload['sampling']>
    const method = ANIMA_SAMPLING_METHOD_OPTIONS.find(
      (option) => option.value === sampling.animaMethod,
    )?.label
    return [sampling.sampler, sampling.scheduler, method].filter(Boolean).join(' · ') || 'Not set'
  }
  if (section === 'seed') {
    const seed = value as NonNullable<EditablePresetPayload['seed']>
    return seed.policy === 'fixed'
      ? `Fixed · ${seed.value ?? 'unfinished'}`
      : seed.policy === 'reuse'
        ? 'Reuse last project seed'
        : 'Random'
  }
  return String(value)
}
</script>

<template>
  <NModal
    :closeOnEsc="!busy && !editOriginalConfirm"
    displayDirective="show"
    :maskClosable="false"
    :show="show && !suspended"
    :zIndex="AppLayer.appOverlay"
    @afterEnter="afterEnter"
    @afterLeave="afterLeave"
    @update:show="!$event && close()"
  >
    <div
      ref="modalRoot"
      :aria-label="`Apply Preset: ${source.name}`"
      aria-modal="true"
      class="apply-modal"
      role="dialog"
    >
      <header class="modal-header">
        <div class="header-copy">
          <div class="title-line">
            <h2>Apply Preset: {{ source.name }}</h2>
            <NTooltip>
              <template v-slot:trigger>
                <NButton aria-label="About Apply Preset" circle quaternary size="tiny">
                  <template v-slot:icon><NIcon :component="InfoCircle" /></template>
                </NButton>
              </template>
              <div class="apply-help">
                <strong>Apply copies selected settings into the current project.</strong>
                <span>Changes here do not update the saved preset.</span>
                <span>The project does not stay linked to the preset.</span>
              </div>
            </NTooltip>
          </div>
          <NText class="application-context" depth="3">
            Customize a temporary copy for
            <strong>{{ projectName }}</strong>
            . The saved preset will not change.
          </NText>
        </div>
        <IconButton :disabled="busy" :icon="X" label="Close Apply Preset" @click="close" />
      </header>
      <NScrollbar class="modal-scroll">
        <div class="modal-content">
          <div class="preset-meta">
            <NTag type="info">{{ workflowLabels[source.workflow] }}</NTag>
            <NButton :disabled="busy" size="small" tertiary @click="requestEditOriginal">
              <template v-slot:icon><NIcon :component="EditIcon" /></template>
              Edit original
            </NButton>
          </div>
          <p v-if="source.description.trim()" class="preset-description">
            {{ source.description }}
          </p>
          <NAlert v-if="error" aria-label="Preset Apply failed" role="alert" type="error">
            {{ error }}
          </NAlert>
          <NAlert
            v-if="diagnostics.length"
            key="n-alert-2"
            aria-label="Selected preset settings need attention"
            title="Selected settings need attention"
            type="warning"
          >
            <div
              v-for="({ actionKey, diagnostic, focus }, index) of diagnosticRows"
              :key="`${diagnostic.section}:${diagnostic.code}:${index}`"
              class="preset-diagnostic"
            >
              <span>{{ sectionLabels[diagnostic.section] }}: {{ diagnostic.message }}</span>
              <NButton
                v-if="focus"
                :aria-label="`Open ${focus.resource?.resourceName} in Models`"
                :data-preset-model-action="actionKey"
                :disabled="busy || suspended"
                size="small"
                text
                @click="requestModels(focus, actionKey, $event)"
              >
                Open in Models
              </NButton>
            </div>
            <p>
              Correct the selected setting or deselect its section to keep your current settings.
            </p>
          </NAlert>
          <div class="modal-toolbar">
            <NCheckbox
              aria-label="Select all sections"
              :aria-labelledby="undefined"
              :checked="allSelected"
              :disabled="busy"
              :indeterminate="selectedSections.length > 0 && !allSelected"
              @update:checked="selectedSections = $event ? [...sections] : []"
            >
              Select all sections
            </NCheckbox>
            <span class="toolbar-actions">
              <NButton
                :disabled="busy"
                size="small"
                tertiary
                @click="
                  expandedSections =
                    expandedSections.length === sections.length ? [] : [...sections]
                "
              >
                <template v-slot:icon><NIcon :component="ArrowsMaximize" /></template>
                {{ expandedSections.length === sections.length ? 'Collapse all' : 'Expand all' }}
              </NButton>
              <NButton
                :disabled="busy || (!changedSections.length && !dirtyRaw)"
                size="small"
                tertiary
                @click="resetAll"
              >
                <template v-slot:icon><NIcon :component="Refresh" /></template>
                Reset all
              </NButton>
            </span>
          </div>
          <PresetPayloadEditor
            v-model="draft"
            v-model:expandedSections="expandedSections"
            :catalog
            :catalogReady
            :disabled="busy"
            :fallbackModelFamily="current.generationDraft.model?.baseModelFamily ?? null"
            :sectionRevisions
            :sections
            :selectedSections
            :workflow="source.workflow"
            @dirtyRaw="dirtyRaw = $event"
            @rawSections="rawSections = $event"
            @validity="editorValid = $event"
          >
            <template v-slot:section-context="{ section }">
              <span class="comparison">
                <NText depth="3" :title="summary(section, currentValue(section))">
                  Current: {{ summary(section, currentValue(section)) }}
                </NText>
                <NText depth="3" :title="summary(section, draft[section])">
                  Apply: {{ summary(section, draft[section]) }}
                </NText>
              </span>
            </template>
            <template v-slot:section-actions="{ section }">
              <NButton
                v-if="changedSections.includes(section) || rawSections.includes(section)"
                :aria-label="`Reset ${sectionLabels[section]}`"
                :disabled="busy"
                size="tiny"
                tertiary
                @click="resetSection(section)"
              >
                Reset
              </NButton>
            </template>
            <template v-slot:section-control="{ section }">
              <NCheckbox
                :aria-label="`Apply ${sectionLabels[section]}`"
                :aria-labelledby="undefined"
                :checked="selectedSections.includes(section)"
                :disabled="busy"
                @update:checked="setSelected(section, $event)"
              >
                Apply
              </NCheckbox>
            </template>
          </PresetPayloadEditor>
          <NText v-if="selectedSections.length && (!editorValid || canonical === null)" depth="3">
            Correct the selected fields before applying, or deselect their sections.
          </NText>
        </div>
      </NScrollbar>
      <footer class="modal-footer">
        <NButton :disabled="busy" tertiary @click="close">Cancel</NButton>
        <NButton :disabled="!canApply" :loading="busy" type="primary" @click="apply">Apply</NButton>
      </footer>
    </div>
  </NModal>
  <NModal
    :closeOnEsc="!busy"
    :maskClosable="false"
    :show="editOriginalConfirm"
    :zIndex="AppLayer.dialog"
    @update:show="!$event && (editOriginalConfirm = false)"
  >
    <div aria-label="Edit saved preset" aria-modal="true" class="edit-confirm" role="dialog">
      <h2>Edit the saved preset?</h2>
      <p>
        Changes in this temporary application will be discarded. Preset Manager will open the saved
        original.
      </p>
      <footer class="confirmation-actions">
        <NButton :disabled="busy" tertiary @click="editOriginalConfirm = false">
          Keep editing here
        </NButton>
        <NButton :disabled="busy" type="primary" @click="openOriginal">Open original</NButton>
      </footer>
    </div>
  </NModal>
</template>

<style scoped>
.apply-modal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(980px, calc(100vw - 80px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.modal-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--app-border);
}
.header-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.title-line,
.preset-meta,
.modal-toolbar,
.toolbar-actions,
.modal-footer,
.confirmation-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-line h2 {
  overflow-wrap: anywhere;
}
.preset-meta,
.modal-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
}
.application-context {
  font-size: 13px;
}
.apply-help {
  display: grid;
  gap: 4px;
  max-width: 380px;
}
.modal-scroll {
  min-height: 0;
}
.modal-content {
  display: grid;
  gap: 10px;
  padding: 14px 18px;
}
.modal-content p {
  margin: 4px 0;
}
.preset-diagnostic {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-block: 4px;
}
.preset-diagnostic > span {
  flex: 1 1 220px;
}
.preset-description {
  padding: 10px 12px;
  border-left: 2px solid var(--workspace-blue);
  background: var(--app-elevated);
}
.comparison {
  display: grid;
  min-width: 0;
}
.comparison :deep(.n-text) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-footer {
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid var(--app-border);
}
.edit-confirm {
  width: min(460px, calc(100vw - 48px));
  padding: 18px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.confirmation-actions {
  justify-content: flex-end;
  margin-top: 16px;
}
h2 {
  margin: 0;
  font-size: 18px;
}
</style>
