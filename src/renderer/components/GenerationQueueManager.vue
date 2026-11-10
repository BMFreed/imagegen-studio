<script setup lang="ts">
import type {
  ApiResult,
  ProjectGenerationActionState,
  ProjectGenerationResultsSnapshot,
  ProjectGenerationResultView,
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultView,
  ProjectTab,
} from '../../shared/api.js'
import { ANIMA_SAMPLING_METHOD_LABELS } from '../../shared/projects/anima-sampling-method.js'
import type { GenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'
import { progressForJob } from '../../shared/projects/generation-progress.js'
import type {
  GenerationQueueCursor,
  GenerationQueueEntry,
  GenerationQueuePage,
  GenerationQueueReview,
  GenerationQueueStatus,
  GenerationQueueTerminalStatus,
} from '../../shared/projects/generation-queue-manager.js'
import { generationQueueStatuses } from '../../shared/projects/generation-queue-manager.js'

import { Photo, X as XIcon } from '@vicons/tabler'
import {
  NAlert,
  NButton,
  NCard,
  NDropdown,
  NEmpty,
  NIcon,
  NModal,
  NSpin,
  NTag,
  NTooltip,
} from 'naive-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
  queueResultCandidate,
  queueResultOpenReference,
  type QueueResultOpenReference,
  queueResultReference,
  type QueueResultReference,
  queueSmartResultCandidate,
  queueSmartResultReference,
} from './generation-queue-result.js'
import { generationQueueRetryReason } from './generation-queue-retry.js'
import GenerationProgressIndicator from './GenerationProgressIndicator.vue'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{
  appBusy: boolean
  generationErrors: Record<string, string | null>
  generationLoading: Record<string, boolean>
  generationProgress: GenerationProgressSnapshot
  generationStates: Record<string, ProjectGenerationActionState>
  projectTabs: ProjectTab[]
  refreshEpoch: number
  reloadRequiredIds: Set<string>
  resultErrors: Record<string, string | null>
  resultLoading: Record<string, boolean>
  resultNavigationError: string | null
  resultOpeningId: string | null
  resultSnapshots: Record<string, ProjectGenerationResultsSnapshot>
  runtimeUnavailableReason: string | null
  smartResultErrors: Record<string, string | null>
  smartResultLoading: Record<string, boolean>
  smartResultSnapshots: Record<string, ProjectSmartPatchResultsSnapshot>
}>()
const emit = defineEmits<{
  changed: []
  openProject: [projectKey: string, result?: QueueResultOpenReference]
  openResult: [reference: QueueResultReference]
  refreshResults: []
}>()

type QueueAction = 'cancel' | 'delete' | 'prune' | 'retry'
type Confirmation =
  | { kind: 'delete'; name: string; review: GenerationQueueReview }
  | { kind: 'prune'; label: string; statuses: GenerationQueueTerminalStatus[] }

const items = ref<GenerationQueueEntry[]>([])
const counts = ref<GenerationQueuePage['counts'] | null>(null)
const nextCursor = ref<GenerationQueueCursor | null>(null)
const selectedId = ref<string | null>(null)
const loading = ref(false)
const loadingOlder = ref(false)
const readError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref<{ action: QueueAction; id: string | null } | null>(null)
const confirmation = ref<Confirmation | null>(null)
const failedThumbnails = ref(new Set<string>())
let pageRequest = 0
let actionRequest = 0
let pageDepth = 1
let disposed = false

const selected = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
const selectedResult = computed(() => (selected.value ? resultCandidate(selected.value) : null))
const selectedSmartResult = computed(() =>
  selected.value ? smartResultCandidate(selected.value) : null,
)
const controlsBusy = computed(() => busy.value !== null || props.appBusy)
const countsTotal = computed(
  () => counts.value && Object.values(counts.value).reduce((a, b) => a + b, 0),
)
const historyOptions = computed(() => [
  { disabled: !counts.value?.completed, key: 'completed', label: 'Completed jobs' },
  {
    disabled: !(counts.value && counts.value.failed + counts.value.canceled),
    key: 'failed-canceled',
    label: 'Failed and canceled jobs',
  },
  {
    disabled: !(
      counts.value && counts.value.completed + counts.value.failed + counts.value.canceled
    ),
    key: 'terminal',
    label: 'All terminal jobs',
  },
])
const statusLabels: Record<GenerationQueueStatus, string> = {
  canceled: 'Canceled',
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Pending',
  running: 'Running',
}
const formatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  second: '2-digit',
  year: 'numeric',
})

function timestamp(value: string | null): string {
  return value ? formatter.format(new Date(value)) : '—'
}

function statusType(status: GenerationQueueStatus) {
  if (status === 'failed') {
    return 'error'
  }
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'running') {
    return 'info'
  }
  return 'default'
}

