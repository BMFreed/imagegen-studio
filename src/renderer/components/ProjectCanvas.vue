<script setup lang="ts">
import type {
  ProjectGenerationResultView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
  ProjectSmartPatchMaskEditRequest,
} from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import {
  ArrowsMaximize,
  Box,
  Brush,
  Eraser,
  HandMove,
  Lasso,
  Polygon,
  ArrowForwardUp as RedoIcon,
  ArrowBackUp as UndoIcon,
  ZoomIn,
  ZoomOut,
} from '@vicons/tabler'
import Konva from 'konva'
import { NButton, NIcon, NSelect, NTooltip } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  type GenerationResultFocusRequest,
  resultFocusCandidate,
} from './generation-queue-result.js'
import { reconcileResultSession, resultSessionFocus } from './generation-result-sessions.js'
import {
  type CanvasCamera,
  type CanvasSize,
  fitCamera,
  fitTargetBounds,
  rectBounds,
  zoomCameraAt,
} from './project-canvas-geometry.js'
import {
  type MaskGestureOwner,
  type MaskOperation,
  type MaskPoint,
  type MaskTool,
  maskWorldPoint,
  ProjectMaskGesture,
  sameMaskGestureOwner,
} from './project-mask-gesture.js'
import ProjectGenerationResultsTray from './ProjectGenerationResultsTray.vue'

const props = defineProps<{
  bbox: IgsRectV1
  bboxEditingDisabled?: boolean
  bboxLabel?: string
  candidateActionsDisabled: boolean
  canRedo: boolean
  canUndo: boolean
  disabled: boolean
  documentId: string
  documentRevision: string
  generationResults: ProjectGenerationResultView[]
  generationResultsLoading: boolean
  historyPending: 'redo' | 'undo' | null
  layers: ProjectRasterLayerView[]
  maskEditingDisabled: boolean
  maskTarget: ProjectSmartPatchLayerView | null
  projectKey: string
  resultFocus: GenerationResultFocusRequest | null
  selectedLayerId: string | null
}>()

const emit = defineEmits<{
  acceptCandidates: [selection: { candidateIds: string[]; focusedCandidateId: string | null }]
  changeBbox: [rect: IgsRectV1]
  editMask: [layerId: string, request: ProjectSmartPatchMaskEditRequest]
  redo: []
  refreshGenerationResults: []
  resultFocusHandled: [revision: number]
  saveCandidateImage: [candidateId: string]
  selectLayer: [layerId: string]
  undo: []
}>()
const bboxDisabled = computed(() => props.disabled || props.bboxEditingDisabled)
const maskDiameter = defineModel<number>('maskDiameter', { required: true })
const maskOperation = defineModel<MaskOperation>('maskOperation', { required: true })
const maskOverlayVisible = defineModel<boolean>('maskOverlayVisible', { required: true })

