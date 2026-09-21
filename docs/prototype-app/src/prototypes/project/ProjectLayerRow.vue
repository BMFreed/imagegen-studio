<script setup lang="ts">
import { DotsVertical, Eye, EyeOff, Lock, LockOpen, Refresh } from '@vicons/tabler'
import { NAlert, NButton, NDropdown, NIcon, NPopover } from 'naive-ui'
import { computed, ref } from 'vue'

import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import { resultProvenance } from './project-provenance'
import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectEntitySurface from './ProjectEntitySurface.vue'
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
  { key: 'duplicate', label: 'Duplicate layer' },
  { key: 'delete', label: 'Delete layer' },
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
  if (key === 'duplicate') {
    emit('duplicate')
    return
  }
  if (key === 'delete') {
    emit('remove')
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
  <ProjectEntitySurface class="layer-row" :selected>
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
    <template v-if="selected && layer.kind === 'smart-patch'" v-slot:details>
      <NAlert
        v-if="layer.status === 'outdated'"
        class="patch-warning"
        :showIcon="false"
        type="warning"
      >
        Mask, bounds or settings changed. Regenerate to refresh this patch.
      </NAlert>
      <dl class="patch-properties">
        <div>
          <dt>Bounds</dt>
          <dd>{{ layer.bbox.width }} × {{ layer.bbox.height }}</dd>
        </div>
        <div>
          <dt>Internal size</dt>
          <dd>{{ layer.internalWidth }} × {{ layer.internalHeight }}</dd>
        </div>
      </dl>
      <div class="patch-variant">
        <span>Mask revision {{ layer.maskRevision }}</span>
        <NButton size="tiny" text @click="$emit('variants')">
          {{
            layer.variants.find(
              (v) => v.id === (layer.kind === 'smart-patch' ? layer.activeVariantId : undefined),
            )?.name ?? 'No variant'
          }}
          · Browse
        </NButton>
      </div>
    </template>
  </ProjectEntitySurface>
</template>

<style scoped>
.patch-properties {
  display: flex;
  gap: 24px;
  margin: 2px 0 8px;
  font-size: 12px;
}
.patch-properties dt,
.patch-variant {
  color: var(--app-text-muted);
}
.patch-properties dd {
  margin: 0;
}
.patch-variant {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
}
.patch-warning {
  margin-bottom: 8px;
}

.selection-button {
  min-width: 0;
  flex: 1;
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
