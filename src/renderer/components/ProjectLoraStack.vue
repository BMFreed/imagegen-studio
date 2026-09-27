<script setup lang="ts">
import type {
  ModelCatalogItem,
  ProjectGenerationDraftChange,
  ProjectLoraIdentity,
  ProjectTab,
} from '../../shared/api.js'

import { NSelect, type SelectOption } from 'naive-ui'
import { computed, h, ref, watch } from 'vue'

import { savedModelAvailability } from './project-model-picker.js'
import ProjectLoraRow from './ProjectLoraRow.vue'
import ProjectModelOption from './ProjectModelOption.vue'

const props = defineProps<{
  catalog: ModelCatalogItem[]
  catalogReady: boolean
  disabled: boolean
  draft: ProjectTab['generationDraft']
  loading: boolean
}>()
const emit = defineEmits<{
  add: [identity: ProjectLoraIdentity]
  change: [change: ProjectGenerationDraftChange]
  remove: [identity: ProjectLoraIdentity]
  validity: [valid: boolean]
}>()
const invalidRows = ref(new Set<string>())
const rows = computed(() =>
  props.draft.loras.map((lora) => ({
    identity: { resourceId: lora.resource.localModelId, versionId: lora.resource.localVersionId },
    key: JSON.stringify([lora.resource.localModelId, lora.resource.localVersionId]),
    lora,
  })),
)
watch(
  () => [rows.value.map((row) => row.key), [...invalidRows.value]] as const,
  ([keys, invalid]) => {
    emit('validity', !invalid.some((key) => keys.includes(key)))
  },
  { immediate: true },
)
const options = computed(() =>
  props.catalog
    .filter((resource) => resource.resourceType === 'lora')
    .flatMap((resource) =>
      resource.versions.map((version) => {
        const added = props.draft.loras.some((lora) => lora.resource.localModelId === resource.id)
        const mismatch =
          props.draft.model?.baseModelFamily &&
          version.baseModelFamily &&
          props.draft.model.baseModelFamily !== version.baseModelFamily
        const status = added
          ? 'Added'
          : version.fileStatus !== 'ready'
            ? version.fileStatus === 'corrupt'
              ? 'Needs repair'
              : 'Missing file'
            : mismatch
              ? 'Incompatible with selected model'
              : version.baseModelFamily === null
                ? 'Compatibility unknown'
                : resource.defaultVersionId === version.id
                  ? 'Default'
                  : 'Installed'
        return {
          added,
          disabled: added || version.fileStatus !== 'ready' || !!mismatch,
          label: `${resource.name} · ${version.name}`,
          resource,
          status,
          value: version.id,
          version,
        }
      }),
    ),
)
function renderLabel(option: SelectOption) {
  const entry = options.value.find((item) => item.value === option.value)
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
function filterOption(pattern: string, option: SelectOption) {
  const entry = options.value.find((item) => item.value === option.value)
  return (
    !!entry &&
    [entry.label, entry.version.baseModelFamily ?? '', ...entry.version.trainedWords].some((text) =>
      text.toLocaleLowerCase().includes(pattern.toLocaleLowerCase()),
    )
  )
}
function add(versionId: string) {
  const entry = options.value.find((item) => item.value === versionId && !item.disabled)
  if (entry) {
    emit('add', { resourceId: entry.resource.id, versionId })
  }
}
function warning(lora: ProjectTab['generationDraft']['loras'][number]) {
  if (!props.catalogReady) {
    return null
  }
  const availability = savedModelAvailability(lora.resource, props.catalog)
  if (availability === 'missing') {
    return 'Exact version unavailable. Restore it in Model Manager, or remove this LoRA.'
  }
  if (availability === 'corrupt') {
    return 'File needs repair in Model Manager.'
  }
  if (availability === 'unknown-family') {
    return 'Model family is unknown; compatibility cannot be checked.'
  }
  if (
    props.draft.model?.baseModelFamily &&
    lora.resource.baseModelFamily !== props.draft.model.baseModelFamily
  ) {
    return 'Incompatible with the selected model. Disable or remove this LoRA.'
  }
  return null
}
function validity(key: string, valid: boolean) {
  const next = new Set(invalidRows.value)
  if (valid) {
    next.delete(key)
  } else {
    next.add(key)
  }
  invalidRows.value = next
}
</script>

<template>
  <section aria-label="LoRAs" class="lora-stack">
    <span class="field-label">LoRAs</span>
    <NSelect
      aria-label="Add LoRA"
      :disabled="disabled || !catalogReady"
      :filter="filterOption"
      filterable
      :loading
      :options
      placeholder="Add LoRA"
      :renderLabel
      size="small"
      :value="null"
      :virtualScroll="false"
      @update:value="add"
    />
    <p v-if="catalogReady && options.length === 0" class="lora-empty">
      Install LoRAs in Model Manager to add them here.
    </p>
    <ProjectLoraRow
      v-for="row of rows"
      :key="row.key"
      :disabled
      :lora="row.lora"
      :warning="warning(row.lora)"
      @change="emit('change', $event)"
      @remove="emit('remove', row.identity)"
      @validity="validity(row.key, $event)"
    />
  </section>
</template>

<style scoped>
.lora-stack {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.field-label {
  font-size: var(--app-font-size);
  font-weight: 600;
}
.lora-empty {
  margin: 0;
  font-size: var(--app-font-size-meta);
  color: var(--app-text-muted);
}
</style>
