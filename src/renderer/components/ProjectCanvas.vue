<script setup lang="ts">
import type { ProjectGenerationResultView, ProjectRasterLayerView } from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import {
  ArrowsMaximize,
  Box,
  HandMove,
  ArrowForwardUp as RedoIcon,
  ArrowBackUp as UndoIcon,
  ZoomIn,
  ZoomOut,
} from '@vicons/tabler'
import Konva from 'konva'
import { NButton, NIcon, NSelect, NTooltip } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  type CanvasCamera,
  type CanvasSize,
  fitCamera,
  fitTargetBounds,
  rectBounds,
  zoomCameraAt,
} from './project-canvas-geometry.js'
import ProjectGenerationResultsTray from './ProjectGenerationResultsTray.vue'

const props = defineProps<{
  bbox: IgsRectV1
  candidateActionsDisabled: boolean
  canRedo: boolean
  canUndo: boolean
  disabled: boolean
  generationResults: ProjectGenerationResultView[]
  generationResultsLoading: boolean
  historyPending: 'redo' | 'undo' | null
  layers: ProjectRasterLayerView[]
  selectedLayerId: string | null
}>()

const emit = defineEmits<{
  acceptCandidates: [selection: { candidateIds: string[]; focusedCandidateId: string | null }]
  changeBbox: [rect: IgsRectV1]
  redo: []
  refreshGenerationResults: []
  saveCandidateImage: [candidateId: string]
  selectLayer: [layerId: string]
  undo: []
}>()

const host = ref<HTMLDivElement | null>(null)
const stageContainer = ref<HTMLDivElement | null>(null)
const tool = ref<'bbox' | 'pan'>('pan')
const panning = ref(false)
const camera = ref<CanvasCamera>({ scale: 1, x: 0, y: 0 })
const viewport = ref<CanvasSize>({ height: 0, width: 0 })
const failedImageUrls = ref<Set<string>>(new Set())
const failedCandidateUrls = ref<Set<string>>(new Set())
const focusedCandidateId = ref<string | null>(null)
const selectedCandidateIds = ref<string[]>([])
const stagingHeight = ref(0)
const previewVisible = ref(true)
const localBboxPosition = ref<{ x: number; y: number } | null>(null)
const focusedCandidate = computed(
  () =>
    props.generationResults.find(
      (candidate) => candidate.candidateId === focusedCandidateId.value,
    ) ?? null,
)
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
let candidatePreview: Konva.Group | null = null
let previewBorder: Konva.Rect | null = null
let bboxShape: Konva.Rect | null = null
let bboxTransformer: Konva.Transformer | null = null
let resizeObserver: ResizeObserver | null = null
let fitMode = true
let candidateFitMode = false
let selectionInitialized = false
let panMoved = false
let lastPointer = { x: 0, y: 0 }
let keyboardBboxDirty = false
const heldArrowKeys = new Set<string>()
const images = new Map<string, HTMLImageElement>()
const candidateImages = new Map<string, HTMLImageElement>()

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
  if (previewBorder) {
    previewBorder.strokeWidth(1 / next.scale)
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
  candidateFitMode = false
  const bounds = fitTargetBounds(props.layers, props.bbox)
  const candidate = previewVisible.value ? focusedCandidate.value : null
  const previewBounds = candidate ? rectBounds(candidate.bbox) : null
  applyCamera(
    fitCamera(
      previewBounds
        ? {
            bottom: Math.max(bounds.bottom, previewBounds.bottom),
            left: Math.min(bounds.left, previewBounds.left),
            right: Math.max(bounds.right, previewBounds.right),
            top: Math.min(bounds.top, previewBounds.top),
          }
        : bounds,
      {
        height: Math.max(1, viewport.value.height - stagingSpace()),
        width: viewport.value.width,
      },
    ),
  )
}

function stagingSpace(): number {
  return props.generationResults.length > 0 ? (stagingHeight.value || 108) + 12 : 0
}

function fitFocusedCandidate() {
  const candidate = focusedCandidate.value
  if (
    !candidate ||
    !previewVisible.value ||
    viewport.value.width === 0 ||
    viewport.value.height === 0
  ) {
    return
  }
  applyCamera(
    fitCamera(rectBounds(candidate.bbox), {
      height: Math.max(1, viewport.value.height - stagingSpace()),
      width: viewport.value.width,
    }),
  )
}

