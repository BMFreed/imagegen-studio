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
import { computed, ref } from 'vue'

import type { ProjectSession, ProjectTool } from './project.types'

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
const canvasStyle = computed(() => ({
  aspectRatio: `${props.session.document.canvas.width} / ${props.session.document.canvas.height}`,
  transform: `translate(${props.session.ui.viewport.offsetX}px, ${props.session.ui.viewport.offsetY}px) scale(${props.session.ui.viewport.scale})`,
}))
const zoomOptions = [25, 50, 62, 75, 100, 125].map((value) => ({
  label: `${value}%`,
  value: value / 100,
}))
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
function startPan(event: PointerEvent) {
  if (
    props.session.ui.activeTool !== 'pan' ||
    (event.target as Element).closest('button, input, .tool-rail')
  ) {
    return
  }
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
  props.session.ui.viewport = { offsetX: 0, offsetY: 0, scale: 0.62 }
}
function zoom(delta: number) {
  props.session.ui.viewport.scale = Math.min(
    1.5,
    Math.max(0.2, props.session.ui.viewport.scale + delta),
  )
}
</script>

<template>
  <section aria-label="Project canvas workspace" class="canvas-workspace">
    <div
      class="canvas-stage"
      tabindex="0"
      @click.self="editContextualSurface"
      @pointercancel="stopPan"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="stopPan"
    >
      <div class="canvas-size-label">
        Project Canvas {{ session.document.canvas.width }} × {{ session.document.canvas.height }}
      </div>
      <div class="left-rail tool-rail">
        <NTooltip>
          <template v-slot:trigger>
            <NButton
              :aria-expanded="!session.ui.leftCollapsed"
              circle
              quaternary
              size="small"
              @click="session.ui.leftCollapsed = !session.ui.leftCollapsed"
            >
              <NIcon :component="session.ui.leftCollapsed ? ChevronRight : ChevronLeft" />
            </NButton>
          </template>
          {{ session.ui.leftCollapsed ? 'Expand settings panel' : 'Collapse settings panel' }}
        </NTooltip>
        <NButton
          aria-label="Pan tool"
          circle
          quaternary
          size="small"
          :type="session.ui.activeTool === 'pan' ? 'primary' : 'default'"
          @click="setTool('pan')"
        >
          <NIcon :component="HandMove" />
        </NButton>
        <NButton
          aria-label="Crop or resize Project Canvas"
          circle
          quaternary
          size="small"
          :type="session.ui.activeTool === 'crop-canvas' ? 'primary' : 'default'"
          @click="setTool('crop-canvas')"
        >
          <NIcon :component="Crop" />
        </NButton>
        <template v-if="selectedPatch">
          <NButton
            aria-label="Transform Mask"
            circle
            quaternary
            size="small"
            @click="setTool('transform-mask')"
          >
            <NIcon :component="HandMove" />
          </NButton>
          <NButton aria-label="Lasso" circle quaternary size="small" @click="setTool('lasso')">
            <NIcon :component="Lasso" />
          </NButton>
          <NButton
            aria-label="Polygon Lasso"
            circle
            quaternary
            size="small"
            @click="setTool('polygon-lasso')"
          >
            <NIcon :component="Polygon" />
          </NButton>
          <NButton aria-label="Brush" circle quaternary size="small" @click="setTool('brush')">
            <NIcon :component="Brush" />
          </NButton>
          <NButton aria-label="Eraser" circle quaternary size="small" @click="setTool('eraser')">
            <NIcon :component="Eraser" />
          </NButton>
          <NButton
            aria-label="Bounding Box"
            circle
            quaternary
            size="small"
            @click="setTool('bbox')"
          >
            <NIcon :component="Box" />
          </NButton>
          <NButton
            aria-label="Fit Patch BBox to Mask"
            circle
            secondary
            size="small"
            type="primary"
            @click="fitPatch"
          >
            <NIcon :component="ArrowsMaximize" />
          </NButton>
        </template>
        <template v-else-if="selectedRegional">
          <NButton
            aria-label="Transform Region"
            circle
            quaternary
            size="small"
            @click="setTool('transform-region')"
          >
            <NIcon :component="HandMove" />
          </NButton>
          <NButton aria-label="Lasso" circle quaternary size="small" @click="setTool('lasso')">
            <NIcon :component="Lasso" />
          </NButton>
          <NButton
            aria-label="Polygon Lasso"
            circle
            quaternary
            size="small"
            @click="setTool('polygon-lasso')"
          >
            <NIcon :component="Polygon" />
          </NButton>
          <NButton aria-label="Brush" circle quaternary size="small" @click="setTool('brush')">
            <NIcon :component="Brush" />
          </NButton>
          <NButton aria-label="Eraser" circle quaternary size="small" @click="setTool('eraser')">
            <NIcon :component="Eraser" />
          </NButton>
        </template>
      </div>
      <div class="right-rail tool-rail">
        <NButton
          :aria-expanded="!session.ui.rightCollapsed"
          :aria-label="session.ui.rightCollapsed ? 'Expand layers panel' : 'Collapse layers panel'"
          circle
          quaternary
          size="small"
          @click="session.ui.rightCollapsed = !session.ui.rightCollapsed"
        >
          <NIcon :component="session.ui.rightCollapsed ? ChevronLeft : ChevronRight" />
        </NButton>
      </div>

      <div class="canvas-frame" :style="canvasStyle" @click="editContextualSurface">
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
      <ProjectQueuePanel
        :session
        @cancelCurrent="emit('cancelCurrent')"
        @cancelPending="emit('cancelPending')"
        @clear="emit('clearQueue')"
        @close="session.ui.queueOpen = false"
      />
    </div>

    <GenerationResultsTray
      :session
      @accept="emit('acceptCandidates')"
      @discard="emit('discardCandidates')"
    />

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
          @update:value="session.ui.viewport.scale = $event"
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
  background-color: #0b0b0f;
  background-image:
    linear-gradient(45deg, #ffffff08 25%, transparent 25%),
    linear-gradient(-45deg, #ffffff08 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ffffff08 75%),
    linear-gradient(-45deg, transparent 75%, #ffffff08 75%);
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
  width: min(54%, 560px);
  min-width: 270px;
  max-height: 82%;
  transform-origin: center;
  translate: -50% -50%;
  overflow: hidden;
  background: #070a0f;
  border: 1px solid color-mix(in srgb, var(--workspace-green) 72%, transparent);
  box-shadow: 0 18px 48px #0008;
}
.tool-rail {
  position: absolute;
  top: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-rail :deep(.n-button) {
  color: #111116;
  background: #a7a7ae;
}
.tool-rail :deep(.n-icon) {
  font-size: 18px;
}
.tool-rail :deep(.n-button:hover) {
  background: #bebec4;
}
.left-rail {
  left: 8px;
}
.right-rail {
  right: 8px;
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
</style>
