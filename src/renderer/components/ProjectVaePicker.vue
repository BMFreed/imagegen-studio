<script setup lang="ts">
import type { ModelCatalogItem, ProjectGenerationModelSelection } from '../../shared/api.js'

import { RotateClockwise as ResetIcon } from '@vicons/tabler'
import { NButton, NSelect, type SelectOption } from 'naive-ui'
import { computed, h } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import LabeledControl from '../../../docs/prototype-app/src/components/LabeledControl.vue'
import { type ModelManagerFocus, modelManagerFocusFor } from './model-manager-focus.js'
import { portableModelRelinkCandidate } from './project-model-picker.js'
import {
  EMBEDDED_VAE_OPTION,
  externalVaeGenerationReason,
  projectVaeDiagnostic,
  projectVaeOptions,
  type SavedVae,
} from './project-vae-picker.js'
import ProjectModelOption from './ProjectModelOption.vue'

const props = defineProps<{
  catalog: ModelCatalogItem[]
  catalogReady: boolean
  disabled: boolean
  loading: boolean
  modelFamily: string | null
  runtimeSupported: boolean | null
  saved: SavedVae | null
}>()
// This is an exact resource command, not an ordinary v-model: main resolves IDs to trusted metadata.
const emit = defineEmits<{
  manageModels: [focus: ModelManagerFocus | null]
  relink: []
  select: [selection: ProjectGenerationModelSelection]
}>()
const entries = computed(() => projectVaeOptions(props.catalog))
const diagnostic = computed(() =>
  projectVaeDiagnostic(props.saved, props.catalog, props.catalogReady, props.modelFamily),
)
const generationReason = computed(() =>
  externalVaeGenerationReason(props.saved, props.runtimeSupported),
)
const canRelink = computed(
  () =>
    props.catalogReady &&
    props.modelFamily === 'illustrious' &&
    !!portableModelRelinkCandidate(props.saved, props.catalog),
)
const selectionDisabled = computed(
  () => props.disabled || !props.catalogReady || props.modelFamily !== 'illustrious',
)
const options = computed(() => {
  const result: SelectOption[] = [
    { label: 'Embedded', value: EMBEDDED_VAE_OPTION },
    ...entries.value,
  ]
  if (props.saved && !entries.value.some((entry) => entry.value === props.saved?.localVersionId)) {
    result.push({
      disabled: true,
      label: `${props.saved.displayName} · ${props.saved.versionName}`,
      value: props.saved.localVersionId,
    })
  }
  return result
})
function renderLabel(option: SelectOption) {
  const entry = entries.value.find((item) => item.value === option.value)
  return entry
    ? h(ProjectModelOption, {
        defaultSelectable: false,
        hasReadyVersion: entry.version.fileStatus === 'ready',
        resource: entry.resource,
        statusLabel: entry.status,
        version: entry.version,
      })
    : String(option.label)
}
function renderTag({ option }: { option: SelectOption }) {
  return String(option.label)
}
function select(value: string) {
  if (selectionDisabled.value) {
    return
  }
  if (value === EMBEDDED_VAE_OPTION) {
    emit('select', null)
    return
  }
  const entry = entries.value.find((item) => item.value === value && !item.disabled)
  if (entry) {
    emit('select', { resourceId: entry.resource.id, versionId: entry.version.id })
  }
}
function openModels() {
  emit('manageModels', modelManagerFocusFor('vae', props.saved))
}
</script>

<template>
  <section aria-label="VAE settings" class="vae-picker">
    <div class="vae-heading">
      <NButton aria-label="Open VAE in Models" :disabled size="tiny" text @click="openModels">
        Open in Models
      </NButton>
    </div>
    <div class="vae-control">
      <LabeledControl class="vae-labeled-control" label="VAE">
        <template v-slot="{ controlId }">
          <NSelect
            class="vae-select"
            :disabled="selectionDisabled"
            filterable
            :inputProps="{ id: controlId, 'aria-label': 'VAE' }"
            :loading
            :options
            :renderLabel
            :renderTag
            size="small"
            :value="saved?.localVersionId ?? EMBEDDED_VAE_OPTION"
            :virtualScroll="false"
            @update:value="select"
          />
        </template>
      </LabeledControl>
      <IconButton
        v-if="saved"
        compact
        :disabled
        :icon="ResetIcon"
        label="Reset VAE"
        @click="emit('select', null)"
      />
    </div>
    <p v-if="diagnostic" class="vae-diagnostic" role="status">{{ diagnostic }}</p>
    <NButton
      v-if="canRelink"
      aria-label="Relink VAE"
      :disabled
      size="tiny"
      text
      @click="emit('relink')"
    >
      Link installed exact VAE
    </NButton>
    <p v-if="generationReason" class="vae-diagnostic" role="status">{{ generationReason }}</p>
    <p v-else-if="modelFamily === 'illustrious' && !diagnostic" class="vae-diagnostic">
      {{ saved ? 'Uses the selected external VAE.' : 'Uses the VAE included in the checkpoint.' }}
    </p>
  </section>
</template>

<style scoped>
.vae-picker {
  margin-bottom: 12px;
  min-width: 0;
}
.vae-heading {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
.vae-control {
  display: flex;
  align-items: center;
  gap: 6px;
}
.vae-labeled-control {
  flex: 1;
}
.vae-select {
  width: 192px;
  max-width: 100%;
}
.vae-diagnostic {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