const host = ref<HTMLDivElement | null>(null)
const stageContainer = ref<HTMLDivElement | null>(null)
const tool = ref<'bbox' | 'pan' | MaskTool>('pan')
const sceneReady = ref(false)
const maskImageReady = ref(false)
const maskDisplayError = ref<string | null>(null)
const maskGestureError = ref<string | null>(null)
const maskDisabled = computed(
  () =>
    !nativeSceneReady.value ||
    props.disabled ||
    props.maskEditingDisabled ||
    !props.maskTarget ||
    props.maskTarget.locked ||
    !props.maskTarget.visible ||
    (props.maskTarget.mask.asset !== null && !maskImageReady.value),
)
const maskTools = [
  { icon: Brush, name: 'Brush tool', tool: 'brush' },
  { icon: Eraser, name: 'Eraser tool', tool: 'eraser' },
  { icon: Lasso, name: 'Lasso tool', tool: 'lasso' },
  { icon: Polygon, name: 'Polygon Lasso tool', tool: 'polygon-lasso' },
] as const
const panning = ref(false)
const camera = ref<CanvasCamera>({ scale: 1, x: 0, y: 0 })
const viewport = ref<CanvasSize>({ height: 0, width: 0 })
const nativeSceneReady = computed(
  () => sceneReady.value && viewport.value.width > 0 && viewport.value.height > 0,
)
const failedImageUrls = ref<Set<string>>(new Set())
const failedCandidateUrls = ref<Set<string>>(new Set())
const focusedCandidateId = ref<string | null>(null)
const resultFocusRevision = ref(0)
const resultSessionId = ref<string | null>(null)
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
let maskScene: Konva.Layer | null = null
let maskOverlay: Konva.Image | null = null
let maskCursor: Konva.Circle | null = null
let maskContour: Konva.Line | null = null
let maskBuffer: HTMLCanvasElement | null = null
let maskImage: HTMLImageElement | null = null
let maskImageRequest = 0
let maskGesture: ProjectMaskGesture | null = null
let maskPointerId: number | null = null
let cursorPoint: MaskPoint | null = null
let resizeObserver: ResizeObserver | null = null
let fitMode = true
let candidateFitMode = false
let selectionInitialized = false
let panMoved = false
let lastPointer = { x: 0, y: 0 }
let panPointerId: number | null = null
let keyboardBboxDirty = false
const heldArrowKeys = new Set<string>()
const images = new Map<string, HTMLImageElement>()
const candidateImages = new Map<string, HTMLImageElement>()

function isMaskTool(value: typeof tool.value): value is MaskTool {
  return value === 'brush' || value === 'eraser' || value === 'lasso' || value === 'polygon-lasso'
}

function currentMaskOwner(): MaskGestureOwner | null {
  const target = props.maskTarget
  return target
    ? {
        documentId: props.documentId,
        documentRevision: props.documentRevision,
        layerId: target.id,
        maskId: target.mask.id,
        maskRevision: target.mask.revision,
        projectKey: props.projectKey,
      }
    : null
}

function releaseMaskPointer() {
  const pointerId = maskPointerId
  maskPointerId = null
  if (pointerId !== null && host.value?.hasPointerCapture(pointerId)) {
    host.value.releasePointerCapture(pointerId)
  }
}

function cancelMaskGesture() {
  maskGesture?.cancel()
  maskGesture = null
  releaseMaskPointer()
  renderMaskOverlay()
}

function pointFromPointer(event: PointerEvent): MaskPoint | null {
  if (!host.value) {
    return null
  }
  return maskWorldPoint(event, host.value.getBoundingClientRect(), camera.value)
}

function appendMaskSamples(event: PointerEvent) {
  if (!maskGesture) {
    return
  }
  try {
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    for (const sample of [...samples, event]) {
      const point = pointFromPointer(sample)
      if (point) {
        maskGesture.append(point)
      }
    }
  } catch (cause) {
    maskGestureError.value = cause instanceof Error ? cause.message : 'The mask gesture is invalid.'
    cancelMaskGesture()
  }
}

function startMaskGesture(event: PointerEvent): boolean {
  if (!isMaskTool(tool.value)) {
    return false
  }
  if (maskDisabled.value || event.button !== 0 || !event.isPrimary) {
    return true
  }
  const owner = currentMaskOwner()
  const point = pointFromPointer(event)
  if (!owner || !point || !host.value) {
    return true
  }
  event.preventDefault()
  maskGestureError.value = null
  if (tool.value === 'polygon-lasso') {
    if (!maskGesture) {
      maskGesture = new ProjectMaskGesture(
        owner,
        tool.value,
        maskOperation.value,
        maskDiameter.value,
      )
    }
    if (!sameMaskGestureOwner(maskGesture.owner, owner)) {
      cancelMaskGesture()
      return true
    }
    const first = maskGesture.points[0]
    if (
      first &&
      maskGesture.points.length >= 3 &&
      Math.hypot(point.x - first.x, point.y - first.y) * camera.value.scale <= 8
    ) {
      finishMaskGesture()
      return true
    }
    try {
      maskGesture.append(point)
    } catch (cause) {
      maskGestureError.value =
        cause instanceof Error ? cause.message : 'The mask gesture is invalid.'
      cancelMaskGesture()
    }
  } else {
    if (maskGesture) {
      return true
    }
    maskGesture = new ProjectMaskGesture(owner, tool.value, maskOperation.value, maskDiameter.value)
    maskPointerId = event.pointerId
    host.value.setPointerCapture(event.pointerId)
    appendMaskSamples(event)
  }
  cursorPoint = point
  renderMaskOverlay()
  return true
}

