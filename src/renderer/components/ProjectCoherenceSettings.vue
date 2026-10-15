<script setup lang="ts">
import type { SmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'
import { resolveSmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import { NInput, NSelect, NTooltip } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'

import type { ProjectMaskSettingsOwner } from './project-mask-settings-editor.js'

import {
  parseProjectCoherenceNumericInput,
  type ProjectCoherenceNumericField,
  type ProjectCoherenceSettingsCommand,
  ProjectCoherenceSettingsEditor,
} from './project-coherence-settings-editor.js'

const props = defineProps<{
  disabled: boolean
  owner: ProjectMaskSettingsOwner | null
  settings?: SmartPatchCoherenceSettings
}>()
const emit = defineEmits<{ change: [command: ProjectCoherenceSettingsCommand] }>()
const controlId = useId()
const settings = computed(() => resolveSmartPatchCoherenceSettings(props.settings))
const raw = reactive<Record<ProjectCoherenceNumericField, string>>({
  edgeSize: String(settings.value.edgeSize),
  minimumDenoise: String(settings.value.minimumDenoise),
})
const pending = ref(false)
const unavailable = computed(() => props.disabled || !props.owner || pending.value)
const editors: Record<ProjectCoherenceNumericField, ProjectCoherenceSettingsEditor | null> = {
  edgeSize: null,
  minimumDenoise: null,
}
let focusIntent: { field: ProjectCoherenceNumericField; owner: ProjectMaskSettingsOwner } | null =
  null
const fields = [
  {
    ariaLabel: 'Smart Patch coherence edge size',
    field: 'edgeSize',
    inputmode: 'numeric',
    label: 'Edge size',
    tooltip:
      'Coherence edge width in processing pixels at the internal resolution. Mask blur uses project pixels. Enter an integer from 0 to 1024.',
  },
  {
    ariaLabel: 'Smart Patch coherence minimum denoise',
    field: 'minimumDenoise',
    inputmode: 'decimal',
    label: 'Minimum denoise',
    tooltip:
      'Minimum denoising in the coherence edge, from 0 to 1. This is separate from Generation denoising strength.',
  },
] as const
const modeOptions = ['Gaussian Blur', 'Box Blur', 'Staged'].map((mode) => ({
  label: mode,
  value: mode,
}))
const invalidReason = computed(() => {
  if (parseProjectCoherenceNumericInput('edgeSize', raw.edgeSize) === null) {
    return 'Enter an edge size from 0 to 1024 whole processing pixels.'
  }
  if (parseProjectCoherenceNumericInput('minimumDenoise', raw.minimumDenoise) === null) {
    return 'Enter minimum denoise from 0 to 1.'
  }
  return null
})

function cancel(field: ProjectCoherenceNumericField) {
  editors[field]?.cancel()
  editors[field] = null
  raw[field] = String(settings.value[field])
}
function cancelAll() {
  cancel('edgeSize')
  cancel('minimumDenoise')
}
function sameTarget(owner: ProjectMaskSettingsOwner | null, other: ProjectMaskSettingsOwner) {
  return (
    owner?.projectKey === other.projectKey &&
    owner.documentId === other.documentId &&
    owner.layerId === other.layerId
  )
}
function restoreFocus() {
  const intent = focusIntent
  if (!intent || props.disabled || pending.value) {
    return
  }
  void nextTick(() => {
    if (focusIntent !== intent || unavailable.value || !sameTarget(props.owner, intent.owner)) {
      return
    }
    focusIntent = null
    const input = document.getElementById(`${controlId}-${intent.field}`)
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true })
    }
  })
}

watch(
  [
    () => props.owner?.projectKey,
    () => props.owner?.documentId,
    () => props.owner?.documentRevision,
    () => props.owner?.layerId,
    () => settings.value.mode,
    () => settings.value.edgeSize,
    () => settings.value.minimumDenoise,
    () => props.disabled,
  ],
  () => {
    pending.value = false
    cancelAll()
    if (focusIntent && !sameTarget(props.owner, focusIntent.owner)) {
      focusIntent = null
    }
    restoreFocus()
  },
  { flush: 'sync' },
)

