<script setup lang="ts">
import { Copy, Eye, EyeOff, Lock, LockOpen, Refresh, Trash } from '@vicons/tabler';
import { NButton, NIcon } from 'naive-ui';

import type { ProjectCompositingLayer } from './project.types';

import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue';

defineProps<{ layer: ProjectCompositingLayer; selected: boolean }>();
defineEmits<{
  duplicate: [];
  remove: [];
  select: [];
  toggleLock: [];
  toggleVisible: [];
  variants: [];
}>();

function layerTone(layer: ProjectCompositingLayer) {
  return layer.kind === 'raster'
    ? layer.tone
    : layer.variants.find((item) => item.id === layer.activeVariantId)?.tone;
}
</script>

<template>
  <article class="layer-row" :class="{ 'layer-row--selected': selected }">
    <NButton
      :aria-label="`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`"
      circle
      quaternary
      size="small"
      @click="$emit('toggleVisible')"
      ><template v-slot:icon><NIcon :component="layer.visible ? Eye : EyeOff" /></template
    ></NButton>
    <NButton
      :aria-label="`Select ${layer.name}`"
      class="selection-button"
      quaternary
      @click="$emit('select')"
    >
      <span
        v-if="layer.kind === 'smart-patch'"
        aria-label="Mask thumbnail"
        class="layer-thumb mask-thumb"
      />
      <span class="layer-thumb"><ProjectCanvasArtwork :tone="layerTone(layer)" /></span>
      <span class="layer-info"
        ><strong v-overflow-title>{{ layer.name }}</strong
        ><small v-if="layer.kind === 'smart-patch'"
          >{{ layer.variants.length }} variants · {{ layer.status }}</small
        ><small v-else>{{ layer.opacity }}% · {{ layer.blendMode }}</small></span
      >
    </NButton>
    <NButton
      v-if="layer.kind === 'smart-patch'"
      :aria-label="`Switch variant for ${layer.name}`"
      circle
      quaternary
      size="small"
      @click="$emit('variants')"
      ><template v-slot:icon><NIcon :component="Refresh" /></template
    ></NButton>
    <NButton
      :aria-label="`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`"
      circle
      quaternary
      size="small"
      @click="$emit('toggleLock')"
      ><template v-slot:icon><NIcon :component="layer.locked ? Lock : LockOpen" /></template
    ></NButton>
    <NButton
      :aria-label="`Duplicate ${layer.name}`"
      circle
      quaternary
      size="small"
      @click="$emit('duplicate')"
      ><template v-slot:icon><NIcon :component="Copy" /></template
    ></NButton>
    <NButton
      :aria-label="`Delete ${layer.name}`"
      circle
      quaternary
      size="small"
      @click="$emit('remove')"
      ><template v-slot:icon><NIcon :component="Trash" /></template
    ></NButton>
  </article>
</template>

<style scoped>
.layer-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) repeat(4, auto);
  align-items: center;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.layer-row--selected {
  border-color: color-mix(in srgb, var(--workspace-green) 75%, transparent);
}
.selection-button {
  min-width: 0;
  width: 100%;
  height: 54px;
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
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
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
}
</style>
