<script setup lang="ts">
import {
  ArrowsMaximize as FitIcon,
  Refresh as ResetIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from '@vicons/tabler'
import { NButton, NIcon } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import type { HomeProjectRecord } from './home.types'

import ProjectArtwork from './ProjectArtwork.vue'

const props = defineProps<{
  project: HomeProjectRecord
}>()

const scale = ref(0.72)
const offsetX = ref(0)
const offsetY = ref(0)
const dragging = ref(false)
let dragOrigin = { x: 0, y: 0 }

const transform = computed(
  () => `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
)

watch(
  () => props.project.id,
  () => fitView(),
)

function zoom(delta: number) {
  scale.value = Math.min(1.5, Math.max(0.4, Number((scale.value + delta).toFixed(2))))
}

function fitView() {
  scale.value = 0.72
  offsetX.value = 0
  offsetY.value = 0
}

function resetView() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function startDrag(event: PointerEvent) {
  dragging.value = true
  dragOrigin = { x: event.clientX - offsetX.value, y: event.clientY - offsetY.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!dragging.value) {
    return
  }
  offsetX.value = event.clientX - dragOrigin.x
  offsetY.value = event.clientY - dragOrigin.y
}
</script>

<template>
  <div class="preview-viewport">
    <div
      aria-label="Project preview canvas"
      class="preview-stage"
      :class="{ 'preview-stage--dragging': dragging }"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="dragging = false"
    >
      <div class="preview-image" :style="{ transform }">
        <ProjectArtwork :tone="project.thumbnailTone" />
      </div>
    </div>
    <div class="preview-controls">
      <span>Preview</span>
      <div class="zoom-controls">
        <NButton aria-label="Zoom out" circle quaternary size="small" @click="zoom(-0.1)">
          <template v-slot:icon><NIcon :component="ZoomOutIcon" /></template>
        </NButton>
        <span aria-live="polite" class="zoom-value">{{ Math.round(scale * 100) }}%</span>
        <NButton aria-label="Zoom in" circle quaternary size="small" @click="zoom(0.1)">
          <template v-slot:icon><NIcon :component="ZoomInIcon" /></template>
        </NButton>
        <NButton aria-label="Fit view" circle quaternary size="small" @click="fitView">
          <template v-slot:icon><NIcon :component="FitIcon" /></template>
        </NButton>
        <NButton aria-label="Reset view" circle quaternary size="small" @click="resetView">
          <template v-slot:icon><NIcon :component="ResetIcon" /></template>
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-viewport {
  display: grid;
  grid-template-rows: minmax(220px, 1fr) auto;
  gap: 8px;
  min-height: 0;
}

.preview-stage {
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  background:
    linear-gradient(45deg, #ffffff08 25%, transparent 25%),
    linear-gradient(-45deg, #ffffff08 25%, transparent 25%), var(--app-chrome);
  background-size: 18px 18px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  touch-action: none;
}

.preview-stage--dragging {
  cursor: grabbing;
}

.preview-image {
  position: relative;
  width: min(76%, 280px);
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  transform-origin: center;
}

.preview-controls,
.zoom-controls {
  display: flex;
  align-items: center;
}

.preview-controls {
  justify-content: space-between;
  color: var(--app-text-muted);
  font-size: 12px;
}

.zoom-controls {
  gap: 2px;
}

.zoom-value {
  width: 44px;
  text-align: center;
}
</style>