function focusCandidate(candidateId: string) {
  const candidate = props.generationResults.find((item) => item.candidateId === candidateId)
  if (!candidate) {
    return
  }
  fitMode = false
  candidateFitMode = true
  focusedCandidateId.value = candidateId
  previewVisible.value = true
  fitFocusedCandidate()
}

function setCandidateSelected(candidateId: string, selected: boolean) {
  const candidate = props.generationResults.find((item) => item.candidateId === candidateId)
  if (!candidate || candidate.sourceDocumentMismatch || props.candidateActionsDisabled) {
    return
  }
  const ids = new Set(selectedCandidateIds.value)
  if (selected) {
    ids.add(candidateId)
  } else {
    ids.delete(candidateId)
  }
  selectedCandidateIds.value = props.generationResults
    .filter((item) => !item.sourceDocumentMismatch && ids.has(item.candidateId))
    .map((item) => item.candidateId)
}

function selectAllCandidates() {
  if (props.candidateActionsDisabled) {
    return
  }
  selectedCandidateIds.value = props.generationResults
    .filter((candidate) => !candidate.sourceDocumentMismatch)
    .map((candidate) => candidate.candidateId)
}

function clearSelection() {
  if (!props.candidateActionsDisabled) {
    selectedCandidateIds.value = []
  }
}

function acceptCandidates() {
  if (props.candidateActionsDisabled) {
    return
  }
  const ids = new Set(selectedCandidateIds.value)
  const candidateIds = props.generationResults
    .filter((candidate) => !candidate.sourceDocumentMismatch && ids.has(candidate.candidateId))
    .map((candidate) => candidate.candidateId)
  if (candidateIds.length > 0) {
    emit('acceptCandidates', { candidateIds, focusedCandidateId: focusedCandidateId.value })
  }
}

function setZoom(scale: number, point?: { x: number; y: number }) {
  const center = point ?? { x: viewport.value.width / 2, y: viewport.value.height / 2 }
  fitMode = false
  candidateFitMode = false
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
  candidateFitMode = false
  lastPointer = { x: event.clientX, y: event.clientY }
  host.value.setPointerCapture(event.pointerId)
}

