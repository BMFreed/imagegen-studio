<script setup lang="ts">
import type { ModelCatalogItem, PresetApi } from '../../shared/api.js'
import type { PresetRecord, PresetWorkflow } from '../../shared/presets/preset-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import { WindowCloseCanceledError } from '../../shared/window-close.js'

import {
  AlertTriangle,
  ArrowBackUp,
  Copy,
  FilterOff,
  Plus,
  Refresh,
  Star,
  Trash,
  X,
} from '@vicons/tabler'
import {
  NAlert,
  NButton,
  NCard,
  NDynamicTags,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NScrollbar,
  NSelect,
  NSpin,
  NSplit,
  NSwitch,
  NTag,
  NText,
} from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'
import {
  presetDefinitionFromRecord,
  presetNeedsAttention,
  workflowLabels,
} from './preset-editor.js'
import { PresetManagerSession, type PresetManagerState } from './preset-manager-session.js'
import PresetPayloadEditor from './PresetPayloadEditor.vue'

const props = defineProps<{ catalog: ModelCatalogItem[]; catalogReady: boolean }>()
const show = defineModel<boolean>('show', { required: true })
let closingWindow: {
  reject: (error: Error) => void
  resolve: () => void
  setDecisionPending: (pending: boolean) => void
} | null = null
function nativeApi(): PresetApi {
  if (!globalThis.window.api?.presets) {
    throw new Error('Preset storage is unavailable in this window.')
  }
  return globalThis.window.api.presets
}
const api: PresetApi = {
  create: (definition) => nativeApi().create(definition),
  duplicate: (id, name) => nativeApi().duplicate(id, name),
  get: (id, options) => nativeApi().get(id, options),
  list: (options) => nativeApi().list(options),
  restore: (id) => nativeApi().restore(id),
  softDelete: (id) => nativeApi().softDelete(id),
  update: (id, definition) => nativeApi().update(id, definition),
}
const session = new PresetManagerSession(api, {
  onChange: (next) => {
    state.value = { ...next }
    closingWindow?.setDecisionPending(next.pending !== null && !next.busy)
    if (closingWindow && !next.busy && !next.pending) {
      queueMicrotask(() => {
        if (closingWindow && !session.state.busy && !session.state.pending) {
          session.requestClose()
        }
      })
    }
  },
  onClose: () => {
    show.value = false
    closingWindow?.resolve()
    closingWindow = null
  },
  onCloseCanceled: () => {
    closingWindow?.reject(new WindowCloseCanceledError())
    closingWindow = null
  },
})
const state = ref<PresetManagerState>({ ...session.state })
const workflowFilter = ref<'all' | PresetWorkflow>('all')
const search = ref('')
const sort = ref<'name' | 'recent'>('name')
const favoritesOnly = ref(false)
const attentionOnly = ref(false)
const navigationWidth = ref('200px')
const listSize = ref(0.46)
const contentHost = ref<HTMLElement | null>(null)
const contentWidth = ref(0)
const contentTriggerSize = 3
const minimumListWidth = 250
const preferredEditorWidth = 360
let contentObserver: ResizeObserver | null = null
const listBounds = computed(() => {
  const usableWidth = contentWidth.value - contentTriggerSize
  if (usableWidth <= 0) {
    return { max: 1, min: 0 }
  }
  const listMinimum = Math.min(minimumListWidth, usableWidth)
  // At the supported narrow window, a wide navigation pane can leave less
  // than both preferred minima. Keep the list usable and give the editor
  // the actual remainder instead of forcing the panes outside the modal.
  const editorMinimum = Math.min(preferredEditorWidth, Math.max(0, usableWidth - listMinimum))
  return {
    max: Math.max(
      listMinimum / usableWidth,
      Math.min(0.6, (usableWidth - editorMinimum) / usableWidth),
    ),
    min: listMinimum / usableWidth,
  }
})
watch(
  listBounds,
  (bounds) => {
    listSize.value = Math.max(bounds.min, Math.min(bounds.max, listSize.value))
  },
  { flush: 'sync' },
)
watch(
  contentHost,
  (element) => {
    contentObserver?.disconnect()
    contentObserver = null
    contentWidth.value = element?.getBoundingClientRect().width ?? 0
    if (!element) {
      return
    }
    contentObserver = new ResizeObserver((entries) => {
      if (contentHost.value === element) {
        contentWidth.value = entries[0]?.contentRect.width ?? 0
      }
    })
    contentObserver.observe(element)
  },
  { flush: 'post' },
)
const deleteConfirmation = ref(false)
const dirty = computed(() => {
  JSON.stringify(state.value.draft)
  return session.dirty
})
const valid = computed(() => {
  JSON.stringify(state.value.draft)
  return session.valid
})
const selected = computed(
  () => state.value.records.find((record) => record.id === state.value.selectedId) ?? null,
)
const deletedDefinition = computed(() =>
  selected.value?.deletedAt ? presetDefinitionFromRecord(selected.value) : null,
)
const activeRecords = computed(() =>
  state.value.records.filter((record) => record.deletedAt === null),
)
const deletedRecords = computed(() =>
  state.value.records.filter((record) => record.deletedAt !== null),
)
const hasFilters = computed(
  () =>
    workflowFilter.value !== 'all' || !!search.value || favoritesOnly.value || attentionOnly.value,
)
const navigation = computed(() => [
  { count: activeRecords.value.length, label: 'All Presets', value: 'all' as const },
  ...Object.entries(workflowLabels).map(([value, label]) => ({
    count: activeRecords.value.filter((record) => record.workflow === value).length,
    label,
    value: value as PresetWorkflow,
  })),
])
const visibleRecords = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (state.value.view === 'deleted' ? deletedRecords.value : activeRecords.value)
    .filter(
      (record) =>
        state.value.view === 'deleted' ||
        workflowFilter.value === 'all' ||
        record.workflow === workflowFilter.value,
    )
    .filter((record) => !favoritesOnly.value || record.favorite)
    .filter(
      (record) =>
        !attentionOnly.value || presetNeedsAttention(record, props.catalog, props.catalogReady),
    )
    .filter((record) => !query || searchText(record).includes(query))
    .toSorted((a, b) =>
      sort.value === 'recent'
        ? b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    )
})
const needsAttention = computed(
  () =>
    state.value.draft !== null &&
    presetNeedsAttention(state.value.draft, props.catalog, props.catalogReady),
)
const canRestore = computed(
  () =>
    selected.value?.expiresAt !== null &&
    selected.value?.expiresAt !== undefined &&
    Date.parse(selected.value.expiresAt) > Date.now(),
)
const nameProblem = computed(() => {
  const name = state.value.draft?.name ?? ''
  if (!name.trim()) {
    return 'Name is required.'
  }
  return new TextEncoder().encode(name).length > IGS_SAFETY_CEILINGS.titleBytes
    ? 'Name is too long.'
    : undefined
})
const workflowOptions = Object.entries(workflowLabels).map(([value, label]) => ({ label, value }))
const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Recently updated', value: 'recent' },
]

