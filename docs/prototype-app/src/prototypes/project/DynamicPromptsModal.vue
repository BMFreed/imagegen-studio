<script setup lang="ts">
import { NAlert, NButton, NCard, NInputNumber, NModal, NSelect, NText } from 'naive-ui';
import { computed } from 'vue';

import type { ProjectDynamicPromptSettings } from './project.types';

import { expandPromptPairs } from './project-prompt.utils';

const props = defineProps<{
  negativePrompt: string;
  prompt: string;
  settings: ProjectDynamicPromptSettings;
}>();
const emit = defineEmits<{ updateSettings: [value: ProjectDynamicPromptSettings] }>();
const show = defineModel<boolean>('show', { default: false });
const result = computed(() =>
  expandPromptPairs(props.prompt, props.negativePrompt, props.settings.maxPrompts),
);
function update(value: Partial<ProjectDynamicPromptSettings>) {
  emit('updateSettings', { ...props.settings, ...value });
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Dynamic Prompt Preview"
      class="dynamic-modal"
      role="dialog"
      size="small"
      title="Dynamic Prompt Preview"
    >
      <NAlert v-if="result.error" key="n-alert-1" :title="result.error" type="error" />
      <NAlert
        v-else-if="result.truncated"
        key="n-alert-2"
        title="Preview truncated at the configured maximum"
        type="warning"
      />
      <div class="dynamic-settings">
        <label
          >Max prompts<NInputNumber
            aria-label="Maximum dynamic prompts"
            :max="100"
            :min="1"
            size="small"
            :value="settings.maxPrompts"
            @update:value="update({ maxPrompts: $event ?? 1 })"
        /></label>
        <label
          >Seed behavior<NSelect
            aria-label="Dynamic prompt seed behavior"
            :options="[
              { label: 'Per iteration', value: 'per-iteration' },
              { label: 'Per prompt', value: 'per-prompt' },
            ]"
            size="small"
            :value="settings.seedBehavior"
            @update:value="update({ seedBehavior: $event })"
        /></label>
      </div>
      <NText depth="3"
        >{{ result.pairs.length }} concrete prompt pair{{
          result.pairs.length === 1 ? '' : 's'
        }}</NText
      >
      <div v-if="!result.error" class="prompt-pairs">
        <article
          v-for="(pair, index) of result.pairs"
          :key="`${pair.prompt}-${pair.negativePrompt}-${index}`"
        >
          <strong>{{ index + 1 }}</strong
          ><span>{{ pair.prompt || 'Empty positive prompt' }}</span
          ><small>{{ pair.negativePrompt || 'Empty negative prompt' }}</small>
        </article>
      </div>
      <template v-slot:footer
        ><div class="modal-footer"><NButton @click="show = false">Close</NButton></div></template
      >
    </NCard>
  </NModal>
</template>

<style scoped>
.dynamic-modal {
  width: min(720px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
}
.dynamic-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 10px 0;
}
.dynamic-settings label {
  display: grid;
  gap: 4px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.prompt-pairs {
  display: grid;
  gap: 5px;
  max-height: 380px;
  margin-top: 8px;
  overflow: auto;
}
.prompt-pairs article {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 2px 8px;
  padding: 7px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.prompt-pairs small {
  grid-column: 2;
  color: var(--app-text-muted);
}
.modal-footer {
  display: flex;
  justify-content: end;
}
</style>
