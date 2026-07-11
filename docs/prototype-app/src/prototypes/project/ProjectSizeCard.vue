<script setup lang="ts">
import { ArrowsLeftRight, AspectRatio, Lock, LockOpen } from '@vicons/tabler'
import { NButton, NCard, NIcon, NInputNumber, NSelect, NTooltip } from 'naive-ui'

import type { ProjectAspectRatioId, ProjectSession } from './project.types'

import {
  aspectRatioOptions,
  constrainedDimension,
  PROJECT_CANVAS_MAX,
  PROJECT_CANVAS_MIN,
  ratioValue,
  sizeForRatio,
  swapAspectRatio,
} from './project-aspect-ratio'
import { commitProjectMutation } from './project-history'
import ProjectAspectRatioPreview from './ProjectAspectRatioPreview.vue'

const props = defineProps<{ session: ProjectSession }>()

function syncSize() {
  props.session.document.generationDraft.payload.size = { ...props.session.document.canvas }
}

function selectRatio(id: ProjectAspectRatioId) {
  const state = props.session.ui.aspectRatio
  if (id === 'free') {
    state.id = 'free'
    state.locked = false
    state.value = props.session.document.canvas.width / props.session.document.canvas.height
    return
  }
  const nextRatio = ratioValue(id, state.value)
  const area = props.session.document.canvas.width * props.session.document.canvas.height
  commitProjectMutation(props.session, `Set aspect ratio ${id}`, (document) => {
    document.canvas = sizeForRatio(nextRatio, area)
    syncSize()
  })
  state.id = id
  state.locked = true
  state.value = nextRatio
}

function toggleLock() {
  const state = props.session.ui.aspectRatio
  state.locked = !state.locked
  state.value = props.session.document.canvas.width / props.session.document.canvas.height
}

function updateDimension(key: 'height' | 'width', raw: number | null) {
  if (raw === null) {
    return
  }
  const value = constrainedDimension(raw)
  const state = props.session.ui.aspectRatio
  commitProjectMutation(props.session, 'Resize Project Canvas', (document) => {
    document.canvas[key] = value
    if (state.locked) {
      if (key === 'width') {
        document.canvas.height = constrainedDimension(value / state.value)
      } else {
        document.canvas.width = constrainedDimension(value * state.value)
      }
    } else {
      state.id = 'free'
      state.value = document.canvas.width / document.canvas.height
    }
    syncSize()
  })
}

function swap() {
  commitProjectMutation(props.session, 'Swap canvas dimensions', (document) => {
    ;[document.canvas.width, document.canvas.height] = [
      document.canvas.height,
      document.canvas.width,
    ]
    syncSize()
  })
  swapAspectRatio(props.session.ui.aspectRatio)
}

function fitToLayers() {
  const hasVisible = props.session.document.layers.some((layer) => layer.visible)
  const next = hasVisible ? { height: 1184, width: 888 } : { height: 1024, width: 1024 }
  commitProjectMutation(props.session, 'Fit canvas to visible layers', (document) => {
    document.canvas = next
    syncSize()
  })
  props.session.ui.aspectRatio = { id: 'free', locked: false, value: next.width / next.height }
}
</script>

<template>
  <NCard size="small" title="Size">
    <div class="size-layout">
      <div class="size-controls">
        <label>
          Aspect
          <NSelect
            aria-label="Aspect ratio"
            :options="aspectRatioOptions"
            size="small"
            :value="session.ui.aspectRatio.id"
            @update:value="selectRatio"
          />
        </label>
        <div class="dimension-grid">
          <label>
            Width
            <NInputNumber
              aria-label="Canvas width"
              :max="PROJECT_CANVAS_MAX"
              :min="PROJECT_CANVAS_MIN"
              size="small"
              :step="8"
              :value="session.document.canvas.width"
              @update:value="updateDimension('width', $event)"
            />
          </label>
          <label>
            Height
            <NInputNumber
              aria-label="Canvas height"
              :max="PROJECT_CANVAS_MAX"
              :min="PROJECT_CANVAS_MIN"
              size="small"
              :step="8"
              :value="session.document.canvas.height"
              @update:value="updateDimension('height', $event)"
            />
          </label>
        </div>
      </div>
      <div class="preview-column">
        <ProjectAspectRatioPreview
          :height="session.document.canvas.height"
          :width="session.document.canvas.width"
        />
        <div class="preview-actions">
          <NTooltip>
            <template v-slot:trigger>
              <NButton
                :aria-label="
                  session.ui.aspectRatio.locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'
                "
                circle
                quaternary
                size="tiny"
                @click="toggleLock"
              >
                <template v-slot:icon>
                  <NIcon :component="session.ui.aspectRatio.locked ? Lock : LockOpen" />
                </template>
              </NButton>
            </template>
            {{
              session.ui.aspectRatio.locked ? 'Unlock aspect ratio' : 'Lock current aspect ratio'
            }}
          </NTooltip>
          <NTooltip>
            <template v-slot:trigger>
              <NButton
                aria-label="Swap canvas dimensions"
                circle
                quaternary
                size="tiny"
                @click="swap"
              >
                <template v-slot:icon><NIcon :component="ArrowsLeftRight" /></template>
              </NButton>
            </template>
            Swap width and height
          </NTooltip>
          <NTooltip>
            <template v-slot:trigger>
              <NButton
                aria-label="Fit canvas to visible layers"
                circle
                quaternary
                size="tiny"
                @click="fitToLayers"
              >
                <template v-slot:icon><NIcon :component="AspectRatio" /></template>
              </NButton>
            </template>
            Fit canvas to visible layers
          </NTooltip>
        </div>
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.size-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
}
.size-controls,
.size-controls label {
  display: grid;
  gap: 5px;
}
.size-controls label {
  color: var(--app-text-muted);
  font-size: 11px;
}
.dimension-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.preview-column {
  display: grid;
  justify-items: center;
  gap: 3px;
}
.preview-actions {
  display: flex;
  gap: 1px;
}
</style>