function terminal(item: GenerationQueueEntry): boolean {
  return item.status === 'completed' || item.status === 'failed' || item.status === 'canceled'
}

function resultCandidate(item: GenerationQueueEntry): ProjectGenerationResultView | null {
  if (props.reloadRequiredIds.has(item.projectKey)) {
    return null
  }
  const tab = props.projectTabs.find((candidate) => candidate.id === item.projectKey)
  return queueResultCandidate(item, props.resultSnapshots[item.projectKey], tab?.documentId)
}
function smartResultCandidate(item: GenerationQueueEntry): ProjectSmartPatchResultView | null {
  if (props.reloadRequiredIds.has(item.projectKey)) {
    return null
  }
  const tab = props.projectTabs.find((candidate) => candidate.id === item.projectKey)
  return queueSmartResultCandidate(
    item,
    props.smartResultSnapshots[item.projectKey],
    tab?.documentId,
  )
}
function resultIsLoading(item: GenerationQueueEntry): boolean {
  return ['anima-smart-patch', 'illustrious-smart-patch'].includes(item.operation)
    ? Boolean(props.smartResultLoading[item.projectKey])
    : Boolean(props.resultLoading[item.projectKey])
}

function thumbnailUrl(candidate: { thumbnailUrl?: string } | null): string | null {
  const url = candidate?.thumbnailUrl
  return url && !failedThumbnails.value.has(url) ? url : null
}

function thumbnailFailed(candidate: { thumbnailUrl?: string } | null) {
  if (candidate?.thumbnailUrl) {
    failedThumbnails.value.add(candidate.thumbnailUrl)
  }
}

function resultReason(item: GenerationQueueEntry): string | null {
  if (item.publicationPending) {
    return 'The result is awaiting local recovery.'
  }
  if (item.status === 'pending' || item.status === 'running') {
    return 'A result becomes available after generation completes.'
  }
  if (item.status !== 'completed') {
    return 'This job did not produce a completed result.'
  }
  if (!props.projectTabs.some((tab) => tab.id === item.projectKey)) {
    return 'Open this Project to check its local result.'
  }
  if (props.reloadRequiredIds.has(item.projectKey)) {
    return 'Reload this Project before viewing its results.'
  }
  if (resultIsLoading(item)) {
    return 'Checking the local result…'
  }
  if (['anima-smart-patch', 'illustrious-smart-patch'].includes(item.operation)) {
    if (props.smartResultErrors[item.projectKey]) {
      return props.smartResultErrors[item.projectKey]!
    }
    if (props.smartResultSnapshots[item.projectKey]?.recoveryUnavailable) {
      return 'Local Smart Patch recovery is unavailable. Reopen the Project to check its results.'
    }
    return smartResultCandidate(item)
      ? null
      : 'The local Smart Patch candidate is unavailable. It may have been added or discarded.'
  }
  if (props.resultErrors[item.projectKey]) {
    return props.resultErrors[item.projectKey]!
  }
  if (props.resultSnapshots[item.projectKey]?.recoveryUnavailable) {
    return 'Local recovery is unavailable. Reopen the Project to check its results.'
  }
  if (!resultCandidate(item)) {
    return 'The local candidate is unavailable. It may have been added or discarded.'
  }
  return null
}

function openResult(item: GenerationQueueEntry) {
  const tab = props.projectTabs.find((candidate) => candidate.id === item.projectKey)
  const candidate = resultCandidate(item)
  const smartCandidate = smartResultCandidate(item)
  if (controlsBusy.value || resultIsLoading(item) || !tab || (!candidate && !smartCandidate)) {
    return
  }
  if (smartCandidate) {
    emit('openResult', queueSmartResultReference(item, smartCandidate, tab.documentId))
  } else if (candidate) {
    emit('openResult', queueResultReference(item, candidate, tab.documentId))
  }
}

function openProject(item: GenerationQueueEntry) {
  emit('openProject', item.projectKey, queueResultOpenReference(item) ?? undefined)
}

function review(item: GenerationQueueEntry): GenerationQueueReview {
  return { id: item.id, statusSequence: item.statusSequence }
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The queue operation could not be completed.'
}

function queueApi() {
  const api = globalThis.window.api?.projects
  if (!api || typeof api.getGenerationQueue !== 'function') {
    throw new Error('The queue connection is unavailable. Reopen the desktop app and try again.')
  }
  return api
}

async function apiValue<T>(operation: () => Promise<ApiResult<T>>): Promise<T> {
  const result = await operation()
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.value
}

function keepSelection() {
  if (!items.value.some((item) => item.id === selectedId.value)) {
    selectedId.value = items.value[0]?.id ?? null
  }
}

