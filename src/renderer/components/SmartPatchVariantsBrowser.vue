<script setup lang="ts">
import type {
  ProjectSmartPatchLayerView,
  ProjectSmartPatchVariantChange,
  ProjectSmartPatchVariantsInspection,
  ProjectTab,
} from '../../shared/api.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import { Edit, Refresh, Trash, X } from '@vicons/tabler'
import { NAlert, NButton, NCard, NEmpty, NIcon, NInput, NSpin, NTag } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{
  busy: boolean
  draftPending: boolean
  error: string | null
  layer: ProjectSmartPatchLayerView | null
  reloadRequired: boolean
  tab: ProjectTab
}>()
const emit = defineEmits<{
  change: [layerId: string, change: ProjectSmartPatchVariantChange]
  closed: []
}>()
const inspection = ref<ProjectSmartPatchVariantsInspection | null>(null)
const loading = ref(false)
const readError = ref<string | null>(null)
const editingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const nameDraft = ref('')
const nameInput = ref<InstanceType<typeof NInput> | null>(null)
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<InstanceType<typeof NButton> | null>(null)
const pendingIntent = ref<VariantIntent | null>(null)
let requestId = 0
let disposed = false

const mutationDisabled = computed(
  () => props.busy || props.reloadRequired || !props.layer || props.layer.locked,
)
const nameError = computed(() =>
  nameDraft.value.trim().length === 0
    ? 'Enter a variant name.'
    : new TextEncoder().encode(nameDraft.value).byteLength > IGS_SAFETY_CEILINGS.titleBytes
      ? 'The variant name is too long.'
      : null,
)
const statuses = computed(
  () => new Map(inspection.value?.variants.map((variant) => [variant.id, variant])),
)
const changedInputLabels: Record<
  ProjectSmartPatchVariantsInspection['variants'][number]['changedInputs'][number],
  string
> = {
  bbox: 'bounds',
  coherence: 'coherence settings',
  'generation-draft': 'generation settings',
  'internal-resolution': 'internal resolution',
  mask: 'mask',
  'mask-blur': 'mask blur',
  'source-composite': 'source composite',
}

function statusLabel(id: string): string {
  const state = statuses.value.get(id)
  return state?.status === 'ready'
    ? 'Matches current inputs'
    : state?.status === 'outdated'
      ? 'Outdated'
      : state
        ? 'Unverified'
        : loading.value
          ? 'Checking freshness…'
          : 'Freshness unavailable'
}

async function read() {
  const request = ++requestId
  const layer = props.layer
  inspection.value = null
  readError.value = null
  loading.value = false
  if (!show.value || !layer || props.reloadRequired) {
    return
  }
  loading.value = true
  if (props.draftPending) {
    return
  }
  const { documentId, documentRevision, id: tabId } = props.tab
  const layerId = layer.id
  const current = () =>
    !disposed &&
    show.value &&
    request === requestId &&
    props.tab.id === tabId &&
    props.tab.documentId === documentId &&
    props.tab.documentRevision === documentRevision &&
    props.layer?.id === layerId &&
    !props.draftPending &&
    !props.reloadRequired
  try {
    const api = globalThis.window.api?.projects
    if (!api) {
      throw new Error('The application connection is unavailable.')
    }
    const result = await api.getSmartPatchVariants(tabId, layerId, documentId, documentRevision)
    if (!current()) {
      return
    }
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    if (
      result.value.documentId !== documentId ||
      result.value.documentRevision !== documentRevision ||
      result.value.layerId !== layerId
    ) {
      throw new Error(
        'The Project changed while variant diagnostics were being read. Refresh to retry.',
      )
    }
    inspection.value = result.value
  } catch (cause) {
    if (current()) {
      readError.value =
        cause instanceof Error ? cause.message : 'Variant diagnostics could not be read.'
    }
  } finally {
    if (current()) {
      loading.value = false
    }
  }
}

