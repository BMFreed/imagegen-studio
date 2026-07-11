<script setup lang="ts">
import { Eye, EyeOff, Plus, Trash } from '@vicons/tabler'
import { DnDProvider } from '@vue-dnd-kit/core'
import {
  NAlert,
  NButton,
  NCard,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NTag,
} from 'naive-ui'
import { computed, ref } from 'vue'

import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import { commitProjectMutation } from './project-history'
import { getSelectedEntity } from './project.utils'
import ProjectLayerStack from './ProjectLayerStack.vue'

const props = defineProps<{ session: ProjectSession }>()
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
function activeVariantName(layer: ProjectCompositingLayer) {
  return layer.kind === 'smart-patch'
    ? (layer.variants.find((item) => item.id === layer.activeVariantId)?.name ?? 'None')
    : ''
}
function mutateLayer(
  layer: ProjectCompositingLayer,
  label: string,
  mutate: (target: ProjectCompositingLayer) => void,
) {
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
            generationDraft: structuredClone(document.generationDraft),
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
    const copy = structuredClone(layer)
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
          <article
            v-for="entity of session.document.regionalGuidance"
            :key="entity.id"
            class="regional-row"
            :class="{ 'regional-row--selected': session.ui.selection?.id === entity.id }"
          >
            <NButton
              :aria-label="`${entity.enabled ? 'Hide' : 'Show'} ${entity.name}`"
              circle
              class="regional-icon-button"
              quaternary
              size="small"
              @click="
                commitProjectMutation(
                  session,
                  'Toggle Regional Guidance',
                  () => (entity.enabled = !entity.enabled),
                )
              "
            >
              <NIcon :component="entity.enabled ? Eye : EyeOff" />
            </NButton>
            <NButton
              :aria-label="`Select ${entity.name}`"
              class="regional-select"
              quaternary
              @click="session.ui.selection = { id: entity.id, kind: 'regional-guidance' }"
            >
              <span class="regional-thumb" />
              <span>
                <strong>{{ entity.name }}</strong>
                <small>{{ entity.referenceImages.length }} reference image</small>
              </span>
              <NTag v-if="entity.compatibilityStatus !== 'ok'" size="small" type="warning">
                Check
              </NTag>
            </NButton>
            <NButton
              :aria-label="`Delete ${entity.name}`"
              circle
              class="regional-icon-button"
              quaternary
              size="small"
              @click="
                commitProjectMutation(
                  session,
                  'Delete Regional Guidance',
                  (document) =>
                    (document.regionalGuidance = document.regionalGuidance.filter(
                      (item) => item.id !== entity.id,
                    )),
                )
              "
            >
              <NIcon :component="Trash" />
            </NButton>
          </article>
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

        <NCard v-if="selectedLayer" size="small" :title="selectedLayer.name">
          <template v-if="selectedLayer.kind === 'raster'">
            <div class="two-fields">
              <label>
                Opacity
                <NInputNumber
                  aria-label="Layer opacity"
                  :max="100"
                  :min="0"
                  :value="selectedLayer.opacity"
                />
              </label>
              <label>
                Blend
                <NSelect
                  aria-label="Layer blend mode"
                  :options="
                    ['normal', 'multiply', 'screen', 'overlay'].map((value) => ({
                      label: value,
                      value,
                    }))
                  "
                  :value="selectedLayer.blendMode"
                />
              </label>
            </div>
            <p>Raster editing tools are outside the MVP canvas.</p>
          </template>
          <template v-else>
            <NAlert v-if="selectedLayer.status === 'outdated'" type="warning">
              Mask, bounds or generation settings changed. Regenerate to refresh this patch.
            </NAlert>
            <div class="detail-grid">
              <span>
                Mask
                <strong>Revision {{ selectedLayer.maskRevision }}</strong>
              </span>
              <span>
                Bounding Box
                <strong>{{ selectedLayer.bbox.width }} × {{ selectedLayer.bbox.height }}</strong>
              </span>
              <span>
                Internal Size
                <strong>
                  {{ selectedLayer.internalWidth }} × {{ selectedLayer.internalHeight }}
                </strong>
              </span>
              <span>
                Active Variant
                <strong>{{ activeVariantName(selectedLayer) }}</strong>
              </span>
            </div>
          </template>
        </NCard>

        <NCard v-if="selectedRegional" key="n-card-2" size="small" :title="selectedRegional.name">
          <NAlert v-if="selectedRegional.compatibilityStatus !== 'ok'" type="warning">
            The current model may ignore regional reference images.
          </NAlert>
          <label>
            Prompt
            <NInput
              aria-label="Regional prompt"
              type="textarea"
              :value="selectedRegional.positivePrompt"
            />
          </label>
          <div class="switch-line">
            <span>Use global negative prompt</span>
            <NSwitch :value="selectedRegional.autoNegative" />
          </div>
        </NCard>
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
        {{ variant.name }}
      </NButton>
    </div>
  </aside>
</template>

<style scoped>
.layers-panel {
  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--app-surface);
  border-left: 1px solid var(--app-border);
}
.panel-scroll {
  height: 100%;
  overflow: auto;
}
.panel-stack {
  display: grid;
  gap: 10px;
  padding: 8px;
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
.regional-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  border: 1px solid transparent;
  background: var(--app-elevated);
}
.regional-row--selected {
  border-color: #b58cff;
}
.regional-icon-button :deep(.n-icon) {
  font-size: 18px;
}

.regional-select {
  width: 100%;
  height: 52px;
  justify-content: start;
  padding: 4px 6px;
}
.regional-select :deep(.n-button__content) {
  display: flex;
  justify-content: start;
  gap: 7px;
  width: 100%;
  min-width: 0;
}
.regional-select span:nth-child(2) {
  display: grid;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.regional-select small {
  color: var(--app-text-muted);
}
.regional-thumb {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  background: radial-gradient(circle, #b58cff99, transparent 60%), #18121f;
  border: 1px solid #b58cff66;
}
.two-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.two-fields label,
label {
  display: grid;
  gap: 4px;
  color: var(--app-text-muted);
}
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.detail-grid span {
  display: grid;
  padding: 7px;
  color: var(--app-text-muted);
  background: var(--app-elevated);
}
.detail-grid strong {
  color: var(--app-text);
}
p {
  color: var(--app-text-muted);
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