// Re-read the loaded pages from the newest cursor after events. Reusing an old
// cursor after inserts/deletes would leave holes or duplicate rows in history.
async function refresh() {
  if (!show.value || disposed) {
    return
  }
  const request = ++pageRequest
  const depth = pageDepth
  loading.value = true
  loadingOlder.value = false
  readError.value = null
  const current = () => !disposed && show.value && request === pageRequest
  try {
    let cursor: GenerationQueueCursor | null = null
    let latest: GenerationQueuePage | null = null
    const loaded: GenerationQueueEntry[] = []
    let loadedDepth = 0
    for (let index = 0; index < depth; index += 1) {
      latest = await apiValue(() => queueApi().getGenerationQueue(cursor))
      if (!current()) {
        return
      }
      loaded.push(...latest.items)
      loadedDepth += 1
      cursor = latest.nextCursor
      if (!cursor) {
        break
      }
    }
    if (current() && latest) {
      items.value = [...new Map(loaded.map((item) => [item.id, item])).values()]
      counts.value = latest.counts
      nextCursor.value = latest.nextCursor
      pageDepth = loadedDepth
      keepSelection()
    }
  } catch (cause) {
    if (current()) {
      readError.value = message(cause)
    }
  } finally {
    if (current()) {
      loading.value = false
    }
  }
}

function refreshFromUser() {
  // User refresh retries result/cache reads; lifecycle page refresh must not feed back into it.
  emit('refreshResults')
  void refresh()
}

async function loadOlder() {
  const cursor = nextCursor.value
  if (!cursor || loading.value || loadingOlder.value || !show.value || disposed) {
    return
  }
  const request = ++pageRequest
  loadingOlder.value = true
  readError.value = null
  const current = () => !disposed && show.value && request === pageRequest
  try {
    const page = await apiValue(() =>
      queueApi().getGenerationQueue({ createdAt: cursor.createdAt, id: cursor.id }),
    )
    if (current()) {
      items.value = [
        ...new Map([...items.value, ...page.items].map((item) => [item.id, item])).values(),
      ]
      counts.value = page.counts
      nextCursor.value = page.nextCursor
      pageDepth += 1
      keepSelection()
    }
  } catch (cause) {
    if (current()) {
      readError.value = message(cause)
    }
  } finally {
    if (current()) {
      loadingOlder.value = false
    }
  }
}

function retryReason(item: GenerationQueueEntry): string | null {
  if (item.publicationPending) {
    return 'This job is awaiting candidate recovery. Retry and Delete are blocked until recovery is resolved.'
  }
  if (!item.details) {
    return 'The frozen generation settings are unavailable, so this job cannot be retried.'
  }
  const tab = props.projectTabs.find((candidate) => candidate.id === item.projectKey)
  if (!tab) {
    return 'Open the original Project to retry its frozen job.'
  }
  if (tab.documentId !== item.documentId) {
    return 'The open Project is a different document. Open the original document to retry this job.'
  }
  if (props.reloadRequiredIds.has(tab.id)) {
    return 'Reload this Project before retrying.'
  }
  if (props.runtimeUnavailableReason) {
    return props.runtimeUnavailableReason
  }
  if (props.appBusy) {
    return 'Wait for the current Project operation to finish.'
  }
  if (readError.value) {
    return 'Refresh the queue before retrying.'
  }
  if (loading.value || loadingOlder.value || props.generationLoading[tab.id]) {
    return 'Wait for the queue and generation state to finish updating.'
  }
  if (props.generationErrors[tab.id]) {
    return 'Refresh generation state before retrying.'
  }
  const state = props.generationStates[tab.id]
  if (!state || state.documentId !== item.documentId) {
    return 'Wait for the Project generation state to become available.'
  }
  if (state.phase === 'blocked') {
    return state.error?.message ?? 'Generation recovery must finish before retrying.'
  }
  if (state.phase === 'closed') {
    return 'Generation has stopped for this app session. Restart the app before retrying.'
  }
  if (state.phase !== 'idle' && state.phase !== 'processing') {
    return 'Wait for the current queue request to finish.'
  }
  const operationReason = generationQueueRetryReason(
    item.operation,
    state,
    item.details?.sampling.sampler,
    item.details?.requiresRegionalLora,
    item.details?.requiresRegionalVae,
    item.details?.sampling.cfgRescale,
    item.details?.sampling.animaMethod,
    item.details?.sampling.predictionType,
    item.details?.requiresSmartPatchRegional,
    item.details?.requiresSmartPatchRegionalOutpaint,
    item.details?.requiresSmartPatchRegionalTxt2Img,
    item.details?.requiresSmartPatchRegionalImg2Img,
    item.details?.requiresRegionalReferenceImages,
  )
  if (operationReason) {
    return operationReason
  }
  if (!counts.value) {
    return 'Wait for the queue to finish updating.'
  }
  return null
}

