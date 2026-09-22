<script setup lang="ts">
import { ChevronDown, Plus } from '@vicons/tabler'
import { DnDProvider } from '@vue-dnd-kit/core'
import { NButton, NIcon, NInputNumber, NPopover, NSelect, NSlider } from 'naive-ui'
import { computed, ref } from 'vue'

import type { PresetCreateIntent } from '../presets/presets.types'
import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import { clonePreset } from '../presets/presets.utils'
import {
  beginProjectEdit,
  commitActiveProjectEdit,
  commitProjectMutation,
  updateProjectEdit,
} from './project-history'
import { presetIntentFromResult } from './project-provenance'
import { getSelectedEntity } from './project.utils'
import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectLayerStack from './ProjectLayerStack.vue'
import ProjectRegionalRow from './ProjectRegionalRow.vue'

const props = defineProps<{ session: ProjectSession }>()
const emit = defineEmits<{ savePreset: [intent: PresetCreateIntent] }>()
function saveResultPreset(layer: ProjectCompositingLayer) {
  const intent = presetIntentFromResult(layer)
  if (intent) {
    emit('savePreset', intent)
  }
}
const panelScroll = ref<HTMLElement | null>(null)
const variantLayerId = ref<string>()
const selected = computed(() => getSelectedEntity(props.session))
const selectedLayer = computed(() =>
  selected.value && 'kind' in selected.value ? selected.value : undefined,
)
const selectedRegional = computed(() =>
  selected.value && !('kind' in selected.value) ? selected.value : undefined,
)
const variantLayer = computed(() =>
  props.session.document.layers.find(
    (layer) => layer.id === variantLayerId.value && layer.kind === 'smart-patch',
  ),
)
const opacityTarget = computed(() =>
  selectedLayer.value?.kind === 'raster' ? selectedLayer.value : selectedRegional.value,
)
function updateOpacity(value: number | null, sliding = false) {
  const entity = opacityTarget.value
  if (!entity || value === null) {
    return
  }
  if (sliding) {
    beginProjectEdit(props.session, `opacity:${entity.id}`, 'Change opacity')
    updateProjectEdit(props.session, () => {
      entity.opacity = value
    })
  } else {
    commitProjectMutation(props.session, 'Change opacity', () => {
      entity.opacity = value
    })
  }
}
function mutateLayer(
  layer: ProjectCompositingLayer | undefined,
  label: string,
  mutate: (target: ProjectCompositingLayer) => void,
) {
  if (!layer) {
    return
  }
  commitProjectMutation(props.session, label, (document) => {
    const target = document.layers.find((item) => item.id === layer.id)
    if (target) {
      mutate(target)
    }
  })
}
function addLayer(kind: 'raster' | 'smart-patch') {
  commitProjectMutation(props.session, `Add ${kind} layer`, (document) => {
    const id = `${kind}-${Date.now()}`
    const layer: ProjectCompositingLayer =
      kind === 'raster'
        ? {
            blendMode: 'normal',
            id,
            kind,
            locked: false,
            mockCoverage: 'partial',
            name: 'New Raster Layer',
            opacity: 100,
            tone: 'blue',
            visible: true,
          }
        : {
            bbox: { height: 384, width: 384, x: 252, y: 360 },
            generationDraft: clonePreset(document.generationDraft),
            id,
            internalHeight: 768,
            internalWidth: 768,
            kind,
            locked: false,
            maskRevision: 0,
            name: 'New Smart Patch',
            status: 'empty',
            variants: [],
            visible: true,
          }
    document.layers.unshift(layer)
    props.session.ui.selection = { id, kind: 'compositing-layer' }
  })
}
function duplicate(layer: ProjectCompositingLayer) {
  commitProjectMutation(props.session, 'Duplicate layer', (document) => {
    const index = document.layers.findIndex((item) => item.id === layer.id)
    const copy = clonePreset(layer)
    copy.id = `${layer.id}-copy-${Date.now()}`
    copy.name = `${layer.name} copy`
    document.layers.splice(index, 0, copy)
    props.session.ui.selection = { id: copy.id, kind: 'compositing-layer' }
  })
}
function remove(layer: ProjectCompositingLayer) {
  commitProjectMutation(props.session, 'Delete layer', (document) => {
    const index = document.layers.findIndex((item) => item.id === layer.id)
    document.layers.splice(index, 1)
    const next = document.layers[index] ?? document.layers[index - 1]
    props.session.ui.selection = next ? { id: next.id, kind: 'compositing-layer' } : undefined
  })
}
function move(layer: ProjectCompositingLayer, delta: number) {
  commitProjectMutation(props.session, 'Reorder layer', (document) => {
    const index = document.layers.findIndex((item) => item.id === layer.id)
    const next = index + delta
    if (next < 0 || next >= document.layers.length) {
      return
    }
    const [item] = document.layers.splice(index, 1)
    if (item) {
      document.layers.splice(next, 0, item)
    }
  })
}
function addRegional() {
  commitProjectMutation(props.session, 'Add Regional Guidance', (document) => {
    const id = `regional-${Date.now()}`
    document.regionalGuidance.push({
      autoNegative: true,
      compatibilityStatus: 'ok',
      enabled: true,
      id,
      locked: false,
      name: 'Regional Guidance',
      negativePrompt: '',
      opacity: 50,
      positivePrompt: '',
      referenceImages: [],
      regionRevision: 0,
    })
    props.session.ui.selection = { id, kind: 'regional-guidance' }
  })
}
</script>