watch(
  [
    show,
    () => props.tab.id,
    () => props.tab.documentId,
    () => props.tab.documentRevision,
    () => props.layer?.id,
    () => props.draftPending,
    () => props.reloadRequired,
  ],
  (values, previous) => {
    editingId.value = null
    deletingId.value = null
    if (
      !show.value ||
      (previous &&
        (values[1] !== previous[1] || values[2] !== previous[2] || values[4] !== previous[4]))
    ) {
      pendingIntent.value = null
      nameDraft.value = ''
    }
    void read()
  },
  { immediate: true },
)
watch(show, async (open, previous, onCleanup) => {
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  await nextTick()
  if (cancelled || disposed) {
    return
  }
  if (open) {
    closeButton.value?.$el.focus({ preventScroll: true })
  } else if (previous) {
    emit('closed')
  }
})
onBeforeUnmount(() => {
  disposed = true
  requestId += 1
})

type VariantIntent =
  | { kind: 'delete' | 'select'; variantId: string }
  | { kind: 'rename'; name: string; variantId: string }

function change(intent: VariantIntent) {
  const layer = props.layer
  if (
    mutationDisabled.value ||
    !layer?.rasterSubLayers.some((variant) => variant.id === intent.variantId) ||
    (intent.kind === 'select' && layer.activeRasterSubLayerId === intent.variantId)
  ) {
    return
  }
  pendingIntent.value = intent
  emit('change', layer.id, {
    ...intent,
    documentId: props.tab.documentId,
    documentRevision: props.tab.documentRevision,
  })
}

watch(
  () => props.busy,
  (busy, previous) => {
    const intent = pendingIntent.value
    if (busy || !previous || !intent) {
      return
    }
    pendingIntent.value = null
    if (props.error || !show.value) {
      return
    }
    editingId.value = null
    deletingId.value = null
    void nextTick(() => {
      const targetId = props.layer?.rasterSubLayers.some(({ id }) => id === intent.variantId)
        ? intent.variantId
        : props.layer?.activeRasterSubLayerId
      const target = targetId
        ? dialog.value?.querySelector<HTMLElement>(
            `[data-smart-patch-variant-id="${CSS.escape(targetId)}"]`,
          )
        : null
      if (target) {
        target.focus({ preventScroll: true })
      } else {
        closeButton.value?.$el.focus({ preventScroll: true })
      }
    })
  },
)

function setNameInput(value: unknown) {
  nameInput.value = value as InstanceType<typeof NInput> | null
}

function restoreActionFocus(id: string, action: 'delete' | 'rename') {
  void nextTick(() => {
    dialog.value
      ?.querySelector<HTMLElement>(
        `[data-smart-patch-variant-id="${CSS.escape(id)}"] [data-variant-${action}]`,
      )
      ?.focus({ preventScroll: true })
  })
}
function rename(id: string, name: string) {
  if (mutationDisabled.value) {
    return
  }
  deletingId.value = null
  editingId.value = id
  nameDraft.value = name
  void nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}
function cancelRename() {
  const id = editingId.value
  editingId.value = null
  if (id) {
    restoreActionFocus(id, 'rename')
  }
}
function saveName() {
  if (editingId.value && !nameError.value) {
    change({ kind: 'rename', name: nameDraft.value, variantId: editingId.value })
  }
}
function confirmDelete(id: string) {
  if (mutationDisabled.value) {
    return
  }
  editingId.value = null
  deletingId.value = id
  void nextTick(() =>
    dialog.value?.querySelector<HTMLElement>('[data-confirm-variant-delete]')?.focus(),
  )
}
function cancelDelete() {
  const id = deletingId.value
  deletingId.value = null
  if (id) {
    restoreActionFocus(id, 'delete')
  }
}
function escape() {
  if (props.busy && pendingIntent.value) {
    return
  }
  if (editingId.value) {
    cancelRename()
  } else if (deletingId.value) {
    cancelDelete()
  } else {
    show.value = false
  }
}
</script>

