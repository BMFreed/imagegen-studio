<script setup lang="ts">
import type { ProjectRasterLayerView } from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import { ArrowsMaximize, Box, HandMove, ZoomIn, ZoomOut } from '@vicons/tabler'
import Konva from 'konva'
import { NButton, NIcon, NSelect } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  type CanvasCamera,
  type CanvasSize,
  fitCamera,
  fitTargetBounds,
  zoomCameraAt,
} from './project-canvas-geometry.js'

const props = defineProps<{
  bbox: IgsRectV1
  disabled: boolean
  layers: ProjectRasterLayerView[]
  selectedLayerId: string | null
}>()

const emit = defineEmits<{
  changeBbox: [rect: IgsRectV1]
  selectLayer: [layerId: string]
}>()

const host = ref<HTMLDivElement | null>(null)
const stageContainer = ref<HTMLDivElement | null>(null)
const tool = ref<'bbox' | 'pan'>('pan')
const panning = ref(false)
const camera = ref<CanvasCamera>({ scale: 1, x: 0, y: 0 })
const viewport = ref<CanvasSize>({ height: 0, width: 0 })
const failedImageUrls = ref<Set<string>>(new Set())
const zoomPercent = computed(() => Number((camera.value.scale * 100).toPrecision(3)))
const zoomOptions = computed(() =>
  [...new Set([25, 50, 75, 100, 125, 200, 400, zoomPercent.value])]
    .sort((left, right) => left - right)
    .map((value) => ({ label: `${value}%`, value })),
)
const failedLayerCount = computed(
  () => props.layers.filter((layer) => failedImageUrls.value.has(layer.imageUrl)).length,
)

const controlTheme = {
  colorQuaternary: 'var(--app-text-muted)',
  colorQuaternaryHover: 'var(--app-text)',
  colorQuaternaryPressed: 'var(--app-text)',
  textColor: 'var(--app-chrome)',
}
const activeControlTheme = {
  ...controlTheme,
  colorQuaternary: 'var(--app-tab-active-text)',
}

let stage: Konva.Stage | null = null
let sceneLayer: Konva.Layer | null = null
let world: Konva.Group | null = null
let rasters: Konva.Group | null = null
let bboxShape: Konva.Rect | null = null
let bboxTransformer: Konva.Transformer | null = null
let resizeObserver: ResizeObserver | null = null
let fitMode = true
let panMoved = false
let lastPointer = { x: 0, y: 0 }
const images = new Map<string, HTMLImageElement>()

function token(name: string): string {
  return host.value ? getComputedStyle(host.value).getPropertyValue(name).trim() : ''
}

function applyCamera(next: CanvasCamera) {
  camera.value = next
  world?.position({ x: next.x, y: next.y })
  world?.scale({ x: next.scale, y: next.scale })
  if (bboxShape) {
    bboxShape.strokeWidth(1 / next.scale)
  }
  if (bboxTransformer) {
    bboxTransformer.anchorSize(8 / next.scale)
    bboxTransformer.borderStrokeWidth(1 / next.scale)
  }
  sceneLayer?.batchDraw()
}

function fitView() {
  if (viewport.value.width === 0 || viewport.value.height === 0) {
    return
  }
  fitMode = true
  applyCamera(fitCamera(fitTargetBounds(props.layers, props.bbox), viewport.value))
}

function setZoom(scale: number, point?: { x: number; y: number }) {
  const center = point ?? { x: viewport.value.width / 2, y: viewport.value.height / 2 }
  fitMode = false
  applyCamera(zoomCameraAt(camera.value, scale, center.x, center.y))
}

function setZoomPercent(value: number | null) {
  if (value !== null) {
    setZoom(value / 100)
  }
}

