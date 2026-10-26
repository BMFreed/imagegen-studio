<script setup lang="ts">
import type {
  ProjectGenerationResultView,
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectRegionalGuidanceLayerView,
  ProjectRegionalGuidanceMaskEditRequest,
  ProjectSmartPatchCandidateExportRequest,
  ProjectSmartPatchLayerView,
  ProjectSmartPatchMaskEditRequest,
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultView,
} from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import {
  ArrowsMaximize,
  Box,
  BoxMargin,
  Brush,
  Check,
  Eraser,
  HandMove,
  Lasso,
  Polygon,
  ArrowForwardUp as RedoIcon,
  Shape,
  ArrowBackUp as UndoIcon,
  X,
  ZoomIn,
  ZoomOut,
} from '@vicons/tabler'
import Konva from 'konva'
import { NButton, NIcon, NSelect, NTooltip } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import {
  type GenerationResultFocusRequest,
  resultFocusCandidate,
  smartResultFocusCandidate,
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
import {
  projectMaskFitRequest,
  ProjectMaskTransformGesture,
  snapProjectMaskTransformToPixelGrid,
} from './project-mask-transform-gesture.js'
import ProjectGenerationResultsTray from './ProjectGenerationResultsTray.vue'
import ProjectSmartPatchResultsTray from './ProjectSmartPatchResultsTray.vue'
import {
  smartPatchCandidateHasTarget,
  smartPatchPreviewRasters,
  smartPatchResultScope,
} from './smart-patch-result-context.js'

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
  entityLayers: ProjectLayerView[]
  generationResults: ProjectGenerationResultView[]
  generationResultsLoading: boolean
  historyPending: 'redo' | 'undo' | null
  layers: ProjectRasterLayerView[]
  maskEditingDisabled: boolean
  maskEditingReason?: string | null
  maskGeometryEditingDisabled: boolean
  maskTarget: ProjectSmartPatchLayerView | null
  projectKey: string
  regionalContext?: ProjectRegionalGuidanceLayerView | null
  resultFocus: GenerationResultFocusRequest | null
  selectedLayerId: string | null
  smartPatchResults: ProjectSmartPatchResultsSnapshot | null
  smartPatchResultsLoading: boolean
}>()

const emit = defineEmits<{
  acceptCandidates: [selection: { candidateIds: string[]; focusedCandidateId: string | null }]
  acceptSmartPatch: [
    selection: {
      candidateIds: string[]
      documentId: string
      focusedCandidateId: string | null
      layerId: string
    },
  ]
  acceptSmartPatchRaster: [
    selection: {
      candidateIds: string[]
      documentId: string
      focusedCandidateId: string | null
      layerId: string
    },
  ]
  changeBbox: [rect: IgsRectV1]
  discardSmartPatch: [scope: { documentId: string; layerId: string }]
  editMask: [layerId: string, request: ProjectSmartPatchMaskEditRequest]
  editRegionalMask: [regionId: string, request: ProjectRegionalGuidanceMaskEditRequest]
  exportSmartPatch: [request: ProjectSmartPatchCandidateExportRequest]
  redo: []
  refreshGenerationResults: []
  refreshSmartPatch: []
  resultFocusHandled: [revision: number]
  saveCandidateImage: [candidateId: string]
  selectLayer: [layerId: string]
  undo: []
}>()
const bboxDisabled = computed(
  () => props.disabled || props.bboxEditingDisabled || Boolean(props.regionalContext),
)
const maskToolReasonId = useId()
const activeMaskTarget = computed(() => props.regionalContext ?? props.maskTarget)
const transformToolLabel = computed(() =>
  props.regionalContext ? 'Transform Region' : 'Transform Mask',
)
const maskDiameter = defineModel<number>('maskDiameter', { required: true })
const maskOperation = defineModel<MaskOperation>('maskOperation', { required: true })
const maskOverlayVisible = defineModel<boolean>('maskOverlayVisible', { required: true })

