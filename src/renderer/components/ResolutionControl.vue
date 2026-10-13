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
    heightFormat?: (value: number | null) => string
    heightLabel?: string
    layout?: 'expanded-preview' | 'regular'
    max: number
    min?: number
    step?: number
    swapLabel?: string
    widthFormat?: (value: number | null) => string
    widthLabel?: string
  }>(),
  {
    disabled: false,
    heightLabel: 'Height',
    layout: 'regular',
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
const emit = defineEmits<{ commit: [] }>()
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
// The same intrinsic SVG frame is used by both layouts; only its placement changes.
const previewFrame = { height: 132, innerHeight: 104, innerWidth: 168, width: 200 }
const previewWidth = computed(() =>
  Math.max(1, Math.min(previewFrame.innerWidth, previewFrame.innerHeight * currentRatio.value)),
)
const previewHeight = computed(() => previewWidth.value / currentRatio.value)

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
  emit('commit')
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
  emit('commit')
}
</script>

<template>
  <div
    class="resolution-control"
    :class="{ 'resolution-control--expanded-preview': layout === 'expanded-preview' }"
  >
    <div class="resolution-fields">
      <div class="resolution-field">
        <span :id="`${id}-aspect`">Aspect ratio</span>
        <div class="aspect-ratio-row">
          <NSelect
            aria-label="Aspect ratio"
            :aria-labelledby="`${id}-aspect`"
            :disabled
            :options="aspectRatioOptions"
            size="small"
            :value="aspect.id"
            @update:value="selectRatio"
          />
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
        </div>
      </div>
      <div class="dimension-fields">
        <div class="resolution-field">
          <label :for="`${id}-width`">Width</label>
          <NInputNumber
            :disabled
            :format="widthFormat"
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
        <div class="dimension-swap">
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
        </div>
        <div class="resolution-field">
          <label :for="`${id}-height`">Height</label>
          <NInputNumber
            :disabled
            :format="heightFormat"
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
      <svg
        aria-label="Aspect ratio preview"
        class="aspect-preview"
        :height="previewFrame.height"
        role="img"
        :viewBox="`0 0 ${previewFrame.width} ${previewFrame.height}`"
        :width="previewFrame.width"
      >
        <title>
          {{ validSize ? `${size.width} × ${size.height}` : 'Enter a width and height' }}
        </title>
        <rect
          v-if="validSize"
          :fill="theme.primaryColor"
          :height="previewHeight"
          :stroke="theme.primaryColor"
          :width="previewWidth"
          :x="(previewFrame.width - previewWidth) / 2"
          :y="(previewFrame.height - previewHeight) / 2"
        />
      </svg>
      <div v-if="$slots['actions']" class="preview-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.resolution-control {
  display: grid;
  grid-template-areas: 'fields preview';
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 12px;
  min-width: 0;
}
.resolution-fields {
  grid-area: fields;
  display: grid;
  gap: 9px;
  min-width: 0;
}
.resolution-field {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta, 12px);
}
.aspect-ratio-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.aspect-ratio-row :deep(.n-select) {
  min-width: 0;
}
.dimension-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr);
  align-items: end;
  gap: 8px;
}
.dimension-swap {
  display: grid;
  place-items: center;
  height: 28px;
}
.dimension-fields .resolution-field {
  min-width: 0;
}
.preview-column {
  grid-area: preview;
  position: relative;
  justify-self: center;
  min-width: 0;
}
.aspect-preview {
  display: block;
  box-sizing: border-box;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.aspect-preview rect {
  fill-opacity: 0.12;
  stroke-opacity: 0.7;
}
.preview-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
}
.resolution-control--expanded-preview {
  grid-template-areas:
    'preview'
    'fields';
  grid-template-columns: minmax(0, 1fr);
  gap: 13px;
}
</style>
