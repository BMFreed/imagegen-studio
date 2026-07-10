<script setup lang="ts">
import { Trash as TrashIcon } from '@vicons/tabler';
import { NButton, NIcon, NInputNumber, NSelect, NSwitch, NText } from 'naive-ui';
import { computed, ref } from 'vue';

import type { PresetLora } from './presets.types';

import { availableLoras } from './presets.mock';

const loras = defineModel<PresetLora[]>({ required: true });
const selectedResourceId = ref<string | null>(null);

const loraOptions = computed(() =>
  availableLoras.map((resource) => ({
    disabled: loras.value.some((lora) => lora.resource.id === resource.id),
    label: `${resource.name} · ${resource.version ?? ''}`,
    value: resource.id,
  })),
);

function addLora(resourceId: string | null) {
  const resource = availableLoras.find((candidate) => candidate.id === resourceId);

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
    <article v-for="(lora, index) of loras" :key="lora.resource.id" class="lora-row">
      <NSwitch v-model:value="lora.enabled" size="small" />
      <div class="lora-main">
        <strong>{{ lora.resource.name }}</strong>
        <NText depth="3">
          {{ lora.resource.version
          }}<template v-if="lora.triggerWords.length > 0">
            · {{ lora.triggerWords.join(', ') }}</template
          >
        </NText>
      </div>
      <NInputNumber v-model:value="lora.weight" :max="2" :min="-2" :step="0.05" />
      <NButton
        :aria-label="`Remove ${lora.resource.name}`"
        circle
        quaternary
        size="small"
        @click="loras.splice(index, 1)"
      >
        <template v-slot:icon><NIcon :component="TrashIcon" /></template>
      </NButton>
    </article>
    <NSelect
      v-model:value="selectedResourceId"
      clearable
      :options="loraOptions"
      placeholder="Add LoRA"
      @update:value="addLora"
    />
  </div>
</template>

<style scoped>
.lora-stack {
  display: grid;
  gap: 8px;
}

.lora-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 92px auto;
  align-items: center;
  gap: 10px;
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