function finishMaskGesture() {
  const session = maskGesture
  maskGesture = null
  releaseMaskPointer()
  const request = !maskDisabled.value ? session?.finish(currentMaskOwner()) : null
  renderMaskOverlay()
  if (request && session) {
    emit('editMask', session.owner.layerId, request)
  }
}

function handleMaskPointerMove(event: PointerEvent) {
  cursorPoint = pointFromPointer(event)
  if (maskGesture && maskPointerId === event.pointerId) {
    appendMaskSamples(event)
  }
  renderMaskOverlay()
}

function handleCanvasPointerMove(event: PointerEvent) {
  if (isMaskTool(tool.value)) {
    if (
      maskPointerId !== null ||
      event.target === host.value ||
      (event.target instanceof Element && event.target.closest('.konva-stage'))
    ) {
      handleMaskPointerMove(event)
    } else {
      leaveMaskCanvas()
    }
  } else {
    movePan(event)
  }
}

function handleCanvasPointerUp(event: PointerEvent) {
  if (maskGesture && maskPointerId === event.pointerId) {
    appendMaskSamples(event)
    finishMaskGesture()
  }
  stopPan()
}

function handleCanvasPointerCancel() {
  cancelMaskGesture()
  stopPan()
}

function handleLostPointerCapture(event: PointerEvent) {
  // Polygon keeps its session between clicks and owns no pointer capture then.
  // Implicit touch/pen capture loss must not cancel an unrelated session.
  if (maskPointerId === event.pointerId) {
    cancelMaskGesture()
  }
  if (panPointerId === event.pointerId) {
    stopPan()
  }
}

function handleCanvasBlur() {
  finishKeyboardBbox()
  cancelMaskGesture()
  cursorPoint = null
  renderMaskOverlay()
}

function leaveMaskCanvas() {
  cursorPoint = null
  renderMaskOverlay()
}

function chooseTool(value: typeof tool.value) {
  if (isMaskTool(value) && maskDisabled.value) {
    return
  }
  if (tool.value !== value) {
    cancelMaskGesture()
  }
  finishKeyboardBbox()
  tool.value = value
  cursorPoint = null
  renderMaskOverlay()
}

function loadMaskImage() {
  const request = ++maskImageRequest
  if (maskImage) {
    maskImage.onload = null
    maskImage.onerror = null
  }
  maskImage = null
  maskImageReady.value = false
  maskDisplayError.value = null
  const target = props.maskTarget
  if (!target || target.mask.asset === null) {
    maskImageReady.value = true
    renderMaskOverlay()
    return
  }
  if (!target.maskImageUrl) {
    maskDisplayError.value = 'The owned mask preview is unavailable. Reopen this Project.'
    renderMaskOverlay()
    return
  }
  const image = new Image()
  image.crossOrigin = 'anonymous'
  maskImage = image
  image.onload = () => {
    if (request !== maskImageRequest || maskImage !== image) {
      return
    }
    if (
      image.naturalWidth !== target.mask.asset?.width ||
      image.naturalHeight !== target.mask.asset?.height
    ) {
      maskDisplayError.value = 'The owned mask preview has unexpected dimensions.'
      renderMaskOverlay()
      return
    }
    maskImageReady.value = true
    renderMaskOverlay()
  }
  image.onerror = () => {
    if (request !== maskImageRequest) {
      return
    }
    maskDisplayError.value = 'The owned mask preview could not be displayed. Reopen this Project.'
    renderMaskOverlay()
  }
  image.src = target.maskImageUrl
  renderMaskOverlay()
}

