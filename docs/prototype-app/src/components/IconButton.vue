<script setup lang="ts">
import type { Component } from 'vue'

import { NBadge, NButton, NIcon, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    badge?: { dot?: boolean; value: number | string | undefined }
    compact?: boolean
    disabled?: boolean
    icon: Component
    label: string
    loading?: boolean
    preserveFocus?: boolean
    pressed?: boolean
    tooltip?: string
  }>(),
  { compact: false, disabled: false, loading: false, preserveFocus: false },
)

const emit = defineEmits<{ click: [] }>()

const buttonTheme = computed(() => ({
  heightSmall: props.compact ? '24px' : '32px',
  iconSizeSmall: '18px',
}))
const badgeVisible = computed(() => {
  const value = props.badge?.value
  return value !== undefined && value !== 0 && value !== ''
})

const hovered = ref(false)
const focused = ref(false)
const dismissed = ref(false)
const tooltipVisible = computed(
  () =>
    Boolean(props.tooltip ?? props.label) && (hovered.value || focused.value) && !dismissed.value,
)

watch(
  () => props.disabled,
  () => {
    focused.value = false
    dismissed.value = false
  },
)

function onPointerEnter() {
  hovered.value = true
  dismissed.value = false
}

function onPointerLeave() {
  hovered.value = false
  dismissed.value = false
}

function onFocusIn() {
  focused.value = true
  dismissed.value = false
}

function onFocusOut() {
  focused.value = false
  dismissed.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    dismissed.value = true
  }
  if (props.disabled && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
  }
}

function onClick() {
  emit('click')
}
</script>

<template>
  <NTooltip placement="bottom" :show="tooltipVisible" :showArrow="false" to="body" trigger="manual">
    <template v-slot:trigger>
      <span
        :aria-disabled="disabled || undefined"
        :aria-label="disabled ? label : undefined"
        class="icon-action"
        :role="disabled ? 'group' : undefined"
        :tabindex="disabled ? 0 : undefined"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
        @keydown="onKeydown"
        @mouseenter="onPointerEnter"
        @mouseleave="onPointerLeave"
      >
        <NBadge
          :dot="badge?.dot"
          :offset="[-2, 2]"
          :show="badgeVisible"
          type="success"
          :value="badge?.value"
        >
          <NButton
            :aria-busy="loading || undefined"
            :aria-label="label"
            :aria-pressed="pressed"
            circle
            :disabled
            :loading
            quaternary
            size="small"
            :themeOverrides="buttonTheme"
            :type="pressed ? 'primary' : 'default'"
            @click="onClick"
            @mousedown="preserveFocus && $event.preventDefault()"
          >
            <template v-slot:icon>
              <NIcon :component="icon" :size="18" />
            </template>
          </NButton>
        </NBadge>
      </span>
    </template>
    {{ tooltip ?? label }}
  </NTooltip>
</template>

<style scoped>
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  line-height: 1;
}

.icon-action:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  border-radius: 50%;
}
</style>
