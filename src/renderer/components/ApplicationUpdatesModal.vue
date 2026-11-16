<script setup lang="ts">
import type {
  ApplicationUpdateInstallPreview,
  ApplicationUpdateRecoverySnapshot,
  ApplicationUpdateSnapshot,
} from '../../shared/application-updates.js'

import { NAlert, NButton, NCard, NModal, NProgress, NSpin } from 'naive-ui'
import { computed } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  downloading: boolean
  error: string | null
  installError: string | null
  installPending: boolean
  installPreview: ApplicationUpdateInstallPreview | null
  pending: boolean
  previewError: string | null
  previewPending: boolean
  recovery: ApplicationUpdateRecoverySnapshot | null
  recoveryError: string | null
  recoveryPending: boolean
  snapshot: ApplicationUpdateSnapshot | null
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{
  check: []
  dismiss: []
  download: [availableVersion: string]
  install: [availableVersion: string]
  reviewInstallation: [availableVersion: string]
}>()

const activeDownload = computed(() => props.downloading || props.snapshot?.status === 'downloading')
const recoveryAllowsInstallation = computed(
  () =>
    !props.recoveryPending &&
    props.recoveryError === null &&
    props.recovery !== null &&
    props.recovery.status !== 'required',
)
const previewView = computed(
  () =>
    recoveryAllowsInstallation.value &&
    (props.previewPending ||
      props.previewError !== null ||
      props.installError !== null ||
      props.installPreview !== null),
)
const installationEligible = computed(
  () =>
    recoveryAllowsInstallation.value &&
    props.installPreview?.installationAvailable === true &&
    props.snapshot?.status === 'downloaded' &&
    props.snapshot.verification === 'signed-release' &&
    props.snapshot.availableVersion === props.installPreview.availableVersion,
)
const canInstall = computed(
  () =>
    installationEligible.value &&
    !props.pending &&
    !activeDownload.value &&
    !props.previewPending &&
    !props.installPending,
)
const canReview = computed(
  () =>
    recoveryAllowsInstallation.value &&
    !props.pending &&
    !activeDownload.value &&
    !props.previewPending &&
    !props.installPending &&
    props.snapshot?.status === 'downloaded' &&
    props.snapshot.verification === 'signed-release' &&
    !!props.snapshot.availableVersion,
)
const canDownload = computed(
  () =>
    !props.pending &&
    !activeDownload.value &&
    !props.installPending &&
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

function reviewInstallation() {
  const version = props.snapshot?.availableVersion
  if (canReview.value && version) {
    emit('reviewInstallation', version)
  }
}

function install() {
  const version = props.installPreview?.availableVersion
  if (canInstall.value && version) {
    emit('install', version)
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
  if (props.installPending) {
    return
  }
  show.value = false
  emit('dismiss')
}
</script>

<template>
  <NModal
    :closeOnEsc="!installPending"
    :maskClosable="false"
    :show
    :zIndex="AppLayer.dialog"
    @update:show="!$event && close()"
  >
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
      <section
        v-if="recovery?.status === 'required'"
        aria-label="Application update recovery at startup"
        class="updates-recovery"
      >
        <NAlert title="Application update recovery required" type="warning">
          <p class="updates-result">At app startup</p>
          <p class="updates-recovery-detail">
            Installation is blocked while update recovery is required. Keep any update and backup
            files. You can continue working with Projects.
          </p>
          <p class="updates-recovery-detail">
            Application file:
            {{
              recovery.target === 'verified'
                ? 'publisher signature verified.'
                : 'could not be verified.'
            }}
          </p>
          <p class="updates-recovery-detail">
            Runtime files:
            {{
              recovery.runtime === 'verified-publisher-declaration'
                ? 'match the signed publisher declaration.'
                : 'could not be verified.'
            }}
          </p>
          <p class="updates-recovery-detail">
            These checks do not establish image-engine readiness.
          </p>
        </NAlert>
      </section>
      <p v-else-if="recoveryPending" class="updates-detail updates-recovery" role="status">
        Reading application update recovery status…
      </p>
      <NAlert
        v-else-if="recoveryError"
        class="updates-recovery"
        title="Application update recovery status unavailable"
        type="warning"
      >
        {{ recoveryError }}
      </NAlert>
      <p v-else-if="recovery?.status === 'not-checked'" class="updates-detail updates-recovery">
        Application update recovery was not checked at app startup.
      </p>
      <section v-if="previewView" aria-label="Installation preview" class="updates-preview">
        <h3>Installation preview</h3>
        <p v-if="installationEligible" class="updates-detail">
          Install and restart closes ImageGen Studio using the normal Save/Close choices. You can
          cancel those choices before installation starts. The image engine will be checked after
          restart.
        </p>
        <p v-else-if="!previewPending && !installError && !previewError" class="updates-detail">
          Installation is not available in this build.
        </p>
        <NAlert
          v-if="installError"
          key="n-alert-2"
          title="Installation could not start"
          type="error"
        >
          {{ installError }}
        </NAlert>
        <div v-if="installPending" aria-live="polite" class="updates-pending" role="status">
          <NSpin size="small" />
          <span>Checking the update before closing…</span>
        </div>
        <div v-if="previewPending" aria-live="polite" class="updates-pending" role="status">
          <NSpin size="small" />
          <span>Reviewing installation impact…</span>
        </div>
        <NAlert
          v-else-if="previewError"
          key="n-alert-2"
          title="Installation preview unavailable"
          type="error"
        >
          {{ previewError }}
        </NAlert>
        <template v-else-if="installPreview">
          <dl class="updates-versions updates-impact">
            <dt>Open Projects</dt>
            <dd>{{ installPreview.openProjectCount }}</dd>
            <dt>Projects with unsaved changes</dt>
            <dd>{{ installPreview.unsavedProjectCount }}</dd>
            <dt>Unfinished generation jobs</dt>
            <dd>{{ installPreview.unfinishedJobCount ?? 'Unknown' }}</dd>
            <dt>Unaccepted results in open Projects</dt>
            <dd>{{ installPreview.unacceptedResultCount ?? 'Unknown' }}</dd>
            <dt>Active model installations</dt>
            <dd>{{ installPreview.activeModelInstallCount }}</dd>
            <dt>Preparing model installations</dt>
            <dd>{{ installPreview.preparingModelInstallCount }}</dd>
          </dl>
          <NAlert
            v-if="installPreview.generationStorageUnavailable"
            title="Generation recovery storage unavailable"
            type="warning"
          >
            Generation jobs and temporary results could not be fully inspected. Temporary results
            remain on this computer for a later recovery attempt.
          </NAlert>
          <p v-if="installPreview.resourceRemovalActive" class="updates-detail">
            Resource removal is in progress and must finish before closing.
          </p>
          <p class="updates-detail">
            Before installation, Projects use their normal Save/Close choices. Closing cancels
            unfinished generation jobs and model downloads. Unaccepted results in open Projects are
            discarded only after confirmation.
          </p>
        </template>
        <p class="updates-detail">
          Current Project state is checked again when you close. Nothing has been saved, closed or
          canceled.
        </p>
      </section>
      <div
        v-else-if="activeDownload && !error"
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
            Installation has not started.
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
        <p v-if="snapshot.verification === 'signed-release'" class="updates-detail">
          <template v-if="snapshot.status === 'downloaded' && recoveryAllowsInstallation">
            Review installation availability and what must close before restarting.
          </template>
          <template v-else-if="snapshot.status !== 'downloaded' && recoveryAllowsInstallation">
            Download and verify the update before reviewing installation.
          </template>
          <template v-else>Installation review is unavailable.</template>
        </p>
        <p v-else class="updates-detail">Installation is not available in this build.</p>
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
          <template v-if="previewView">
            <NButton :disabled="installPending" @click="close">Install later</NButton>
            <NButton
              aria-label="Refresh preview"
              :disabled="!canReview"
              :loading="previewPending"
              @click="reviewInstallation"
            >
              Refresh preview
            </NButton>
            <NButton
              v-if="installationEligible"
              aria-label="Install and restart"
              :disabled="!canInstall"
              :loading="installPending"
              type="primary"
              @click="install"
            >
              Install and restart
            </NButton>
          </template>
          <template v-else>
            <NButton @click="close">Close</NButton>
            <NButton :disabled="pending || activeDownload" @click="$emit('check')">
              Check again
            </NButton>
            <NButton
              v-if="canReview"
              key="review-installation"
              type="primary"
              @click="reviewInstallation"
            >
              Review installation
            </NButton>
            <NButton
              v-if="canDownload"
              key="n-button-2"
              :type="canReview ? 'default' : 'primary'"
              @click="download"
            >
              {{ downloadLabel }}
            </NButton>
          </template>
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

.updates-recovery {
  margin: 0 0 16px;
}

.updates-recovery-detail {
  margin: 12px 0 0;
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

.updates-notes-section h3,
.updates-preview h3 {
  margin: 0 0 8px;
  font-size: inherit;
  font-weight: 600;
}

.updates-impact {
  grid-template-columns: minmax(0, 1fr) auto;
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
