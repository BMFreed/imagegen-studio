<script setup lang="ts">
import { Trash as TrashIcon } from '@vicons/tabler'
import { NButton, NIcon, NInputNumber, NSwitch, NText } from 'naive-ui'
import { computed, ref } from 'vue'

import type { GenerationLora, GenerationLoraResourceRef } from './generation.types'

import GenerationResourceSelect from './GenerationResourceSelect.vue'

const props = defineProps<{
  disabled?: boolean
  resources: GenerationLoraResourceRef[]
}>()
const emit = defineEmits<{ remove: [resourceId: string] }>()

const loras = defineModel<GenerationLora[]>({ required: true })
const selectedResourceId = ref<string | null>(null)
const addedResourceIds = computed(() => loras.value.map((lora) => lora.resource.id))

function add(resourceId: string | null | undefined) {
  const resource = props.resources.find((candidate) => candidate.id === resourceId)
  if (!resource || loras.value.some((lora) => lora.resource.id === resource.id)) {
    return
  }
  loras.value = [
    ...loras.value,
    {
      enabled: true,
      resource: structuredClone(resource),
      weight: 0.7,
    },
  ]
  selectedResourceId.value = null
}
function updateEnabled(index: number, enabled: boolean) {
  loras.value = loras.value.map((lora, current) =>
    current === index ? { ...lora, enabled } : lora,
  )
}
function updateWeight(index: number, weight: number | null) {
  loras.value = loras.value.map((lora, current) =>
    current === index ? { ...lora, weight: weight ?? 0.7 } : lora,
  )
}
function remove(index: number) {
  const lora = loras.value[index]
  if (lora) {
    emit('remove', lora.resource.id)
  }
}
</script>

<template>
  <div class="lora-stack">
    <GenerationResourceSelect
      v-model="selectedResourceId"
      :addedIds="addedResourceIds"
      ariaLabel="Add LoRA"
      clearable
      :disabled
      :disabledIds="addedResourceIds"
      placeholder="Add LoRA"
      :resources
      @update:modelValue="add"
    />
    <article v-for="(lora, index) of loras" :key="lora.resource.id" class="lora-row">
      <NSwitch
        :aria-label="`Enable ${lora.resource.name}`"
        :disabled
        size="small"
        :value="lora.enabled"
        @update:value="updateEnabled(index, $event)"
      />
      <div class="lora-main">
        <strong>{{ lora.resource.name }}</strong>
        <NText depth="3">{{ lora.resource.version ?? 'Local resource' }}</NText>
      </div>
      <NInputNumber
        :disabled
        :inputProps="{ 'aria-label': `${lora.resource.name} weight` }"
        :max="2"
        :min="-2"
        :step="0.05"
        :value="lora.weight"
        @update:value="updateWeight(index, $event)"
      />
      <NButton
        :aria-label="`Remove ${lora.resource.name}`"
        circle
        :disabled
        quaternary
        size="tiny"
        @click="remove(index)"
      >
        <template v-slot:icon><NIcon :component="TrashIcon" /></template>
      </NButton>
    </article>
  </div>
</template>

<style scoped>
.lora-stack {
  display: grid;
  gap: 8px;
}
.lora-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 104px auto;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.lora-main {
  display: grid;
  min-width: 0;
}
.lora-main strong,
.lora-main .n-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