function deleteReason(item: GenerationQueueEntry): string | null {
  if (item.publicationPending) {
    return 'This job is awaiting candidate recovery. Queue history is kept until recovery is resolved.'
  }
  return null
}

async function perform(action: QueueAction, id: string | null, operation: () => Promise<unknown>) {
  if (controlsBusy.value || !show.value || disposed) {
    return
  }
  const request = ++actionRequest
  busy.value = { action, id }
  actionError.value = null
  notice.value = null
  try {
    const result = await operation()
    if (disposed || request !== actionRequest) {
      return
    }
    confirmation.value = null
    notice.value =
      action === 'prune'
        ? `Removed ${result} jobs from queue history.`
        : action === 'delete'
          ? 'Job removed from queue history.'
          : action === 'retry'
            ? 'A new job was queued with the original frozen settings.'
            : 'Cancellation requested.'
    emit('changed')
    await refresh()
  } catch (cause) {
    if (!disposed && request === actionRequest) {
      actionError.value = message(cause)
      // Main may have rejected a stale review. Show the current row before
      // allowing the user to decide again, without replaying the action.
      await refresh()
    }
  } finally {
    if (!disposed && request === actionRequest) {
      busy.value = null
    }
  }
}

function cancelJob(item: GenerationQueueEntry) {
  if (terminal(item) || (item.cancelRequested && item.status !== 'running')) {
    return
  }
  const captured = review(item)
  void perform('cancel', item.id, () => apiValue(() => queueApi().cancelGenerationJob(captured)))
}

function retryJob(item: GenerationQueueEntry) {
  if ((item.status !== 'failed' && item.status !== 'canceled') || retryReason(item)) {
    return
  }
  const captured = review(item)
  void perform('retry', item.id, () => apiValue(() => queueApi().retryGenerationJob(captured)))
}

function requestDelete(item: GenerationQueueEntry) {
  if (controlsBusy.value || !terminal(item) || deleteReason(item)) {
    return
  }
  actionError.value = null
  confirmation.value = { kind: 'delete', name: item.projectName, review: review(item) }
}

function requestPrune(key: number | string) {
  if (controlsBusy.value) {
    return
  }
  actionError.value = null
  if (key === 'completed') {
    confirmation.value = { kind: 'prune', label: 'completed', statuses: ['completed'] }
  }
  if (key === 'failed-canceled') {
    confirmation.value = {
      kind: 'prune',
      label: 'failed and canceled',
      statuses: ['failed', 'canceled'],
    }
  }
  if (key === 'terminal') {
    confirmation.value = {
      kind: 'prune',
      label: 'completed, failed and canceled',
      statuses: ['completed', 'failed', 'canceled'],
    }
  }
}

function confirmCleanup() {
  const decision = confirmation.value
  if (!decision || controlsBusy.value) {
    return
  }
  if (decision.kind === 'prune') {
    void perform('prune', null, () =>
      apiValue(() => queueApi().pruneGenerationQueue([...decision.statuses])),
    )
    return
  }
  const item = items.value.find((candidate) => candidate.id === decision.review.id)
  if (
    !item ||
    item.statusSequence !== decision.review.statusSequence ||
    !terminal(item) ||
    deleteReason(item)
  ) {
    actionError.value =
      'This job changed while the confirmation was open. Keep history and review its current state.'
    return
  }
  void perform('delete', item.id, () =>
    apiValue(() => queueApi().deleteGenerationJob({ ...decision.review })),
  )
}

function close() {
  if (!busy.value && !confirmation.value) {
    show.value = false
  }
}

watch(
  show,
  (open) => {
    if (open) {
      pageDepth = 1
      items.value = []
      counts.value = null
      nextCursor.value = null
      selectedId.value = null
      actionError.value = null
      notice.value = null
      void refresh()
    } else {
      pageRequest += 1
      loading.value = false
      loadingOlder.value = false
      confirmation.value = null
    }
  },
  { immediate: true },
)
watch(
  () => props.refreshEpoch,
  () => {
    if (show.value) {
      void refresh()
    }
  },
)
watch(
  () => props.resultSnapshots,
  () => {
    // A fresh verified snapshot permits one new attempt after an explicit Refresh.
    failedThumbnails.value = new Set()
  },
)
onBeforeUnmount(() => {
  disposed = true
  pageRequest += 1
  actionRequest += 1
})
</script>

