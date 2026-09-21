<script setup lang="ts">
import { NButton, NCard, NModal, NSplit, NText, useDialog, useMessage } from 'naive-ui'
import { computed, nextTick, onMounted, ref } from 'vue'

import type {
  PresetCreateIntent,
  PresetDefinition,
  PresetRecord,
  PresetWorkflow,
} from './presets.types'

import { AppLayer } from '../../theme/app-layers'
import PresetList from './PresetList.vue'
import PresetManagerEditor from './PresetManagerEditor.vue'
import PresetManagerHeader from './PresetManagerHeader.vue'
import PresetManagerNavigation from './PresetManagerNavigation.vue'
import { presetCatalog } from './presets.catalog'
import { defaultPresetId, presetEditorResources } from './presets.mock'
import {
  clonePreset,
  createManualPresetDefinition,
  createPresetDefinitionFromProject,
  createPresetRecord,
  isPresetDefinitionValid,
  isPresetEqual,
  presetHasMissingResources,
  presetSearchText,
} from './presets.utils'

type WorkflowFilter = 'all' | PresetWorkflow
type ManagerSelection = { id: string; kind: 'record' } | { kind: 'draft' }
type PendingNavigation = { id: string; type: 'select' } | { type: 'close' } | { type: 'new' }

const props = defineProps<{
  initialCreateIntent?: PresetCreateIntent
  initialSelectedId?: string
}>()
const emit = defineEmits<{
  close: []
}>()

const dialog = useDialog()
const message = useMessage()
const presets = presetCatalog
const managerOpen = ref(false)
const navigationPaneSize = ref<number | string>('210px')
const presetPaneSize = ref<number | string>('calc(100% - 520px)')
const createIntent = ref<PresetCreateIntent | undefined>(props.initialCreateIntent)
const selection = ref<ManagerSelection>(
  props.initialCreateIntent
    ? { kind: 'draft' }
    : { id: props.initialSelectedId ?? defaultPresetId, kind: 'record' },
)
const previousSelectedId = ref(props.initialSelectedId ?? defaultPresetId)
const draft = ref<PresetDefinition>(getInitialDefinition())
const workflowFilter = ref<WorkflowFilter>('all')
const searchFilter = ref('')
const sortValue = ref<'name' | 'recent'>('name')
const favoritesOnly = ref(false)
const attentionOnly = ref(false)
const pendingNavigation = ref<PendingNavigation | null>(null)
const showUnsavedDialog = ref(false)

const creating = computed(() => selection.value.kind === 'draft')
const selectedId = computed(() => (selection.value.kind === 'record' ? selection.value.id : ''))
const selectedRecord = computed(() => {
  const currentSelection = selection.value

  return currentSelection.kind === 'record'
    ? presets.value.find((preset) => preset.id === currentSelection.id)
    : undefined
})
const dirty = computed(
  () =>
    creating.value ||
    (selectedRecord.value
      ? !isPresetEqual(draft.value, toDefinition(selectedRecord.value))
      : false),
)
const hasActiveFilters = computed(
  () =>
    workflowFilter.value !== 'all' ||
    searchFilter.value.trim() !== '' ||
    favoritesOnly.value ||
    attentionOnly.value,
)
const visiblePresets = computed(() => {
  const query = searchFilter.value.trim().toLocaleLowerCase()
  const filtered = presets.value.filter(
    (preset) =>
      (workflowFilter.value === 'all' || preset.workflow === workflowFilter.value) &&
      (!favoritesOnly.value || preset.favorite) &&
      (!attentionOnly.value || presetHasMissingResources(preset)) &&
      (query === '' || presetSearchText(preset).includes(query)),
  )

  return filtered.toSorted((left, right) =>
    sortValue.value === 'name'
      ? left.name.localeCompare(right.name)
      : Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  )
})

function toDefinition(record: PresetRecord): PresetDefinition {
  const { id: _id, updatedAt: _updatedAt, ...definition } = record
  return clonePreset(definition)
}

function getRecord(id: string): PresetRecord {
  const record = presets.value.find((candidate) => candidate.id === id) ?? presets.value[0]

  if (!record) {
    throw new Error('Preset Manager prototype requires at least one mock preset.')
  }

  return record
}

function getInitialDefinition(): PresetDefinition {
  if (props.initialCreateIntent?.kind === 'project') {
    return createPresetDefinitionFromProject(props.initialCreateIntent)
  }

  if (props.initialCreateIntent?.kind === 'manual') {
    return createManualPresetDefinition()
  }

  return toDefinition(getRecord(props.initialSelectedId ?? defaultPresetId))
}

