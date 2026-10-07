<script setup lang="ts">
import type {
  CheckpointNoiseProfileView,
  SetCheckpointNoiseProfileChange,
} from '../../shared/api.js'

import { ArrowBackUp as ResetIcon } from '@vicons/tabler'
import { NButton, NIcon, NSelect, NSwitch, NText, NTooltip } from 'naive-ui'

defineProps<{
  disabled?: boolean
  policy: CheckpointNoiseProfileView
  versionName: string
}>()
const emit = defineEmits<{ change: [change: SetCheckpointNoiseProfileChange] }>()
const spacingChoices = [
  { label: 'Leading', value: 'leading' },
  { label: 'Linspace', value: 'linspace' },
  { label: 'Trailing', value: 'trailing' },
]

function setSpacing(value: number | string | null) {
  if (value === 'leading' || value === 'linspace' || value === 'trailing') {
    emit('change', { kind: 'timestep-spacing', value })
  }
}
</script>

<template>
  <div class="checkpoint-noise-controls">
    <div class="noise-field">
      <div class="noise-field-header">
        <span>ZTSNR</span>
        <div class="noise-actions">
          <NTooltip v-if="policy.rescaleBetasZeroSnrSource === 'override'">
            <template v-slot:trigger>
              <NButton
                :aria-label="`Reset ZTSNR for ${versionName}`"
                circle
                :disabled
                quaternary
                size="tiny"
                @click="emit('change', { kind: 'rescale-betas-zero-snr', value: null })"
              >
                <template v-slot:icon><NIcon :component="ResetIcon" :size="18" /></template>
              </NButton>
            </template>
            Restore assumed default: off
          </NTooltip>
          <NSwitch
            :aria-label="`ZTSNR for ${versionName}`"
            :disabled
            size="small"
            :value="policy.effective.rescaleBetasZeroSnr"
            @update:value="(value) => emit('change', { kind: 'rescale-betas-zero-snr', value })"
          />
        </div>
      </div>
      <NText :depth="3" tag="small">
        {{
          policy.rescaleBetasZeroSnrSource === 'assumed'
            ? 'Assumed default'
            : 'Chosen for this file'
        }}
        · {{ policy.effective.rescaleBetasZeroSnr ? 'On' : 'Off' }}
      </NText>
    </div>
    <div class="noise-field">
      <div class="noise-field-header">
        <span>Timestep spacing</span>
        <NTooltip v-if="policy.timestepSpacingSource === 'override'">
          <template v-slot:trigger>
            <NButton
              :aria-label="`Reset timestep spacing for ${versionName}`"
              circle
              :disabled
              quaternary
              size="tiny"
              @click="emit('change', { kind: 'timestep-spacing', value: null })"
            >
              <template v-slot:icon><NIcon :component="ResetIcon" :size="18" /></template>
            </NButton>
          </template>
          Restore assumed default: leading
        </NTooltip>
      </div>
      <NSelect
        :aria-label="`Timestep spacing for ${versionName}`"
        :disabled
        :options="spacingChoices"
        size="small"
        :value="policy.effective.timestepSpacing"
        @update:value="setSpacing"
      />
      <NText :depth="3" tag="small">
        {{
          policy.timestepSpacingSource === 'assumed' ? 'Assumed default' : 'Chosen for this file'
        }}
      </NText>
    </div>
    <NText :depth="3" tag="small">
      Follow the model author’s guidance. Prediction type does not set these values. DPM++ 2M Karras
      uses its own step grid. DPM++ SDE cannot use ZTSNR.
    </NText>
  </div>
</template>

<style scoped>
.checkpoint-noise-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: 12px;
  min-width: 0;
}
.checkpoint-noise-controls > small {
  grid-column: 1 / -1;
}
.noise-field {
  display: grid;
  align-content: start;
  gap: 4px;
}
.noise-field-header,
.noise-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.noise-field-header {
  justify-content: space-between;
  min-height: 24px;
  font-size: 12px;
  font-weight: 600;
}
.checkpoint-noise-controls small {
  line-height: 1.4;
}
</style>
