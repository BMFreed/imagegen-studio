<script setup lang="ts">
import type { RuntimeSetupProgress } from '../../shared/runtime-setup-progress.js'
import type { RuntimeSetupMode, RuntimeSetupReview } from '../../shared/runtime-setup.js'

import { NAlert, NButton, NCard, NModal, NProgress, NSpin } from 'naive-ui'
import { computed } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  cancelPending: boolean
  error: string | null
  mode: RuntimeSetupMode
  progress: RuntimeSetupProgress | null
  review: RuntimeSetupReview | null
  submitting: boolean
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ cancelOperation: []; confirm: []; dismiss: [] }>()

const title = computed(() =>
  props.mode === 'install' ? 'Set up image generation' : 'Repair image generation',
)
const action = computed(() => (props.mode === 'install' ? 'Install' : 'Repair'))
const canConfirm = computed(
  () => props.review !== null && props.review.mode === props.mode && !props.submitting,
)

const cancelling = computed(() => props.cancelPending || props.progress?.state === 'cancelling')
const canCancelOperation = computed(
  () => props.submitting && props.progress?.state === 'running' && !cancelling.value,
)
const stageLabel = computed(() => {
  if (cancelling.value) {
    return 'Cancelling…'
  }
  switch (props.progress?.state) {
    case 'canceled': {
      return 'Setup canceled'
    }
    case 'failed': {
      return 'Setup failed'
    }
    case 'recovery-required': {
      return 'Setup needs recovery'
    }
    case 'succeeded': {
      return 'Setup completed'
    }
  }
  const labels = {
    'assembling-runtime': 'Installing engine dependencies',
    'checking-activation': 'Checking activated engine',
    'checking-runtime': 'Checking image engine',
    'copying-runtime': 'Copying engine files',
    'downloading-runtime': 'Downloading image engine',
    'extracting-runtime': 'Unpacking image engine',
    finalizing: 'Finishing setup',
    'installing-outpaint': 'Preparing outpainting resource',
    preparing: 'Preparing setup',
    'preparing-runtime': 'Preparing runtime files',
    'verifying-runtime': 'Verifying engine files',
  } as const
  return props.progress
    ? labels[props.progress.stage]
    : props.mode === 'install'
      ? 'Installing…'
      : 'Repairing…'
})
const transferPercent = computed(() => {
  const progress = props.progress
  return progress?.bytesDownloaded !== null &&
    progress?.bytesDownloaded !== undefined &&
    progress.bytesTotal !== null &&
    progress.bytesTotal > 0
    ? (progress.bytesDownloaded / progress.bytesTotal) * 100
    : null
})

function cancel() {
  if (canCancelOperation.value) {
    emit('cancelOperation')
  }
}

function close() {
  if (!props.submitting) {
    show.value = false
    emit('dismiss')
  }
}

function confirm() {
  if (canConfirm.value) {
    emit('confirm')
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`
}
</script>

<template>
  <NModal
    :closeOnEsc="!submitting"
    :maskClosable="false"
    :show
    :zIndex="AppLayer.dialog"
    @update:show="!$event && close()"
  >
    <NCard
      :aria-label="title"
      class="runtime-setup-modal"
      contentScrollable
      role="dialog"
      size="small"
      :title
    >
      <div v-if="!review && !submitting" aria-live="polite" class="setup-pending" role="status">
        <NSpin size="small" />
        <span>Preparing installation review…</span>
      </div>
      <template v-else-if="review">
        <p class="setup-intro">
          Review the image engine and its shared outpainting resource before continuing.
        </p>
        <dl class="setup-sizes">
          <dt>Engine release</dt>
          <dd class="setup-release">{{ review.releaseId }}</dd>
          <dt>Total download</dt>
          <dd>{{ formatBytes(review.downloadBytes) }}</dd>
          <dt>Installed size</dt>
          <dd>{{ formatBytes(review.installedBytes) }}</dd>
          <dt>Additional installed size</dt>
          <dd>{{ formatBytes(review.additionalInstalledBytes) }}</dd>
          <dt>Runtime minimum free space</dt>
          <dd>{{ formatBytes(review.runtimeRequiredFreeBytes) }}</dd>
          <dt>Peak free space required</dt>
          <dd>Unknown</dd>
        </dl>
        <p class="setup-detail">
          {{
            review.runtimeSourceCached
              ? 'The runtime download is already cached. Installation still creates a new runtime.'
              : 'The runtime download is included in this review. Installation creates a new runtime.'
          }}
        </p>
        <p class="setup-detail">
          {{
            review.outpaintInfillReused
              ? 'The existing outpainting resource will be verified and reused.'
              : 'The outpainting resource will be installed with the engine.'
          }}
        </p>
        <p class="setup-detail">
          The full installation may need more space than the runtime minimum.
        </p>
      </template>
      <div v-if="submitting" class="setup-progress">
        <div aria-live="polite" class="setup-pending" role="status">
          <NSpin
            v-if="!progress || progress.state === 'running' || progress.state === 'cancelling'"
            size="small"
          />
          <span>{{ stageLabel }}</span>
        </div>
        <template v-if="transferPercent !== null && progress">
          <p class="setup-transfer">
            {{ formatBytes(progress.bytesDownloaded) }} of {{ formatBytes(progress.bytesTotal) }}
          </p>
          <NProgress
            aria-label="Current download progress"
            :percentage="transferPercent"
            :showIndicator="false"
            type="line"
          />
        </template>
      </div>
      <NAlert
        v-if="error"
        class="setup-error"
        title="Cancellation could not be completed"
        type="error"
      >
        {{ error }}
      </NAlert>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton
            v-if="submitting"
            key="n-button-1"
            :disabled="!canCancelOperation"
            @click="cancel"
          >
            {{ cancelling ? 'Cancelling…' : 'Cancel' }}
          </NButton>
          <NButton v-else key="n-button-2" @click="close">Cancel</NButton>
          <NButton
            v-if="!submitting"
            key="n-button-3"
            :disabled="!canConfirm"
            type="primary"
            @click="confirm"
          >
            {{ action }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.runtime-setup-modal {
  width: min(540px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
}

.setup-intro {
  margin: 0 0 16px;
}

.setup-pending {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setup-sizes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0 0 16px;
}

.setup-sizes dt,
.setup-detail {
  color: var(--app-text-muted);
}

.setup-sizes dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.setup-release,
.setup-detail {
  overflow-wrap: anywhere;
}

.setup-detail {
  margin: 8px 0 0;
  font-size: var(--app-font-size-meta);
}

.setup-progress {
  margin: 16px 0 0;
}

.setup-transfer {
  margin: 12px 0 8px;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
}

.setup-error {
  margin-top: 16px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