/** A viewport-sized isolated alpha buffer prevents Eraser from cutting scene Raster pixels. */
function renderMaskOverlay() {
  if (!maskBuffer || !maskOverlay || !maskScene) {
    return
  }
  const width = Math.max(1, Math.round(viewport.value.width))
  const height = Math.max(1, Math.round(viewport.value.height))
  if (maskBuffer.width !== width || maskBuffer.height !== height) {
    maskBuffer.width = width
    maskBuffer.height = height
  }
  const context = maskBuffer.getContext('2d')
  if (!context) {
    return
  }
  context.resetTransform()
  context.globalCompositeOperation = 'source-over'
  context.clearRect(0, 0, width, height)
  context.save()
  context.setTransform(camera.value.scale, 0, 0, camera.value.scale, camera.value.x, camera.value.y)
  const target = props.maskTarget
  if (target?.mask.asset && maskImageReady.value && maskImage) {
    const bounds = target.mask.bounds
    context.drawImage(maskImage, bounds.x, bounds.y, bounds.width, bounds.height)
  }
  const gesture = maskGesture
  if (gesture && sameMaskGestureOwner(gesture.owner, currentMaskOwner())) {
    const points = gesture.points
    context.globalCompositeOperation =
      gesture.operation === 'add' ? 'source-over' : 'destination-out'
    context.fillStyle = token('--app-text')
    context.strokeStyle = token('--app-text')
    if ((gesture.tool === 'brush' || gesture.tool === 'eraser') && points[0]) {
      context.lineWidth = gesture.diameter
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      for (const point of points.slice(1)) {
        context.lineTo(point.x, point.y)
      }
      context.stroke()
      // A click is a disk; Canvas2D's zero-length line may otherwise paint nothing.
      for (const point of [points[0], points.at(-1)!]) {
        context.beginPath()
        context.arc(point.x, point.y, gesture.diameter / 2, 0, Math.PI * 2)
        context.fill()
      }
    } else if (points.length >= 3 && points[0]) {
      context.beginPath()
      context.moveTo(points[0].x, points[0].y)
      for (const point of points.slice(1)) {
        context.lineTo(point.x, point.y)
      }
      context.closePath()
      context.fill('evenodd')
    }
  }
  context.restore()
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = token('--app-tab-active-text')
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'source-over'
  maskOverlay.size({ height, width })
  maskOverlay.visible(Boolean(target && maskOverlayVisible.value))
  maskCursor?.visible(
    Boolean(
      cursorPoint &&
      isMaskTool(tool.value) &&
      !maskDisabled.value &&
      (tool.value === 'brush' || tool.value === 'eraser'),
    ),
  )
  if (cursorPoint && maskCursor) {
    maskCursor.position({
      x: cursorPoint.x * camera.value.scale + camera.value.x,
      y: cursorPoint.y * camera.value.scale + camera.value.y,
    })
    maskCursor.radius((maskDiameter.value * camera.value.scale) / 2)
  }
  const contour =
    gesture && gesture.tool !== 'brush' && gesture.tool !== 'eraser'
      ? [...gesture.points, ...(cursorPoint ? [cursorPoint] : [])]
      : []
  maskContour?.points(
    contour.flatMap((point) => [
      point.x * camera.value.scale + camera.value.x,
      point.y * camera.value.scale + camera.value.y,
    ]),
  )
  maskContour?.visible(contour.length > 0)
  maskScene.batchDraw()
}

function token(name: string): string {
  return host.value ? getComputedStyle(host.value).getPropertyValue(name).trim() : ''
}

