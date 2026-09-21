<script setup lang="ts">
import { Copy, DotsVertical, Eye, EyeOff, Lock, LockOpen, Refresh, Trash } from '@vicons/tabler'
import { NButton, NDropdown, NIcon, NPopover } from 'naive-ui'
import { computed, ref } from 'vue'

import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import { resultProvenance } from './project-provenance'
import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectGenerationComparison from './ProjectGenerationComparison.vue'

const props = defineProps<{
  layer: ProjectCompositingLayer
  selected: boolean
  session: ProjectSession
}>()
const comparisonOpen = ref(false)
const emit = defineEmits<{
  duplicate: []
  moveDown: []
  moveUp: []
  remove: []
  savePreset: []
  select: []
  toggleLock: []
  toggleVisible: []
  variants: []
}>()

const moveOptions = computed(() => [
  {
    disabled: !resultProvenance(props.layer),
    key: 'compare',
    label: resultProvenance(props.layer)
      ? 'Compare generation settings'
      : 'Compare generation settings · No generation data',
  },
  { disabled: !resultProvenance(props.layer), key: 'preset', label: 'Create Preset from Result' },
  { key: 'up', label: 'Move up' },
  { key: 'down', label: 'Move down' },
])
function move(key: number | string) {
  if (key === 'compare') {
    comparisonOpen.value = true
    return
  }
  if (key === 'preset') {
    emit('savePreset')
    return
  }
  if (key === 'up') {
    emit('moveUp')
  } else {
    emit('moveDown')
  }
}

function layerTone(layer: ProjectCompositingLayer) {
  return layer.kind === 'raster'
    ? layer.tone
    : layer.variants.find((item) => item.id === layer.activeVariantId)?.tone
}
</script>

<template>
  <article class="layer-row" :class="{ 'layer-row--selected': selected }">
    <NButton
      :aria-label="`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`"
      circle
      quaternary
      size="tiny"
      @click="$emit('toggleVisible')"
    >
      <template v-slot:icon><NIcon :component="layer.visible ? Eye : EyeOff" /></template>
    </NButton>
    <NButton
      :aria-label="`Select ${layer.name}`"
      class="selection-button"
      text
      @click="$emit('select')"
    >
      <span
        v-if="layer.kind === 'smart-patch'"
        aria-label="Mask thumbnail"
        class="layer-thumb mask-thumb"
      />
      <span class="layer-thumb"><ProjectCanvasArtwork :tone="layerTone(layer)" /></span>
      <span class="layer-info">
        <strong v-overflow-title>{{ layer.name }}</strong>
        <small v-if="layer.kind === 'smart-patch'">
          {{ layer.variants.length }} variants · {{ layer.status }}
        </small>
        <small v-else>{{ layer.opacity }}% · {{ layer.blendMode }}</small>
      </span>
    </NButton>
    <NButton
      v-if="layer.kind === 'smart-patch'"
      :aria-label="`Switch variant for ${layer.name}`"
      circle
      quaternary
      size="tiny"
      @click="$emit('variants')"
    >
      <template v-slot:icon><NIcon :component="Refresh" /></template>
    </NButton>
    <NButton
      :aria-label="`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`"
      circle
      quaternary
      size="tiny"
      @click="$emit('toggleLock')"
    >
      <template v-slot:icon><NIcon :component="layer.locked ? Lock : LockOpen" /></template>
    </NButton>
    <NButton
      :aria-label="`Duplicate ${layer.name}`"
      circle
      quaternary
      size="tiny"
      @click="$emit('duplicate')"
    >
      <template v-slot:icon><NIcon :component="Copy" /></template>
    </NButton>
    <NButton
      :aria-label="`Delete ${layer.name}`"
      circle
      quaternary
      size="tiny"
      @click="$emit('remove')"
    >
      <template v-slot:icon><NIcon :component="Trash" /></template>
    </NButton>
    <NPopover
      v-model:show="comparisonOpen"
      placement="left-start"
      trigger="manual"
      @clickoutside="comparisonOpen = false"
    >
      <template v-slot:trigger>
        <span>
          <NDropdown :options="moveOptions" trigger="click" @select="move">
            <NButton :aria-label="`Layer actions for ${layer.name}`" circle quaternary size="tiny">
              <template v-slot:icon><NIcon :component="DotsVertical" /></template>
            </NButton>
          </NDropdown>
        </span>
      </template>
      <ProjectGenerationComparison :layer :session />
    </NPopover>
  </article>
</template>

<style scoped>
.layer-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) repeat(5, auto);
  align-items: center;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.layer-row:hover {
  border-color: color-mix(in srgb, var(--app-text-muted) 35%, transparent);
  background: var(--app-surface-soft);
}
.layer-row--selected {
  border-color: color-mix(in srgb, var(--workspace-green) 75%, transparent);
}
.selection-button {
  min-width: 0;
  width: 100%;
  height: 48px;
  justify-content: start;
  padding: 4px 6px;
}
.selection-button :deep(.n-button__content) {
  display: flex;
  gap: 7px;
  width: 100%;
  min-width: 0;
  justify-content: start;
}
.layer-thumb {
  position: relative;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 2px;
  background: var(--app-surface-soft);
}
.mask-thumb {
  background: radial-gradient(circle at 58% 52%, #fff 0 24%, #777 26% 33%, #121216 35%);
}
.layer-info {
  display: grid;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
}
.layer-info strong,
.layer-info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layer-info small {
  color: var(--app-text-muted);
  line-height: 1.25;
}
.layer-info strong {
  line-height: 1.2;
}
</style>
