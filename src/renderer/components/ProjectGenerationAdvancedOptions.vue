<script setup lang="ts">
import { RotateClockwise as ResetIcon } from '@vicons/tabler'
import { NCollapse, NCollapseItem, NInput } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import LabeledControl from '../../../docs/prototype-app/src/components/LabeledControl.vue'
import {
  cfgRescaleControlState,
  cfgRescaleDisplayValue,
  cfgRescaleEditingValid,
  parseCfgRescaleInput,
} from './cfg-rescale-control.js'

const props = defineProps<{
  editingDisabled: boolean
  modelFamily: string | null
  runtimeSupported: boolean | null
  runtimeUnavailableReason: string | null
}>()
const cfgRescale = defineModel<number | null>({ required: true })
const emit = defineEmits<{ validity: [valid: boolean] }>()
const text = ref('')
const focused = ref(false)
const edited = ref(false)
const state = computed(() => cfgRescaleControlState(props))
const invalid = computed(() => parseCfgRescaleInput(text.value).kind === 'invalid')
watch(
  () => cfgRescaleEditingValid(text.value, edited.value),
  (value) => emit('validity', value),
  { immediate: true },
)
watch(
  () => [cfgRescale.value, props.modelFamily] as const,
  () => {
    if (!focused.value && cfgRescaleEditingValid(text.value, edited.value)) {
      text.value = cfgRescaleDisplayValue(cfgRescale.value, props.modelFamily)
      edited.value = false
    }
  },
  { immediate: true },
)

function updateText(value: string) {
  text.value = value
  edited.value = true
  const parsed = parseCfgRescaleInput(value)
  if (state.value.disabled || parsed.kind === 'invalid') {
    return
  }
  cfgRescale.value = parsed.value
}

function normalizeOnBlur() {
  focused.value = false
  if (!invalid.value) {
    text.value = cfgRescaleDisplayValue(cfgRescale.value, props.modelFamily)
    edited.value = false
  }
}

function reset() {
  if (props.editingDisabled) {
    return
  }
  cfgRescale.value = null
  text.value = cfgRescaleDisplayValue(null, props.modelFamily)
  edited.value = false
}
</script>

<template>
  <NCollapse class="advanced-options">
    <NCollapseItem name="advanced" title="Advanced Options">
      <div class="rescale-field">
        <LabeledControl label="CFG Rescale">
          <template v-slot="{ controlId }">
            <NInput
              class="rescale-input"
              :disabled="state.disabled"
              :inputProps="{ id: controlId, 'aria-label': 'CFG Rescale', inputmode: 'decimal' }"
              placeholder="0"
              size="small"
              :status="invalid ? 'error' : undefined"
              :value="text"
              @blur="normalizeOnBlur"
              @focus="focused = true"
              @update:value="updateText"
            />
          </template>
        </LabeledControl>
        <IconButton
          v-if="cfgRescale !== null || invalid"
          compact
          :disabled="editingDisabled"
          :icon="ResetIcon"
          label="Reset CFG Rescale"
          @click="reset"
        />
      </div>
      <p v-if="invalid" class="rescale-diagnostic" role="alert">
        {{
          edited
            ? 'Enter CFG Rescale from 0 to 0.99, or clear it to use the default.'
            : 'This saved value is outside the currently supported range (0 to 0.99). Reset it before generating.'
        }}
      </p>
      <p v-else-if="state.reason" class="rescale-diagnostic" role="status">{{ state.reason }}</p>
      <p v-else class="rescale-diagnostic">
        Reduces overexposure from high guidance. 0 disables rescaling.
      </p>
    </NCollapseItem>
  </NCollapse>
</template>

<style scoped>
.advanced-options {
  margin-top: 16px;
}
.rescale-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rescale-diagnostic {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.rescale-input {
  width: 96px;
}
</style>
