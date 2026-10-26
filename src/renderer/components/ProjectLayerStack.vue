<script setup lang="ts">
import type {
  ModelCatalogItem,
  ProjectApi,
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectRegionalGuidanceLayerView,
  ProjectTab,
} from '../../shared/api.js'
import type { ProjectAcceptedResultTarget } from '../../shared/projects/project-accepted-results.js'
import { embeddingSourcesFromCatalog } from '../../shared/projects/prompt-embeddings.js'
import {
  isProjectRegionalGuidanceDocumentOwner,
  type ProjectRegionalGuidanceChange,
  type ProjectRegionalGuidanceDocumentOwner,
  type ProjectRegionalGuidanceOwner,
  type ProjectRegionalGuidancePromptChange,
  type ProjectRegionalGuidanceReferenceImageChange,
} from '../../shared/projects/regional-guidance.js'

import { Plus } from '@vicons/tabler'
import { type IDragEvent, makeAutoScroll, makeDroppable, useDnDProvider } from '@vue-dnd-kit/core'
import { NButton, NEmpty, NIcon, NInput, NInputNumber, NSelect, NTooltip } from 'naive-ui'
import { computed, ref, shallowRef, useId, watch } from 'vue'

import { isSmartPatchLayerView } from './project-layer-context.js'
import { projectPromptLoraSources } from './project-prompt-context.js'
import ProjectRegionalGuidanceRow from './ProjectRegionalGuidanceRow.vue'
import ProjectSortableLayerRow from './ProjectSortableLayerRow.vue'

type RasterLayerChange = Parameters<ProjectApi['updateRasterLayer']>[2]

const props = defineProps<{
  currentCanvasDraft?: ProjectTab['generationDraft']
  disabled: boolean
  documentId?: string
  documentRevision?: string
  generatedLayerIds: readonly string[]
  importing: boolean
  layers: ProjectLayerView[]
  modelCatalog?: ModelCatalogItem[]
  modelCatalogReady?: boolean
  patchFreshnessLabels?: Readonly<Record<string, string>>
  presetLayerIds: readonly string[]
  promptHistoryEpoch?: number
  regionalPromptInputBlocked?: boolean
  regionalPromptPending?: boolean
  regions?: ProjectRegionalGuidanceLayerView[]
}>()
const emit = defineEmits<{
  addPatch: []
  addRegionalGuidance: []
  browseVariants: [layerId: string]
  deleteRegionalGuidance: [owner: ProjectRegionalGuidanceOwner]
  duplicateRegionalGuidance: [owner: ProjectRegionalGuidanceOwner]
  importImage: []
  importRegionalReferenceImage: [owner: ProjectRegionalGuidanceOwner]
  move: [layerId: string, targetIndex: number]
  saveResultPreset: [layerId: string]
  saveSmartResultPreset: [owner: ProjectAcceptedResultTarget]
  sealRegionalGuidancePromptHistory: [owner: ProjectRegionalGuidanceOwner, historyGroupId: string]
  update: [layerId: string, change: RasterLayerChange]
  updatePatch: [layerId: string, change: Parameters<ProjectApi['updateSmartPatchLayer']>[2]]
  updateRegionalGuidance: [
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceChange,
  ]
  updateRegionalGuidancePrompt: [
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidancePromptChange,
  ]
  updateRegionalReferenceImage: [
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceReferenceImageChange,
  ]
}>()
const selectedLayerId = defineModel<string | null>('selectedLayerId', { required: true })
const comparisonLayerId = defineModel<string | null>('comparisonLayerId', { required: true })
const selectedLayer = computed(
  () => props.layers.find((layer) => layer.id === selectedLayerId.value) ?? null,
)
const regionalDocumentOwner = computed<ProjectRegionalGuidanceDocumentOwner | null>(() => {
  const owner = { documentId: props.documentId, documentRevision: props.documentRevision }
  return isProjectRegionalGuidanceDocumentOwner(owner) ? owner : null
})
const regions = computed(() => (regionalDocumentOwner.value ? (props.regions ?? []) : []))
const regionalRows = new Map<string, InstanceType<typeof ProjectRegionalGuidanceRow>>()

function regionalRowRef(documentId: string, regionId: string) {
  const key = `${documentId}:${regionId}`
  return (instance: unknown) => {
    if (instance) {
      regionalRows.set(key, instance as InstanceType<typeof ProjectRegionalGuidanceRow>)
    } else {
      regionalRows.delete(key)
    }
  }
}

