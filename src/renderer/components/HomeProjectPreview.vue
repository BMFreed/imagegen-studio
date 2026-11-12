<script setup lang="ts">
import {
  ArrowsMaximize as FitIcon,
  Refresh as ResetIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from '@vicons/tabler'
import { NEmpty, NSpin } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import { type CanvasCamera, fitCamera, zoomCameraAt } from './project-canvas-geometry.js'

const props = defineProps<{ source: string }>()
const stage = ref<SVGSVGElement | null>(null)
const state = ref<'error' | 'loading' | 'ready'>('loading')
const width = ref(0)
const height = ref(0)
const viewport = ref({ height: 0, width: 0 })
const camera = ref<CanvasCamera>({ scale: 1, x: 0, y: 0 })
const dragging = ref(false)
let pointer: { camera: CanvasCamera; id: number; x: number; y: number } | null = null
let image: HTMLImageElement | null = null
let observer: ResizeObserver | null = null
let loadEpoch = 0
let fitting = true
const zoomPercent = computed(() => Number((camera.value.scale * 100).toPrecision(3)))
const viewBox = computed(() => {
  const { scale, x, y } = camera.value
  return `${-x / scale} ${-y / scale} ${Math.max(1, viewport.value.width) / scale} ${Math.max(1, viewport.value.height) / scale}`
})

function fitView() {
  fitting = true
  if (state.value !== 'ready') {
    return
  }
  camera.value = fitCamera(
    { bottom: height.value, left: 0, right: width.value, top: 0 },
    viewport.value,
    16,
  )
}

function resetView() {
  fitting = false
  camera.value = {
    scale: 1,
    x: (viewport.value.width - width.value) / 2,
    y: (viewport.value.height - height.value) / 2,
  }
}

function zoom(factor: number) {
  fitting = false
  camera.value = zoomCameraAt(
    camera.value,
    camera.value.scale * factor,
    viewport.value.width / 2,
    viewport.value.height / 2,
  )
}

function imageLoaded(event: Event) {
  const target = event.currentTarget as SVGImageElement
  if (!target.isConnected || target.getAttribute('href') !== props.source) {
    return
  }
  state.value = 'ready'
  fitView()
}

function imageFailed(event: Event) {
  const target = event.currentTarget as SVGImageElement
  if (target.isConnected && target.getAttribute('href') === props.source) {
    state.value = 'error'
  }
}

function stopDrag() {
  const active = pointer
  pointer = null
  dragging.value = false
  if (active && stage.value?.hasPointerCapture(active.id)) {
    stage.value.releasePointerCapture(active.id)
  }
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || state.value !== 'ready' || pointer) {
    return
  }
  event.preventDefault()
  stage.value?.focus({ preventScroll: true })
  fitting = false
  pointer = { camera: { ...camera.value }, id: event.pointerId, x: event.clientX, y: event.clientY }
  dragging.value = true
  stage.value?.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) {
    return
  }
  camera.value = {
    ...pointer.camera,
    x: pointer.camera.x + event.clientX - pointer.x,
    y: pointer.camera.y + event.clientY - pointer.y,
  }
}

function onKeydown(event: KeyboardEvent) {
  if (state.value !== 'ready') {
    return
  }
  switch (event.key) {
    case '0': {
      resetView()
      break
    }
    case '+':
    case '=': {
      zoom(1.25)
      break
    }
    case '-': {
      zoom(1 / 1.25)
      break
    }
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp': {
      fitting = false
      const step = event.shiftKey ? 40 : 10
      camera.value = {
        ...camera.value,
        x:
          camera.value.x +
          (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
        y:
          camera.value.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
      }
      break
    }
    case 'f':
    case 'F': {
      fitView()
      break
    }
    default: {
      return
    }
  }
  event.preventDefault()
  event.stopPropagation()
}

