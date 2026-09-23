<script setup lang="ts">
import {
  ArrowBackUp,
  ArrowForwardUp,
  ArrowsMaximize,
  Box,
  Brush,
  ChevronLeft,
  ChevronRight,
  Crop,
  Eraser,
  HandMove,
  Lasso,
  Polygon,
  Refresh,
  ZoomIn,
  ZoomOut,
} from '@vicons/tabler'
import { NButton, NIcon, NSelect, NText, NTooltip } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ProjectSession, ProjectTool } from './project.types'

import { canvasControlButtonActiveTheme, canvasControlButtonTheme } from '../../theme/naive-theme'
import GenerationResultsTray from './GenerationResultsTray.vue'
import { commitProjectMutation } from './project-history'
import { getSelectedEntity } from './project.utils'
import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectQueuePanel from './ProjectQueuePanel.vue'

const props = defineProps<{ session: ProjectSession }>()
const emit = defineEmits<{
  acceptCandidates: []
  cancelCurrent: []
  cancelPending: []
  clearQueue: []
  discardCandidates: []
  redo: []
  undo: []
}>()

const dragging = ref(false)
const lastPoint = ref({ x: 0, y: 0 })
const selected = computed(() => getSelectedEntity(props.session))
const selectedPatch = computed(() =>
  selected.value && 'kind' in selected.value && selected.value.kind === 'smart-patch'
    ? selected.value
    : undefined,
)
const selectedRegional = computed(() =>
  selected.value && !('kind' in selected.value) ? selected.value : undefined,
)
const topArtwork = computed(() => {
  const candidate = props.session.staging?.candidates.find(
    (item) => item.id === props.session.staging?.focusedCandidateId && item.status === 'completed',
  )
  if (candidate && props.session.staging?.previewVisible) {
    return candidate.tone
  }
  const layer = [...props.session.document.layers].find(
    (item) => item.visible && (item.kind === 'raster' || item.activeVariantId),
  )
  if (layer?.kind === 'raster') {
    return layer.tone
  }
  if (layer?.kind === 'smart-patch') {
    return layer.variants.find((item) => item.id === layer.activeVariantId)?.tone ?? 'emerald'
  }
  return undefined
})
const stage = ref<HTMLElement | null>(null)
const stageSize = ref({ height: 0, width: 0 })
const observer = new ResizeObserver(([entry]) => {
  if (entry) {
    stageSize.value = { height: entry.contentRect.height, width: entry.contentRect.width }
  }
})
onMounted(() => {
  if (stage.value) {
    observer.observe(stage.value)
  }
})
onBeforeUnmount(() => observer.disconnect())
const stagingHeight = ref(0)
const stagingSpace = computed(() =>
  props.session.staging
    ? (stagingHeight.value || (props.session.staging.collapsed ? 34 : 110)) + 12
    : 0,
)
const regionOpacity = computed(() => (selectedRegional.value?.opacity ?? 50) / 100)
const canvasWidth = computed(() => `${props.session.document.canvas.width}px`)
const canvasHeight = computed(() => `${props.session.document.canvas.height}px`)
const canvasTransform = computed(
  () =>
    `translate(${props.session.ui.viewport.offsetX}px, ${props.session.ui.viewport.offsetY}px) scale(${props.session.ui.viewport.scale})`,
)
const zoomOptions = computed(() =>
  [...new Set([0.25, 0.5, 0.75, 1, 1.25, props.session.ui.viewport.scale])]
    .sort((a, b) => a - b)
    .map((value) => ({ label: `${Math.round(value * 100)}%`, value })),
)
const previewCandidate = computed(() =>
  props.session.staging?.previewVisible
    ? props.session.staging.candidates.find(
        (item) =>
          item.id === props.session.staging?.focusedCandidateId && item.status === 'completed',
      )
    : undefined,
)
watch(
  [
    stagingSpace,
    stageSize,
    () => props.session.document.canvas.width,
    () => props.session.document.canvas.height,
  ],
  () => {
    if (
      props.session.ui.viewport.fit !== false &&
      stageSize.value.width > 0 &&
      stageSize.value.height > 0
    ) {
      fitView()
    }
  },
)
function setZoom(scale: number) {
  props.session.ui.viewport.fit = false
  props.session.ui.viewport.scale = scale
}
const toolHints: Record<ProjectTool, string> = {
  bbox: 'Drag handles to resize · Shift keeps ratio',
  brush: 'Drag to edit mask · [ ] changes size',
  'crop-canvas': 'Drag canvas bounds · Enter applies · Esc cancels',
  eraser: 'Drag to erase mask',
  lasso: 'Draw a closed mask selection',
  pan: 'Drag to pan · Wheel to zoom',
  'polygon-lasso': 'Click points · Enter closes',
  'transform-mask': 'Drag mask to transform',
  'transform-region': 'Drag region to transform',
}
function setTool(tool: ProjectTool) {
  props.session.ui.activeTool = tool
}
function canvasToolTheme(tool: ProjectTool) {
  return props.session.ui.activeTool === tool
    ? canvasControlButtonActiveTheme
    : canvasControlButtonTheme
}
function startPan(event: PointerEvent) {
  if (
    props.session.ui.activeTool !== 'pan' ||
    (event.target as Element).closest('button, input, .tool-rail, .panel-toggle, .results-tray')
  ) {
    return
  }
  props.session.ui.viewport.fit = false
  dragging.value = true
  lastPoint.value = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function movePan(event: PointerEvent) {
  if (!dragging.value) {
    return
  }
  props.session.ui.viewport.offsetX += event.clientX - lastPoint.value.x
  props.session.ui.viewport.offsetY += event.clientY - lastPoint.value.y
  lastPoint.value = { x: event.clientX, y: event.clientY }
}
function stopPan() {
  dragging.value = false
}
function editContextualSurface() {
  if (props.session.ui.activeTool === 'pan') {
    return
  }
  const entity = selected.value
  if (entity && 'kind' in entity && entity.kind === 'smart-patch') {
    commitProjectMutation(props.session, 'Edit Smart Patch mask', () => {
      entity.maskRevision += 1
      entity.status = 'outdated'
    })
  } else if (entity && !('kind' in entity)) {
    commitProjectMutation(props.session, 'Edit regional guidance', () => {
      entity.regionRevision += 1
    })
  }
}
function fitPatch() {
  const patch = selectedPatch.value
  if (!patch) {
    return
  }
  const patchId = patch.id
  commitProjectMutation(props.session, 'Fit Patch BBox to Mask', (document) => {
    const target = document.layers.find((layer) => layer.id === patchId)
    if (target?.kind === 'smart-patch') {
      target.bbox = { height: 384, width: 448, x: 284, y: 296 }
      target.status = 'outdated'
    }
  })
}
function fitView() {
  const { height, width } = stageSize.value
  if (!width || !height) {
    return
  }
  const canvas = props.session.document.canvas
  const scale = Math.max(
    0.01,
    Math.min((width - 112) / canvas.width, (height - 76 - stagingSpace.value) / canvas.height, 1),
  )
  props.session.ui.viewport = { fit: true, offsetX: 0, offsetY: -stagingSpace.value / 2, scale }
}
function zoom(delta: number) {
  setZoom(Math.min(1.5, Math.max(0.05, props.session.ui.viewport.scale + delta)))
}
</script>

<template>
  <section aria-label="Project canvas workspace" class="canvas-workspace">
    <div
      ref="stage"
      class="canvas-stage"
      tabindex="0"
      @click.self="editContextualSurface"
      @pointercancel="stopPan"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="stopPan"
      @wheel.prevent="zoom($event.deltaY > 0 ? -0.05 : 0.05)"
    >
      <div class="canvas-size-label">
        Project Canvas {{ session.document.canvas.width }} × {{ session.document.canvas.height }}
      </div>
      <div v-if="previewCandidate" class="preview-label">
        Preview #{{ previewCandidate.imageIndex }} · Not added
      </div>
      <div v-else-if="!session.document.layers.length" class="canvas-empty">
        <strong>Your image starts here</strong>
        <span>Describe an image, then Generate. Choose the results you want to add as layers.</span>
      </div>
      <div class="left-rail tool-rail">
        <div class="tool-rail__panel-toggle">
          <NTooltip>
            <template v-slot:trigger>
              <NButton
                :aria-expanded="!session.ui.leftCollapsed"
                :aria-label="
                  session.ui.leftCollapsed ? 'Expand settings panel' : 'Collapse settings panel'
                "
                circle
                quaternary
                size="small"
                :themeOverrides="canvasControlButtonTheme"
                @click="session.ui.leftCollapsed = !session.ui.leftCollapsed"
              >
                <NIcon :component="session.ui.leftCollapsed ? ChevronRight : ChevronLeft" />
              </NButton>
            </template>
            {{ session.ui.leftCollapsed ? 'Expand settings panel' : 'Collapse settings panel' }}
          </NTooltip>
        </div>
        <NButton
          aria-label="Pan tool"
          :aria-pressed="session.ui.activeTool === 'pan'"
          circle
          quaternary
          size="small"
          :themeOverrides="canvasToolTheme('pan')"
          @click="setTool('pan')"
        >
          <NIcon :component="HandMove" />
        </NButton>
        <NButton
          aria-label="Crop or resize Project Canvas"
          :aria-pressed="session.ui.activeTool === 'crop-canvas'"
          circle
          quaternary
          size="small"
          :themeOverrides="canvasToolTheme('crop-canvas')"
          @click="setTool('crop-canvas')"
        >
          <NIcon :component="Crop" />
        </NButton>
        <template v-if="selectedPatch">
          <NButton
            aria-label="Transform Mask"
            :aria-pressed="session.ui.activeTool === 'transform-mask'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('transform-mask')"
            @click="setTool('transform-mask')"
          >
            <NIcon :component="HandMove" />
          </NButton>
          <NButton
            aria-label="Lasso"
            :aria-pressed="session.ui.activeTool === 'lasso'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('lasso')"
            @click="setTool('lasso')"
          >
            <NIcon :component="Lasso" />
          </NButton>
          <NButton
            aria-label="Polygon Lasso"
            :aria-pressed="session.ui.activeTool === 'polygon-lasso'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('polygon-lasso')"
            @click="setTool('polygon-lasso')"
          >
            <NIcon :component="Polygon" />
          </NButton>
          <NButton
            aria-label="Brush"
            :aria-pressed="session.ui.activeTool === 'brush'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('brush')"
            @click="setTool('brush')"
          >
            <NIcon :component="Brush" />
          </NButton>
          <NButton
            aria-label="Eraser"
            :aria-pressed="session.ui.activeTool === 'eraser'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('eraser')"
            @click="setTool('eraser')"
          >
            <NIcon :component="Eraser" />
          </NButton>
          <NButton
            aria-label="Bounding Box"
            :aria-pressed="session.ui.activeTool === 'bbox'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('bbox')"
            @click="setTool('bbox')"
          >
            <NIcon :component="Box" />
          </NButton>
          <NButton
            aria-label="Fit Patch BBox to Mask"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasControlButtonTheme"
            @click="fitPatch"
          >
            <NIcon :component="ArrowsMaximize" />
          </NButton>
        </template>
        <template v-else-if="selectedRegional">
          <NButton
            aria-label="Transform Region"
            :aria-pressed="session.ui.activeTool === 'transform-region'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('transform-region')"
            @click="setTool('transform-region')"
          >
            <NIcon :component="HandMove" />
          </NButton>
          <NButton
            aria-label="Lasso"
            :aria-pressed="session.ui.activeTool === 'lasso'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('lasso')"
            @click="setTool('lasso')"
          >
            <NIcon :component="Lasso" />
          </NButton>
          <NButton
            aria-label="Polygon Lasso"
            :aria-pressed="session.ui.activeTool === 'polygon-lasso'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('polygon-lasso')"
            @click="setTool('polygon-lasso')"
          >
            <NIcon :component="Polygon" />
          </NButton>
          <NButton
            aria-label="Brush"
            :aria-pressed="session.ui.activeTool === 'brush'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('brush')"
            @click="setTool('brush')"
          >
            <NIcon :component="Brush" />
          </NButton>
          <NButton
            aria-label="Eraser"
            :aria-pressed="session.ui.activeTool === 'eraser'"
            circle
            quaternary
            size="small"
            :themeOverrides="canvasToolTheme('eraser')"
            @click="setTool('eraser')"
          >
            <NIcon :component="Eraser" />
          </NButton>
        </template>
      </div>
      <div class="panel-toggle panel-toggle--right">
        <NButton
          :aria-expanded="!session.ui.rightCollapsed"
          :aria-label="session.ui.rightCollapsed ? 'Expand layers panel' : 'Collapse layers panel'"
          circle
          quaternary
          size="small"
          :themeOverrides="canvasControlButtonTheme"
          @click="session.ui.rightCollapsed = !session.ui.rightCollapsed"
        >
          <NIcon :component="session.ui.rightCollapsed ? ChevronLeft : ChevronRight" />
        </NButton>
      </div>

      <div class="canvas-frame" @click="editContextualSurface">
        <ProjectCanvasArtwork v-if="topArtwork" :tone="topArtwork" />
        <div v-if="selectedRegional" class="regional-overlay"><span>Regional Guidance</span></div>
        <div
          v-if="selectedPatch"
          class="mask-overlay"
          :style="{ opacity: String(0.18 + selectedPatch.maskRevision * 0.04) }"
        />
        <div
          v-if="selectedPatch"
          class="bbox-overlay"
          :class="{ 'bbox-overlay--active': session.ui.activeTool === 'bbox' }"
          :style="{
            left: `${(selectedPatch.bbox.x / session.document.canvas.width) * 100}%`,
            top: `${(selectedPatch.bbox.y / session.document.canvas.height) * 100}%`,
            width: `${(selectedPatch.bbox.width / session.document.canvas.width) * 100}%`,
            height: `${(selectedPatch.bbox.height / session.document.canvas.height) * 100}%`,
          }"
        >
          <i v-for="corner of 4" :key="corner" />
        </div>
        <div v-if="session.ui.activeTool === 'crop-canvas'" class="crop-overlay">
          <span>Resize Project Canvas</span>
        </div>
      </div>
      <GenerationResultsTray
        :session
        @accept="emit('acceptCandidates')"
        @discard="emit('discardCandidates')"
        @resize="stagingHeight = $event"
      />
      <ProjectQueuePanel
        :session
        @cancelCurrent="emit('cancelCurrent')"
        @cancelPending="emit('cancelPending')"
        @clear="emit('clearQueue')"
        @close="session.ui.queueOpen = false"
      />
    </div>

    <footer class="viewport-bar">
      <div class="viewport-group">
        <NButton
          aria-label="Undo"
          circle
          :disabled="session.history.past.length === 0"
          quaternary
          size="small"
          @click="emit('undo')"
        >
          <NIcon :component="ArrowBackUp" />
        </NButton>
        <NButton
          aria-label="Redo"
          circle
          :disabled="session.history.future.length === 0"
          quaternary
          size="small"
          @click="emit('redo')"
        >
          <NIcon :component="ArrowForwardUp" />
        </NButton>
      </div>
      <div class="viewport-group">
        <NButton aria-label="Zoom out" circle quaternary size="small" @click="zoom(-0.1)">
          <NIcon :component="ZoomOut" />
        </NButton>
        <NSelect
          aria-label="Zoom"
          class="zoom-select"
          :options="zoomOptions"
          size="small"
          :value="session.ui.viewport.scale"
          @update:value="setZoom"
        />
        <NButton aria-label="Zoom in" circle quaternary size="small" @click="zoom(0.1)">
          <NIcon :component="ZoomIn" />
        </NButton>
        <NButton aria-label="Fit View" circle quaternary size="small" @click="fitView">
          <NIcon :component="Refresh" />
        </NButton>
      </div>
      <NText class="tool-hint" depth="3">{{ toolHints[session.ui.activeTool] }}</NText>
    </footer>
  </section>