function focusRegionalReferenceImport(owner: ProjectRegionalGuidanceOwner) {
  if (regionalDocumentOwner.value?.documentId === owner.documentId) {
    regionalRows.get(`${owner.documentId}:${owner.regionId}`)?.focusRegionalReferenceImport(owner)
  }
}
const regionalMetadataDisabled = computed(
  () => props.disabled || Boolean(props.regionalPromptPending),
)
const regionalEmbeddingSources = computed(() =>
  props.modelCatalogReady ? embeddingSourcesFromCatalog(props.modelCatalog ?? []) : [],
)
const regionalLoraSources = computed(() =>
  projectPromptLoraSources(
    props.currentCanvasDraft?.loras ?? [],
    props.modelCatalog ?? [],
    Boolean(props.modelCatalogReady),
  ),
)
const selectedRegion = computed(
  () => regions.value.find((region) => region.id === selectedLayerId.value) ?? null,
)
const opacityDraft = ref<number | null>(null)
const regionOpacityId = useId()
const regionOpacityHelpId = useId()
const regionOpacityRaw = ref('')
const regionOpacityEdit = shallowRef<{
  originalRaw: string
  owner: ProjectRegionalGuidanceOwner
} | null>(null)
const regionOpacityInvalid = computed(() => {
  const value = Number(regionOpacityRaw.value)
  return (
    !/^(?:\d+\.?\d*|\.\d+)$/.test(regionOpacityRaw.value.trim()) ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
})

function resetRegionOpacity() {
  regionOpacityEdit.value = null
  regionOpacityRaw.value = selectedRegion.value
    ? String(Number((selectedRegion.value.overlayOpacity * 100).toPrecision(12)))
    : ''
}

watch(
  [
    () => props.documentId,
    () => props.documentRevision,
    () => props.disabled,
    () => props.regionalPromptPending,
    () => selectedRegion.value?.id,
    () => selectedRegion.value?.locked,
    () => selectedRegion.value?.overlayOpacity,
  ],
  resetRegionOpacity,
  { flush: 'sync', immediate: true },
)

function beginRegionOpacity() {
  const region = selectedRegion.value
  if (regionalMetadataDisabled.value || !region || region.locked || regionOpacityEdit.value) {
    return
  }
  const owner = currentRegionalOwner(region.id)
  if (!owner) {
    return
  }
  regionOpacityEdit.value = {
    originalRaw: regionOpacityRaw.value,
    owner,
  }
}

function commitRegionOpacity() {
  const edit = regionOpacityEdit.value
  const region = selectedRegion.value
  if (
    !edit ||
    !region ||
    regionalMetadataDisabled.value ||
    region.locked ||
    regionOpacityInvalid.value ||
    !regionalOwnerIsCurrent(edit.owner) ||
    edit.owner.regionId !== region.id
  ) {
    return
  }
  regionOpacityEdit.value = null
  const overlayOpacity = Number(regionOpacityRaw.value) / 100
  if (regionOpacityRaw.value !== edit.originalRaw && overlayOpacity !== region.overlayOpacity) {
    updateRegionalGuidance(edit.owner, { kind: 'overlay-opacity', overlayOpacity })
  }
}

function updateRegionOpacity(value: string) {
  beginRegionOpacity()
  regionOpacityRaw.value = value
}

function commitRegionOpacityOnEnter(event: KeyboardEvent) {
  if (!event.isComposing) {
    commitRegionOpacity()
  }
}

function currentRegionalOwner(regionId: string): ProjectRegionalGuidanceOwner | null {
  const owner = regionalDocumentOwner.value
  return owner && regions.value.some((region) => region.id === regionId)
    ? { ...owner, regionId }
    : null
}

function regionalOwnerIsCurrent(owner: ProjectRegionalGuidanceOwner): boolean {
  const current = currentRegionalOwner(owner.regionId)
  return Boolean(
    current &&
    current.documentId === owner.documentId &&
    current.documentRevision === owner.documentRevision,
  )
}

function addRegionalGuidance() {
  if (!regionalMetadataDisabled.value && regionalDocumentOwner.value) {
    emit('addRegionalGuidance')
  }
}

function updateRegionalGuidance(
  owner: ProjectRegionalGuidanceOwner,
  change: ProjectRegionalGuidanceChange,
) {
  if (!regionalMetadataDisabled.value && regionalOwnerIsCurrent(owner)) {
    emit('updateRegionalGuidance', owner, change)
  }
}

function duplicateRegionalGuidance(owner: ProjectRegionalGuidanceOwner) {
  if (!regionalMetadataDisabled.value && regionalOwnerIsCurrent(owner)) {
    emit('duplicateRegionalGuidance', owner)
  }
}

function canEditRegionalReferences(owner: ProjectRegionalGuidanceOwner): boolean {
  const region = regions.value.find(({ id }) => id === owner.regionId)
  return Boolean(
    !regionalMetadataDisabled.value &&
    !props.regionalPromptInputBlocked &&
    region &&
    !region.locked &&
    regionalOwnerIsCurrent(owner),
  )
}

function importRegionalReferenceImage(owner: ProjectRegionalGuidanceOwner) {
  if (
    canEditRegionalReferences(owner) &&
    props.currentCanvasDraft?.model?.baseModelFamily === 'illustrious'
  ) {
    emit('importRegionalReferenceImage', owner)
  }
}

function updateRegionalReferenceImage(
  owner: ProjectRegionalGuidanceOwner,
  change: ProjectRegionalGuidanceReferenceImageChange,
) {
  const references = regions.value.find(({ id }) => id === owner.regionId)?.referenceImages
  const index = references?.findIndex(({ id }) => id === change.referenceId) ?? -1
  if (
    canEditRegionalReferences(owner) &&
    references &&
    index >= 0 &&
    (change.kind === 'remove' ||
      (Number.isSafeInteger(change.targetIndex) &&
        change.targetIndex >= 0 &&
        change.targetIndex < references.length &&
        change.targetIndex !== index))
  ) {
    emit('updateRegionalReferenceImage', owner, change)
  }
}

function updateRegionalGuidancePrompt(
  owner: ProjectRegionalGuidanceOwner,
  change: ProjectRegionalGuidancePromptChange,
) {
  const region = regions.value.find(({ id }) => id === owner.regionId)
  if (
    !props.disabled &&
    !props.regionalPromptInputBlocked &&
    props.currentCanvasDraft &&
    region &&
    !region.locked &&
    regionalOwnerIsCurrent(owner)
  ) {
    emit('updateRegionalGuidancePrompt', owner, change)
  }
}

function sealRegionalGuidancePromptHistory(
  owner: ProjectRegionalGuidanceOwner,
  historyGroupId: string,
) {
  // A blur seal must follow its captured writes even when a lifecycle action has disabled input.
  if (regionalOwnerIsCurrent(owner)) {
    emit('sealRegionalGuidancePromptHistory', owner, historyGroupId)
  }
}

function deleteRegionalGuidance(owner: ProjectRegionalGuidanceOwner) {
  if (!regionalMetadataDisabled.value && regionalOwnerIsCurrent(owner)) {
    emit('deleteRegionalGuidance', owner)
  }
}

function selectRegion(regionId: string) {
  if (!props.disabled && currentRegionalOwner(regionId)) {
    selectedLayerId.value = regionId
  }
}

watch(
  selectedLayer,
  (layer) => {
    opacityDraft.value = layer ? Math.round(layer.opacity * 10_000) / 100 : null
  },
  { immediate: true },
)

const blendModes = ['normal', 'multiply', 'screen', 'overlay'] as const
const blendOptions = blendModes.map((value) => ({
  label: value.charAt(0).toUpperCase() + value.slice(1),
  value,
}))

function updateBlend(value: number | string | null) {
  const layer = selectedLayer.value
  if (
    props.disabled ||
    !layer ||
    layer.locked ||
    typeof value !== 'string' ||
    !blendModes.includes(value as (typeof blendModes)[number]) ||
    value === layer.blendMode
  ) {
    return
  }
  const change: RasterLayerChange = {
    blendMode: value as ProjectRasterLayerView['blendMode'],
    kind: 'blend-mode',
  }
  if (isSmartPatchLayerView(layer)) {
    emit('updatePatch', layer.id, change)
  } else {
    emit('update', layer.id, change)
  }
}

function commitOpacity() {
  const layer = selectedLayer.value
  const value = opacityDraft.value
  if (!layer || props.disabled || layer.locked) {
    return
  }
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) {
    opacityDraft.value = Math.round(layer.opacity * 10_000) / 100
    return
  }
  const opacity = Math.round(value * 100) / 10_000
  if (opacity !== layer.opacity) {
    if (isSmartPatchLayerView(layer)) {
      emit('updatePatch', layer.id, { kind: 'opacity', opacity })
    } else {
      emit('update', layer.id, { kind: 'opacity', opacity })
    }
  }
}