function begin(field: ProjectCoherenceNumericField) {
  if (!props.owner || unavailable.value || editors[field]) {
    return
  }
  editors[field] = new ProjectCoherenceSettingsEditor(props.owner, field, settings.value)
  editors[field].update(raw[field])
}
function updateNumeric(field: ProjectCoherenceNumericField, value: string) {
  if (unavailable.value) {
    return
  }
  begin(field)
  raw[field] = value
  editors[field]?.update(value)
}
function finish(
  field: ProjectCoherenceNumericField,
  focusTarget: ProjectCoherenceNumericField | null,
) {
  const editor = editors[field]
  if (!editor) {
    return
  }
  editors[field] = null
  const command = editor.finish(props.owner)
  if (command && !unavailable.value) {
    raw[field] = String(command.change.value[field])
    focusIntent = focusTarget ? { field: focusTarget, owner: { ...editor.owner } } : null
    pending.value = true
    emit('change', command)
  } else if (parseProjectCoherenceNumericInput(field, raw[field]) !== null) {
    raw[field] = String(settings.value[field])
  }
}
function fieldForTarget(target: EventTarget | null): ProjectCoherenceNumericField | null {
  return target instanceof HTMLInputElement
    ? (fields.find((field) => target.id === `${controlId}-${field.field}`)?.field ?? null)
    : null
}
function navigationTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }
  if (target.closest('[aria-label="Open Home"]')) {
    return true
  }
  const tab = target.closest('[role="tab"]')
  const close = target.closest('[aria-label^="Close "]')
  return (
    (tab?.getAttribute('aria-selected') === 'false' &&
      Boolean(tab.closest('[role="tablist"][aria-label="Open documents"]'))) ||
    Boolean(close?.closest('[role="tablist"][aria-label="Open documents"]'))
  )
}
function captureBlur(field: ProjectCoherenceNumericField, event: FocusEvent) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  if (navigationTarget(event.relatedTarget)) {
    focusIntent = null
    cancelAll()
    return
  }
  finish(field, fieldForTarget(event.relatedTarget))
}
function captureKey(field: ProjectCoherenceNumericField, event: KeyboardEvent) {
  if (event.isComposing || !(event.target instanceof HTMLInputElement)) {
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    focusIntent = null
    cancel(field)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    updateNumeric(field, event.target.value)
    finish(field, field)
  }
}
function selectMode(value: number | string | null) {
  if (!props.owner || unavailable.value || typeof value !== 'string') {
    return
  }
  const editor = new ProjectCoherenceSettingsEditor(props.owner, 'mode', settings.value)
  editor.update(value)
  const command = editor.finish(props.owner)
  if (command) {
    focusIntent = null
    pending.value = true
    emit('change', command)
  }
}
function capturePointer(event: PointerEvent) {
  if (!(event.target instanceof Element)) {
    return
  }
  const layer = event.target.closest<HTMLElement>('[data-layer-id]')
  const row = event.target.closest('[data-entity-zone="surface"]')
  const otherRow = row?.querySelector('[aria-label^="Select "][aria-pressed="false"]')
  if (
    (layer && layer.dataset['layerId'] !== props.owner?.layerId) ||
    otherRow ||
    navigationTarget(event.target)
  ) {
    focusIntent = null
    cancelAll()
  } else if (focusIntent && fieldForTarget(event.target) !== focusIntent.field) {
    focusIntent = null
  }
}
function captureFocusIntent(event: Event) {
  if (focusIntent && fieldForTarget(event.target) !== focusIntent.field) {
    focusIntent = null
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', capturePointer, true)
  document.addEventListener('keydown', captureFocusIntent, true)
})
onBeforeUnmount(() => {
  focusIntent = null
  cancelAll()
  document.removeEventListener('pointerdown', capturePointer, true)
  document.removeEventListener('keydown', captureFocusIntent, true)
})
</script>

<template>
  <div aria-label="Smart Patch coherence settings" class="coherence-settings" data-entity-control>
    <div class="coherence-row">
      <NTooltip :maxWidth="280">
        <template v-slot:trigger>
          <label :for="`${controlId}-mode`">Coherence</label>
        </template>
        Edge coherence method. Staged applies minimum denoise to the expanded edge. With minimum
        denoise 0, it does not expand the mask.
      </NTooltip>
      <NSelect
        class="coherence-mode"
        :disabled="unavailable"
        filterable
        :inputProps="{ 'aria-label': 'Smart Patch coherence mode', id: `${controlId}-mode` }"
        :options="modeOptions"
        size="small"
        :value="settings.mode"
        @update:value="selectMode"
      />
    </div>
    <div
      v-for="field of fields"
      :key="field.field"
      class="coherence-row"
      @blur.capture="captureBlur(field.field, $event)"
      @keydown.capture="captureKey(field.field, $event)"
    >
      <NTooltip :maxWidth="280">
        <template v-slot:trigger>
          <label :for="`${controlId}-${field.field}`">{{ field.label }}</label>
        </template>
        {{ field.tooltip }}
      </NTooltip>
      <NInput
        class="coherence-number"
        :disabled="unavailable"
        :inputProps="{
          'aria-label': field.ariaLabel,
          id: `${controlId}-${field.field}`,
          inputmode: field.inputmode,
        }"
        size="small"
        :status="
          parseProjectCoherenceNumericInput(field.field, raw[field.field]) === null
            ? 'error'
            : undefined
        "
        :value="raw[field.field]"
        @focus="begin(field.field)"
        @update:value="updateNumeric(field.field, $event)"
      >
        <template v-if="field.field === 'edgeSize'" v-slot:suffix>px</template>
      </NInput>
    </div>
    <p v-if="invalidReason" class="coherence-diagnostic" role="alert">{{ invalidReason }}</p>
  </div>
</template>

<style scoped>
.coherence-settings {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.coherence-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.coherence-row label {
  min-width: 0;
}
.coherence-mode {
  width: 140px;
  flex-shrink: 0;
}
.coherence-number {
  width: 92px;
  flex-shrink: 0;
}
.coherence-diagnostic {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