function onWheel(event: WheelEvent) {
  if (!host.value) {
    return
  }
  const bounds = host.value.getBoundingClientRect()
  const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12
  setZoom(camera.value.scale * factor, {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
}

function startPan(event: PointerEvent) {
  if (tool.value !== 'pan' || event.button !== 0 || !host.value) {
    return
  }
  if (event.target instanceof Element && event.target.closest('button, .n-select')) {
    return
  }
  panning.value = true
  panMoved = false
  fitMode = false
  lastPointer = { x: event.clientX, y: event.clientY }
  host.value.setPointerCapture(event.pointerId)
}

function movePan(event: PointerEvent) {
  if (!panning.value) {
    return
  }
  if (Math.abs(event.clientX - lastPointer.x) + Math.abs(event.clientY - lastPointer.y) > 2) {
    panMoved = true
  }
  applyCamera({
    ...camera.value,
    x: camera.value.x + event.clientX - lastPointer.x,
    y: camera.value.y + event.clientY - lastPointer.y,
  })
  lastPointer = { x: event.clientX, y: event.clientY }
}

function stopPan() {
  panning.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.target !== host.value) {
    return
  }
  switch (event.key) {
    case '0': {
      event.preventDefault()
      fitView()

      break
    }
    case '+':
    case '=': {
      event.preventDefault()
      setZoom(camera.value.scale * 1.25)

      break
    }
    case '-': {
      event.preventDefault()
      setZoom(camera.value.scale / 1.25)

      break
    }
    // No default
  }
}

function validBbox(rect: IgsRectV1): boolean {
  return (
    Number.isSafeInteger(rect.x) &&
    Number.isSafeInteger(rect.y) &&
    Number.isSafeInteger(rect.width) &&
    Number.isSafeInteger(rect.height) &&
    Math.abs(rect.x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    Math.abs(rect.y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    rect.width >= 1 &&
    rect.height >= 1 &&
    rect.width <= IGS_SAFETY_CEILINGS.rasterDimension &&
    rect.height <= IGS_SAFETY_CEILINGS.rasterDimension
  )
}

function restoreBbox() {
  bboxShape?.position({ x: props.bbox.x, y: props.bbox.y })
  bboxShape?.size({ height: props.bbox.height, width: props.bbox.width })
  bboxShape?.scale({ x: 1, y: 1 })
  bboxTransformer?.forceUpdate()
  sceneLayer?.batchDraw()
}

function commitBbox() {
  if (!bboxShape) {
    return
  }
  const rect = {
    height: Math.round(bboxShape.height() * bboxShape.scaleY()),
    width: Math.round(bboxShape.width() * bboxShape.scaleX()),
    x: Math.round(bboxShape.x()),
    y: Math.round(bboxShape.y()),
  }
  if (props.disabled || !validBbox(rect)) {
    restoreBbox()
    return
  }
  bboxShape.size({ height: rect.height, width: rect.width })
  bboxShape.scale({ x: 1, y: 1 })
  bboxTransformer?.forceUpdate()
  if (
    Object.keys(rect).some(
      (key) => rect[key as keyof IgsRectV1] !== props.bbox[key as keyof IgsRectV1],
    )
  ) {
    emit('changeBbox', rect)
  }
}

function loadImage(layer: ProjectRasterLayerView): HTMLImageElement | null {
  const cached = images.get(layer.imageUrl)
  if (cached) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null
  }
  const image = new Image()
  image.crossOrigin = 'anonymous'
  images.set(layer.imageUrl, image)
  image.onload = () => {
    if (stage) {
      renderRasters()
    }
  }
  image.onerror = () => {
    failedImageUrls.value = new Set([...failedImageUrls.value, layer.imageUrl])
  }
  image.src = layer.imageUrl
  return null
}

function releaseStaleImages() {
  const activeUrls = new Set(props.layers.map((layer) => layer.imageUrl))
  for (const [url, image] of images) {
    if (activeUrls.has(url)) {
      continue
    }
    image.onload = null
    image.onerror = null
    image.removeAttribute('src')
    images.delete(url)
  }
  failedImageUrls.value = new Set([...failedImageUrls.value].filter((url) => activeUrls.has(url)))
}

function renderRasters() {
  if (!rasters || !sceneLayer) {
    return
  }
  rasters.destroyChildren()
  for (const layer of [...props.layers].reverse()) {
    if (!layer.visible || layer.opacity === 0) {
      continue
    }
    const image = loadImage(layer)
    if (!image) {
      continue
    }
    const config = {
      height: layer.height,
      image,
      listening: true,
      opacity: layer.opacity,
      rotation: layer.transform.rotationDegrees,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
      width: layer.width,
      x: layer.transform.x,
      y: layer.transform.y,
    }
    const imageNode = new Konva.Image(config)
    imageNode.globalCompositeOperation(
      layer.blendMode === 'normal' ? 'source-over' : layer.blendMode,
    )
    imageNode.on('click tap', () => {
      if (!panMoved) {
        emit('selectLayer', layer.id)
      }
    })
    rasters.add(imageNode)
    if (layer.id === props.selectedLayerId) {
      rasters.add(
        new Konva.Rect({
          height: layer.height,
          listening: false,
          rotation: layer.transform.rotationDegrees,
          scaleX: layer.transform.scaleX,
          scaleY: layer.transform.scaleY,
          stroke: token('--app-tab-active-text'),
          strokeWidth: 1 / camera.value.scale,
          width: layer.width,
          x: layer.transform.x,
          y: layer.transform.y,
        }),
      )
    }
  }
  sceneLayer.batchDraw()
}

function updateBboxTool() {
  if (!bboxShape || !bboxTransformer) {
    return
  }
  const editing = tool.value === 'bbox' && !props.disabled
  bboxShape.draggable(editing)
  bboxShape.listening(editing)
  bboxShape.stroke(editing ? token('--app-tab-active-text') : token('--app-text'))
  bboxTransformer.nodes(editing ? [bboxShape] : [])
  bboxTransformer.visible(editing)
  sceneLayer?.batchDraw()
}

function createStage() {
  if (!host.value || !stageContainer.value) {
    return
  }
  stage = new Konva.Stage({
    container: stageContainer.value,
    height: host.value.clientHeight,
    width: host.value.clientWidth,
  })
  sceneLayer = new Konva.Layer()
  world = new Konva.Group()
  rasters = new Konva.Group()
  bboxShape = new Konva.Rect({
    dash: [7, 5],
    fill: 'rgba(0,0,0,0.001)',
    hitStrokeWidth: 8,
    stroke: token('--app-text'),
  })
  bboxTransformer = new Konva.Transformer({
    anchorFill: token('--app-text'),
    anchorStroke: token('--app-chrome'),
    borderStroke: token('--app-tab-active-text'),
    boundBoxFunc: (oldBox, newBox) => {
      const scale = camera.value.scale
      const worldX = (newBox.x - camera.value.x) / scale
      const worldY = (newBox.y - camera.value.y) / scale
      return newBox.width / scale >= 1 &&
        newBox.height / scale >= 1 &&
        newBox.width / scale <= IGS_SAFETY_CEILINGS.rasterDimension &&
        newBox.height / scale <= IGS_SAFETY_CEILINGS.rasterDimension &&
        Math.abs(worldX) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
        Math.abs(worldY) <= IGS_SAFETY_CEILINGS.coordinateMagnitude
        ? newBox
        : oldBox
    },
    enabledAnchors: [
      'top-left',
      'top-center',
      'top-right',
      'middle-right',
      'bottom-right',
      'bottom-center',
      'bottom-left',
      'middle-left',
    ],
    flipEnabled: false,
    rotateEnabled: false,
  })
  bboxShape.on('dragend transformend', commitBbox)
  world.add(rasters)
  world.add(bboxShape)
  world.add(bboxTransformer)
  sceneLayer.add(world)
  stage.add(sceneLayer)
  restoreBbox()
  renderRasters()
  updateBboxTool()
}

onMounted(() => {
  createStage()
  if (!host.value) {
    return
  }
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry || !stage) {
      return
    }
    const previous = viewport.value
    const next = { height: entry.contentRect.height, width: entry.contentRect.width }
    viewport.value = next
    stage.size(next)
    if (fitMode || previous.width === 0 || previous.height === 0) {
      fitView()
    } else {
      applyCamera({
        ...camera.value,
        x: camera.value.x + (next.width - previous.width) / 2,
        y: camera.value.y + (next.height - previous.height) / 2,
      })
    }
  })
  resizeObserver.observe(host.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  for (const image of images.values()) {
    image.onload = null
    image.onerror = null
  }
  images.clear()
  stage?.destroy()
  stage = null
})