function handleCanvasPointerDown(event: PointerEvent) {
  if (
    event.target === host.value ||
    (event.target instanceof Element && event.target.closest('.konva-stage'))
  ) {
    host.value?.focus({ preventScroll: true })
  }
  startPan(event)
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
  if (
    tool.value === 'bbox' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown')
  ) {
    event.preventDefault()
    if (props.disabled || !bboxShape) {
      return
    }
    const step = event.shiftKey ? 10 : 1
    const x =
      Math.round(bboxShape.x()) +
      (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)
    const y =
      Math.round(bboxShape.y()) +
      (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)
    if (!validBbox({ height: props.bbox.height, width: props.bbox.width, x, y })) {
      return
    }
    heldArrowKeys.add(event.key)
    bboxShape.position({ x, y })
    localBboxPosition.value = { x, y }
    bboxTransformer?.forceUpdate()
    sceneLayer?.batchDraw()
    keyboardBboxDirty = true
    fitMode = false
    candidateFitMode = false
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

function finishKeyboardBbox() {
  heldArrowKeys.clear()
  if (!keyboardBboxDirty) {
    return
  }
  keyboardBboxDirty = false
  commitBbox()
}

function handleKeyup(event: KeyboardEvent) {
  if (event.target !== host.value || !heldArrowKeys.has(event.key)) {
    return
  }
  event.preventDefault()
  heldArrowKeys.delete(event.key)
  if (heldArrowKeys.size === 0) {
    finishKeyboardBbox()
  }
}

function selectBboxTool() {
  tool.value = 'bbox'
  host.value?.focus({ preventScroll: true })
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
  localBboxPosition.value = null
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
    localBboxPosition.value = { x: rect.x, y: rect.y }
    fitMode = false
    candidateFitMode = false
    emit('changeBbox', rect)
  } else {
    localBboxPosition.value = null
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

function loadCandidateImage(candidate: ProjectGenerationResultView): HTMLImageElement | null {
  const cached = candidateImages.get(candidate.imageUrl)
  if (cached) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null
  }
  const image = new Image()
  image.crossOrigin = 'anonymous'
  candidateImages.set(candidate.imageUrl, image)
  image.onload = () => {
    if (stage) {
      renderCandidatePreview()
    }
  }
  image.onerror = () => {
    failedCandidateUrls.value = new Set([...failedCandidateUrls.value, candidate.imageUrl])
  }
  image.src = candidate.imageUrl
  return null
}

function releaseStaleCandidateImages() {
  const activeUrls = new Set(props.generationResults.map((candidate) => candidate.imageUrl))
  for (const [url, image] of candidateImages) {
    if (activeUrls.has(url) && !failedCandidateUrls.value.has(url)) {
      continue
    }
    image.onload = null
    image.onerror = null
    image.removeAttribute('src')
    candidateImages.delete(url)
  }
  failedCandidateUrls.value = new Set()
}

function renderCandidatePreview() {
  if (!candidatePreview || !sceneLayer) {
    return
  }
  candidatePreview.destroyChildren()
  previewBorder = null
  const candidate = previewVisible.value ? focusedCandidate.value : null
  if (!candidate) {
    sceneLayer.batchDraw()
    return
  }
  const image = loadCandidateImage(candidate)
  if (!image) {
    sceneLayer.batchDraw()
    return
  }
  candidatePreview.add(
    new Konva.Image({
      height: candidate.bbox.height,
      image,
      listening: false,
      width: candidate.bbox.width,
      x: candidate.bbox.x,
      y: candidate.bbox.y,
    }),
  )
  previewBorder = new Konva.Rect({
    dash: [5, 4],
    height: candidate.bbox.height,
    listening: false,
    stroke: token('--app-tab-active-text'),
    strokeWidth: 1 / camera.value.scale,
    width: candidate.bbox.width,
    x: candidate.bbox.x,
    y: candidate.bbox.y,
  })
  candidatePreview.add(previewBorder)
  sceneLayer.batchDraw()
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
  candidatePreview = new Konva.Group({ listening: false })
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
  world.add(candidatePreview)
  world.add(bboxShape)
  world.add(bboxTransformer)
  sceneLayer.add(world)
  stage.add(sceneLayer)
  restoreBbox()
  renderRasters()
  renderCandidatePreview()
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
    if (candidateFitMode) {
      fitFocusedCandidate()
    } else if (fitMode || previous.width === 0 || previous.height === 0) {
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
  window.addEventListener('blur', finishKeyboardBbox)
})

onBeforeUnmount(() => {
  window.removeEventListener('blur', finishKeyboardBbox)
  resizeObserver?.disconnect()
  for (const image of images.values()) {
    image.onload = null
    image.onerror = null
  }
  images.clear()
  for (const image of candidateImages.values()) {
    image.onload = null
    image.onerror = null
  }
  candidateImages.clear()
  stage?.destroy()
  stage = null
})

watch(
  () => props.bbox,
  () => {
    restoreBbox()
    if (
      fitMode &&
      !(focusedCandidate.value && previewVisible.value) &&
      !props.layers.some((layer) => layer.visible && layer.opacity > 0)
    ) {
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
watch(
  () => props.generationResults,
  (candidates) => {
    const ids = new Set(candidates.map((candidate) => candidate.candidateId))
    const eligible = candidates.filter((candidate) => !candidate.sourceDocumentMismatch)
    const selected = new Set(selectedCandidateIds.value)
    selectedCandidateIds.value = eligible
      .filter((candidate) => selected.has(candidate.candidateId))
      .map((candidate) => candidate.candidateId)
    if (candidates.length === 0) {
      selectionInitialized = false
    } else if (!selectionInitialized && eligible.length > 0) {
      selectedCandidateIds.value = [eligible[0]!.candidateId]
      selectionInitialized = true
    }
    if (!focusedCandidateId.value || !ids.has(focusedCandidateId.value)) {
      focusedCandidateId.value = (eligible[0] ?? candidates[0])?.candidateId ?? null
    }
    releaseStaleCandidateImages()
    renderCandidatePreview()
    if (fitMode) {
      fitView()
    } else if (candidateFitMode) {
      fitFocusedCandidate()
    }
  },
  { immediate: true },
)
watch(stagingHeight, () => {
  if (fitMode) {
    fitView()
  } else if (candidateFitMode) {
    fitFocusedCandidate()
  }
})
watch([focusedCandidateId, previewVisible], renderCandidatePreview)
watch(tool, () => {
  panMoved = false
  heldArrowKeys.clear()
  keyboardBboxDirty = false
  restoreBbox()
  updateBboxTool()
})
watch(
  () => props.disabled,
  (disabled) => {
    panMoved = false
    if (keyboardBboxDirty) {
      heldArrowKeys.clear()
      keyboardBboxDirty = false
      restoreBbox()
    } else if (!disabled) {
      // Keep the local drag/nudge position visible until the IPC result arrives.
      // A failed mutation has no bbox prop update, so leaving busy restores it.
      restoreBbox()
    }
    updateBboxTool()
  },
)
</script>

<template>
  <section aria-label="Project Canvas" class="project-canvas">
    <div
      ref="host"
      :aria-label="
        tool === 'bbox'
          ? 'Infinite project canvas. Bounding Box tool. Arrow keys move the generation area by 1 pixel; Shift and arrow keys move it by 10 pixels. Drag to move or use handles to resize.'
          : 'Infinite project canvas. Use the Pan or Bounding Box tool. Zoom with the wheel.'
      "
      class="canvas-area"
      :class="{ 'canvas-area--pan': tool === 'pan', 'canvas-area--panning': panning }"
      role="group"
      tabindex="0"
      @blur="finishKeyboardBbox"
      @keydown="handleKeydown"
      @keyup="handleKeyup"
      @pointercancel="stopPan"
      @pointerdown="handleCanvasPointerDown"
      @pointermove="movePan"
      @pointerup="stopPan"
      @wheel.prevent="onWheel"
    >
      <div ref="stageContainer" aria-hidden="true" class="konva-stage" />
      <div class="bbox-readout">
        Generation area · {{ bbox.width }} × {{ bbox.height }} · X
        {{ localBboxPosition?.x ?? bbox.x }} · Y {{ localBboxPosition?.y ?? bbox.y }}
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
          @click="selectBboxTool"
        >
          <template v-slot:icon><NIcon :component="Box" :size="18" /></template>
        </NButton>
      </div>
      <div v-if="failedLayerCount" class="image-warning" role="status">
        {{ failedLayerCount }} layer {{ failedLayerCount === 1 ? 'image' : 'images' }} could not be
        displayed
      </div>
      <div
        v-if="
          previewVisible && focusedCandidate && failedCandidateUrls.has(focusedCandidate.imageUrl)
        "
        class="candidate-warning"
        role="status"
      >
        The result preview could not be displayed. Refresh results to try again.
      </div>
      <ProjectGenerationResultsTray
        v-if="generationResults.length > 0"
        :actionsDisabled="candidateActionsDisabled"
        :candidates="generationResults"
        :focusedCandidateId
        :loading="generationResultsLoading"
        :previewVisible
        :selectedCandidateIds
        @acceptCandidates="acceptCandidates"
        @clearSelection="clearSelection"
        @focus="focusCandidate"
        @refresh="emit('refreshGenerationResults')"
        @resize="stagingHeight = $event"
        @saveCandidateImage="emit('saveCandidateImage', $event)"
        @selectAll="selectAllCandidates"
        @selectCandidate="setCandidateSelected"
        @togglePreview="previewVisible = !previewVisible"
      />
      <div v-if="layers.length === 0 && !(focusedCandidate && previewVisible)" class="canvas-empty">
        <strong>Canvas ready</strong>
        <span>Raster Layers will appear here.</span>
      </div>
    </div>
    <div class="viewport-bar">
      <div aria-label="Project history" class="history-controls" role="toolbar">
        <NTooltip>
          <template v-slot:trigger>
            <NButton
              aria-label="Undo"
              :disabled="disabled || !canUndo"
              :loading="historyPending === 'undo'"
              quaternary
              size="tiny"
              @click="emit('undo')"
            >
              <template v-slot:icon><NIcon :component="UndoIcon" :size="16" /></template>
            </NButton>
          </template>
          Undo · Ctrl/Cmd+Z
        </NTooltip>
        <NTooltip>
          <template v-slot:trigger>
            <NButton
              aria-label="Redo"
              :disabled="disabled || !canRedo"
              :loading="historyPending === 'redo'"
              quaternary
              size="tiny"
              @click="emit('redo')"
            >
              <template v-slot:icon><NIcon :component="RedoIcon" :size="16" /></template>
            </NButton>
          </template>
          Redo · Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y
        </NTooltip>
      </div>
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
        {{
          tool === 'pan'
            ? 'Drag to pan · Wheel to zoom'
            : 'Drag to move · Arrows: 1 px · Shift+Arrows: 10 px · Handles to resize'
        }}
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
.image-warning,
.candidate-warning {
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

.candidate-warning {
  top: 74px;
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
.history-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 6px;
  border-right: 1px solid var(--app-border);
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
