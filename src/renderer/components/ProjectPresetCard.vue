<script setup lang="ts">
import type { ModelCatalogItem } from '../../shared/api.js'
import { includedPresetSections } from '../../shared/presets/preset-application.js'
import type { PresetRecord, PresetSectionKey } from '../../shared/presets/preset-schema.js'

import { FilePlus, Refresh, Settings } from '@vicons/tabler'
import { NButton, NCard, NEmpty, NInput, NPopover, NSpin, NTag, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import { presetNeedsAttention, sectionLabels, workflowLabels } from './preset-editor.js'

const props = defineProps<{
  applyDisabledReason?: string | null
  catalog: ModelCatalogItem[]
  catalogReady: boolean
  disabled: boolean
  error: string | null
  loading: boolean
  presets: PresetRecord[]
  saveDisabledReason?: string | null
}>()
const emit = defineEmits<{ choose: [id: string]; manage: []; refresh: []; save: [] }>()
const applyDisabled = computed(() => props.disabled || Boolean(props.applyDisabledReason))
const open = ref(false)
const search = ref('')
const presets = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.presets.filter(
    (preset) =>
      preset.deletedAt === null &&
      (!query ||
        [preset.name, preset.description].some((text) => text.toLocaleLowerCase().includes(query))),
  )
})
watch(applyDisabled, (disabled) => {
  if (disabled) {
    open.value = false
  }
})
function choose(id: string) {
  if (applyDisabled.value || props.loading || !presets.value.some((preset) => preset.id === id)) {
    return
  }
  open.value = false
  search.value = ''
  emit('choose', id)
}
function badgeLabel(section: PresetSectionKey) {
  return section === 'negativePrompt'
    ? 'Negative'
    : section === 'loras'
      ? 'LoRA'
      : section === 'guidance'
        ? 'Steps'
        : sectionLabels[section]
}
</script>

<template>
  <NCard size="small" title="Preset">
    <div class="preset-actions">
      <NPopover
        v-model:show="open"
        :disabled="applyDisabled"
        placement="bottom-start"
        :showArrow="false"
        trigger="click"
      >
        <template v-slot:trigger>
          <NTooltip :disabled="!applyDisabledReason">
            <template v-slot:trigger>
              <span class="apply-trigger">
                <NButton
                  aria-label="Apply preset"
                  class="apply-button"
                  :disabled="applyDisabled"
                  secondary
                  size="small"
                >
                  Apply preset...
                </NButton>
              </span>
            </template>
            {{ applyDisabledReason }}
          </NTooltip>
        </template>
        <div aria-label="Choose preset to apply" class="preset-picker" role="dialog">
          <div class="picker-search">
            <NInput
              v-model:value="search"
              clearable
              :inputProps="{ 'aria-label': 'Search presets to apply' }"
              placeholder="Search presets"
              size="small"
            />
            <IconButton
              compact
              :disabled="loading"
              :icon="Refresh"
              label="Refresh presets to apply"
              @click="emit('refresh')"
            />
          </div>
          <p v-if="error" class="picker-error" role="alert">{{ error }}</p>
          <div v-if="loading" class="picker-empty">
            <NSpin size="small" />
            <span>Loading presets…</span>
          </div>
          <div v-else-if="presets.length" class="preset-results">
            <NButton
              v-for="preset of presets"
              :key="preset.id"
              :aria-label="`Choose preset ${preset.name}`"
              block
              class="preset-result"
              :disabled
              quaternary
              @click="choose(preset.id)"
            >
              <div class="preset-copy">
                <strong>{{ preset.name }}</strong>
                <small>{{ workflowLabels[preset.workflow] }}</small>
                <span class="section-badges">
                  <NTag
                    v-for="section of includedPresetSections(preset.payload)"
                    :key="section"
                    size="small"
                  >
                    {{ badgeLabel(section) }}
                  </NTag>
                  <NTag
                    v-if="presetNeedsAttention(preset, catalog, catalogReady)"
                    size="small"
                    type="warning"
                  >
                    Needs attention
                  </NTag>
                </span>
              </div>
            </NButton>
          </div>
          <NEmpty
            v-else
            class="picker-empty"
            :description="
              error
                ? 'Presets could not be loaded'
                : search.trim()
                  ? 'No presets match this search'
                  : 'No saved presets yet'
            "
          />
        </div>
      </NPopover>
      <IconButton
        compact
        :disabled
        :icon="Settings"
        label="Manage Presets"
        @click="emit('manage')"
      />
      <IconButton
        compact
        :disabled="disabled || Boolean(saveDisabledReason)"
        :icon="FilePlus"
        label="Save Current as Preset"
        :tooltip="saveDisabledReason ?? undefined"
        @click="emit('save')"
      />
    </div>
  </NCard>
</template>

<style scoped>
.preset-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 4px;
}
.apply-button {
  width: 100%;
  justify-content: start;
}
.apply-trigger {
  display: block;
  min-width: 0;
}
.preset-picker {
  display: flex;
  flex-direction: column;
  width: min(320px, calc(100vw - 64px));
  /* Leave room for the trigger, popover padding/gap and viewport edge on either side. */
  max-height: min(356px, calc(50vh - 48px));
  gap: 8px;
}
.picker-search {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
}
.preset-results {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 320px;
  overflow: auto;
}
.preset-result {
  flex-shrink: 0;
  justify-content: flex-start;
  min-height: 44px;
  height: auto;
  padding: 8px 10px;
  white-space: normal;
}
.preset-copy {
  display: grid;
  gap: 5px;
  width: 100%;
  min-width: 0;
  text-align: left;
}
.preset-copy strong {
  white-space: normal;
  overflow-wrap: anywhere;
}
.preset-copy small {
  color: var(--app-text-muted);
}
.section-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.picker-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 18px 10px;
}
.picker-error {
  margin: 0;
  color: var(--status-warning-text);
  font-size: var(--app-font-size-meta);
}
</style>