<template>
  <NCard
    v-if="show && layer"
    aria-label="Smart Patch variants"
    aria-modal="false"
    :bordered="false"
    class="variants-panel"
    contentClass="variants-card-body"
    role="dialog"
    size="small"
    title="Smart Patch variants"
    @keydown.esc.stop.prevent="escape"
  >
    <template v-slot:header-extra>
      <div class="variants-header-actions">
        <NButton
          aria-label="Refresh variant diagnostics"
          :disabled="loading || draftPending || reloadRequired"
          quaternary
          size="small"
          @click="read"
        >
          <template v-slot:icon><NIcon :component="Refresh" :size="16" /></template>
        </NButton>
        <NButton
          ref="closeButton"
          aria-label="Close Smart Patch variants"
          quaternary
          size="small"
          @click="show = false"
        >
          <template v-slot:icon><NIcon :component="X" :size="16" /></template>
        </NButton>
      </div>
    </template>
    <div ref="dialog" class="variants-content">
      <div class="variants-owner">
        <img
          v-if="layer.activeRaster"
          :alt="`Active variant of ${layer.name}`"
          class="variants-preview"
          :src="layer.activeRaster.imageUrl"
        />
        <div class="variants-owner-copy">
          <strong>{{ layer.name }}</strong>
          <p>Only the active variant appears on the Canvas.</p>
          <p v-if="layer.locked">Unlock this Patch to select, rename or delete variants.</p>
        </div>
      </div>
      <NAlert v-if="error" :showIcon="false" type="error">{{ error }}</NAlert>
      <NAlert v-if="readError" key="n-alert-2" :showIcon="false" type="warning">
        {{ readError }}
      </NAlert>
      <NAlert v-if="reloadRequired" key="n-alert-3" :showIcon="false" type="warning">
        Reload this Project before changing variants or checking current inputs.
      </NAlert>
      <div v-if="loading" class="variants-loading" role="status">
        <NSpin size="small" />
        <span>
          {{
            draftPending ? 'Waiting for draft changes…' : 'Checking current inputs and resources…'
          }}
        </span>
      </div>
      <div class="variants-scroll">
        <NEmpty
          v-if="layer.rasterSubLayers.length === 0"
          description="No variants yet"
          size="small"
        />
        <div v-else aria-label="Stored Smart Patch variants" class="variants-list" role="list">
          <article
            v-for="variant of layer.rasterSubLayers"
            :key="variant.id"
            class="variant-row"
            :data-smart-patch-variant-id="variant.id"
            role="listitem"
            tabindex="-1"
          >
            <div class="variant-heading">
              <NButton
                :aria-label="`Select variant ${variant.name}`"
                :aria-pressed="variant.id === layer.activeRasterSubLayerId"
                class="variant-select"
                :disabled="mutationDisabled"
                text
                @click="change({ kind: 'select', variantId: variant.id })"
              >
                <span class="variant-name" :title="variant.name">{{ variant.name }}</span>
              </NButton>
              <NTag
                v-if="variant.id === layer.activeRasterSubLayerId"
                :bordered="false"
                size="small"
              >
                Active
              </NTag>
              <div class="variant-actions">
                <NButton
                  :aria-label="`Rename variant ${variant.name}`"
                  data-variant-rename
                  :disabled="mutationDisabled"
                  quaternary
                  size="tiny"
                  @click="rename(variant.id, variant.name)"
                >
                  <template v-slot:icon><NIcon :component="Edit" :size="16" /></template>
                </NButton>
                <NButton
                  :aria-label="`Delete variant ${variant.name}`"
                  data-variant-delete
                  :disabled="mutationDisabled"
                  quaternary
                  size="tiny"
                  @click="confirmDelete(variant.id)"
                >
                  <template v-slot:icon><NIcon :component="Trash" :size="16" /></template>
                </NButton>
              </div>
            </div>
            <p
              class="variant-freshness"
              :data-variant-status="statuses.get(variant.id)?.status ?? 'unknown'"
            >
              {{ statusLabel(variant.id) }}
            </p>
            <p v-if="statuses.get(variant.id)?.changedInputs.length" class="variant-changes">
              Changed:
              {{
                statuses
                  .get(variant.id)
                  ?.changedInputs.map((input) => changedInputLabels[input])
                  .join(', ')
              }}.
            </p>
            <p
              v-if="statuses.get(variant.id) && !statuses.get(variant.id)?.sourceVerified"
              class="variant-changes"
            >
              Source composite could not be verified.
            </p>
            <form v-if="editingId === variant.id" class="variant-editor" @submit.prevent="saveName">
              <NInput
                :ref="setNameInput"
                v-model:value="nameDraft"
                :disabled="mutationDisabled"
                :inputProps="{ 'aria-label': 'Variant name' }"
                size="small"
                :status="nameError ? 'error' : undefined"
              />
              <p v-if="nameError" class="variant-changes" role="status">{{ nameError }}</p>
              <div class="variant-editor-actions">
                <NButton
                  attrType="submit"
                  :disabled="mutationDisabled || Boolean(nameError)"
                  size="small"
                >
                  Save name
                </NButton>
                <NButton :disabled="busy" size="small" @click="cancelRename">Cancel rename</NButton>
              </div>
            </form>
            <div v-if="deletingId === variant.id" class="variant-editor">
              <p class="variant-delete-copy">
                Delete “{{ variant.name }}”?
                {{
                  layer.rasterSubLayers.length === 1
                    ? 'The Patch will have no raster result.'
                    : variant.id === layer.activeRasterSubLayerId
                      ? 'Another stored variant will become active.'
                      : ''
                }}
                You can undo this change.
              </p>
              <div class="variant-editor-actions">
                <NButton
                  :aria-label="`Confirm delete variant ${variant.name}`"
                  data-confirm-variant-delete
                  :disabled="mutationDisabled"
                  size="small"
                  type="error"
                  @click="change({ kind: 'delete', variantId: variant.id })"
                >
                  Delete variant
                </NButton>
                <NButton :disabled="busy" size="small" @click="cancelDelete">Cancel delete</NButton>
              </div>
            </div>
          </article>
        </div>
        <section
          v-if="inspection"
          aria-label="Current generation resources"
          class="variants-resources"
        >
          <h3>Current generation resources</h3>
          <p v-if="inspection.sourceUnavailableReason">
            {{ inspection.sourceUnavailableReason }}
          </p>
          <ul v-if="inspection.resourceDiagnostics.length">
            <li
              v-for="(diagnostic, index) of inspection.resourceDiagnostics"
              :key="`${diagnostic.code}:${index}`"
            >
              {{ diagnostic.message }}
            </li>
          </ul>
          <p v-else>
            {{
              inspection.resourcesChecked
                ? 'No resource issues found.'
                : 'Resource availability could not be checked.'
            }}
          </p>
        </section>
      </div>
      <p class="variants-explanation">
        Freshness compares saved generation inputs with the current Patch. Resource checks do not
        confirm runtime readiness. Generate checks the current Patch and runtime separately.
      </p>
    </div>
  </NCard>