const host = ref<HTMLDivElement | null>(null)
const stageContainer = ref<HTMLDivElement | null>(null)
const tool = ref<'bbox' | 'pan' | 'transform-mask' | MaskTool>('pan')
const sceneReady = ref(false)
const maskImageReady = ref(false)
const maskDisplayError = ref<string | null>(null)
const maskGestureError = ref<string | null>(null)
const maskTransformActive = ref(false)
const maskTransformNode = ref<string | null>(null)
const maskTransformHandles = ref<string | null>(null)
const maskGeometryDisabled = computed(
  () =>
    !nativeSceneReady.value ||
    props.disabled ||
    props.maskGeometryEditingDisabled ||
    !activeMaskTarget.value ||
    activeMaskTarget.value.locked ||
    (!props.regionalContext && !props.maskTarget?.visible) ||
    activeMaskTarget.value.mask.asset === null ||
    !maskImageReady.value,
)
const fitMaskDisabled = computed(
  () => Boolean(props.regionalContext) || maskGeometryDisabled.value || maskTransformActive.value,
)
const maskDisabled = computed(
  () =>
    !nativeSceneReady.value ||
    props.disabled ||
    props.maskEditingDisabled ||
    !activeMaskTarget.value ||
    activeMaskTarget.value.locked ||
    (!props.regionalContext && !props.maskTarget?.visible) ||
    (activeMaskTarget.value.mask.asset !== null && !maskImageReady.value),
)
const maskToolReason = computed(() => {
  if (props.maskEditingReason) {
    return props.maskEditingReason
  }
  if (props.disabled || props.maskEditingDisabled) {
    return 'Wait for Project settings to finish updating before editing the mask.'
  }
  if (activeMaskTarget.value?.locked) {
    return props.regionalContext
      ? 'Unlock this Regional Guidance layer before editing its mask.'
      : 'Unlock this Smart Patch before editing its mask.'
  }
  if (!props.regionalContext && props.maskTarget && !props.maskTarget.visible) {
    return 'Show this Smart Patch before editing its mask.'
  }
  if (activeMaskTarget.value?.mask.asset && !maskImageReady.value) {
    return maskDisplayError.value ?? 'Wait for the owned mask preview to load.'
  }
  if (activeMaskTarget.value?.mask.asset === null) {
    return 'Paint this mask before transforming it.'
  }
  return null
})
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
const resultTarget = ref('project-canvas')
const smartFocusedId = ref<string | null>(null)
const smartSelectedIds = ref<string[]>([])
const smartActionsDisabled = computed(
  () =>
    props.candidateActionsDisabled ||
    !props.smartPatchResults ||
    props.smartPatchResults.recoveryUnavailable ||
    props.smartPatchResults.documentId !== props.documentId ||
    props.smartPatchResults.documentRevision !== props.documentRevision,
)
const smartTargets = computed(() => props.smartPatchResults?.targets ?? [])
const smartTarget = computed(
  () =>
    smartTargets.value.find(
      (target) => smartPatchResultScope(target.documentId, target.layerId) === resultTarget.value,
    ) ?? null,
)
const smartCandidates = computed(() =>
  smartTarget.value
    ? (props.smartPatchResults?.candidates ?? []).filter(
        (candidate) =>
          candidate.documentId === smartTarget.value!.documentId &&
          candidate.layerId === smartTarget.value!.layerId,
      )
    : [],
)
const resultTargetOptions = computed(() => [
  { label: 'Project Canvas results', value: 'project-canvas' },
  ...smartTargets.value.map((target) => ({
    label: `${target.layerName ?? 'Missing Smart Patch'}${target.disposition === 'foreign-document' ? ' · different document' : ''}`,
    value: smartPatchResultScope(target.documentId, target.layerId),
  })),
])
const focusedSmartCandidate = computed(
  () =>
    smartCandidates.value.find((candidate) => candidate.candidateId === smartFocusedId.value) ??
    null,
)
const previewRasters = computed(() =>
  smartPatchPreviewRasters(
    props.entityLayers,
    smartTarget.value && previewVisible.value ? focusedSmartCandidate.value : null,
    props.documentId,
  ),
)
const localBboxPosition = ref<{ x: number; y: number } | null>(null)
const focusedCandidate = computed(() =>
  smartTarget.value
    ? focusedSmartCandidate.value
    : (props.generationResults.find(
        (candidate) => candidate.candidateId === focusedCandidateId.value,
      ) ?? null),
)
const zoomPercent = computed(() => Number((camera.value.scale * 100).toPrecision(3)))
const zoomOptions = computed(() =>
  [...new Set([25, 50, 75, 100, 125, 200, 400, zoomPercent.value])]
    .sort((left, right) => left - right)
    .map((value) => ({ label: `${value}%`, value })),
)
const failedLayerCount = computed(
  () => previewRasters.value.filter((layer) => failedImageUrls.value.has(layer.imageUrl)).length,
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
let maskTransformWorld: Konva.Group | null = null
let maskTransformShape: Konva.Rect | null = null
let maskTransformer: Konva.Transformer | null = null
let maskTransformGesture: ProjectMaskTransformGesture | null = null
let maskTransformPointerId: number | null = null
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
  const target = activeMaskTarget.value
  return target
    ? {
        documentId: props.documentId,
        documentRevision: props.documentRevision,
        kind: props.regionalContext ? 'regional-guidance' : 'smart-patch',
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

function updateMaskTransformDiagnostics() {
  if (!maskTransformGesture || !maskTransformShape || !maskTransformer) {
    maskTransformNode.value = null
    maskTransformHandles.value = null
    return
  }
  const shape = maskTransformShape
  maskTransformNode.value = JSON.stringify({
    height: shape.height(),
    rotationDegrees: shape.rotation(),
    scaleX: shape.scaleX(),
    scaleY: shape.scaleY(),
    width: shape.width(),
    x: shape.x(),
    y: shape.y(),
  })
  maskTransformHandles.value = JSON.stringify(
    Object.fromEntries(
      [...maskTransformer.enabledAnchors(), 'rotater'].map((name) => {
        const anchor = maskTransformer?.findOne<Konva.Rect>(`.${name}`)
        return [name, anchor?.getAbsolutePosition() ?? null]
      }),
    ),
  )
}

function hideMaskTransformControls() {
  maskTransformShape?.stopDrag()
  maskTransformer?.stopDrag()
  maskTransformer?.findOne<Konva.Shape>('.back')?.stopDrag()
  maskTransformer?.stopTransform()
  maskTransformShape?.draggable(false)
  maskTransformShape?.listening(false)
  maskTransformShape?.visible(false)
  maskTransformer?.nodes([])
  maskTransformer?.visible(false)
  updateMaskTransformDiagnostics()
  maskScene?.batchDraw()
}

function cancelMaskTransform() {
  const session = maskTransformGesture
  maskTransformGesture = null
  maskTransformActive.value = false
  maskTransformPointerId = null
  session?.cancel()
  hideMaskTransformControls()
  if (tool.value === 'transform-mask') {
    tool.value = 'pan'
  }
  renderMaskOverlay()
}

function startMaskTransform() {
  const owner = currentMaskOwner()
  const target = activeMaskTarget.value
  if (
    maskGeometryDisabled.value ||
    !owner ||
    !target?.mask.asset ||
    !maskTransformShape ||
    !maskTransformer
  ) {
    return
  }
  maskGestureError.value = null
  maskTransformGesture = new ProjectMaskTransformGesture(owner, target.mask.bounds)
  maskTransformActive.value = true
  maskTransformShape.setAttrs({
    draggable: true,
    height: target.mask.bounds.height,
    listening: true,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    width: target.mask.bounds.width,
    x: target.mask.bounds.x,
    y: target.mask.bounds.y,
  })
  maskTransformer.nodes([maskTransformShape])
  maskTransformer.visible(true)
  maskTransformer.forceUpdate()
  updateMaskTransformDiagnostics()
  renderMaskOverlay()
}

function updateMaskTransformPreview() {
  const session = maskTransformGesture
  const shape = maskTransformShape
  if (!session || !shape) {
    return
  }
  if (maskGeometryDisabled.value || !sameMaskGestureOwner(session.owner, currentMaskOwner())) {
    cancelMaskTransform()
    return
  }
  try {
    session.update({
      rotationDegrees: shape.rotation(),
      scaleX: shape.scaleX(),
      scaleY: shape.scaleY(),
      x: shape.x(),
      y: shape.y(),
    })
    maskGestureError.value = null
  } catch (cause) {
    maskGestureError.value =
      cause instanceof Error ? cause.message : 'The mask transform is invalid.'
    const previous = session.transform
    shape.setAttrs({
      rotation: previous.rotationDegrees,
      scaleX: previous.scaleX,
      scaleY: previous.scaleY,
      x: previous.x,
      y: previous.y,
    })
    maskTransformer?.forceUpdate()
  }
  maskTransformer?.forceUpdate()
  updateMaskTransformDiagnostics()
  renderMaskOverlay()
}

function finishMaskTransformInteraction() {
  updateMaskTransformPreview()
  const session = maskTransformGesture
  const shape = maskTransformShape
  if (!session || !shape) {
    return
  }
  const snapped = snapProjectMaskTransformToPixelGrid(session.transform, session.bounds)
  shape.setAttrs({
    rotation: snapped.rotationDegrees,
    scaleX: snapped.scaleX,
    scaleY: snapped.scaleY,
    x: snapped.x,
    y: snapped.y,
  })
  updateMaskTransformPreview()
}

function applyMaskTransform() {
  const session = maskTransformGesture
  if (!session || maskGeometryDisabled.value) {
    cancelMaskTransform()
    return
  }
  updateMaskTransformPreview()
  if (session !== maskTransformGesture) {
    return
  }
  const request = session.finish(currentMaskOwner())
  maskTransformGesture = null
  maskTransformActive.value = false
  maskTransformPointerId = null
  hideMaskTransformControls()
  tool.value = 'pan'
  renderMaskOverlay()
  host.value?.focus({ preventScroll: true })
  if (request) {
    publishMaskEdit(session.owner, request)
  }
}

function cancelMaskTransformAction() {
  cancelMaskTransform()
  host.value?.focus({ preventScroll: true })
}

function fitPatchBboxToMask() {
  const owner = currentMaskOwner()
  if (fitMaskDisabled.value || !owner || owner.kind === 'regional-guidance') {
    return
  }
  cancelMaskGesture()
  emit('editMask', owner.layerId, projectMaskFitRequest(owner))
}

function publishMaskEdit(
  owner: Readonly<MaskGestureOwner>,
  request: ProjectRegionalGuidanceMaskEditRequest,
) {
  if (!sameMaskGestureOwner(owner, currentMaskOwner())) {
    return
  }
  if (owner.kind === 'regional-guidance') {
    emit('editRegionalMask', owner.layerId, request)
  } else {
    emit('editMask', owner.layerId, request)
  }
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
    publishMaskEdit(session.owner, request)
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
  if (maskTransformPointerId === event.pointerId) {
    maskTransformPointerId = null
    updateMaskTransformPreview()
  }
  stopPan()
}

function handleCanvasPointerCancel() {
  cancelMaskGesture()
  cancelMaskTransform()
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
  if (maskTransformPointerId === event.pointerId) {
    cancelMaskTransform()
  }
}

function handleCanvasBlur(event: FocusEvent) {
  finishKeyboardBbox()
  cancelMaskGesture()
  if (!(
    event.relatedTarget instanceof Element && event.relatedTarget.closest('.mask-transform-actions')
  )) {
    cancelMaskTransform()
  }
  cursorPoint = null
  renderMaskOverlay()
}

function handleTransformActionFocusout(event: FocusEvent) {
  if (
    event.relatedTarget !== host.value &&
    !(
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest('.mask-transform-actions')
    )
  ) {
    cancelMaskTransform()
  }
}

function leaveMaskCanvas() {
  cursorPoint = null
  renderMaskOverlay()
}

function chooseTool(value: typeof tool.value) {
  if (props.regionalContext && value === 'bbox') {
    return
  }
  if (isMaskTool(value) && maskDisabled.value) {
    return
  }
  if (value === 'transform-mask' && maskGeometryDisabled.value) {
    return
  }
  if (tool.value !== value) {
    cancelMaskGesture()
    cancelMaskTransform()
  }
  finishKeyboardBbox()
  tool.value = value
  cursorPoint = null
  if (value === 'transform-mask' && !maskTransformGesture) {
    startMaskTransform()
    host.value?.focus({ preventScroll: true })
  }
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
  const target = activeMaskTarget.value
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
  const target = activeMaskTarget.value
  if (target?.mask.asset && maskImageReady.value && maskImage) {
    const bounds = target.mask.bounds
    const transform = maskTransformGesture?.transform
    if (transform && sameMaskGestureOwner(maskTransformGesture!.owner, currentMaskOwner())) {
      context.save()
      context.translate(transform.x, transform.y)
      context.rotate((transform.rotationDegrees * Math.PI) / 180)
      context.scale(transform.scaleX, transform.scaleY)
      context.drawImage(maskImage, 0, 0, bounds.width, bounds.height)
      context.restore()
    } else {
      context.drawImage(maskImage, bounds.x, bounds.y, bounds.width, bounds.height)
    }
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
  maskOverlay.opacity(props.regionalContext?.overlayOpacity ?? 0.32)
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
  if (next.x !== camera.value.x || next.y !== camera.value.y || next.scale !== camera.value.scale) {
    cancelMaskGesture()
    cancelMaskTransform()
  }
  camera.value = next
  world?.position({ x: next.x, y: next.y })
  world?.scale({ x: next.scale, y: next.scale })
  maskTransformWorld?.position({ x: next.x, y: next.y })
  maskTransformWorld?.scale({ x: next.scale, y: next.scale })
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
  if (maskTransformer) {
    maskTransformer.anchorSize(8 / next.scale)
    maskTransformer.anchorStrokeWidth(1 / next.scale)
    maskTransformer.borderStrokeWidth(1 / next.scale)
    maskTransformer.rotateAnchorOffset(24 / next.scale)
    maskTransformer.forceUpdate()
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
  return smartTarget.value || props.generationResults.length > 0
    ? (stagingHeight.value || 108) + 12
    : 0
}

function focusSmartCandidate(candidateId: string) {
  if (!smartCandidates.value.some((candidate) => candidate.candidateId === candidateId)) {
    return
  }
  smartFocusedId.value = candidateId
  previewVisible.value = true
  fitMode = false
  candidateFitMode = true
  fitFocusedCandidate()
}
function selectSmartCandidate(candidateId: string, selected: boolean) {
  if (
    smartActionsDisabled.value ||
    smartTarget.value?.disposition !== 'available' ||
    !smartCandidates.value.some((candidate) => candidate.candidateId === candidateId)
  ) {
    return
  }
  const ids = new Set(smartSelectedIds.value)
  if (selected) {
    ids.add(candidateId)
  } else {
    ids.delete(candidateId)
  }
  smartSelectedIds.value = smartCandidates.value
    .filter((candidate) => ids.has(candidate.candidateId))
    .map((candidate) => candidate.candidateId)
}
function selectAllSmartCandidates(selected: boolean) {
  if (!smartActionsDisabled.value && smartTarget.value?.disposition === 'available') {
    smartSelectedIds.value = selected
      ? smartCandidates.value.map(({ candidateId }) => candidateId)
      : []
  }
}
function acceptSmartCandidates() {
  const target = smartTarget.value
  if (
    target?.disposition === 'available' &&
    !smartActionsDisabled.value &&
    smartSelectedIds.value.length
  ) {
    emit('acceptSmartPatch', {
      candidateIds: [...smartSelectedIds.value],
      documentId: target.documentId,
      focusedCandidateId: smartFocusedId.value,
      layerId: target.layerId,
    })
  }
}
function exportSmartCandidate(candidate: ProjectSmartPatchResultView) {
  emit('exportSmartPatch', {
    candidateId: candidate.candidateId,
    documentId: candidate.documentId,
    layerId: candidate.layerId,
    stagingSessionId: candidate.stagingSessionId,
  })
}
function acceptSmartRasterCandidate(candidate: ProjectSmartPatchResultView) {
  if (
    smartActionsDisabled.value ||
    candidate.documentId !== props.documentId ||
    candidate.disposition !== 'orphaned' ||
    candidate.rasterConversionUnavailableReason !== null ||
    !smartCandidates.value.some(
      (current) =>
        current.candidateId === candidate.candidateId &&
        current.stagingSessionId === candidate.stagingSessionId &&
        current.imageUrl === candidate.imageUrl,
    )
  ) {
    return
  }
  emit('acceptSmartPatchRaster', {
    candidateIds: [candidate.candidateId],
    documentId: candidate.documentId,
    focusedCandidateId: candidate.candidateId,
    layerId: candidate.layerId,
  })
}
function discardCurrentSmartTarget() {
  const target = smartTarget.value
  if (target && !smartActionsDisabled.value) {
    emit('discardSmartPatch', { documentId: target.documentId, layerId: target.layerId })
  }
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
    if (
      tool.value === 'transform-mask' &&
      maskTransformGesture &&
      event.isPrimary &&
      event.button === 0
    ) {
      maskTransformPointerId = event.pointerId
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
  if (maskTransformGesture && (event.key === 'Enter' || event.key === 'Escape')) {
    event.preventDefault()
    if (event.key === 'Enter') {
      applyMaskTransform()
    } else {
      cancelMaskTransform()
    }
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
  if (props.regionalContext) {
    return
  }
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
  const activeUrls = new Set(previewRasters.value.map((layer) => layer.imageUrl))
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

function loadCandidateImage(
  candidate: Pick<ProjectGenerationResultView, 'imageUrl'>,
): HTMLImageElement | null {
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
  const activeUrls = new Set(
    [...props.generationResults, ...(props.smartPatchResults?.candidates ?? [])].map(
      (candidate) => candidate.imageUrl,
    ),
  )
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
  if (
    !('kind' in candidate) ||
    !smartPatchCandidateHasTarget(props.entityLayers, candidate, props.documentId)
  ) {
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
  }
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
  for (const layer of [...previewRasters.value].reverse()) {
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
  maskScene = new Konva.Layer()
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
  maskTransformWorld = new Konva.Group({ name: 'mask-transform-world' })
  maskTransformShape = new Konva.Rect({
    fill: 'transparent',
    listening: false,
    name: 'mask-transform-target',
    visible: false,
  })
  maskTransformer = new Konva.Transformer({
    anchorFill: token('--app-text'),
    anchorStroke: token('--app-chrome'),
    borderStroke: token('--app-tab-active-text'),
    boundBoxFunc: (oldBox, newBox) => {
      const scale = camera.value.scale
      return newBox.width / scale >= 1 &&
        newBox.height / scale >= 1 &&
        newBox.width / scale <= IGS_SAFETY_CEILINGS.rasterDimension &&
        newBox.height / scale <= IGS_SAFETY_CEILINGS.rasterDimension
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
    keepRatio: false,
    name: 'mask-transform-controls',
    rotateAnchorOffset: 24,
    rotationSnaps: [0, 90, 180, 270],
    rotationSnapTolerance: 5,
    shouldOverdrawWholeArea: true,
    visible: false,
  })
  maskTransformShape.on('dragmove transform', updateMaskTransformPreview)
  maskTransformShape.on('dragend transformend', finishMaskTransformInteraction)
  maskTransformWorld.add(maskTransformShape, maskTransformer)
  maskScene.add(maskOverlay, maskCursor, maskContour, maskTransformWorld)
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
  cancelMaskTransform()
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
watch(previewRasters, () => {
  renderRasters()
  releaseStaleImages()
})
watch(
  [smartTargets, () => props.maskTarget?.id],
  ([targets], previous) => {
    const preferred = targets.find(
      (target) => target.documentId === props.documentId && target.layerId === props.maskTarget?.id,
    )
    const ownerChanged = previous && previous[1] !== props.maskTarget?.id
    const preferredAppeared =
      preferred &&
      !previous?.[0]?.some(
        (target) =>
          target.documentId === preferred.documentId && target.layerId === preferred.layerId,
      )
    if (
      preferred &&
      (ownerChanged ||
        preferredAppeared ||
        (resultTarget.value === 'project-canvas' && !props.generationResults.length))
    ) {
      resultTarget.value = smartPatchResultScope(preferred.documentId, preferred.layerId)
    } else if (
      resultTarget.value !== 'project-canvas' &&
      !targets.some(
        (target) => smartPatchResultScope(target.documentId, target.layerId) === resultTarget.value,
      )
    ) {
      resultTarget.value = props.generationResults.length
        ? 'project-canvas'
        : targets[0]
          ? smartPatchResultScope(targets[0].documentId, targets[0].layerId)
          : 'project-canvas'
    }
  },
  { immediate: true },
)
watch(resultTarget, () => {
  smartSelectedIds.value = []
  if (!smartCandidates.value.some((candidate) => candidate.candidateId === smartFocusedId.value)) {
    smartFocusedId.value = smartCandidates.value[0]?.candidateId ?? null
  }
  previewVisible.value = true
})
watch(
  [smartCandidates, () => smartTarget.value?.disposition],
  ([candidates]) => {
    const ids = new Set(candidates.map(({ candidateId }) => candidateId))
    smartSelectedIds.value =
      smartTarget.value?.disposition === 'available'
        ? smartSelectedIds.value.filter((id) => ids.has(id))
        : []
    if (!smartFocusedId.value || !ids.has(smartFocusedId.value)) {
      smartFocusedId.value = candidates[0]?.candidateId ?? null
    }
    releaseStaleCandidateImages()
    renderCandidatePreview()
  },
  { immediate: true },
)
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
  [() => props.resultFocus, () => props.generationResults, () => props.smartPatchResults],
  ([request, candidates]) => {
    if (!request || request.revision <= resultFocusRevision.value) {
      return
    }
    if (request.targetKind === 'smart-patch') {
      const candidate = smartResultFocusCandidate(
        request,
        props.smartPatchResults?.candidates ?? [],
        { documentId: props.documentId, projectKey: props.projectKey },
      )
      if (!candidate) {
        return
      }
      resultTarget.value = smartPatchResultScope(candidate.documentId, candidate.layerId)
      focusSmartCandidate(candidate.candidateId)
      resultFocusRevision.value = request.revision
      emit('resultFocusHandled', request.revision)
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
    resultTarget.value = 'project-canvas'
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
watch([focusedCandidateId, smartFocusedId, resultTarget, previewVisible], renderCandidatePreview)
watch(
  () => props.regionalContext?.id,
  (regionId) => {
    if (!regionId) {
      return
    }
    // Selection changes cancel the old edit; choosing Pan would finish a pending bbox nudge.
    heldArrowKeys.clear()
    keyboardBboxDirty = false
    cancelMaskGesture()
    cancelMaskTransform()
    cursorPoint = null
    bboxShape?.stopDrag()
    bboxTransformer?.stopTransform()
    tool.value = 'pan'
    restoreBbox()
    updateBboxTool()
  },
  { flush: 'sync' },
)
watch(
  [
    () => props.projectKey,
    () => props.documentId,
    () => props.documentRevision,
    () => (props.regionalContext ? 'regional-guidance' : 'smart-patch'),
    () => activeMaskTarget.value?.id,
    () => activeMaskTarget.value?.mask.id,
    () => activeMaskTarget.value?.mask.revision,
    () => activeMaskTarget.value?.locked,
    () => (!props.regionalContext ? props.maskTarget?.visible : null),
  ],
  () => {
    cancelMaskGesture()
    cancelMaskTransform()
    cursorPoint = null
    maskGestureError.value = null
    if (!activeMaskTarget.value && isMaskTool(tool.value)) {
      chooseTool('pan')
    }
    renderMaskOverlay()
  },
  { flush: 'sync' },
)
watch(() => activeMaskTarget.value?.maskImageUrl, loadMaskImage, { flush: 'sync', immediate: true })
watch(maskDisabled, (disabled) => {
  if (disabled) {
    cancelMaskGesture()
  }
  renderMaskOverlay()
})
watch(maskGeometryDisabled, (disabled) => {
  if (disabled) {
    cancelMaskTransform()
  }
})
watch(
  [maskDiameter, maskOverlayVisible, () => props.regionalContext?.overlayOpacity],
  renderMaskOverlay,
)
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
            : tool === 'transform-mask'
              ? `Infinite project canvas. ${transformToolLabel} tool. Drag to move, use handles to scale or rotate. Enter applies the transform; Escape cancels.`
              : regionalContext
                ? 'Infinite project canvas. Use Pan or the selected Regional Guidance mask tools. Zoom with the wheel.'
                : 'Infinite project canvas. Use the Pan or Bounding Box tool. Zoom with the wheel.'
      "
      class="canvas-area"
      :class="{ 'canvas-area--pan': tool === 'pan', 'canvas-area--panning': panning }"
      :data-camera-scale="camera.scale"
      :data-camera-x="camera.x"
      :data-camera-y="camera.y"
      :data-mask-owner-id="activeMaskTarget?.id"
      :data-mask-owner-kind="
        regionalContext ? 'regional-guidance' : maskTarget ? 'smart-patch' : undefined
      "
      :data-mask-ready="nativeSceneReady && !maskDisabled"
      :data-mask-transform-active="maskTransformActive"
      :data-mask-transform-handles="maskTransformHandles"
      :data-mask-transform-node="maskTransformNode"
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
      <div class="canvas-top-overlays">
        <div class="canvas-context-bar">
          <NSelect
            v-if="smartTargets.length"
            v-model:value="resultTarget"
            aria-label="Generation results target"
            class="result-target-select"
            :options="resultTargetOptions"
            size="small"
            @pointerdown.stop
            @wheel.stop
          />
          <div class="bbox-readout">
            {{ bboxLabel ?? 'Generation area' }} · {{ bbox.width }} × {{ bbox.height }} · X
            {{ localBboxPosition?.x ?? bbox.x }} · Y {{ localBboxPosition?.y ?? bbox.y }}
          </div>
          <div
            v-if="maskTransformActive"
            aria-label="Mask transform actions"
            class="mask-transform-actions"
            role="toolbar"
            @focusout="handleTransformActionFocusout"
            @keydown.esc.prevent="cancelMaskTransformAction"
          >
            <NButton
              aria-label="Apply mask transform"
              :disabled="maskGeometryDisabled"
              secondary
              size="small"
              @click="applyMaskTransform"
            >
              <template v-slot:icon><NIcon :component="Check" :size="18" /></template>
              Apply
            </NButton>
            <NButton
              aria-label="Cancel mask transform"
              secondary
              size="small"
              @click="cancelMaskTransformAction"
            >
              <template v-slot:icon><NIcon :component="X" :size="18" /></template>
              Cancel
            </NButton>
          </div>
        </div>
        <div
          v-if="regionalContext && maskToolReason"
          :id="maskToolReasonId"
          class="regional-tool-help"
          role="status"
        >
          {{ maskToolReason }}
        </div>
        <div v-if="maskDisplayError || maskGestureError" class="mask-warning" role="alert">
          {{ maskDisplayError ?? maskGestureError }}
        </div>
        <div v-if="failedLayerCount" class="image-warning" role="status">
          {{ failedLayerCount }} layer {{ failedLayerCount === 1 ? 'image' : 'images' }} could not
          be displayed
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
          v-if="!regionalContext"
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
        <template v-if="activeMaskTarget">
          <NTooltip>
            <template v-slot:trigger>
              <NButton
                :aria-describedby="regionalContext && maskToolReason ? maskToolReasonId : undefined"
                :aria-label="transformToolLabel"
                :aria-pressed="tool === 'transform-mask'"
                circle
                :disabled="maskGeometryDisabled"
                quaternary
                size="small"
                :themeOverrides="tool === 'transform-mask' ? activeControlTheme : controlTheme"
                @click="chooseTool('transform-mask')"
              >
                <template v-slot:icon><NIcon :component="Shape" :size="18" /></template>
              </NButton>
            </template>
            {{ maskGeometryDisabled && maskToolReason ? maskToolReason : transformToolLabel }}
          </NTooltip>
          <NTooltip v-for="item of maskTools" :key="item.tool">
            <template v-slot:trigger>
              <NButton
                :aria-describedby="regionalContext && maskToolReason ? maskToolReasonId : undefined"
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
            {{ maskDisabled && maskToolReason ? maskToolReason : item.name }}
          </NTooltip>
          <NTooltip v-if="!regionalContext">
            <template v-slot:trigger>
              <NButton
                aria-label="Fit Patch BBox to Mask"
                circle
                :disabled="fitMaskDisabled"
                quaternary
                size="small"
                :themeOverrides="controlTheme"
                @click="fitPatchBboxToMask"
                @pointerdown.prevent
              >
                <template v-slot:icon><NIcon :component="BoxMargin" :size="18" /></template>
              </NButton>
            </template>
            Fit Patch BBox to Mask
          </NTooltip>
        </template>
      </div>
      <ProjectGenerationResultsTray
        v-if="!smartTarget && generationResults.length > 0"
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
      <ProjectSmartPatchResultsTray
        v-if="smartTarget"
        :busy="smartActionsDisabled"
        :candidates="smartCandidates"
        :focusedCandidateId="smartFocusedId"
        :loading="smartPatchResultsLoading"
        :previewVisible
        :selectedIds="smartSelectedIds"
        :target="smartTarget"
        @accept="acceptSmartCandidates"
        @acceptRaster="acceptSmartRasterCandidate"
        @discard="discardCurrentSmartTarget"
        @export="exportSmartCandidate"
        @focus="focusSmartCandidate"
        @refresh="emit('refreshSmartPatch')"
        @resize="stagingHeight = $event"
        @select="selectSmartCandidate"
        @selectAll="selectAllSmartCandidates"
        @togglePreview="previewVisible = !previewVisible"
      />
      <div
        v-if="!activeMaskTarget && layers.length === 0 && !(focusedCandidate && previewVisible)"
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
              : tool === 'transform-mask'
                ? 'Drag to move · Handles to scale/rotate · Enter applies · Escape cancels'
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
.mask-warning,
.regional-tool-help {
  max-width: 100%;
  min-width: 0;
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

.regional-tool-help {
  white-space: normal;
  overflow-wrap: anywhere;
}

.canvas-top-overlays {
  position: absolute;
  z-index: 2;
  top: 10px;
  right: 10px;
  left: 48px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
}
.canvas-context-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}
.result-target-select {
  width: min(240px, 100%);
  pointer-events: auto;
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

.mask-transform-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 5px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  pointer-events: auto;
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
