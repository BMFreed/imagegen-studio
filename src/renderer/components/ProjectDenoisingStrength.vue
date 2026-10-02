<script setup lang="ts">
import type { ProjectGenerationTargetState } from '../../shared/projects/project-generation-target-state.js'

import { RotateClockwise as ResetIcon } from '@vicons/tabler'
import { NInput } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import LabeledControl from '../../../docs/prototype-app/src/components/LabeledControl.vue'
import { denoisingControlReason, parseDenoisingStrength } from './denoising-strength-control.js'

const props = defineProps<{
  editingDisabled: boolean
  modelFamily: string | null
  runtimeUnavailableReason: string | null
  supported: boolean | null
  target: ProjectGenerationTargetState | null
  targetError: string | null
}>()
const strength = defineModel<number | null>({ required: true })
const emit = defineEmits<{ validity: [valid: boolean] }>()
const text = ref('')
const focused = ref(false)
const invalid = computed(() => parseDenoisingStrength(text.value).kind === 'invalid')
const reason = computed(() => denoisingControlReason(props))
watch(invalid, (value) => emit('validity', !value), { immediate: true })
watch(
  strength,
  (value) => {
    if (!focused.value && !invalid.value) {
      text.value = value === null ? '' : String(value)
    }
  },
  { immediate: true },
)
function updateText(value: string) {
  text.value = value
  const parsed = parseDenoisingStrength(value)
  if (!props.editingDisabled && !reason.value && parsed.kind === 'valid') {
    strength.value = parsed.value
  }
}
function reset() {
  if (props.editingDisabled) {
    return
  }
  strength.value = null
  text.value = ''
}
</script>

<template>
  <div class="denoising-control">
    <div class="denoising-field">
      <LabeledControl label="Denoising Strength">
        <template v-slot="{ controlId }">
          <NInput
            class="denoising-input"
            :disabled="editingDisabled || Boolean(reason)"
            :inputProps="{
              id: controlId,
              'aria-label': 'Denoising Strength',
              inputmode: 'decimal',
            }"
            placeholder="Unset"
            size="small"
            :status="invalid ? 'error' : undefined"
            :value="text"
            @blur="focused = false"
            @focus="focused = true"
            @update:value="updateText"
          />
        </template>
      </LabeledControl>
      <IconButton
        v-if="strength !== null || invalid"
        compact
        :disabled="editingDisabled"
        :icon="ResetIcon"
        label="Reset Denoising Strength"
        @click="reset"
      />
    </div>
    <p v-if="invalid" class="denoising-diagnostic" role="alert">
      Enter Denoising Strength from 0 to 1, or leave it unset.
    </p>
    <p v-else-if="reason" class="denoising-diagnostic" role="status">{{ reason }}</p>
  </div>
</template>

<style scoped>
.denoising-control {
  margin-bottom: 12px;
}
.denoising-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.denoising-input {
  width: 80px;
}
.denoising-diagnostic {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