function resetFilters() {
  workflowFilter.value = 'all'
  searchFilter.value = ''
  favoritesOnly.value = false
  attentionOnly.value = false
}

function focusPresetName() {
  void nextTick(() => {
    globalThis.document.querySelector<HTMLInputElement>('[aria-label="Preset name"]')?.focus()
  })
}

function selectPreset(id: string) {
  const record = getRecord(id)
  selection.value = { id: record.id, kind: 'record' }
  draft.value = toDefinition(record)
}

function startManualCreate() {
  if (selection.value.kind === 'record') {
    previousSelectedId.value = selection.value.id
  }

  createIntent.value = { kind: 'manual' }
  draft.value = createManualPresetDefinition()
  selection.value = { kind: 'draft' }
  focusPresetName()
}

function requestNewPreset() {
  if (creating.value) {
    focusPresetName()
    return
  }

  if (dirty.value) {
    pendingNavigation.value = { type: 'new' }
    showUnsavedDialog.value = true
    return
  }

  startManualCreate()
}

function requestSelection(id: string) {
  if (selection.value.kind === 'record' && id === selection.value.id) {
    return
  }

  if (!dirty.value) {
    selectPreset(id)
    return
  }

  pendingNavigation.value = { id, type: 'select' }
  showUnsavedDialog.value = true
}

function requestClose() {
  if (!dirty.value) {
    managerOpen.value = false
    return
  }

  pendingNavigation.value = { type: 'close' }
  showUnsavedDialog.value = true
}

function saveDraft(showMessage = true): boolean {
  const currentSelection = selection.value

  if (currentSelection.kind !== 'record' || !isPresetDefinitionValid(draft.value)) {
    return false
  }

  const index = presets.value.findIndex((preset) => preset.id === currentSelection.id)

  if (index < 0) {
    return false
  }

  const current = presets.value[index]!
  presets.value[index] = {
    ...clonePreset(draft.value),
    id: current.id,
    updatedAt: new Date().toISOString(),
  }
  draft.value = toDefinition(presets.value[index]!)

  if (showMessage) {
    message.success('Preset saved')
  }

  return true
}

function createDraft(showMessage = true): PresetRecord | undefined {
  if (!creating.value || !isPresetDefinitionValid(draft.value)) {
    return undefined
  }

  const record = createPresetRecord(draft.value)
  presets.value.unshift(record)
  createIntent.value = undefined
  selection.value = { id: record.id, kind: 'record' }
  draft.value = toDefinition(record)

  if (showMessage) {
    message.success('Preset created')
  }

  return record
}

function completePendingNavigation() {
  const pending = pendingNavigation.value
  pendingNavigation.value = null
  showUnsavedDialog.value = false

  if (!pending) {
    return
  }

  if (pending.type === 'select') {
    selectPreset(pending.id)
  } else if (pending.type === 'new') {
    startManualCreate()
  } else {
    managerOpen.value = false
  }
}

function saveAndContinue() {
  const completed = creating.value ? Boolean(createDraft(false)) : saveDraft(false)

  if (completed) {
    completePendingNavigation()
  }
}

function discardAndContinue() {
  if (!creating.value && selectedRecord.value) {
    draft.value = toDefinition(selectedRecord.value)
  }

  createIntent.value = undefined
  completePendingNavigation()
}

function cancelPendingNavigation() {
  pendingNavigation.value = null
  showUnsavedDialog.value = false
}

function cancelCreate() {
  if (!creating.value) {
    return
  }

  if (createIntent.value?.kind === 'project') {
    managerOpen.value = false
    return
  }

  createIntent.value = undefined
  selectPreset(previousSelectedId.value)
}

function duplicatePreset() {
  const currentSelection = selection.value

  if (currentSelection.kind !== 'record') {
    return
  }

  const selectedIndex = presets.value.findIndex((preset) => preset.id === currentSelection.id)
  const copy = createPresetRecord({
    ...clonePreset(draft.value),
    name: `${draft.value.name} Copy`,
  })
  presets.value.splice(selectedIndex + 1, 0, copy)
  selectPreset(copy.id)
  message.success('Preset duplicated')
}