<template>
  <aside aria-label="Layers and selected item" class="layers-panel">
    <div aria-label="Selected layer properties" class="layer-properties" role="toolbar">
      <NSelect
        v-if="selectedLayer?.kind === 'raster'"
        aria-label="Layer blend mode"
        class="blend-select"
        :options="
          ['normal', 'multiply', 'screen', 'overlay'].map((value) => ({
            label: value.charAt(0).toUpperCase() + value.slice(1),
            value,
          }))
        "
        size="small"
        :value="selectedLayer.blendMode"
        @update:value="
          mutateLayer(selectedLayer, 'Change blend mode', (target) => {
            if (target.kind === 'raster') target.blendMode = $event
          })
        "
      />
      <span v-else class="selection-kind">
        {{ selectedRegional ? 'Region display' : selectedLayer ? 'Smart Patch' : 'Select a layer' }}
      </span>
      <template v-if="opacityTarget">
        <span>Opacity</span>
        <NInputNumber
          class="opacity-input"
          :inputProps="{ 'aria-label': selectedRegional ? 'Region opacity' : 'Layer opacity' }"
          :max="100"
          :min="0"
          :showButton="false"
          size="small"
          :value="opacityTarget.opacity"
          @update:value="updateOpacity"
        >
          <template v-slot:suffix>%</template>
        </NInputNumber>
        <NPopover placement="bottom-end" trigger="click">
          <template v-slot:trigger>
            <NButton aria-label="Adjust opacity with slider" quaternary size="tiny">
              <NIcon :component="ChevronDown" />
            </NButton>
          </template>
          <div class="opacity-slider">
            <NSlider
              aria-label="Opacity slider"
              :max="100"
              :min="0"
              :value="opacityTarget.opacity"
              @dragend="commitActiveProjectEdit(session)"
              @keyup="commitActiveProjectEdit(session)"
              @update:value="updateOpacity($event, true)"
            />
          </div>
        </NPopover>
      </template>
    </div>
    <div ref="panelScroll" class="panel-scroll">
      <div class="panel-stack">
        <section aria-label="Regional Guidance">
          <header class="section-header">
            <strong>Regional Guidance ({{ session.document.regionalGuidance.length }})</strong>
            <NButton
              aria-label="Add Regional Guidance"
              circle
              class="regional-icon-button"
              quaternary
              size="small"
              @click="addRegional"
            >
              <NIcon :component="Plus" />
            </NButton>
          </header>
          <div class="regional-list">
            <ProjectRegionalRow
              v-for="entity of session.document.regionalGuidance"
              :key="entity.id"
              :entity
              :selected="session.ui.selection?.id === entity.id"
              :session
            />
          </div>
        </section>

        <section aria-label="Compositing Layers">
          <header class="section-header">
            <strong>Layers ({{ session.document.layers.length }})</strong>
            <span>
              <NButton
                aria-label="Add Raster Layer"
                circle
                quaternary
                size="small"
                @click="addLayer('raster')"
              >
                <NIcon :component="Plus" />
              </NButton>
              <NButton
                aria-label="Add Smart Patch Layer"
                size="tiny"
                tertiary
                @click="addLayer('smart-patch')"
              >
                + Patch
              </NButton>
            </span>
          </header>
          <DnDProvider :autoScrollViewport="false">
            <ProjectLayerStack
              :scrollContainer="panelScroll"
              :session
              @duplicate="duplicate"
              @move="move"
              @remove="remove"
              @savePreset="saveResultPreset"
              @toggleLock="
                mutateLayer($event, 'Toggle lock', (target) => (target.locked = !target.locked))
              "
              @toggleVisible="
                mutateLayer(
                  $event,
                  'Toggle visibility',
                  (target) => (target.visible = !target.visible),
                )
              "
              @variants="variantLayerId = $event.id"
            />
          </DnDProvider>
        </section>
      </div>
    </div>

    <div v-if="variantLayer?.kind === 'smart-patch'" class="variant-popover">
      <header>
        <strong>{{ variantLayer.name }} variants</strong>
        <NButton circle quaternary size="tiny" @click="variantLayerId = undefined">×</NButton>
      </header>
      <NButton
        v-for="variant of variantLayer.variants"
        :key="variant.id"
        block
        secondary
        :type="variant.id === variantLayer.activeVariantId ? 'primary' : 'default'"
        @click="
          () => {
            commitProjectMutation(session, 'Switch variant', () => {
              if (variantLayer?.kind === 'smart-patch') variantLayer.activeVariantId = variant.id
            })
            variantLayerId = undefined
          }
        "
      >
        <span class="variant-thumb"><ProjectCanvasArtwork :tone="variant.tone" /></span>
        {{ variant.name }}
      </NButton>
    </div>
  </aside>
</template>

<style scoped>
.layer-properties {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text-muted);
  font-size: 12px;
}
.blend-select {
  flex: 1;
  min-width: 80px;
}
.selection-kind {
  flex: 1;
}
.opacity-input {
  width: 64px;
}
.opacity-slider {
  width: 180px;
  padding: 6px;
}

.variant-thumb {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 48px;
  overflow: hidden;
  margin-right: 12px;
}
.variant-popover > .n-button {
  height: 60px;
  justify-content: start;
}
.layers-panel {
  position: relative;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  background: var(--app-surface);
  border-left: 1px solid var(--app-border);
}
.panel-scroll {
  min-height: 0;
  overflow: auto;
}
.panel-stack {
  display: grid;
  gap: 10px;
  padding: 8px;
}
.regional-list {
  display: grid;
  gap: 5px;
}
.section-header,
.section-header span,
.switch-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  min-height: 30px;
}
.variant-popover {
  position: absolute;
  top: 76px;
  right: 12px;
  z-index: var(--z-floating-control);
  display: grid;
  gap: 6px;
  width: 240px;
  padding: 10px;
  background: var(--app-elevated);
  border: 1px solid var(--app-border);
  box-shadow: 0 12px 28px #0008;
}
.variant-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
