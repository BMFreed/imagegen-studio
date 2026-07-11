<script setup lang="ts">
import { Trash as TrashIcon } from '@vicons/tabler';
import { NButton, NIcon, NInputNumber, NSelect, NSwitch, NText } from 'naive-ui';
import { computed, ref } from 'vue';

import type { GenerationLora, GenerationResourceRef } from './generation.types';

const props = defineProps<{
  disabled?: boolean;
  resources: GenerationResourceRef[];
}>();

const loras = defineModel<GenerationLora[]>({ required: true });
const selectedResourceId = ref<string | null>(null);

const options = computed(() =>
  props.resources.map((resource) => ({
    disabled: loras.value.some((lora) => lora.resource.id === resource.id),
    label: `${resource.name}${resource.version ? ` · ${resource.version}` : ''}`,
    value: resource.id,
  })),
);

function add(resourceId: string | null) {
  const resource = props.resources.find((candidate) => candidate.id === resourceId);
  if (!resource || loras.value.some((lora) => lora.resource.id === resource.id)) {
    return;
  }
  loras.value.push({
    enabled: true,
    resource: structuredClone(resource),
    triggerWords: [],
    weight: 0.7,
  });
  selectedResourceId.value = null;
}
</script>

<template>
  <div class="lora-stack">
    <NSelect
      v-model:value="selectedResourceId"
      aria-label="Add LoRA"
      clearable
      :disabled
      :options
      placeholder="Add LoRA"
      :resetMenuOnOptionsChange="false"
      @update:value="add"
    />
    <article v-for="(lora, index) of loras" :key="lora.resource.id" class="lora-row">
      <NSwitch
        v-model:value="lora.enabled"
        :aria-label="`Enable ${lora.resource.name}`"
        :disabled
        size="small"
      />
      <div class="lora-main">
        <strong>{{ lora.resource.name }}</strong>
        <NText depth="3">{{ lora.resource.version ?? 'Local resource' }}</NText>
      </div>
      <NInputNumber
        v-model:value="lora.weight"
        :aria-label="`${lora.resource.name} weight`"
        :disabled
        :max="2"
        :min="-2"
        :step="0.05"
      />
      <NButton
        :aria-label="`Remove ${lora.resource.name}`"
        circle
        :disabled
        quaternary
        size="tiny"
        @click="loras.splice(index, 1)"
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
  grid-template-columns: auto minmax(0, 1fr) 84px auto;
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