const panelScroll = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
function revealLayer(layerId: string) {
  const container = panelScroll.value
  const row = list.value?.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(layerId)}"]`)
  if (!container || !row || !props.layers.some((layer) => layer.id === layerId)) {
    return
  }
  const containerBounds = container.getBoundingClientRect()
  const rowBounds = row.getBoundingClientRect()
  const visibleTop = containerBounds.top + container.clientTop
  const visibleBottom = visibleTop + container.clientHeight
  if (rowBounds.top < visibleTop) {
    container.scrollTop += rowBounds.top - visibleTop
  } else if (rowBounds.bottom > visibleBottom) {
    container.scrollTop += rowBounds.bottom - visibleBottom
  }
}
defineExpose({ focusRegionalReferenceImport, revealLayer })
const provider = useDnDProvider()
provider.keyboard.keys.forDrag = []
provider.keyboard.keys.forDrop = []
makeAutoScroll(panelScroll, { speed: 8, threshold: 54 })
makeDroppable(
  list,
  {
    disabled: computed(() => props.disabled),
    events: {
      onDrop(event: IDragEvent) {
        if (props.disabled || event.draggedItems.length !== 1) {
          return false
        }
        const result = event.helpers.suggestSort('vertical')
        if (!result || !result.sameList) {
          return false
        }
        const moved = event.draggedItems[0]?.item as ProjectLayerView | undefined
        if (!moved || !props.layers.some((layer) => layer.id === moved.id && !layer.locked)) {
          return false
        }
        const target = result.targetItems as ProjectLayerView[]
        const targetIndex = target.findIndex((layer) => layer.id === moved.id)
        const sourceIndex = props.layers.findIndex((layer) => layer.id === moved.id)
        if (targetIndex < 0 || sourceIndex < 0) {
          return false
        }
        if (targetIndex !== sourceIndex) {
          emit('move', moved.id, targetIndex)
        }
        return true
      },
    },
    groups: ['project-raster-layers'],
  },
  () => props.layers,
)
</script>

