<script setup lang="ts">
import type { ApplicationUpdateSnapshot } from '../../shared/application-updates.js'

import { NAlert, NButton, NCard, NModal, NProgress, NSpin } from 'naive-ui'
import { computed } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  downloading: boolean
  error: string | null
  pending: boolean
  snapshot: ApplicationUpdateSnapshot | null
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ check: []; dismiss: []; download: [availableVersion: string] }>()

const activeDownload = computed(() => props.downloading || props.snapshot?.status === 'downloading')
const canDownload = computed(
  () =>
    !props.pending &&
    !activeDownload.value &&
    props.snapshot?.availableVersion !== null &&
    ['available', 'download-error', 'downloaded'].includes(props.snapshot?.status ?? ''),
)
const downloadLabel = computed(() =>
  props.snapshot?.status === 'download-error'
    ? 'Retry download'
    : props.snapshot?.status === 'downloaded'
      ? 'Download again'
      : 'Download',
)
const transferPercent = computed(() => {
  const snapshot = props.snapshot
  return snapshot?.downloadedBytes !== null &&
    snapshot?.downloadedBytes !== undefined &&
    snapshot.totalBytes !== null &&
    snapshot.totalBytes > 0
    ? (snapshot.downloadedBytes / snapshot.totalBytes) * 100
    : null
})

function download() {
  const version = props.snapshot?.availableVersion
  if (canDownload.value && version) {
    emit('download', version)
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`
}

function close() {
  show.value = false
  emit('dismiss')
}
</script>

<template>
  <NModal :maskClosable="false" :show :zIndex="AppLayer.dialog" @update:show="!$event && close()">
    <NCard
      aria-label="Application Updates"
      class="application-updates-modal"
      contentScrollable
      role="dialog"
      size="small"
      title="Application Updates"
    >
      <p class="updates-intro">Check for a newer version of ImageGen Studio.</p>
      <dl class="updates-versions">
        <dt>Current version</dt>
        <dd>{{ snapshot?.currentVersion ?? 'Unknown' }}</dd>
        <template v-if="snapshot?.availableVersion">
          <dt>Available version</dt>
          <dd>{{ snapshot.availableVersion }}</dd>
        </template>
      </dl>
      <div
        v-if="activeDownload && !error"
        aria-live="polite"
        class="updates-download"
        role="status"
      >
        <div class="updates-pending">
          <NSpin size="small" />
          <span>Downloading and verifying…</span>
        </div>
        <NProgress
          v-if="transferPercent !== null"
          aria-label="Application update download"
          :percentage="transferPercent"
          :showIndicator="false"
          type="line"
        />
        <p
          v-if="snapshot && snapshot.downloadedBytes !== null && snapshot.totalBytes !== null"
          class="updates-detail"
        >
          {{ formatBytes(snapshot.downloadedBytes) }} of {{ formatBytes(snapshot.totalBytes) }}
        </p>
        <p class="updates-detail">Closing this dialog leaves the download running.</p>
      </div>
      <div
        v-else-if="!error && (pending || snapshot?.status === 'checking')"
        aria-live="polite"
        class="updates-pending"
        role="status"
      >
        <NSpin size="small" />
        <span>Checking for updates…</span>
      </div>
      <NAlert v-else-if="error" key="n-alert-1" title="Application update failed" type="error">
        {{ error }}
      </NAlert>
      <NAlert
        v-else-if="snapshot?.status === 'error'"
        key="n-alert-2"
        title="Update check failed"
        type="error"
      >
        Could not check for updates. Check your connection and try again.
      </NAlert>
      <NAlert
        v-else-if="snapshot?.status === 'up-to-date'"
        key="n-alert-3"
        title="ImageGen Studio is up to date."
        type="success"
      />
      <template
        v-else-if="
          snapshot && ['available', 'downloaded', 'download-error'].includes(snapshot.status)
        "
      >
        <NAlert
          v-if="snapshot.status === 'downloaded'"
          key="n-alert-4"
          title="Download completed"
          type="success"
        >
          The saved file matches the update metadata checksum.
          <template v-if="snapshot.verification === 'signed-release'">
            Installation has not been verified.
          </template>
          <template v-else>
            Publisher authenticity and installation have not been verified.
          </template>
        </NAlert>
        <NAlert
          v-else-if="snapshot.status === 'download-error'"
          key="n-alert-5"
          title="Download failed"
          type="error"
        >
          Could not download or verify the update. Try downloading again.
        </NAlert>
        <NAlert v-else key="n-alert-6" title="Update available" type="info">
          A new version is available.
        </NAlert>
        <template
          v-if="
            snapshot.verification === 'signed-release' &&
            (snapshot.status === 'available' || snapshot.status === 'downloaded')
          "
        >
          <p class="updates-detail">Publisher signature verified.</p>
          <p class="updates-detail">
            Compatibility declaration accepted. The image engine will be checked after restart.
          </p>
        </template>
        <section v-if="snapshot.releaseNotes !== null" class="updates-notes-section">
          <h3>Release notes</h3>
          <div aria-label="Release notes" class="updates-notes" role="region" tabindex="0">
            {{ snapshot.releaseNotes }}
          </div>
          <p v-if="snapshot.notesTruncated" class="updates-detail">
            Release notes were shortened for display.
          </p>
        </section>
        <p class="updates-detail">Installation is not available in this build.</p>
      </template>
      <NAlert
        v-else-if="!snapshot || snapshot.status === 'unavailable'"
        key="n-alert-4"
        title="Updates unavailable"
        type="info"
      >
        Update checking is not available in this build.
      </NAlert>
      <p v-else class="updates-result">Check for updates when you are ready.</p>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton @click="close">Close</NButton>
          <NButton :disabled="pending || activeDownload" @click="$emit('check')">
            Check again
          </NButton>
          <NButton v-if="canDownload" type="primary" @click="download">{{ downloadLabel }}</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.application-updates-modal {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
}

.updates-intro {
  margin: 0 0 16px;
}

.updates-versions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0 0 16px;
}

.updates-versions dt,
.updates-detail {
  color: var(--app-text-muted);
}

.updates-versions dd {
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.updates-pending {
  display: flex;
  align-items: center;
  gap: 12px;
}

.updates-download {
  display: grid;
  gap: 12px;
}

.updates-notes-section {
  margin-top: 16px;
}

.updates-notes-section h3 {
  margin: 0 0 8px;
  font-size: inherit;
  font-weight: 600;
}

.updates-notes {
  max-height: min(220px, 36vh);
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.updates-detail {
  margin: 12px 0 0;
  font-size: var(--app-font-size-meta);
}

.updates-result {
  margin: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
