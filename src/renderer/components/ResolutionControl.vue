<script setup lang="ts">
import { ArrowsLeftRight, Lock, LockOpen } from '@vicons/tabler'
import { NButton, NIcon, NInputNumber, NSelect, NTooltip, useThemeVars } from 'naive-ui'
import { computed, useId, watch } from 'vue'

import type { AspectRatioId, AspectRatioState, ResolutionSize } from './resolution-control'

import {
  aspectRatioOptions,
  inverseRatio,
  ratioValue,
  resizeDimension,
  sizeForAspectRatio,
} from './resolution-control'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    heightLabel?: string
    max: number
    min?: number
    step?: number
    swapLabel?: string
    widthLabel?: string
  }>(),
  {
    disabled: false,
    heightLabel: 'Height',
    min: 1,
    step: 8,
    swapLabel: 'Swap width and height',
    widthLabel: 'Width',
  },
)
const size = defineModel<ResolutionSize>({ required: true })
const aspect = defineModel<AspectRatioState>('aspectRatio', {
  default: () => ({ id: 'free', locked: false, value: 1 }),
})
const id = useId()
const theme = useThemeVars()
const limits = computed(() => ({ max: props.max, min: props.min, step: props.step }))
const validSize = computed(
  () =>
    size.value.width !== null &&
    size.value.height !== null &&
    size.value.width > 0 &&
    size.value.height > 0,
)
const currentRatio = computed(() => (validSize.value ? size.value.width! / size.value.height! : 1))
// SVG geometry keeps the preview proportional without inline CSS or dependency on a theme palette.
const previewWidth = computed(() => Math.max(1, Math.min(56, 44 * currentRatio.value)))
const previewHeight = computed(() => Math.max(1, Math.min(44, 56 / currentRatio.value)))

watch(currentRatio, (ratio) => {
  if (!validSize.value) {
    return
  }
  if (!aspect.value.locked) {
    aspect.value = { id: 'free', locked: false, value: ratio }
  } else if (
    Math.abs(size.value.width! - size.value.height! * aspect.value.value) >
    props.step * Math.max(1, aspect.value.value)
  ) {
    // An external bbox edit or Fit action owns the new size; do not resize it back.
    aspect.value = { id: 'free', locked: false, value: ratio }
  }
})

function selectRatio(value: AspectRatioId) {
  if (props.disabled) {
    return
  }
  if (value === 'free') {
    aspect.value = { id: value, locked: false, value: currentRatio.value }
    return
  }
  const ratio = ratioValue(value, currentRatio.value)
  aspect.value = { id: value, locked: true, value: ratio }
  const area = validSize.value ? size.value.width! * size.value.height! : 1024 * 1024
  size.value = sizeForAspectRatio(ratio, area, limits.value)
}

function updateDimension(key: 'height' | 'width', value: number | null) {
  if (props.disabled || (value !== null && !Number.isFinite(value))) {
    return
  }
  size.value = resizeDimension(size.value, key, value, aspect.value, limits.value)
}

function toggleLock() {
  if (props.disabled || !validSize.value) {
    return
  }
  aspect.value = { ...aspect.value, locked: !aspect.value.locked, value: currentRatio.value }
}

function swap() {
  if (props.disabled || !validSize.value) {
    return
  }
  aspect.value = {
    ...aspect.value,
    id: inverseRatio(aspect.value.id),
    value: 1 / aspect.value.value,
  }
  size.value = { height: size.value.width, width: size.value.height }
}
</script>

<template>
  <div class="resolution-control">
    <div class="resolution-fields">
      <div class="resolution-field">
        <span :id="`${id}-aspect`">Aspect ratio</span>
        <NSelect
          aria-label="Aspect ratio"
          :aria-labelledby="`${id}-aspect`"
          :disabled
          :options="aspectRatioOptions"
          size="small"
          :value="aspect.id"
          @update:value="selectRatio"
        />
      </div>
      <div class="dimension-fields">
        <div class="resolution-field">
          <label :for="`${id}-width`">Width</label>
          <NInputNumber
            :disabled
            :inputProps="{ 'aria-label': widthLabel, id: `${id}-width` }"
            :max
            :min
            :showButton="false"
            size="small"
            :step
            :value="size.width"
            @update:value="updateDimension('width', $event)"
          />
        </div>
        <div class="resolution-field">
          <label :for="`${id}-height`">Height</label>
          <NInputNumber
            :disabled
            :inputProps="{ 'aria-label': heightLabel, id: `${id}-height` }"
            :max
            :min
            :showButton="false"
            size="small"
            :step
            :value="size.height"
            @update:value="updateDimension('height', $event)"
          />
        </div>
      </div>
    </div>
    <div class="preview-column">
      <svg aria-label="Aspect ratio preview" class="aspect-preview" role="img" viewBox="0 0 72 60">
        <title>
          {{ validSize ? `${size.width} × ${size.height}` : 'Enter a width and height' }}
        </title>
        <rect
          v-if="validSize"
          :fill="theme.primaryColor"
          :height="previewHeight"
          :stroke="theme.primaryColor"
          :width="previewWidth"
          :x="(72 - previewWidth) / 2"
          :y="(60 - previewHeight) / 2"
        />
      </svg>
      <div class="preview-actions">
        <NTooltip>
          <template v-slot:trigger>
            <NButton
              :aria-label="aspect.locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
              :aria-pressed="aspect.locked"
              circle
              :disabled="disabled || !validSize"
              quaternary
              size="tiny"
              @click="toggleLock"
            >
              <template v-slot:icon>
                <NIcon :component="aspect.locked ? Lock : LockOpen" :size="16" />
              </template>
            </NButton>
          </template>
          {{ aspect.locked ? 'Unlock aspect ratio' : 'Lock current aspect ratio' }}
        </NTooltip>
        <NTooltip>
          <template v-slot:trigger>
            <NButton
              :aria-label="swapLabel"
              circle
              :disabled="disabled || !validSize"
              quaternary
              size="tiny"
              @click="swap"
            >
              <template v-slot:icon><NIcon :component="ArrowsLeftRight" :size="16" /></template>
            </NButton>
          </template>
          Swap width and height
        </NTooltip>
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.resolution-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  min-width: 0;
}
.resolution-fields {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.resolution-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta, 12px);
}
.dimension-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.preview-column {
  display: grid;
  justify-items: center;
  gap: 4px;
}
.aspect-preview {
  display: block;
  width: 72px;
  height: 60px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.aspect-preview rect {
  fill-opacity: 0.12;
  stroke-opacity: 0.7;
}
.preview-actions {
  display: flex;
  gap: 2px;
}
</style>