<template>
  <aside ref="panelScroll" aria-label="Project layers" class="layer-stack">
    <div aria-label="Selected layer properties" class="layer-properties" role="toolbar">
      <template v-if="selectedLayer">
        <NSelect
          aria-label="Layer blend mode"
          class="blend-select"
          :disabled="disabled || selectedLayer.locked"
          :options="blendOptions"
          size="small"
          :value="selectedLayer.blendMode"
          @update:value="updateBlend"
        />
        <span class="opacity-label">Opacity</span>
        <NInputNumber
          v-model:value="opacityDraft"
          class="opacity-input"
          :disabled="disabled || selectedLayer.locked"
          :inputProps="{ 'aria-label': 'Layer opacity' }"
          :max="100"
          :min="0"
          :precision="2"
          :showButton="false"
          size="small"
          @blur="commitOpacity"
          @keyup.enter="commitOpacity"
        >
          <template v-slot:suffix>%</template>
        </NInputNumber>
      </template>
      <template v-else-if="selectedRegion">
        <span class="selection-placeholder">Region display</span>
        <label class="opacity-label" :for="regionOpacityId">Opacity</label>
        <NInput
          class="opacity-input"
          :disabled="regionalMetadataDisabled || selectedRegion.locked"
          :inputProps="{
            'aria-describedby': regionOpacityHelpId,
            'aria-label': 'Region opacity',
            id: regionOpacityId,
            inputmode: 'decimal',
          }"
          size="small"
          :status="regionOpacityInvalid ? 'error' : undefined"
          :value="regionOpacityRaw"
          @blur="commitRegionOpacity"
          @focus="beginRegionOpacity"
          @keydown.enter.prevent="commitRegionOpacityOnEnter"
          @keydown.esc.prevent="resetRegionOpacity"
          @update:value="updateRegionOpacity"
        >
          <template v-slot:suffix>%</template>
        </NInput>
      </template>
      <span v-else class="selection-placeholder">Select a layer</span>
    </div>
    <p v-if="selectedRegion" :id="regionOpacityHelpId" class="regional-help" role="status">
      {{
        regionOpacityInvalid
          ? 'Enter an opacity from 0 to 100.'
          : 'Display opacity of the selected region mask, including when disabled. Does not change guidance strength.'
      }}
    </p>
    <section v-if="regionalDocumentOwner" aria-label="Regional Guidance" class="regional-section">
      <div class="layer-header">
        <h2>Regional Guidance ({{ regions.length }})</h2>
        <NButton
          aria-label="Add Regional Guidance"
          circle
          :disabled="regionalMetadataDisabled"
          quaternary
          size="small"
          @click="addRegionalGuidance"
        >
          <template v-slot:icon><NIcon :component="Plus" /></template>
        </NButton>
      </div>
      <slot name="regional-notice" />
      <div class="layer-list">
        <ProjectRegionalGuidanceRow
          v-for="region of regions"
          :key="`${regionalDocumentOwner.documentId}:${region.id}`"
          :ref="regionalRowRef(regionalDocumentOwner.documentId, region.id)"
          :currentCanvasDraft
          :disabled
          :documentId="regionalDocumentOwner.documentId"
          :documentRevision="regionalDocumentOwner.documentRevision"
          :embeddingCatalogReady="Boolean(modelCatalogReady)"
          :embeddingSources="regionalEmbeddingSources"
          :loraSources="regionalLoraSources"
          :metadataDisabled="regionalPromptPending"
          :promptHistoryEpoch
          :promptInputBlocked="regionalPromptInputBlocked"
          :region
          :selected="selectedLayerId === region.id"
          @delete="deleteRegionalGuidance"
          @duplicate="duplicateRegionalGuidance"
          @importReferenceImage="importRegionalReferenceImage"
          @sealPromptHistory="sealRegionalGuidancePromptHistory"
          @select="selectRegion"
          @update="updateRegionalGuidance"
          @updatePrompt="updateRegionalGuidancePrompt"
          @updateReferenceImage="updateRegionalReferenceImage"
        />
      </div>
    </section>
    <div class="layer-header">
      <h2>Layers ({{ layers.length }})</h2>
      <div class="layer-header-actions">
        <slot name="header-actions" />
        <NButton
          aria-label="Add Smart Patch Layer"
          :disabled
          size="tiny"
          tertiary
          @click="emit('addPatch')"
        >
          + Patch
        </NButton>
        <NTooltip trigger="hover">
          <template v-slot:trigger>
            <NButton
              aria-label="Import image as Raster Layer"
              circle
              :disabled
              :loading="importing"
              quaternary
              size="small"
              @click="emit('importImage')"
            >
              <template v-slot:icon><NIcon :component="Plus" /></template>
            </NButton>
          </template>
          Import image as Raster Layer
        </NTooltip>
      </div>
    </div>
    <div ref="list" class="layer-list">
      <NEmpty
        v-if="layers.length === 0"
        class="layer-empty"
        description="No Layers yet"
        size="small"
      >
        <template v-slot:extra>
          <NButton :disabled :loading="importing" size="small" @click="emit('importImage')">
            Import image
          </NButton>
        </template>
      </NEmpty>
      <ProjectSortableLayerRow
        v-for="(layer, index) of layers"
        :key="layer.id"
        v-model:comparisonLayerId="comparisonLayerId"
        :data-layer-id="layer.id"
        :disabled
        :hasGenerationData="generatedLayerIds.includes(layer.id)"
        :hasPresetData="presetLayerIds.includes(layer.id)"
        :index
        :layer
        :layers
        :patchFreshnessLabel="patchFreshnessLabels?.[layer.id]"
        :selected="selectedLayerId === layer.id"
        @browseVariants="emit('browseVariants', $event)"
        @move="(layerId, targetIndex) => emit('move', layerId, targetIndex)"
        @saveResultPreset="emit('saveResultPreset', $event)"
        @saveSmartResultPreset="emit('saveSmartResultPreset', $event)"
        @select="selectedLayerId = $event"
        @update="(layerId, change) => emit('update', layerId, change)"
        @updatePatch="(layerId, change) => emit('updatePatch', layerId, change)"
      >
        <template v-slot:comparison="slotProps">
          <slot name="comparison" v-bind="slotProps" />
        </template>
      </ProjectSortableLayerRow>
    </div>
  </aside>
</template>

<style scoped>
.layer-stack {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
  padding: 9px;
  border-left: 1px solid var(--app-border);
  background: var(--app-surface);
}

.layer-properties {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  margin-bottom: 9px;
  padding: 0 2px 8px;
  border-bottom: 1px solid var(--app-border);
}

.blend-select {
  flex: 1 1 90px;
  min-width: 0;
}

.opacity-label {
  flex: 0 0 auto;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.opacity-input {
  flex: 0 0 78px;
  width: 78px;
}

.selection-placeholder {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.layer-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  margin: 0 2px 7px;
}

.layer-header h2 {
  flex: 0 0 auto;
  margin: 0;
  font-size: var(--app-font-size);
  font-weight: 600;
  white-space: nowrap;
}

.layer-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.layer-list {
  display: grid;
  gap: 4px;
  min-height: 12px;
}

.layer-empty {
  margin-top: 36px;
}

.regional-section {
  margin-bottom: 12px;
}

.regional-help {
  margin: 0 2px 9px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  overflow-wrap: anywhere;
}
</style>
