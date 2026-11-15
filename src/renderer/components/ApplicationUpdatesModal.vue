<script setup lang="ts">
import type { ApplicationUpdateSnapshot } from '../../shared/application-updates.js'

import { NAlert, NButton, NCard, NModal, NSpin } from 'naive-ui'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

defineProps<{
  error: string | null
  pending: boolean
  snapshot: ApplicationUpdateSnapshot | null
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ check: []; dismiss: [] }>()

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
        <template v-if="!pending && !error && snapshot?.status === 'available'">
          <dt>Available version</dt>
          <dd>{{ snapshot.availableVersion }}</dd>
        </template>
      </dl>
      <div
        v-if="pending || (snapshot?.status === 'checking' && !error)"
        aria-live="polite"
        class="updates-pending"
        role="status"
      >
        <NSpin size="small" />
        <span>Checking for updates…</span>
      </div>
      <NAlert v-else-if="error" key="n-alert-1" title="Update check failed" type="error">
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
      <template v-else-if="snapshot?.status === 'available'">
        <NAlert title="Update available" type="info">A new version is available.</NAlert>
        <section v-if="snapshot.releaseNotes !== null" class="updates-notes-section">
          <h3>Release notes</h3>
          <div aria-label="Release notes" class="updates-notes" role="region" tabindex="0">
            {{ snapshot.releaseNotes }}
          </div>
          <p v-if="snapshot.notesTruncated" class="updates-detail">
            Release notes were shortened for display.
          </p>
        </section>
        <p class="updates-detail">Download and installation are not available in this build.</p>
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
          <NButton :disabled="pending" type="primary" @click="$emit('check')">Check again</NButton>
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