</template>

<style scoped>
.panel-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: var(--z-floating-control);
}
.panel-toggle--right {
  right: 8px;
}
.canvas-workspace {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--app-chrome);
}
.canvas-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  outline: none;
  background-color: var(--canvas-background);
  background-image:
    linear-gradient(45deg, var(--canvas-checker) 25%, transparent 25%),
    linear-gradient(-45deg, var(--canvas-checker) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--canvas-checker) 75%),
    linear-gradient(-45deg, transparent 75%, var(--canvas-checker) 75%);
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0;
  background-size: 24px 24px;
}
.canvas-size-label {
  position: absolute;
  top: 12px;
  left: 56px;
  z-index: 4;
  padding: 4px 7px;
  color: var(--app-text-muted);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  font-size: 12px;
}
.canvas-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  width: v-bind(canvasWidth);
  height: v-bind(canvasHeight);
  transform: v-bind(canvasTransform);
  transform-origin: center;
  translate: -50% -50%;
  overflow: hidden;
  background: #070a0f;
  outline: 1px solid var(--app-border);
}
.tool-rail {
  position: absolute;
  top: 50%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: calc(100% - 24px);
  overflow-y: auto;
  scrollbar-width: none;
  transform: translateY(-50%);
}
.tool-rail::-webkit-scrollbar {
  display: none;
}
.tool-rail__panel-toggle {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}
.tool-rail :deep(.n-icon) {
  font-size: 18px;
}
.left-rail {
  left: 8px;
}
.mask-overlay {
  position: absolute;
  inset: 20% 15% 24% 42%;
  background: #64e36e;
  border-radius: 48% 34% 55% 30%;
  mix-blend-mode: screen;
}
.bbox-overlay {
  position: absolute;
  border: 1px dashed #fff;
  box-shadow: 0 0 0 1px #111;
}
.bbox-overlay--active {
  border-color: var(--workspace-green);
}
.bbox-overlay i {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1px solid #111;
}
.bbox-overlay i:nth-child(1) {
  top: -4px;
  left: -4px;
}
.bbox-overlay i:nth-child(2) {
  top: -4px;
  right: -4px;
}
.bbox-overlay i:nth-child(3) {
  bottom: -4px;
  left: -4px;
}
.bbox-overlay i:nth-child(4) {
  right: -4px;
  bottom: -4px;
}
.regional-overlay {
  opacity: v-bind(regionOpacity);
  position: absolute;
  inset: 18% 12% 36% 38%;
  display: grid;
  place-items: center;
  color: #dacbff;
  background: #b58cff2b;
  border: 1px dashed #b58cff;
  border-radius: 45% 38% 52% 28%;
  font-size: 11px;
}
.crop-overlay {
  position: absolute;
  inset: 5%;
  display: grid;
  place-items: center;
  color: white;
  border: 1px dashed var(--workspace-green);
  background: #0002;
}
.viewport-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 31px;
  padding: 2px 7px;
  background: var(--app-elevated);
  border-top: 1px solid var(--app-border);
}
.viewport-group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.zoom-select {
  width: 88px;
}
.tool-hint {
  margin-left: auto;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-label {
  position: absolute;
  top: 46px;
  left: 56px;
  z-index: 4;
  padding: 4px 7px;
  font-size: 12px;
  color: var(--workspace-green);
  background: var(--app-surface);
}
.canvas-empty {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 64px;
  pointer-events: none;
}
.canvas-empty span {
  max-width: 280px;
  color: var(--app-text-muted);
}
</style>