function deletePreset() {
  if (selection.value.kind !== 'record') {
    return
  }

  dialog.warning({
    content: 'Delete this preset? Projects that already used it will not be changed.',
    negativeText: 'Cancel',
    onPositiveClick: () => {
      const selectedIndex = presets.value.findIndex((preset) => preset.id === selectedId.value)
      presets.value.splice(selectedIndex, 1)
      const nextPreset = presets.value[Math.min(selectedIndex, presets.value.length - 1)]

      if (nextPreset) {
        selectPreset(nextPreset.id)
      }

      message.success('Preset deleted')
    },
    positiveButtonProps: { type: 'error' },
    positiveText: 'Delete',
    title: 'Delete preset',
  })
}

function handleVisibilityChange(visible: boolean) {
  if (!visible) {
    requestClose()
  }
}

onMounted(() => {
  void nextTick(() => {
    managerOpen.value = true
  })
})
</script>

<template>
  <NModal
    :closeOnEsc="!showUnsavedDialog"
    :maskClosable="false"
    :show="managerOpen"
    transformOrigin="center"
    :zIndex="AppLayer.appOverlay"
    @afterLeave="$emit('close')"
    @update:show="handleVisibilityChange"
  >
    <div
      aria-label="Preset Manager prototype"
      aria-modal="true"
      class="manager-shell"
      role="dialog"
    >
      <PresetManagerHeader @close="requestClose" @create="requestNewPreset" />
      <NSplit v-model:size="navigationPaneSize" class="manager-body" max="300px" min="190px">
        <template v-slot:1>
          <aside class="manager-column manager-column--navigation">
            <PresetManagerNavigation v-model:workflow="workflowFilter" :presets />
          </aside>
        </template>
        <template v-slot:2>
          <NSplit
            v-model:size="presetPaneSize"
            class="manager-content-split"
            :max="0.7"
            min="420px"
          >
            <template v-slot:1>
              <main class="preset-content">
                <PresetList
                  v-model:attentionOnly="attentionOnly"
                  v-model:favoritesOnly="favoritesOnly"
                  v-model:search="searchFilter"
                  v-model:sort="sortValue"
                  :draft="creating ? draft : undefined"
                  :draftSelected="creating"
                  :hasActiveFilters
                  :presets="visiblePresets"
                  :selectedId
                  @resetFilters="resetFilters"
                  @select="requestSelection"
                  @selectDraft="focusPresetName"
                />
              </main>
            </template>
            <template v-slot:2>
              <aside class="manager-column manager-column--editor">
                <PresetManagerEditor
                  v-model="draft"
                  :createIntent
                  :creating
                  :dirty
                  :resources="presetEditorResources"
                  @cancel="cancelCreate"
                  @create="createDraft"
                  @delete="deletePreset"
                  @duplicate="duplicatePreset"
                  @save="saveDraft"
                />
              </aside>
            </template>
          </NSplit>
        </template>
      </NSplit>
    </div>
  </NModal>

  <NModal
    v-model:show="showUnsavedDialog"
    :maskClosable="false"
    transformOrigin="center"
    :zIndex="AppLayer.dialog"
  >
    <NCard aria-label="Unsaved preset changes" class="unsaved-card" role="dialog" size="small">
      <h2>{{ creating ? 'Unsaved preset' : 'Unsaved changes' }}</h2>
      <NText depth="3">
        {{
          creating
            ? 'Create this preset before leaving the draft?'
            : 'Save your changes before leaving this preset?'
        }}
      </NText>
      <div class="unsaved-actions">
        <NButton tertiary @click="cancelPendingNavigation">Cancel</NButton>
        <NButton secondary type="error" @click="discardAndContinue">
          {{ creating ? 'Discard Draft' : 'Discard' }}
        </NButton>
        <NButton
          :disabled="creating && !isPresetDefinitionValid(draft)"
          type="primary"
          @click="saveAndContinue"
        >
          {{ creating ? 'Create Preset' : 'Save' }}
        </NButton>
      </div>
    </NCard>
  </NModal>
</template>

<style scoped>
.manager-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1500px, calc(100vw - 96px));
  height: min(890px, calc(100vh - 32px));
  min-height: 0;
  overflow: visible;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.manager-body {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.manager-content-split {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.manager-column,
.preset-content {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.unsaved-card {
  width: min(440px, calc(100vw - 48px));
}

.unsaved-card h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.unsaved-actions {
  display: flex;
  justify-content: end;
  gap: 8px;
  margin-top: 20px;
}
</style>