function applyCamera(next: CanvasCamera) {
  if (
    maskGesture &&
    (next.x !== camera.value.x || next.y !== camera.value.y || next.scale !== camera.value.scale)
  ) {
    cancelMaskGesture()
  }
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
  renderMaskOverlay()
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
  panPointerId = event.pointerId
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
    if (startMaskGesture(event)) {
      return
    }
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
  panPointerId = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.target !== host.value) {
    return
  }
  if (event.key === 'Escape' && maskGesture) {
    event.preventDefault()
    cancelMaskGesture()
    return
  }
  if (isMaskTool(tool.value) && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.key === 'Enter' && tool.value === 'polygon-lasso' && maskGesture) {
      event.preventDefault()
      finishMaskGesture()
      return
    }
    if ((event.key === '[' || event.key === ']') && !maskDisabled.value) {
      event.preventDefault()
      maskDiameter.value = Math.min(
        512,
        Math.max(1, maskDiameter.value + (event.key === ']' ? 1 : -1)),
      )
      renderMaskOverlay()
      return
    }
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
    if (bboxDisabled.value || !bboxShape) {
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
  chooseTool('bbox')
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
  if (bboxDisabled.value || !validBbox(rect)) {
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
      if (!panMoved && !isMaskTool(tool.value)) {
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
  const editing = tool.value === 'bbox' && !bboxDisabled.value
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
  maskBuffer = document.createElement('canvas')
  maskScene = new Konva.Layer({ listening: false })
  maskOverlay = new Konva.Image({ image: maskBuffer, listening: false, opacity: 0.32 })
  maskCursor = new Konva.Circle({
    listening: false,
    stroke: token('--app-text'),
    strokeWidth: 1,
    visible: false,
  })
  maskContour = new Konva.Line({
    dash: [4, 4],
    listening: false,
    stroke: token('--app-text'),
    strokeWidth: 1,
    visible: false,
  })
  maskScene.add(maskOverlay, maskCursor, maskContour)
  stage.add(maskScene)
  restoreBbox()
  renderRasters()
  renderCandidatePreview()
  updateBboxTool()
  renderMaskOverlay()
  sceneReady.value = true
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
  window.addEventListener('blur', handleCanvasPointerCancel)
})

onBeforeUnmount(() => {
  sceneReady.value = false
  cancelMaskGesture()
  ++maskImageRequest
  if (maskImage) {
    maskImage.onload = null
    maskImage.onerror = null
  }
  window.removeEventListener('blur', finishKeyboardBbox)
  window.removeEventListener('blur', handleCanvasPointerCancel)
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
  [() => props.generationResults, () => props.generationResultsLoading],
  ([candidates, loading]) => {
    if (loading && candidates.length === 0) {
      return
    }
    resultSessionId.value = reconcileResultSession(candidates, resultSessionId.value)
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
      focusedCandidateId.value = resultSessionFocus(
        candidates,
        resultSessionId.value,
        focusedCandidateId.value,
      )
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
watch(resultSessionId, (sessionId) => {
  const candidateId = resultSessionFocus(
    props.generationResults,
    sessionId,
    focusedCandidateId.value,
  )
  if (candidateId !== null && candidateId !== focusedCandidateId.value) {
    focusCandidate(candidateId)
  }
})
watch(
  [() => props.resultFocus, () => props.generationResults],
  ([request, candidates]) => {
    if (!request || request.revision <= resultFocusRevision.value) {
      return
    }
    const candidate = resultFocusCandidate(request, candidates, {
      documentId: props.documentId,
      projectKey: props.projectKey,
    })
    if (!candidate) {
      return
    }
    // Queue navigation changes preview focus only. Acceptance checkboxes stay independent.
    resultSessionId.value = candidate.stagingSessionId
    focusCandidate(candidate.candidateId)
    resultFocusRevision.value = request.revision
    emit('resultFocusHandled', request.revision)
  },
  { flush: 'post', immediate: true },
)
watch(stagingHeight, () => {
  if (fitMode) {
    fitView()
  } else if (candidateFitMode) {
    fitFocusedCandidate()
  }
})
watch([focusedCandidateId, previewVisible], renderCandidatePreview)
watch(
  [
    () => props.projectKey,
    () => props.documentId,
    () => props.documentRevision,
    () => props.maskTarget?.id,
    () => props.maskTarget?.mask.id,
    () => props.maskTarget?.mask.revision,
    () => props.maskTarget?.locked,
    () => props.maskTarget?.visible,
  ],
  () => {
    cancelMaskGesture()
    cursorPoint = null
    maskGestureError.value = null
    if (!props.maskTarget && isMaskTool(tool.value)) {
      chooseTool('pan')
    }
    renderMaskOverlay()
  },
)
watch(() => props.maskTarget?.maskImageUrl, loadMaskImage, { immediate: true })
watch(maskDisabled, (disabled) => {
  if (disabled) {
    cancelMaskGesture()
  }
  renderMaskOverlay()
})
watch([maskDiameter, maskOverlayVisible], renderMaskOverlay)
watch(tool, () => {
  panMoved = false
  heldArrowKeys.clear()
  keyboardBboxDirty = false
  restoreBbox()
  updateBboxTool()
})
watch(bboxDisabled, (disabled) => {
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
})
</script>

<template>
  <section aria-label="Project Canvas" class="project-canvas">
    <div
      ref="host"
      :aria-label="
        tool === 'bbox'
          ? 'Infinite project canvas. Bounding Box tool. Arrow keys move the generation area by 1 pixel; Shift and arrow keys move it by 10 pixels. Drag to move or use handles to resize.'
          : isMaskTool(tool)
            ? `Infinite project canvas. ${maskTools.find((item) => item.tool === tool)?.name}. Escape cancels the current mask gesture.`
            : 'Infinite project canvas. Use the Pan or Bounding Box tool. Zoom with the wheel.'
      "
      class="canvas-area"
      :class="{ 'canvas-area--pan': tool === 'pan', 'canvas-area--panning': panning }"
      :data-camera-scale="camera.scale"
      :data-camera-x="camera.x"
      :data-camera-y="camera.y"
      :data-mask-ready="nativeSceneReady && !maskDisabled"
      :data-scene-ready="nativeSceneReady"
      role="group"
      tabindex="0"
      @blur="handleCanvasBlur"
      @keydown="handleKeydown"
      @keyup="handleKeyup"
      @lostpointercapture="handleLostPointerCapture"
      @pointercancel="handleCanvasPointerCancel"
      @pointerdown="handleCanvasPointerDown"
      @pointerleave="leaveMaskCanvas"
      @pointermove="handleCanvasPointerMove"
      @pointerup="handleCanvasPointerUp"
      @wheel.prevent="onWheel"
    >
      <div ref="stageContainer" aria-hidden="true" class="konva-stage" />
      <slot name="queue" />
      <div class="bbox-readout">
        {{ bboxLabel ?? 'Generation area' }} · {{ bbox.width }} × {{ bbox.height }} · X
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
          @click="chooseTool('pan')"
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
        <template v-if="maskTarget">
          <NTooltip v-for="item of maskTools" :key="item.tool">
            <template v-slot:trigger>
              <NButton
                :aria-label="item.name"
                :aria-pressed="tool === item.tool"
                circle
                :disabled="maskDisabled"
                quaternary
                size="small"
                :themeOverrides="tool === item.tool ? activeControlTheme : controlTheme"
                @click="chooseTool(item.tool)"
              >
                <template v-slot:icon><NIcon :component="item.icon" :size="18" /></template>
              </NButton>
            </template>
            {{ item.name }}
          </NTooltip>
        </template>
      </div>
      <div v-if="maskDisplayError || maskGestureError" class="mask-warning" role="alert">
        {{ maskDisplayError ?? maskGestureError }}
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
        v-model:sessionId="resultSessionId"
        :actionsDisabled="candidateActionsDisabled"
        :candidates="generationResults"
        :focusRevision="resultFocusRevision"
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
      <div
        v-if="!maskTarget && layers.length === 0 && !(focusedCandidate && previewVisible)"
        class="canvas-empty"
      >
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
            : tool === 'bbox'
              ? 'Drag to move · Arrows: 1 px · Shift+Arrows: 10 px · Handles to resize'
              : tool === 'polygon-lasso'
                ? 'Click points · Enter closes · Escape cancels'
                : tool === 'lasso'
                  ? 'Draw and release to close · Escape cancels'
                  : 'Drag to edit mask · [ ] changes size · Escape cancels'
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
.candidate-warning,
.mask-warning {
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
.mask-warning {
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
