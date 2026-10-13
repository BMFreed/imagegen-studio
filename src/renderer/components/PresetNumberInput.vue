<script setup lang="ts">
import { NInputNumber, useThemeVars } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { presetNumericInputValid } from './preset-editor.js'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    integer?: boolean
    label: string
    max?: number
    min?: number
    precision?: number
    showButton?: boolean
    step?: number
  }>(),
  { disabled: false, integer: false, showButton: true, step: 1 },
)
const value = defineModel<number | null>({ required: true })
const emit = defineEmits<{ validity: [valid: boolean] }>()
const host = ref<HTMLElement | null>(null)
const theme = useThemeVars()
const valid = ref(true)
const raw = ref<string | null>(null)
const focused = ref(false)
const widgetValue = computed({
  get: () => value.value,
  set: (next: number | null) => {
    // Blur may try to clamp or restore a rejected raw value; preserve the draft instead.
    if (raw.value !== null && raw.value.trim() !== '' && !rawValid(raw.value)) {
      return
    }
    if (raw.value !== null && rawValid(raw.value) && Number(raw.value) !== next) {
      raw.value = null
    }
    value.value = next
  },
})
let revision = 0
let disposed = false

function inspect(text: string) {
  valid.value = presetNumericInputValid(text, value.value, props)
  emit('validity', valid.value)
}
function rawValid(text: string) {
  return presetNumericInputValid(text, Number(text), props)
}
function format(next: number | null) {
  return raw.value !== null && (focused.value || !valid.value)
    ? raw.value
    : next === null
      ? ''
      : String(next)
}
async function settle() {
  const current = ++revision
  await nextTick()
  if (disposed || current !== revision) {
    return
  }
  const input = host.value?.querySelector('input')
  if (input) {
    inspect(raw.value !== null && !valid.value ? raw.value : input.value)
  }
}
function onInput(event: Event) {
  if (props.disabled) {
    return
  }
  if (event.target instanceof HTMLInputElement) {
    // Read after Naive updates its displayed draft; formatting can retain the old model number.
    raw.value = event.target.value
    if (raw.value.trim() === '') {
      value.value = null
    } else if (rawValid(raw.value)) {
      value.value = Number(raw.value)
    }
    inspect(raw.value)
    void settle()
  }
}
function onFocus() {
  focused.value = true
}
function onBlur() {
  focused.value = false
  if (valid.value) {
    raw.value = null
  }
  void settle()
}
watch(
  () => [value.value, props.integer, props.min, props.max, props.precision],
  () => void settle(),
  { flush: 'post' },
)
onMounted(() => void settle())
onBeforeUnmount(() => {
  disposed = true
  revision += 1
})
</script>

<template>
  <div
    ref="host"
    class="preset-number-input"
    @blur.capture="onBlur"
    @focus.capture="onFocus"
    @input="onInput"
  >
    <NInputNumber
      v-model:value="widgetValue"
      :disabled
      :format
      :inputProps="{ 'aria-label': label }"
      :max
      :min
      :precision
      :showButton
      :status="valid ? undefined : 'error'"
      :step
    />
    <p v-if="!valid" class="number-error" role="alert">
      {{ integer ? 'Enter a whole number' : 'Enter a finite number' }}
      {{
        min !== undefined && max !== undefined
          ? `between ${min} and ${max}.`
          : min !== undefined
            ? `of at least ${min}.`
            : max !== undefined
              ? `of at most ${max}.`
              : '.'
      }}
    </p>
  </div>
</template>

<style scoped>
.preset-number-input {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.number-error {
  margin: 0;
  color: v-bind('theme.errorColor');
  font-size: var(--app-font-size-meta);
}
</style>