watch(
  () => props.source,
  (source) => {
    const epoch = ++loadEpoch
    stopDrag()
    if (image) {
      image.onload = null
      image.onerror = null
    }
    state.value = 'loading'
    width.value = 0
    height.value = 0
    camera.value = { scale: 1, x: 0, y: 0 }
    fitting = true
    image = new Image()
    image.onload = () => {
      if (epoch !== loadEpoch || !image) {
        return
      }
      width.value = image.naturalWidth
      height.value = image.naturalHeight
      if (width.value <= 0 || height.value <= 0) {
        state.value = 'error'
      }
    }
    image.onerror = () => {
      if (epoch === loadEpoch) {
        state.value = 'error'
      }
    }
    image.src = source
  },
  { immediate: true },
)

onMounted(() => {
  observer = new ResizeObserver(() => {
    if (!stage.value) {
      return
    }
    viewport.value = { height: stage.value.clientHeight, width: stage.value.clientWidth }
    stopDrag()
    if (fitting) {
      fitView()
    }
  })
  if (stage.value) {
    observer.observe(stage.value)
  }
})

onBeforeUnmount(() => {
  ++loadEpoch
  stopDrag()
  observer?.disconnect()
  if (image) {
    image.onload = null
    image.onerror = null
    image = null
  }
})
</script>

<template>
  <div class="home-preview">
    <div class="preview-frame">
      <svg
        ref="stage"
        aria-label="Project preview canvas"
        class="preview-stage"
        :class="{ 'preview-stage--dragging': dragging }"
        :data-image-height="height"
        :data-image-width="width"
        :data-preview-state="state"
        :data-preview-url="source"
        preserveAspectRatio="none"
        role="img"
        tabindex="0"
        :viewBox
        @keydown="onKeydown"
        @lostpointercapture="stopDrag"
        @pointercancel="stopDrag"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="stopDrag"
      >
        <image
          v-if="width > 0 && height > 0"
          :key="source"
          :height
          :href="source"
          preserveAspectRatio="none"
          :width
          @error="imageFailed"
          @load="imageLoaded"
        />
      </svg>
      <div v-if="state !== 'ready'" aria-live="polite" class="preview-state">
        <NSpin v-if="state === 'loading'" aria-label="Loading project preview" size="small" />
        <NEmpty v-else description="Preview could not be displayed" size="small" />
      </div>
    </div>
    <div class="preview-controls">
      <span>Preview</span>
      <div class="zoom-controls">
        <IconButton
          :disabled="state !== 'ready'"
          :icon="ZoomOutIcon"
          label="Zoom out"
          @click="zoom(1 / 1.25)"
        />
        <span aria-live="polite" class="zoom-value">
          {{ state === 'ready' ? `${zoomPercent}%` : '—' }}
        </span>
        <IconButton
          :disabled="state !== 'ready'"
          :icon="ZoomInIcon"
          label="Zoom in"
          @click="zoom(1.25)"
        />
        <IconButton
          :disabled="state !== 'ready'"
          :icon="FitIcon"
          label="Fit view"
          @click="fitView"
        />
        <IconButton
          :disabled="state !== 'ready'"
          :icon="ResetIcon"
          label="Reset view"
          @click="resetView"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-preview {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.preview-frame {
  position: relative;
  height: clamp(220px, 32vh, 360px);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: repeating-conic-gradient(var(--app-surface) 0% 25%, var(--app-chrome) 0% 50%) 50% /
    20px 20px;
}

.preview-stage {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}

.preview-stage:focus-visible {
  outline: 2px solid var(--app-text);
  outline-offset: -3px;
}

.preview-stage--dragging {
  cursor: grabbing;
}

.preview-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 12px;
  pointer-events: none;
}

.preview-controls,
.zoom-controls {
  display: flex;
  align-items: center;
}

.preview-controls {
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.zoom-controls {
  gap: 2px;
}

.zoom-value {
  min-width: 44px;
  text-align: center;
}
</style>