</template>

<style scoped>
.variants-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  border-left: 1px solid var(--app-border);
  border-radius: 0;
}
.variants-panel :deep(.variants-card-body) {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.variants-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--app-border) transparent;
}
.variants-header-actions,
.variant-heading,
.variant-actions,
.variant-editor-actions,
.variants-loading,
.variants-owner {
  display: flex;
  align-items: center;
  gap: 8px;
}
.variants-header-actions,
.variant-actions {
  gap: 2px;
}
.variants-owner {
  align-items: flex-start;
  gap: 12px;
}
.variants-preview {
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  object-fit: contain;
  border: 1px solid var(--app-border);
  background: var(--app-chrome);
}
.variants-owner-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}
.variants-owner-copy p,
.variant-freshness,
.variant-changes,
.variants-explanation,
.variants-loading,
.variants-resources {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.variants-owner-copy p,
.variant-freshness,
.variant-changes {
  margin: 4px 0 0;
}
.variants-scroll {
  flex: 0 0 auto;
}
.variants-list {
  display: grid;
  gap: 6px;
}
.variant-row {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.variant-row:focus-visible {
  outline: 1px solid var(--app-tab-active-text);
  outline-offset: -1px;
}
.variant-heading {
  min-width: 0;
}
.variant-select {
  display: grid;
  flex: 1 1 auto;
  justify-content: start;
  min-width: 0;
  text-align: left;
}
.variant-select :deep(.n-button__content) {
  min-width: 0;
  max-width: 100%;
}
.variant-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.variant-actions {
  flex: 0 0 auto;
}
.variant-editor {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}
.variant-delete-copy,
.variants-explanation {
  margin: 0;
  overflow-wrap: anywhere;
}
.variants-resources {
  margin-top: 16px;
}
.variants-resources h3 {
  margin: 0;
  color: var(--app-text);
  font-size: var(--app-font-size);
  font-weight: 600;
}
.variants-resources p {
  margin: 6px 0 0;
}
.variants-resources ul {
  display: grid;
  gap: 5px;
  margin: 6px 0 0;
  padding-left: 18px;
}
</style>
