<script setup lang="ts">
import { FilePlus, Settings } from '@vicons/tabler'
import { NButton, NCard, NIcon, NInput, NPopover, NTag, NTooltip } from 'naive-ui'
import { computed, ref } from 'vue'

import { presetCatalog } from '../presets/presets.catalog'
import { presetHasMissingResources, workflowLabel } from '../presets/presets.utils'

const emit = defineEmits<{ apply: [id: string]; manage: []; save: [] }>()
const open = ref(false)
const search = ref('')
const presets = computed(() =>
  presetCatalog.value.filter((preset) =>
    preset.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
  ),
)
function choose(id: string) {
  open.value = false
  search.value = ''
  emit('apply', id)
}
</script>

<template>
  <NCard size="small" title="Preset">
    <div class="preset-actions">
      <NPopover v-model:show="open" placement="bottom-start" trigger="click">
        <template v-slot:trigger>
          <NTooltip>
            <template v-slot:trigger>
              <NButton aria-label="Apply preset" class="apply-button" secondary size="small">
                Apply preset...
              </NButton>
            </template>
            Apply a temporary copy of preset settings
          </NTooltip>
        </template>
        <div class="preset-picker">
          <NInput
            v-model:value="search"
            aria-label="Search presets"
            clearable
            placeholder="Search presets"
            size="small"
          />
          <div class="preset-results">
            <NButton
              v-for="preset of presets"
              :key="preset.id"
              block
              class="preset-result"
              quaternary
              @click="choose(preset.id)"
            >
              <span>
                <strong>{{ preset.name }}</strong>
                <small>
                  {{ workflowLabel(preset.workflow) }}
                </small>
              </span>
              <NTag v-if="presetHasMissingResources(preset)" size="small" type="warning">
                Missing resource
              </NTag>
            </NButton>
          </div>
        </div>
      </NPopover>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            aria-label="Manage Presets"
            circle
            quaternary
            size="tiny"
            @click="emit('manage')"
          >
            <template v-slot:icon><NIcon :component="Settings" /></template>
          </NButton>
        </template>
        Manage presets
      </NTooltip>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            aria-label="Save Current as Preset"
            circle
            quaternary
            size="tiny"
            @click="emit('save')"
          >
            <template v-slot:icon><NIcon :component="FilePlus" /></template>
          </NButton>
        </template>
        Save current settings as a new preset
      </NTooltip>
    </div>
  </NCard>
</template>

<style scoped>
.preset-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 4px;
}
.apply-button {
  width: 100%;
  justify-content: start;
}
.preset-picker {
  display: grid;
  width: 320px;
  gap: 6px;
}
.preset-results {
  display: grid;
  max-height: 300px;
  overflow: auto;
}
.preset-result {
  min-height: 44px;
  height: auto;
}
.preset-result :deep(.n-button__content) {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 8px;
}
.preset-result span {
  display: grid;
  min-width: 0;
  text-align: left;
}
.preset-result small {
  color: var(--app-text-muted);
}
</style>