watch(
  () => props.bbox,
  () => {
    restoreBbox()
    if (fitMode && !props.layers.some((layer) => layer.visible && layer.opacity > 0)) {
      fitView()
    }
  },
)
watch(
  () => props.layers,
  () => {
    renderRasters()
    releaseStaleImages()
    if (fitMode) {
      fitView()
    }
  },
)
watch(() => props.selectedLayerId, renderRasters)
watch([tool, () => props.disabled], () => {
  panMoved = false
  restoreBbox()
  updateBboxTool()
})
</script>

<template>
  <section aria-label="Project Canvas" class="project-canvas">
    <div
      ref="host"
      aria-label="Infinite project canvas. Use the Pan or Bounding Box tool. Numeric generation area fields are in Project settings."
      class="canvas-area"
      :class="{ 'canvas-area--pan': tool === 'pan', 'canvas-area--panning': panning }"
      tabindex="0"
      @keydown="handleKeydown"
      @pointercancel="stopPan"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="stopPan"
      @wheel.prevent="onWheel"
    >
      <div ref="stageContainer" aria-hidden="true" class="konva-stage" />
      <div class="bbox-readout">
        Generation area · {{ bbox.width }} × {{ bbox.height }} · X {{ bbox.x }} · Y {{ bbox.y }}
      </div>
      <div aria-label="Canvas tools" class="tool-rail" role="toolbar">
        <NButton
          aria-label="Pan tool"
          :aria-pressed="tool === 'pan'"
          circle
          quaternary
          size="small"
          :themeOverrides="tool === 'pan' ? activeControlTheme : controlTheme"
          @click="tool = 'pan'"
        >
          <template v-slot:icon><NIcon :component="HandMove" :size="18" /></template>
        </NButton>
        <NButton
          aria-label="Bounding Box tool"
          :aria-pressed="tool === 'bbox'"
          circle
          quaternary
          size="small"
          :themeOverrides="tool === 'bbox' ? activeControlTheme : controlTheme"
          @click="tool = 'bbox'"
        >
          <template v-slot:icon><NIcon :component="Box" :size="18" /></template>
        </NButton>
      </div>
      <div v-if="failedLayerCount" class="image-warning" role="status">
        {{ failedLayerCount }} layer {{ failedLayerCount === 1 ? 'image' : 'images' }} could not be
        displayed
      </div>
      <div v-if="layers.length === 0" class="canvas-empty">
        <strong>Canvas ready</strong>
        <span>Raster Layers will appear here.</span>
      </div>
    </div>
    <div class="viewport-bar">
      <div aria-label="Canvas viewport" class="viewport-controls" role="toolbar">
        <NButton aria-label="Zoom out" quaternary size="tiny" @click="setZoom(camera.scale / 1.25)">
          <template v-slot:icon><NIcon :component="ZoomOut" :size="16" /></template>
        </NButton>
        <NSelect
          aria-label="Canvas zoom"
          class="zoom-select"
          :options="zoomOptions"
          size="tiny"
          :value="zoomPercent"
          @update:value="setZoomPercent"
        />
        <NButton aria-label="Zoom in" quaternary size="tiny" @click="setZoom(camera.scale * 1.25)">
          <template v-slot:icon><NIcon :component="ZoomIn" :size="16" /></template>
        </NButton>
        <NButton aria-label="Fit View" quaternary size="tiny" @click="fitView">
          <template v-slot:icon><NIcon :component="ArrowsMaximize" :size="16" /></template>
        </NButton>
      </div>
      <span class="viewport-hint">
        {{ tool === 'pan' ? 'Drag to pan · Wheel to zoom' : 'Drag to move · Handles to resize' }}
      </span>
    </div>
  </section>
