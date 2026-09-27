<script setup lang="ts">
import type { ProjectGenerationDraftChange, ProjectTab } from '../../shared/api.js'

import { Trash as TrashIcon } from '@vicons/tabler'
import { NButton, NIcon, NInput, NSwitch } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  canRelink: boolean
  disabled: boolean
  lora: ProjectTab['generationDraft']['loras'][number]
  warning: string | null
}>()
const emit = defineEmits<{
  change: [change: ProjectGenerationDraftChange]
  relink: []
  remove: []
  validity: [valid: boolean]
}>()
const focused = ref(false)
const weightText = ref(String(props.lora.weight))
const weight = computed(() => {
  const text = weightText.value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : null
})
watch(weight, (value) => emit('validity', value !== null), { immediate: true })
watch(
  () => props.lora.weight,
  (value) => {
    if (!focused.value) {
      weightText.value = String(value)
    }
  },
)
function changeEnabled(value: boolean) {
  emit('change', { kind: 'lora-enabled', value, ...identity() })
}
function identity() {
  return {
    resourceId: props.lora.resource.localModelId,
    versionId: props.lora.resource.localVersionId,
  }
}
function changeWeight(text: string) {
  weightText.value = text
  if (weight.value !== null) {
    emit('change', { kind: 'lora-weight', value: weight.value, ...identity() })
  }
}
function blurWeight() {
  focused.value = false
  weightText.value = String(weight.value ?? props.lora.weight)
}
</script>

<template>
  <article :aria-label="`LoRA ${lora.resource.displayName}`" class="lora-row">
    <div class="lora-controls">
      <NSwitch
        :aria-label="`Enable ${lora.resource.displayName}`"
        :disabled
        size="small"
        :value="lora.enabled"
        @update:value="changeEnabled"
      />
      <div class="lora-name">
        <strong :title="lora.resource.displayName">{{ lora.resource.displayName }}</strong>
        <span :title="lora.resource.versionName">{{ lora.resource.versionName }}</span>
      </div>
      <NButton
        :aria-label="`Remove ${lora.resource.displayName}`"
        circle
        :disabled
        quaternary
        size="tiny"
        @click="emit('remove')"
      >
        <template v-slot:icon><NIcon :component="TrashIcon" :size="18" /></template>
      </NButton>
    </div>
    <label class="lora-weight">
      <span>Weight</span>
      <NInput
        :disabled
        :inputProps="{ 'aria-label': `${lora.resource.displayName} weight`, inputmode: 'decimal' }"
        size="small"
        :status="weight === null ? 'error' : undefined"
        :value="weightText"
        @blur="blurWeight"
        @focus="focused = true"
        @update:value="changeWeight"
      />
    </label>
    <p v-if="weight === null" class="lora-warning" role="alert">
      Enter a finite weight before saving.
    </p>
    <p v-if="warning" class="lora-warning" role="status">{{ warning }}</p>
    <NButton
      v-if="canRelink"
      :aria-label="`Link installed version of ${lora.resource.displayName}`"
      :disabled="disabled || weight === null"
      secondary
      size="small"
      @click="emit('relink')"
    >
      Link installed version
    </NButton>
  </article>
</template>

<style scoped>
.lora-row {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.lora-controls {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 24px;
  align-items: center;
  gap: 8px;
}
.lora-weight {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 94px;
  align-items: center;
  gap: 8px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.lora-name {
  display: grid;
  min-width: 0;
}
.lora-name strong,
.lora-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lora-name strong {
  font-size: var(--app-font-size);
  font-weight: 600;
}
.lora-name span {
  font-size: var(--app-font-size-meta);
  color: var(--app-text-muted);
}
.lora-warning {
  margin: 0;
  color: var(--status-warning-text);
  font-size: var(--app-font-size-meta);
}
</style>