function searchText(record: PresetRecord): string {
  const payload = record.payload
  return [
    record.name,
    record.description,
    payload.prompt?.text,
    payload.negativePrompt?.text,
    payload.model?.displayName,
    payload.vae?.displayName,
    ...(payload.loras ?? []).map((row) => row.resource.displayName),
    ...(payload.prompt?.embeddingRefs ?? []).map((ref) => ref.resource.displayName),
    ...(payload.negativePrompt?.embeddingRefs ?? []).map((ref) => ref.resource.displayName),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}
function filterWorkflow(workflow: 'all' | PresetWorkflow) {
  session.requestView('active')
  workflowFilter.value = workflow
}
function resetFilters() {
  workflowFilter.value = 'all'
  search.value = ''
  favoritesOnly.value = false
  attentionOnly.value = false
}
function updateWorkflow(value: PresetWorkflow) {
  if (!state.value.draft || !Object.hasOwn(workflowLabels, value)) {
    return
  }
  state.value.draft.workflow = value
  if (value === 'textToImage') {
    delete state.value.draft.payload.denoisingStrength
  }
}
async function confirmDelete() {
  await session.softDelete()
  if (!session.state.error) {
    deleteConfirmation.value = false
  }
}
function onKeydown(event: KeyboardEvent) {
  if (!show.value || event.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) {
    return
  }
  const key = event.key.toLowerCase()
  const target = event.target instanceof HTMLElement ? event.target : null
  if (
    (key === 'z' || key === 'y') &&
    !target?.closest('input, textarea, [contenteditable="true"]')
  ) {
    // The manager has no document-wide undo stack. Keep local text undo in its focused input.
    event.preventDefault()
    return
  }
  if (key === 's') {
    event.preventDefault()
    if (!state.value.busy && !deleteConfirmation.value) {
      void saveByShortcut()
    }
  }
}
async function saveByShortcut() {
  const focused = document.activeElement
  if (focused instanceof HTMLElement && focused.closest('.n-input-number')) {
    focused.blur()
  }
  await nextTick()
  if (show.value && valid.value && !state.value.busy && !deleteConfirmation.value) {
    await session.save()
  }
}
function prepareWindowClose(setDecisionPending: (pending: boolean) => void): Promise<void> {
  if (!show.value) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    closingWindow = { reject, resolve, setDecisionPending }
    deleteConfirmation.value = false
    if (!state.value.busy) {
      session.requestClose()
    }
  })
}
defineExpose({ prepareWindowClose })
watch(
  show,
  (open) => {
    deleteConfirmation.value = false
    if (open) {
      resetFilters()
      globalThis.window.addEventListener('keydown', onKeydown, true)
      void session.open()
    } else {
      globalThis.window.removeEventListener('keydown', onKeydown, true)
      session.dispose()
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  contentObserver?.disconnect()
  contentObserver = null
  globalThis.window.removeEventListener('keydown', onKeydown, true)
  closingWindow?.reject(new Error('The preset editor was closed.'))
  closingWindow = null
  session.dispose()
})
</script>

<template>
  <NModal
    :closeOnEsc="!state.pending && !deleteConfirmation && !state.busy"
    :maskClosable="false"
    :show
    :zIndex="AppLayer.appOverlay"
    @update:show="!$event && session.requestClose()"
  >
    <div
      aria-label="Preset Manager"
      aria-modal="true"
      class="manager-shell"
      :class="{ 'manager-shell--error': state.error }"
      role="dialog"
    >
      <header class="manager-header">
        <h1>Preset Manager</h1>
        <div class="header-actions">
          <IconButton
            :disabled="state.busy || state.loading"
            :icon="Refresh"
            label="Refresh presets"
            @click="session.reload()"
          />
          <NButton
            :disabled="state.busy || state.loading"
            secondary
            size="small"
            @click="session.requestNew()"
          >
            <template v-slot:icon><NIcon :component="Plus" /></template>
            New Preset
          </NButton>
          <IconButton
            :disabled="state.busy"
            :icon="X"
            label="Close Preset Manager"
            @click="session.requestClose()"
          />
        </div>
      </header>
      <NAlert
        v-if="state.error"
        aria-label="Preset action failed"
        role="alert"
        title="Preset action failed"
        type="error"
      >
        {{ state.error }}
      </NAlert>
      <NSplit v-model:size="navigationWidth" class="manager-body" max="260px" min="190px">
        <template v-slot:1>
          <aside aria-label="Preset workflows" class="manager-navigation">
            <NText class="navigation-label" depth="3">Workflow</NText>
            <NButton
              v-for="entry of navigation"
              :key="entry.value"
              class="navigation-action"
              :disabled="state.busy"
              quaternary
              :secondary="state.view === 'active' && workflowFilter === entry.value"
              @click="filterWorkflow(entry.value)"
            >
              <span>{{ entry.label }}</span>
              <span>{{ entry.count }}</span>
            </NButton>
            <NButton
              class="navigation-action deleted-action"
              :disabled="state.busy"
              quaternary
              :secondary="state.view === 'deleted'"
              @click="session.requestView('deleted')"
            >
              <span>Deleted</span>
              <span>{{ deletedRecords.length }}</span>
            </NButton>
            <NText class="navigation-help" depth="3">
              Deleted presets can be restored for 30 days. Projects keep their own settings.
            </NText>
          </aside>
        </template>
        <template v-slot:2>
          <div ref="contentHost" class="manager-content-host">
            <NSplit
              v-model:size="listSize"
              class="manager-content-split"
              :max="listBounds.max"
              :min="listBounds.min"
              :pane2Style="{ minWidth: '0' }"
              :resizeTriggerSize="contentTriggerSize"
            >
              <template v-slot:1>
                <section
                  aria-label="Preset list"
                  class="preset-list-panel"
                  :class="{ 'preset-list-panel--draft': state.creating }"
                >
                  <header class="list-toolbar">
                    <div class="search-row">
                      <NInput
                        v-model:value="search"
                        clearable
                        :disabled="state.busy"
                        :inputProps="{ 'aria-label': 'Search presets' }"
                        placeholder="Search presets"
                      />
                      <IconButton
                        :disabled="state.busy || !hasFilters"
                        :icon="FilterOff"
                        label="Reset preset filters"
                        @click="resetFilters"
                      />
                    </div>
                    <label class="sort-field">
                      <span>Sort by</span>
                      <NSelect
                        v-model:value="sort"
                        aria-label="Preset sort"
                        :disabled="state.busy"
                        :options="sortOptions"
                      />
                    </label>
                    <div class="filter-actions">
                      <NButton
                        :disabled="state.busy"
                        :secondary="favoritesOnly"
                        size="small"
                        @click="favoritesOnly = !favoritesOnly"
                      >
                        <template v-slot:icon><NIcon :component="Star" /></template>
                        Favorites
                      </NButton>
                      <NButton
                        :disabled="state.busy || !catalogReady"
                        :secondary="attentionOnly"
                        size="small"
                        @click="attentionOnly = !attentionOnly"
                      >
                        <template v-slot:icon><NIcon :component="AlertTriangle" /></template>
                        Needs Attention
                      </NButton>
                    </div>
                  </header>
                  <article
                    v-if="state.creating"
                    aria-label="Preset draft"
                    class="preset-row draft-row"
                  >
                    <NButton
                      aria-label="Select preset draft"
                      class="preset-row-select"
                      secondary
                      @click="session.requestNew()"
                    >
                      <strong>{{ state.draft?.name.trim() || 'New Preset' }}</strong>
                      <small>Draft · Not saved</small>
                    </NButton>
                  </article>
                  <NScrollbar class="preset-scroll">
                    <div v-if="state.loading" class="empty-state">
                      <NSpin size="small" />
                      <NText depth="3">Loading presets…</NText>
                    </div>
                    <div v-else-if="visibleRecords.length" class="preset-list">
                      <article
                        v-for="record of visibleRecords"
                        :key="record.id"
                        :aria-label="`Preset ${record.name}`"
                        class="preset-row"
                      >
                        <NButton
                          :aria-label="`Select preset ${record.name}`"
                          class="preset-row-select"
                          :disabled="state.busy"
                          quaternary
                          :secondary="record.id === state.selectedId"
                          @click="session.requestSelect(record.id)"
                        >
                          <span class="row-heading">
                            <strong>{{ record.name }}</strong>
                            <NIcon v-if="record.favorite" aria-label="Favorite" :component="Star" />
                            <NTag
                              v-if="presetNeedsAttention(record, catalog, catalogReady)"
                              size="small"
                              type="warning"
                            >
                              Needs Attention
                            </NTag>
                          </span>
                          <small>{{ workflowLabels[record.workflow] }}</small>
                          <small v-if="record.description">{{ record.description }}</small>
                          <small v-if="record.expiresAt">
                            Recoverable until {{ record.expiresAt }}
                          </small>
                        </NButton>
                      </article>
                    </div>
                    <NEmpty
                      v-else
                      class="empty-state"
                      :description="
                        state.error
                          ? 'Presets could not be loaded'
                          : state.view === 'deleted'
                            ? 'No deleted presets match these filters'
                            : activeRecords.length
                              ? 'No presets match these filters'
                              : 'No presets yet'
                      "
                    />
                  </NScrollbar>
                </section>
              </template>
              <template v-slot:2>
                <section aria-label="Preset editor" class="preset-editor">
                  <NScrollbar class="editor-scroll">
                    <div v-if="state.draft" class="editor-content">
                      <NCard size="small">
                        <NForm :disabled="state.busy" labelPlacement="top" size="small">
                          <NFormItem
                            :feedback="nameProblem"
                            label="Name"
                            :validationStatus="nameProblem ? 'error' : undefined"
                          >
                            <NInput
                              v-model:value="state.draft.name"
                              :inputProps="{ 'aria-label': 'Preset name' }"
                            />
                          </NFormItem>
                          <NFormItem label="Description">
                            <NInput
                              v-model:value="state.draft.description"
                              :autosize="{ minRows: 2, maxRows: 3 }"
                              :inputProps="{ 'aria-label': 'Preset description' }"
                              type="textarea"
                            />
                          </NFormItem>
                          <NFormItem label="Workflow">
                            <NSelect
                              aria-label="Preset workflow"
                              :options="workflowOptions"
                              :value="state.draft.workflow"
                              @update:value="updateWorkflow"
                            />
                          </NFormItem>
                          <NFormItem label="Tags">
                            <NDynamicTags
                              v-model:value="state.draft.tags"
                              :disabled="state.busy"
                              :inputProps="{ inputProps: { 'aria-label': 'Preset tag' } }"
                              :max="64"
                            />
                          </NFormItem>
                          <NFormItem label="Favorite">
                            <NSwitch
                              v-model:value="state.draft.favorite"
                              aria-label="Favorite preset"
                              :disabled="state.busy"
                            />
                          </NFormItem>
                        </NForm>
                      </NCard>
                      <NAlert v-if="!catalogReady" key="n-alert-1" type="warning">
                        Resource catalog is unavailable. Saved references remain unchanged.
                      </NAlert>
                      <NAlert v-else-if="needsAttention" key="n-alert-2" type="warning">
                        Unavailable or incompatible resources remain saved. Replace or remove them
                        explicitly before applying this preset.
                      </NAlert>
                      <PresetPayloadEditor
                        :key="state.editorRevision"
                        v-model="state.draft.payload"
                        :catalog
                        :catalogReady
                        :disabled="state.busy"
                        :workflow="state.draft.workflow"
                        @validity="session.setEditorValidity($event)"
                      />
                      <NText v-if="!valid && !nameProblem" depth="3">
                        Correct the included fields and include at least one section to save.
                      </NText>
                    </div>
                    <div
                      v-else-if="selected?.deletedAt && deletedDefinition"
                      class="editor-content"
                    >
                      <h2>{{ selected.name }}</h2>
                      <p>{{ selected.description }}</p>
                      <NAlert type="info">
                        Recoverable until {{ selected.expiresAt }}. Restore this preset to edit it.
                      </NAlert>
                      <PresetPayloadEditor
                        :key="selected.id"
                        :catalog
                        :catalogReady
                        disabled
                        :modelValue="deletedDefinition.payload"
                        :workflow="deletedDefinition.workflow"
                      />
                    </div>
                    <NEmpty
                      v-else
                      class="empty-state"
                      description="Select a preset or use New Preset to create one"
                    />
                  </NScrollbar>
                  <footer
                    v-if="state.draft || selected?.deletedAt"
                    aria-label="Preset editor actions"
                    class="editor-actions"
                  >
                    <template v-if="state.creating">
                      <NButton
                        :disabled="state.busy"
                        size="small"
                        tertiary
                        @click="session.cancelCreate()"
                      >
                        Cancel
                      </NButton>
                      <NText class="save-state" depth="3">Not saved</NText>
                      <NButton
                        :disabled="state.busy || !valid"
                        :loading="state.busy"
                        size="small"
                        type="primary"
                        @click="session.save()"
                      >
                        Create Preset
                      </NButton>
                    </template>
                    <template v-else-if="state.view === 'deleted'">
                      <NText class="save-state" depth="3">
                        {{ canRestore ? 'Deleted' : 'Recovery period ended' }}
                      </NText>
                      <NButton
                        :disabled="state.busy || !canRestore"
                        :loading="state.busy"
                        secondary
                        size="small"
                        @click="session.restore()"
                      >
                        <template v-slot:icon><NIcon :component="ArrowBackUp" /></template>
                        Restore
                      </NButton>
                    </template>
                    <template v-else>
                      <NButton
                        :disabled="state.busy"
                        size="small"
                        tertiary
                        type="error"
                        @click="deleteConfirmation = true"
                      >
                        <template v-slot:icon><NIcon :component="Trash" /></template>
                        Delete
                      </NButton>
                      <NButton
                        :disabled="state.busy"
                        secondary
                        size="small"
                        @click="session.duplicate()"
                      >
                        <template v-slot:icon><NIcon :component="Copy" /></template>
                        Duplicate
                      </NButton>
                      <NText class="save-state" depth="3">
                        {{ dirty ? 'Unsaved changes' : 'Saved' }}
                      </NText>
                      <NButton
                        :disabled="state.busy || !dirty || !valid"
                        :loading="state.busy"
                        size="small"
                        type="primary"
                        @click="session.save()"
                      >
                        Save Changes
                      </NButton>
                    </template>
                  </footer>
                </section>
              </template>
            </NSplit>
          </div>
        </template>
      </NSplit>
    </div>
  </NModal>
  <NModal
    :closeOnEsc="!state.busy"
    :maskClosable="false"
    :show="Boolean(state.pending)"
    :zIndex="AppLayer.dialog"
    @update:show="!$event && session.cancelPending()"
  >
    <NCard
      aria-label="Unsaved preset changes"
      aria-modal="true"
      class="confirmation-card"
      role="dialog"
      size="small"
    >
      <h2>{{ state.creating ? 'Unsaved preset' : 'Unsaved changes' }}</h2>
      <p>
        {{
          state.creating
            ? 'Create this preset before leaving the draft?'
            : 'Save your changes before leaving this preset?'
        }}
      </p>
      <NAlert v-if="state.error" role="alert" type="error">{{ state.error }}</NAlert>
      <div class="confirmation-actions">
        <NButton :disabled="state.busy" tertiary @click="session.cancelPending()">Cancel</NButton>
        <NButton :disabled="state.busy" secondary type="error" @click="session.discardPending()">
          {{ state.creating ? 'Discard Draft' : 'Discard' }}
        </NButton>
        <NButton
          :disabled="state.busy || !valid"
          :loading="state.busy"
          type="primary"
          @click="session.save()"
        >
          {{ state.creating ? 'Create Preset' : 'Save' }}
        </NButton>
      </div>
    </NCard>
  </NModal>
  <NModal
    :closeOnEsc="!state.busy"
    :maskClosable="false"
    :show="deleteConfirmation"
    :zIndex="AppLayer.dialog"
    @update:show="!$event && !state.busy && (deleteConfirmation = false)"
  >
    <NCard
      aria-label="Delete preset"
      aria-modal="true"
      class="confirmation-card"
      role="dialog"
      size="small"
    >
      <h2>Delete preset?</h2>
      <p>
        You can restore {{ selected?.name }} for 30 days. Projects already created from it are not
        changed.
      </p>
      <p v-if="dirty">Unsaved edits in this form will be discarded.</p>
      <NAlert v-if="state.error" role="alert" type="error">{{ state.error }}</NAlert>
      <div class="confirmation-actions">
        <NButton :disabled="state.busy" tertiary @click="deleteConfirmation = false">
          Cancel
        </NButton>
        <NButton
          :disabled="state.busy"
          :loading="state.busy"
          secondary
          type="error"
          @click="confirmDelete"
        >
          Delete
        </NButton>
      </div>
    </NCard>
  </NModal>
</template>

<style scoped>
.manager-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1500px, calc(100vw - 32px));
  height: min(890px, calc(100vh - 32px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.manager-shell--error {
  grid-template-rows: auto auto minmax(0, 1fr);
}
.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--app-border);
}
h1 {
  margin: 0;
  font-size: 20px;
}
h2 {
  margin: 0;
  font-size: 16px;
}
.header-actions,
.filter-actions,
.confirmation-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.manager-body,
.manager-content-host,
.manager-content-split {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.manager-content-host {
  width: 100%;
}
.manager-navigation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 16px 10px;
  box-sizing: border-box;
}
.navigation-label,
.sort-field > span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.navigation-label {
  margin: 4px 8px 10px;
}
.navigation-action {
  width: 100%;
  justify-content: space-between;
}
.navigation-action :deep(.n-button__content) {
  width: 100%;
  justify-content: space-between;
}
.deleted-action {
  margin-top: 24px;
}
.navigation-help {
  margin: auto 8px 0;
  font-size: 11px;
  line-height: 1.5;
}
.preset-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.preset-list-panel--draft {
  grid-template-rows: auto auto minmax(0, 1fr);
}
.list-toolbar {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--app-border);
}
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.sort-field {
  display: grid;
  gap: 5px;
}
.filter-actions {
  flex-wrap: wrap;
}
.preset-scroll,
.editor-scroll {
  min-height: 0;
  height: 100%;
}
.preset-list {
  display: grid;
  gap: 8px;
  padding: 12px;
}
.preset-row {
  min-width: 0;
}
.draft-row {
  padding: 12px 12px 0;
}
.preset-row-select {
  width: 100%;
  height: auto;
  padding: 12px;
  text-align: left;
}
.preset-row-select :deep(.n-button__content) {
  display: grid;
  gap: 5px;
  width: 100%;
  min-width: 0;
  white-space: normal;
}
.row-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.row-heading strong,
.preset-row-select small {
  overflow-wrap: anywhere;
}
.preset-row-select small {
  color: var(--app-text-muted);
  font-weight: 400;
  font-size: 11px;
}
.preset-editor {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
.editor-content {
  display: grid;
  gap: 12px;
  padding: 14px;
}
.editor-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--app-border);
}
.save-state {
  margin-left: auto;
  font-size: 11px;
}
.empty-state {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 36px 16px;
  min-height: 100px;
  text-align: center;
}
.confirmation-card {
  width: min(460px, calc(100vw - 32px));
}
.confirmation-actions {
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