<template>
  <NModal
    :closeOnEsc="!busy && !confirmation"
    :maskClosable="false"
    :show
    @update:show="!$event && close()"
  >
    <div
      aria-label="Queue Manager"
      aria-modal="true"
      class="queue-manager"
      data-testid="queue-manager"
      role="dialog"
    >
      <header class="manager-header">
        <div class="manager-heading">
          <h1>Queue Manager</h1>
          <p>Generation jobs across projects</p>
        </div>
        <div class="header-actions">
          <NButton
            :disabled="controlsBusy || loading || loadingOlder"
            :loading="loading && items.length > 0"
            secondary
            size="small"
            @click="refreshFromUser"
          >
            Refresh
          </NButton>
          <NDropdown :options="historyOptions" trigger="click" @select="requestPrune">
            <NButton
              aria-label="Clear queue history"
              :disabled="controlsBusy || !counts || Boolean(readError)"
              secondary
              size="small"
            >
              Clear history
            </NButton>
          </NDropdown>
          <NButton
            aria-label="Close Queue Manager"
            circle
            :disabled="Boolean(busy) || Boolean(confirmation)"
            quaternary
            size="small"
            @click="close"
          >
            <template v-slot:icon><NIcon :component="XIcon" :size="18" /></template>
          </NButton>
        </div>
      </header>
      <div aria-label="Job status counts" class="status-counts">
        <div v-for="status of generationQueueStatuses" :key="status" class="status-count">
          <span>{{ statusLabels[status] }}</span>
          <strong>{{ counts?.[status] ?? '—' }}</strong>
        </div>
      </div>
      <div
        v-if="readError || (actionError && !confirmation) || resultNavigationError || notice"
        aria-live="polite"
        class="manager-feedback"
      >
        <NAlert v-if="readError" type="error">{{ readError }}</NAlert>
        <NAlert v-if="actionError && !confirmation" key="n-alert-2" type="error">
          {{ actionError }}
        </NAlert>
        <NAlert v-if="resultNavigationError" key="n-alert-3" type="warning">
          {{ resultNavigationError }}
        </NAlert>
        <p v-if="notice" class="action-notice">{{ notice }}</p>
      </div>
      <div class="manager-body">
        <section
          :aria-busy="loading || loadingOlder"
          aria-label="Generation jobs"
          class="jobs-pane"
        >
          <div class="list-heading">
            <span>Newest first</span>
            <span>
              {{ items.length }}
              <template v-if="countsTotal !== null">of {{ countsTotal }}</template>
              jobs
            </span>
          </div>
          <div class="jobs-scroll" data-testid="queue-jobs-scroll">
            <div v-if="loading && !items.length" class="pane-state">
              <NSpin size="small" />
              <p>Loading queue history…</p>
            </div>
            <div v-else-if="!items.length" class="pane-state">
              <NEmpty
                :description="
                  readError ? 'Queue history could not be read' : 'No generation jobs yet'
                "
              />
            </div>
            <div v-else class="job-list">
              <article
                v-for="item of items"
                :key="item.id"
                class="job-row"
                :class="{ 'job-row--selected': selectedId === item.id }"
                :data-job-id="item.id"
                :data-status="item.status"
                data-testid="queue-job-row"
              >
                <button
                  aria-label="Show job details"
                  :aria-pressed="selectedId === item.id"
                  class="job-select"
                  :class="{ 'job-select--with-preview': item.status === 'completed' }"
                  @click="selectedId = item.id"
                >
                  <span
                    v-if="item.status === 'completed'"
                    aria-hidden="true"
                    class="job-thumbnail"
                    data-testid="queue-job-thumbnail"
                  >
                    <img
                      v-if="thumbnailUrl(resultCandidate(item))"
                      alt=""
                      decoding="async"
                      loading="lazy"
                      :src="thumbnailUrl(resultCandidate(item)) ?? undefined"
                      @error="thumbnailFailed(resultCandidate(item))"
                    />
                    <NIcon
                      v-else
                      :component="Photo"
                      data-testid="queue-job-thumbnail-placeholder"
                      :size="18"
                    />
                  </span>
                  <span class="job-copy">
                    <span class="job-heading">
                      <strong class="project-name">{{ item.projectName }}</strong>
                      <NTag :bordered="false" size="small" :type="statusType(item.status)">
                        {{ item.cancelRequested ? 'Canceling' : statusLabels[item.status] }}
                      </NTag>
                    </span>
                    <span class="job-operation">
                      {{
                        item.operation.endsWith('smart-patch')
                          ? 'Generate · Smart Patch'
                          : 'Generate · Project Canvas'
                      }}
                    </span>
                    <span class="job-summary">
                      {{
                        item.details
                          ? `${item.details.modelName} · Seed ${item.details.sampling.seed}`
                          : 'Frozen settings unavailable'
                      }}
                    </span>
                    <span class="job-time">Queued {{ timestamp(item.createdAt) }}</span>
                    <GenerationProgressIndicator
                      v-if="progressForJob(generationProgress, item)"
                      :progress="progressForJob(generationProgress, item)!"
                    />
                  </span>
                </button>
                <div class="job-actions">
                  <NButton
                    v-if="!terminal(item)"
                    :aria-label="item.cancelRequested ? 'Retry cancel' : 'Cancel job'"
                    :disabled="
                      controlsBusy ||
                      (item.cancelRequested && item.status !== 'running') ||
                      Boolean(readError)
                    "
                    :loading="busy?.action === 'cancel' && busy.id === item.id"
                    secondary
                    size="tiny"
                    @click="cancelJob(item)"
                  >
                    {{ item.cancelRequested ? 'Retry cancel' : 'Cancel' }}
                  </NButton>
                  <NButton
                    v-if="item.status === 'failed' || item.status === 'canceled'"
                    key="n-button-2"
                    aria-label="Retry job"
                    :disabled="controlsBusy || Boolean(retryReason(item))"
                    :loading="busy?.action === 'retry' && busy.id === item.id"
                    secondary
                    size="tiny"
                    @click="retryJob(item)"
                  >
                    Retry
                  </NButton>
                  <NButton
                    v-if="terminal(item)"
                    key="n-button-3"
                    aria-label="Delete job"
                    :disabled="controlsBusy || Boolean(deleteReason(item)) || Boolean(readError)"
                    secondary
                    size="tiny"
                    @click="requestDelete(item)"
                  >
                    Delete
                  </NButton>
                </div>
                <p
                  v-if="
                    item.publicationPending ||
                    ((item.status === 'failed' || item.status === 'canceled') && retryReason(item))
                  "
                  class="job-action-reason"
                >
                  {{ item.publicationPending ? deleteReason(item) : retryReason(item) }}
                </p>
              </article>
            </div>
            <div v-if="nextCursor" class="load-older">
              <NButton
                :disabled="loading || controlsBusy"
                :loading="loadingOlder"
                secondary
                size="small"
                @click="loadOlder"
              >
                Load older jobs
              </NButton>
            </div>
          </div>
        </section>
        <section aria-label="Job details" class="details-pane" data-testid="queue-job-details">
          <div v-if="!selected" class="pane-state">
            <NEmpty description="Select a job to inspect its frozen settings" />
          </div>
          <div v-else class="details-scroll">
            <div class="detail-heading">
              <div>
                <h2>{{ selected.projectName }}</h2>
                <p>
                  {{
                    selected.operation.endsWith('smart-patch')
                      ? 'Generate · Smart Patch'
                      : 'Generate · Project Canvas'
                  }}
                </p>
              </div>
              <NTag :bordered="false" size="small" :type="statusType(selected.status)">
                {{ selected.cancelRequested ? 'Canceling' : statusLabels[selected.status] }}
              </NTag>
            </div>
            <NAlert v-if="selected.publicationPending" key="n-alert-3" type="warning">
              {{ deleteReason(selected) }}
            </NAlert>
            <NAlert v-if="selected.error" key="n-alert-4" type="error">
              <strong>{{ selected.error.code }}</strong>
              <p class="error-message">{{ selected.error.message }}</p>
            </NAlert>
            <dl class="job-timestamps">
              <div>
                <dt>Created</dt>
                <dd>{{ timestamp(selected.createdAt) }}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{{ timestamp(selected.startedAt) }}</dd>
              </div>
              <div>
                <dt>Finished</dt>
                <dd>{{ timestamp(selected.finishedAt) }}</dd>
              </div>
            </dl>
            <GenerationProgressIndicator
              v-if="progressForJob(generationProgress, selected)"
              :progress="progressForJob(generationProgress, selected)!"
            />
            <section class="detail-section" data-testid="queue-result-section">
              <h3>Result</h3>
              <div class="result-context">
                <div
                  v-if="selected.status === 'completed'"
                  class="result-thumbnail"
                  data-testid="queue-result-thumbnail"
                >
                  <img
                    v-if="thumbnailUrl(selectedResult ?? selectedSmartResult)"
                    alt="Temporary generation result"
                    decoding="async"
                    :src="thumbnailUrl(selectedResult ?? selectedSmartResult) ?? undefined"
                    @error="thumbnailFailed(selectedResult ?? selectedSmartResult)"
                  />
                  <NIcon
                    v-else
                    aria-label="Thumbnail unavailable"
                    :component="Photo"
                    data-testid="queue-result-thumbnail-placeholder"
                    :size="24"
                  />
                </div>
                <div aria-live="polite" class="result-description">
                  <p v-if="resultReason(selected)" class="secondary-text">
                    {{ resultReason(selected) }}
                  </p>
                  <template v-else-if="selectedResult">
                    <p v-if="selectedResult.sourceDocumentMismatch" class="secondary-text">
                      From an earlier document at this Project path. Preview is available; this
                      candidate cannot be added.
                    </p>
                    <p v-else class="secondary-text">Temporary candidate in Project Results.</p>
                    <p v-if="!thumbnailUrl(selectedResult)" class="secondary-text">
                      Thumbnail unavailable. View the full result in Project.
                    </p>
                  </template>
                  <p v-else-if="selectedSmartResult" class="secondary-text">
                    Temporary Smart Patch candidate.
                    {{
                      selectedSmartResult.unavailableReason ??
                      'View it at its Patch stack position in Project.'
                    }}
                  </p>
                  <NButton
                    v-if="selectedResult || selectedSmartResult"
                    aria-label="View result"
                    :disabled="controlsBusy || resultIsLoading(selected)"
                    :loading="resultOpeningId === selected.id"
                    secondary
                    size="small"
                    @click="openResult(selected)"
                  >
                    View result
                  </NButton>
                </div>
              </div>
            </section>
            <template v-if="selected.details">
              <section class="detail-section">
                <h3>Frozen model</h3>
                <p>{{ selected.details.modelName }}</p>
                <p class="secondary-text">{{ selected.details.modelVersion }}</p>
              </section>
              <section class="detail-section">
                <h3>Frozen settings</h3>
                <dl class="settings-grid">
                  <div>
                    <dt>Seed</dt>
                    <dd>{{ selected.details.sampling.seed }}</dd>
                  </div>
                  <div>
                    <dt>Steps</dt>
                    <dd>{{ selected.details.sampling.steps }}</dd>
                  </div>
                  <div>
                    <dt>CFG</dt>
                    <dd>{{ selected.details.sampling.cfgScale }}</dd>
                  </div>
                  <div v-if="selected.details.sampling.denoisingStrength !== undefined">
                    <dt>Denoising Strength</dt>
                    <dd>{{ selected.details.sampling.denoisingStrength }}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{{ selected.details.size.width }} × {{ selected.details.size.height }}</dd>
                  </div>
                  <div v-if="selected.details.sampling.animaMethod !== undefined">
                    <dt>Anima method</dt>
                    <dd>
                      {{ ANIMA_SAMPLING_METHOD_LABELS[selected.details.sampling.animaMethod] }}
                    </dd>
                  </div>
                  <template v-else>
                    <div>
                      <dt>Sampler</dt>
                      <dd>{{ selected.details.sampling.sampler }}</dd>
                    </div>
                    <div>
                      <dt>Scheduler</dt>
                      <dd>{{ selected.details.sampling.scheduler }}</dd>
                    </div>
                    <div>
                      <dt>Prediction</dt>
                      <dd>{{ selected.details.sampling.predictionType }}</dd>
                    </div>
                  </template>
                </dl>
              </section>
              <section class="detail-section">
                <h3>Prompt</h3>
                <p class="frozen-prompt">{{ selected.details.prompt || 'Empty prompt' }}</p>
              </section>
              <section class="detail-section">
                <h3>Negative prompt</h3>
                <p class="frozen-prompt">
                  {{ selected.details.negativePrompt || 'Empty negative prompt' }}
                </p>
              </section>
            </template>
            <NAlert v-else key="n-alert-5" type="warning">
              Frozen generation settings are unavailable. Terminal queue history can still be
              deleted.
            </NAlert>
            <div
              v-if="selected.status === 'failed' || selected.status === 'canceled'"
              class="retry-context"
            >
              <p class="secondary-text">
                Retry creates a new job from these frozen settings, including the original seed.
              </p>
              <p v-if="retryReason(selected)">{{ retryReason(selected) }}</p>
            </div>
            <div v-if="!projectTabs.some((tab) => tab.id === selected?.projectKey)">
              <NTooltip>
                <template v-slot:trigger>
                  <NButton
                    :disabled="controlsBusy"
                    secondary
                    size="small"
                    @click="openProject(selected)"
                  >
                    Open Project
                  </NButton>
                </template>
                {{
                  queueResultOpenReference(selected)
                    ? 'Open Project, review recovery if needed, then view this temporary result if it is still available.'
                    : 'Open this Project.'
                }}
              </NTooltip>
            </div>
          </div>
        </section>
      </div>
      <footer class="manager-footer">
        Queue history is separate from Project candidates and saved documents.
      </footer>
    </div>
  </NModal>
  <NModal
    :closeOnEsc="!busy"
    :maskClosable="false"
    :show="confirmation !== null"
    @update:show="!$event && !busy && (confirmation = null)"
  >
    <NCard
      :aria-label="confirmation?.kind === 'delete' ? 'Delete queue history' : 'Clear queue history'"
      aria-modal="true"
      class="cleanup-dialog"
      contentScrollable
      role="dialog"
      size="small"
      :title="confirmation?.kind === 'delete' ? 'Delete job history?' : 'Clear queue history?'"
    >
      <NAlert v-if="actionError" type="error">{{ actionError }}</NAlert>
      <p v-if="confirmation?.kind === 'delete'">
        Delete this terminal job for
        <strong>{{ confirmation.name }}</strong>
        from queue history?
      </p>
      <p v-else-if="confirmation?.kind === 'prune'">
        Remove {{ confirmation.label }} jobs from queue history? Pending and running jobs stay
        queued. Jobs awaiting recovery are kept.
      </p>
      <p>
        Only queue history is removed. Project candidates, accepted layers, saved documents and the
        last completed seed remain available.
      </p>
      <template v-slot:footer>
        <div class="cleanup-actions">
          <NButton :disabled="Boolean(busy)" @click="confirmation = null">Keep history</NButton>
          <NButton
            :disabled="controlsBusy"
            :loading="Boolean(busy)"
            type="error"
            @click="confirmCleanup"
          >
            {{ confirmation?.kind === 'delete' ? 'Delete job' : 'Clear history' }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.queue-manager {
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100vw - 32px));
  height: min(820px, calc(100vh - 32px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.manager-header,
.header-actions,
.job-heading,
.detail-heading,
.cleanup-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.manager-header {
  flex: 0 0 auto;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border);
}
.manager-heading h1 {
  margin: 0;
  font-size: 20px;
}
.manager-heading p,
.detail-heading p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.status-counts {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--app-border);
}
.status-count {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-text-muted);
}
.status-count strong {
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}
.manager-feedback {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  padding: 10px 18px;
}
.action-notice {
  margin: 0;
  color: var(--app-text-muted);
}
.manager-body {
  display: grid;
  flex: 1 1 0;
  grid-template-columns: minmax(300px, 42%) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
.jobs-pane,
.details-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.jobs-pane {
  border-right: 1px solid var(--app-border);
}
.list-heading {
  display: flex;
  flex: 0 0 auto;
  justify-content: space-between;
  padding: 10px 14px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.jobs-scroll,
.details-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
}
.job-list {
  display: flex;
  flex-direction: column;
  padding: 0 8px 8px;
  gap: 6px;
}
.job-row {
  border: 1px solid transparent;
  border-radius: var(--app-radius);
}
.job-row:hover {
  background: var(--app-elevated-hover);
}
.job-row--selected {
  border-color: var(--app-border);
  background: var(--app-elevated);
}
.job-select {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 5px;
  padding: 10px;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
}
.job-select--with-preview {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}
.job-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.job-thumbnail,
.result-thumbnail {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  color: var(--app-text-muted);
  background: var(--app-elevated);
}
.job-thumbnail {
  width: 48px;
  height: 48px;
}
.result-thumbnail {
  flex: 0 0 96px;
  width: 96px;
  height: 96px;
}
.job-thumbnail img,
.result-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.result-context {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.result-description {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.job-select:focus-visible {
  outline: 2px solid var(--app-text);
  outline-offset: -2px;
}
.job-heading {
  justify-content: space-between;
  width: 100%;
}
.project-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.job-operation,
.job-summary,
.job-time {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.job-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}
.job-actions {
  display: flex;
  gap: 6px;
  padding: 0 10px 10px;
}
.job-action-reason {
  margin: 0;
  padding: 0 10px 10px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  overflow-wrap: anywhere;
}
.load-older {
  display: flex;
  justify-content: center;
  padding: 8px 14px 18px;
}
.pane-state {
  display: flex;
  flex: 1 1 0;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--app-text-muted);
  text-align: center;
}
.pane-state p {
  margin: 0;
}
.details-scroll {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
}
.detail-heading {
  justify-content: space-between;
  align-items: flex-start;
}
.detail-heading h2 {
  margin: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.job-timestamps,
.settings-grid {
  display: grid;
  gap: 12px 16px;
  margin: 0;
}
.job-timestamps {
  grid-template-columns: 1fr;
}
.job-timestamps div {
  display: grid;
  grid-template-columns: 65px 1fr;
  gap: 12px;
}
.settings-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
dt {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.job-timestamps dd {
  margin: 0;
}
.detail-section h3 {
  margin: 0 0 8px;
  font-size: var(--app-font-size);
  font-weight: 600;
}
.detail-section p {
  margin: 0;
  overflow-wrap: anywhere;
}
.secondary-text {
  color: var(--app-text-muted);
}
.frozen-prompt {
  padding: 10px;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.error-message {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.retry-context p {
  margin: 0 0 10px;
}
.manager-footer {
  flex: 0 0 auto;
  padding: 10px 18px;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.cleanup-dialog {
  width: min(500px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
}
.cleanup-actions {
  justify-content: flex-end;
}
</style>
