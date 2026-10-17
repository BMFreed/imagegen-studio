<script setup lang="ts">
import type { ProjectApi, ProjectLayerView, ProjectRasterLayerView } from '../../shared/api.js'

import { Plus } from '@vicons/tabler'
import { type IDragEvent, makeAutoScroll, makeDroppable, useDnDProvider } from '@vue-dnd-kit/core'
import { NButton, NEmpty, NIcon, NInputNumber, NSelect, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import { isSmartPatchLayerView } from './project-layer-context.js'
import ProjectSortableLayerRow from './ProjectSortableLayerRow.vue'

type RasterLayerChange = Parameters<ProjectApi['updateRasterLayer']>[2]

const props = defineProps<{
  disabled: boolean
  generatedLayerIds: readonly string[]
  importing: boolean
  layers: ProjectLayerView[]
}>()
const emit = defineEmits<{
  addPatch: []
  browseVariants: [layerId: string]
  importImage: []
  move: [layerId: string, targetIndex: number]
  saveResultPreset: [layerId: string]
  update: [layerId: string, change: RasterLayerChange]
  updatePatch: [layerId: string, change: Parameters<ProjectApi['updateSmartPatchLayer']>[2]]
}>()
const selectedLayerId = defineModel<string | null>('selectedLayerId', { required: true })
const comparisonLayerId = defineModel<string | null>('comparisonLayerId', { required: true })
const selectedLayer = computed(
  () => props.layers.find((layer) => layer.id === selectedLayerId.value) ?? null,
)
const opacityDraft = ref<number | null>(null)

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
defineExpose({ revealLayer })
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
      <span v-else class="selection-placeholder">Select a layer</span>
    </div>
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
        :index
        :layer
        :layers
        :selected="selectedLayerId === layer.id"
        @browseVariants="emit('browseVariants', $event)"
        @move="(layerId, targetIndex) => emit('move', layerId, targetIndex)"
        @saveResultPreset="emit('saveResultPreset', $event)"
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
</style>