</template>

<style scoped>
.project-canvas {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--app-chrome);
}

.canvas-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background-color: var(--app-chrome);
  background-image:
    linear-gradient(45deg, var(--app-surface) 25%, transparent 25%),
    linear-gradient(-45deg, var(--app-surface) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--app-surface) 75%),
    linear-gradient(-45deg, transparent 75%, var(--app-surface) 75%);
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0;
  background-size: 24px 24px;
}

.canvas-area:focus-visible {
  outline: 1px solid var(--app-tab-active-text);
  outline-offset: -1px;
}

.canvas-area--pan {
  cursor: grab;
}
.canvas-area--panning {
  cursor: grabbing;
}

.konva-stage {
  position: absolute;
  inset: 0;
}

.bbox-readout,
.image-warning {
  position: absolute;
  z-index: 2;
  left: 48px;
  max-width: calc(100% - 96px);
  padding: 4px 7px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  color: var(--app-text-muted);
  background: var(--app-surface);
  font-size: var(--app-font-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.bbox-readout {
  top: 10px;
}
.image-warning {
  top: 42px;
}

.tool-rail {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transform: translateY(-50%);
}

.canvas-empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px;
  color: var(--app-text-muted);
  text-align: center;
  pointer-events: none;
}

.canvas-empty strong {
  color: var(--app-text);
  font-weight: 600;
}

.viewport-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 2px 7px;
  border-top: 1px solid var(--app-border);
  background: var(--app-elevated);
}

.viewport-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}
.zoom-select {
  width: 84px;
}
.viewport-hint {
  margin-left: auto;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
