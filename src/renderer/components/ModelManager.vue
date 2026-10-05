<script setup lang="ts">
import type {
  ApiResult,
  BaseModelFamily,
  CivitaiTokenStatus,
  IllustriousPredictionType,
  ModelCatalogItem,
  ModelImportPreview,
  ModelInstallJobView,
  ModelResourceType,
  ModelVersionView,
} from '../../shared/api.js'

import {
  Download as DownloadIcon,
  ExternalLink as ExternalLinkIcon,
  FilterOff as FilterOffIcon,
  InfoCircle as InfoIcon,
  Plus as PlusIcon,
  Refresh as RefreshIcon,
  X as XIcon,
} from '@vicons/tabler'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NPopover,
  NProgress,
  NScrollbar,
  NSelect,
  NSpin,
  NSplit,
  NTag,
  NTooltip,
  useThemeVars,
} from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ModelManagerFocus } from './model-manager-focus.js'

import { mergeModelManagerJobSnapshot } from './model-manager-job-snapshot.js'
import { ModelManagerReadGuard } from './model-manager-read-guard.js'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ focus: ModelManagerFocus | null }>()
const focusedResource = computed(() => props.focus?.resource ?? null)
const readGuard = new ModelManagerReadGuard(() => show.value)
// Naive's active color is available through its theme API, not an app-shell token.
const themeVars = useThemeVars()
const accentStyle = computed(() => ({ '--resource-accent': themeVars.value.primaryColor }))

type TypeFilter = 'all' | ModelResourceType
type StatusFilter = 'all' | 'downloading' | 'installed' | 'needs-attention'
type SortOrder = 'name' | 'recent' | 'size'

const typeChoices: { label: string; value: TypeFilter }[] = [
  { label: 'All Models', value: 'all' },
  { label: 'Checkpoints', value: 'checkpoint' },
  { label: 'LoRA', value: 'lora' },
  { label: 'Embeddings', value: 'embedding' },
  { label: 'VAE', value: 'vae' },
  { label: 'Upscalers', value: 'upscaler' },
]
const statusChoices: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Installed', value: 'installed' },
  { label: 'Downloading', value: 'downloading' },
  { label: 'Needs Attention', value: 'needs-attention' },
]
const familyChoices = [
  { label: 'All', value: 'all' },
  { label: 'Illustrious', value: 'illustrious' },
  { label: 'Anima', value: 'anima' },
]
const sortChoices = [
  { label: 'Name', value: 'name' },
  { label: 'Recently installed', value: 'recent' },
  { label: 'Size', value: 'size' },
]
const predictionChoices = [
  { label: 'Epsilon', value: 'epsilon' },
  { label: 'V-prediction', value: 'v_prediction' },
]
const animaBaseLicenseUrl =
  'https://huggingface.co/circlestone-labs/Anima/blob/f973fc41ec7545364ac9776c2440285f43ff2a30/LICENSE.md'

const catalog = ref<ModelCatalogItem[]>([])
const jobs = ref<ModelInstallJobView[]>([])
const storageBytes = ref<number | null>(null)
const tokenStatus = ref<CivitaiTokenStatus | null>(null)
const selectedId = ref<string | null>(null)
const managerShell = ref<HTMLElement | null>(null)
const typeFilter = ref<TypeFilter>('all')
const statusFilter = ref<StatusFilter>('all')
const search = ref('')
const familyFilter = ref<'all' | BaseModelFamily>('all')
const sortOrder = ref<SortOrder>('name')
const queueView = ref(false)
const navigationPaneSize = ref<number | string>('220px')
const resourcePaneSize = ref<number | string>('calc(100% - 400px)')
const loading = ref(false)
const busy = ref<
  'cancel' | 'default' | 'install' | 'prediction' | 'preview' | 'token' | 'updates' | null
>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const importError = ref<string | null>(null)
const importOpen = ref(false)
const tokenPopoverOpen = ref(false)
const tokenInput = ref('')
const urlInput = ref('')
const preview = ref<ModelImportPreview | null>(null)
const selectedFileId = ref<number | null>(null)
const preferredImportFileId = ref<number | null>(null)
const acceptedAnimaLicense = ref(false)
const updates = ref<Record<string, { id: number; name: string }[]>>({})
const checkedUpdates = ref<Set<string>>(new Set())
let unsubscribeInstall: (() => void) | undefined
let pendingJobsRead: {
  isCurrent: () => boolean
  observed: Map<string, ModelInstallJobView>
} | null = null

const modelApi = () => globalThis.window.api?.models
const isConnected = computed(() => tokenStatus.value?.kind === 'connected')
const filePreview = computed(() => (preview.value?.kind === 'select-file' ? preview.value : null))
const selectedFile = computed(() =>
  filePreview.value?.files.find((file) => file.fileId === selectedFileId.value),
)
const selectedFileLicense = computed(() => selectedFile.value?.license ?? null)
const conditionalAnimaLicense = computed(
  () =>
    filePreview.value?.baseModelFamily === 'anima' &&
    filePreview.value.resourceType === 'checkpoint' &&
    selectedFile.value?.sha256 === null,
)
const selectedFileSizeKnown = computed(
  () =>
    selectedFile.value !== undefined &&
    Number.isSafeInteger(selectedFile.value.sizeEstimateBytes) &&
    (selectedFile.value.sizeEstimateBytes ?? 0) > 0,
)
const selectedAdditionalBytes = computed(() => {
  const selection = filePreview.value
  const file = selectedFile.value
  if (!selection || !file) {
    return null
  }
  if (!selectedFileSizeKnown.value) {
    return null
  }
  return (
    (file.alreadyInstalled || file.reusesInstalledFile ? 0 : file.sizeEstimateBytes!) +
    selection.dependencies.reduce(
      (size, dependency) => size + (dependency.alreadyInstalled ? 0 : dependency.sizeBytes),
      0,
    )
  )
})
const canInstall = computed(
  () =>
    isConnected.value &&
    filePreview.value !== null &&
    selectedFile.value !== undefined &&
    selectedFileSizeKnown.value &&
    !selectedFile.value.alreadyInstalled &&
    (filePreview.value.baseModelFamily !== 'anima' ||
      filePreview.value.resourceType !== 'checkpoint' ||
      acceptedAnimaLicense.value) &&
    (filePreview.value.baseModelFamily !== 'anima' ||
      filePreview.value.resourceType !== 'checkpoint' ||
      (selectedAdditionalBytes.value !== null &&
        filePreview.value.dependencies.some((dependency) => dependency.role === 'qwen3_encoder') &&
        filePreview.value.dependencies.some((dependency) => dependency.role === 'vae'))),
)
const hasActiveFilters = computed(
  () =>
    typeFilter.value !== 'all' ||
    statusFilter.value !== 'all' ||
    search.value.trim() !== '' ||
    familyFilter.value !== 'all',
)
const activeJobs = computed(() =>
  jobs.value.filter(
    (job) => job.status === 'waiting' || job.status === 'downloading' || job.status === 'verifying',
  ),
)
const prominentJob = computed(() => activeJobs.value.at(0) ?? null)
const showJobs = computed(() => queueView.value || statusFilter.value === 'downloading')

function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'An unexpected error occurred.'
}

async function runApi<T>(
  action: () => Promise<ApiResult<T>>,
  onSuccess: (value: T) => void,
  target: 'general' | 'import' = 'general',
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  try {
    const result = await action()
    if (!isCurrent()) {
      return false
    }
    if (!result.ok) {
      if (target === 'import') {
        importError.value = result.error.message
      } else {
        error.value = result.error.message
      }
      return false
    }
    onSuccess(result.value)
    return true
  } catch (cause) {
    if (!isCurrent()) {
      return false
    }
    if (target === 'import') {
      importError.value = failureMessage(cause)
    } else {
      error.value = failureMessage(cause)
    }
    return false
  }
}

function requireApi() {
  const api = modelApi()
  if (!api) {
    throw new Error('The desktop application connection is unavailable.')
  }
  return api
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return 'Size unknown'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`
}

function importFileLabel(
  file: Extract<ModelImportPreview, { kind: 'select-file' }>['files'][number],
): string {
  const status = file.alreadyInstalled
    ? 'Installed'
    : file.needsRepair
      ? 'Repair'
      : file.reusesInstalledFile
        ? 'Reuse local file'
        : null
  return `${file.name} · ${formatBytes(file.sizeEstimateBytes)}${status ? ` · ${status}` : ''}`
}

function predictionSourceLabel(version: ModelVersionView): string {
  switch (version.predictionTypeSource) {
    case 'default': {
      return 'Assumed default; check the model author’s guidance'
    }
    case 'manifest': {
      return 'Verified for this exact file'
    }
    case 'user': {
      return 'Chosen for this exact file'
    }
    default: {
      return 'Check the model author’s guidance'
    }
  }
}

function versionFor(resource: ModelCatalogItem): ModelVersionView | null {
  return (
    resource.versions.find((version) => version.id === resource.defaultVersionId) ??
    resource.versions[0] ??
    null
  )
}

function uniqueCatalogFileSize(resources: readonly ModelCatalogItem[]): number {
  const seenHashes = new Set<string>()
  let size = 0
  for (const resource of resources) {
    for (const version of resource.versions) {
      if (!seenHashes.has(version.sha256)) {
        seenHashes.add(version.sha256)
        size += version.fileSizeBytes
      }
    }
  }
  return size
}

function totalSize(resource: ModelCatalogItem): number {
  return uniqueCatalogFileSize([resource])
}

function latestInstall(resource: ModelCatalogItem): number {
  return Math.max(0, ...resource.versions.map((version) => Date.parse(version.installedAt) || 0))
}

function needsAttention(resource: ModelCatalogItem): boolean {
  return resource.versions.some((version) => version.fileStatus !== 'ready')
}

function resourceStatus(
  resource: ModelCatalogItem,
): 'Dependency missing' | 'File corrupted' | 'File missing' | 'Installed' {
  if (resource.versions.some((version) => version.dependencyIssues.length > 0)) {
    return 'Dependency missing'
  }
  if (resource.versions.some((version) => version.fileStatus === 'corrupt')) {
    return 'File corrupted'
  }
  return needsAttention(resource) ? 'File missing' : 'Installed'
}

function matchesSearch(resource: ModelCatalogItem, query: string): boolean {
  const terms = [
    resource.name,
    resource.author ?? '',
    resource.modelId?.toString() ?? '',
    ...resource.trainedWords,
    ...resource.versions.flatMap((version) => [
      version.name,
      version.fileName,
      version.civitaiVersionId?.toString() ?? '',
    ]),
  ]
  return terms.some((term) => term.toLocaleLowerCase().includes(query))
}

const visibleCatalog = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  const resources = catalog.value.filter((resource) => {
    if (typeFilter.value !== 'all' && resource.resourceType !== typeFilter.value) {
      return false
    }
    if (
      familyFilter.value !== 'all' &&
      !resource.versions.some((version) => version.baseModelFamily === familyFilter.value)
    ) {
      return false
    }
    if (
      statusFilter.value === 'installed' &&
      !resource.versions.some((version) => version.fileStatus === 'ready')
    ) {
      return false
    }
    if (statusFilter.value === 'needs-attention' && !needsAttention(resource)) {
      return false
    }
    return !query || matchesSearch(resource, query)
  })
  return resources.sort((left, right) => {
    if (sortOrder.value === 'size') {
      return totalSize(right) - totalSize(left)
    }
    if (sortOrder.value === 'recent') {
      return latestInstall(right) - latestInstall(left)
    }
    return left.name.localeCompare(right.name)
  })
})
const selectedResource = computed(() => {
  const selected = visibleCatalog.value.find((resource) => resource.id === selectedId.value)
  if (selected) {
    return selected
  }
  if (
    focusedResource.value?.resourceId === selectedId.value &&
    !catalog.value.some((resource) => resource.id === selectedId.value)
  ) {
    return null
  }
  return visibleCatalog.value[0] ?? null
})
const detailVersion = computed(() => {
  const resource = selectedResource.value
  if (!resource) {
    return null
  }
  if (focusedResource.value?.resourceId === resource.id) {
    return (
      resource.versions.find((version) => version.id === focusedResource.value?.versionId) ?? null
    )
  }
  return versionFor(resource)
})
const focusedModelMissing = computed(
  () =>
    focusedResource.value !== null &&
    selectedId.value === focusedResource.value.resourceId &&
    !loading.value &&
    !error.value &&
    !catalog.value.some((resource) => resource.id === focusedResource.value?.resourceId),
)
const focusedVersionMissing = computed(
  () =>
    focusedResource.value !== null &&
    selectedResource.value?.id === focusedResource.value.resourceId &&
    !selectedResource.value.versions.some(
      (version) => version.id === focusedResource.value?.versionId,
    ),
)
const duplicateResource = computed(() => {
  const selection = filePreview.value
  const fileId = selectedFileId.value
  if (!selection || fileId === null) {
    return null
  }
  return (
    catalog.value.find(
      (resource) =>
        resource.modelId === selection.modelId &&
        resource.versions.some(
          (version) =>
            version.civitaiVersionId === selection.versionId && version.civitaiFileId === fileId,
        ),
    ) ?? null
  )
})

function typeCount(value: TypeFilter): number {
  return value === 'all'
    ? catalog.value.length
    : catalog.value.filter((resource) => resource.resourceType === value).length
}

function statusCount(value: StatusFilter): number {
  if (value === 'downloading') {
    return activeJobs.value.length
  }
  if (value === 'installed') {
    return catalog.value.filter((resource) =>
      resource.versions.some((version) => version.fileStatus === 'ready'),
    ).length
  }
  if (value === 'needs-attention') {
    return catalog.value.filter(needsAttention).length
  }
  return catalog.value.length
}

function resetFilters() {
  typeFilter.value = 'all'
  statusFilter.value = 'all'
  familyFilter.value = 'all'
  search.value = ''
  queueView.value = false
}

function selectType(value: TypeFilter) {
  typeFilter.value = value
  queueView.value = false
}

function selectStatus(value: StatusFilter) {
  statusFilter.value = value
  queueView.value = false
}

function showCatalog() {
  queueView.value = false
  statusFilter.value = 'all'
}

async function loadCatalog() {
  await runApi(
    () => requireApi().getCatalog(),
    (nextCatalog) => {
      catalog.value = nextCatalog
      if (
        selectedId.value &&
        selectedId.value !== focusedResource.value?.resourceId &&
        !nextCatalog.some((resource) => resource.id === selectedId.value)
      ) {
        selectedId.value = null
      }
    },
    'general',
    readGuard.begin('catalog'),
  )
}

async function loadJobs() {
  const read = {
    isCurrent: readGuard.begin('jobs'),
    observed: new Map<string, ModelInstallJobView>(),
  }
  pendingJobsRead = read
  try {
    await runApi(
      () => requireApi().getInstallJobs(),
      (nextJobs) => {
        jobs.value = mergeModelManagerJobSnapshot(nextJobs, read.observed)
      },
      'general',
      read.isCurrent,
    )
  } finally {
    if (pendingJobsRead === read) {
      pendingJobsRead = null
    }
  }
}

async function loadStorageSummary() {
  await runApi(
    () => requireApi().getStorageSummary(),
    (summary) => {
      storageBytes.value = summary.totalBytes
    },
    'general',
    readGuard.begin('storage'),
  )
}

async function openModelFolder() {
  await runApi(
    () => requireApi().openModelFolder(),
    () => {},
  )
}

async function loadTokenStatus() {
  await runApi(
    () => requireApi().getTokenStatus(),
    (nextStatus) => {
      tokenStatus.value = nextStatus
    },
    'general',
    readGuard.begin('token'),
  )
}

async function loadAll(isCurrent = readGuard.begin('refresh')) {
  loading.value = true
  error.value = null
  try {
    void loadTokenStatus()
    await Promise.all([loadCatalog(), loadJobs(), loadStorageSummary()])
  } finally {
    if (isCurrent()) {
      loading.value = false
    }
  }
}

async function saveToken() {
  if (!tokenInput.value.trim() || busy.value) {
    return
  }
  busy.value = 'token'
  error.value = null
  importError.value = null
  const token = tokenInput.value.trim()
  const saved = await runApi(
    () => requireApi().saveToken(token),
    (nextStatus) => {
      readGuard.invalidate('token')
      tokenStatus.value = nextStatus
      tokenInput.value = ''
      tokenPopoverOpen.value = false
      notice.value = 'CivitAI token saved.'
    },
    importOpen.value ? 'import' : 'general',
  )
  if (!saved) {
    tokenInput.value = ''
  }
  busy.value = null
}

async function removeToken() {
  if (busy.value) {
    return
  }
  busy.value = 'token'
  error.value = null
  await runApi(
    () => requireApi().removeToken(),
    (nextStatus) => {
      readGuard.invalidate('token')
      tokenStatus.value = nextStatus
      tokenInput.value = ''
      tokenPopoverOpen.value = false
      notice.value = 'CivitAI token removed.'
    },
  )
  busy.value = null
}

function openImport(url = '') {
  urlInput.value = url
  preview.value = null
  selectedFileId.value = null
  preferredImportFileId.value = null
  acceptedAnimaLicense.value = false
  importError.value = null
  importOpen.value = true
}

async function previewUrl(url = urlInput.value) {
  if (!url.trim() || busy.value) {
    return
  }
  busy.value = 'preview'
  importError.value = null
  preview.value = null
  selectedFileId.value = null
  acceptedAnimaLicense.value = false
  const requestedUrl = url.trim()
  await runApi(
    () => requireApi().previewImport(requestedUrl),
    (nextPreview) => {
      if (urlInput.value.trim() !== requestedUrl) {
        return
      }
      preview.value = nextPreview
      if (nextPreview.kind === 'select-file') {
        if (preferredImportFileId.value !== null) {
          selectedFileId.value =
            nextPreview.files.find((file) => file.fileId === preferredImportFileId.value)?.fileId ??
            null
          if (selectedFileId.value === null) {
            importError.value =
              'The original CivitAI file is no longer listed. Exact repair is unavailable.'
          }
        } else {
          selectedFileId.value =
            nextPreview.files.find((file) => file.primary)?.fileId ??
            nextPreview.files[0]?.fileId ??
            null
        }
      }
    },
    'import',
  )
  busy.value = null
}

async function selectImportVersion(modelId: number, versionId: number) {
  const url = `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`
  urlInput.value = url
  await previewUrl(url)
}

async function startInstall() {
  const selection = filePreview.value
  const fileId = selectedFileId.value
  if (!selection || fileId === null || !canInstall.value || busy.value) {
    return
  }
  busy.value = 'install'
  importError.value = null
  const repairing = selectedFile.value?.needsRepair === true
  const reusing = selectedFile.value?.reusesInstalledFile === true
  const started = await runApi(
    () => requireApi().startInstall(selection.previewId, fileId, acceptedAnimaLicense.value),
    (job) => {
      upsertJob(job)
      importOpen.value = false
      queueView.value = true
      statusFilter.value = 'downloading'
      notice.value = repairing
        ? `${job.status === 'completed' ? 'Repair complete' : 'Repair started'}: ${job.modelName} ${job.versionName}.`
        : reusing
          ? `${job.status === 'completed' ? 'Version added' : 'Adding version'} from verified local file: ${job.modelName} ${job.versionName}.`
          : `Installation ${job.status === 'completed' ? 'complete' : 'started'}: ${job.modelName} ${job.versionName}.`
    },
    'import',
  )
  if (started) {
    await loadCatalog()
  }
  busy.value = null
}

function upsertJob(job: ModelInstallJobView) {
  if (pendingJobsRead?.isCurrent()) {
    pendingJobsRead.observed.set(job.id, job)
  }
  const index = jobs.value.findIndex((existing) => existing.id === job.id)
  jobs.value =
    index < 0
      ? [job, ...jobs.value]
      : jobs.value.map((existing) => (existing.id === job.id ? job : existing))
}

async function cancelJob(jobId: string) {
  if (busy.value) {
    return
  }
  busy.value = 'cancel'
  error.value = null
  await runApi(
    () => requireApi().cancelInstall(jobId),
    (job) => {
      upsertJob(job)
      notice.value =
        job.status === 'canceled'
          ? `Installation canceled: ${job.modelName}.`
          : `Cancellation requested: ${job.modelName}.`
    },
  )
  busy.value = null
}

async function setDefault(resourceId: string, versionId: string) {
  if (busy.value) {
    return
  }
  busy.value = 'default'
  error.value = null
  const changed = await runApi(
    () => requireApi().setDefaultVersion(resourceId, versionId),
    () => {
      notice.value = 'Default version changed for new selections.'
    },
  )
  if (changed) {
    await loadCatalog()
  }
  busy.value = null
}

async function setPredictionType(
  resourceId: string,
  versionId: string,
  predictionType: IllustriousPredictionType,
) {
  if (busy.value) {
    return
  }
  busy.value = 'prediction'
  error.value = null
  const changed = await runApi(
    () => requireApi().setPredictionType(resourceId, versionId, predictionType),
    () => {
      notice.value = 'Prediction type saved for this exact checkpoint file.'
    },
  )
  if (changed) {
    await loadCatalog()
  }
  busy.value = null
}

function selectPredictionType(
  resourceId: string,
  versionId: string,
  value: number | string | null,
) {
  if (value === 'epsilon' || value === 'v_prediction') {
    void setPredictionType(resourceId, versionId, value)
  }
}

async function checkUpdates(resource: ModelCatalogItem) {
  if (resource.modelId === null || busy.value) {
    return
  }
  busy.value = 'updates'
  error.value = null
  await runApi(
    () => requireApi().checkUpdates(resource.modelId!),
    (result) => {
      const installedIds = new Set(resource.versions.map((version) => version.civitaiVersionId))
      updates.value = {
        ...updates.value,
        [resource.id]: result.availableVersions.filter((version) => !installedIds.has(version.id)),
      }
      checkedUpdates.value = new Set([...checkedUpdates.value, resource.id])
    },
  )
  busy.value = null
}

async function openVersionImport(modelId: number, versionId: number, fileId?: number) {
  openImport(`https://civitai.com/models/${modelId}?modelVersionId=${versionId}`)
  preferredImportFileId.value = fileId ?? null
  if (isConnected.value) {
    await previewUrl()
  }
}

async function openSource(url: string) {
  if (importOpen.value) {
    importError.value = null
  } else {
    error.value = null
  }
  await runApi(
    () => requireApi().openSourceLink(url),
    () => {},
    importOpen.value ? 'import' : 'general',
  )
}

async function openPreviewSource() {
  const selection = filePreview.value
  if (!selection) {
    return
  }
  await openSource(
    `https://civitai.com/models/${selection.modelId}?modelVersionId=${selection.versionId}`,
  )
}

function showAlreadyInstalled() {
  if (!duplicateResource.value) {
    return
  }
  selectedId.value = duplicateResource.value.id
  resetFilters()
  importOpen.value = false
}

function jobPercentage(job: ModelInstallJobView): number {
  if (!job.totalBytes || job.totalBytes <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round((job.bytesDownloaded / job.totalBytes) * 100)))
}

function jobCancelable(job: ModelInstallJobView): boolean {
  return job.status === 'waiting' || job.status === 'downloading' || job.status === 'verifying'
}

watch(show, (visible) => {
  readGuard.invalidateAll()
  if (visible) {
    if (props.focus) {
      resetFilters()
      typeFilter.value = props.focus.resourceType
      selectedId.value = focusedResource.value?.resourceId ?? null
    }
    const isCurrent = readGuard.begin('refresh')
    void loadAll(isCurrent).then(async () => {
      if (!isCurrent() || !props.focus) {
        return
      }
      await nextTick()
      if (!isCurrent()) {
        return
      }
      managerShell.value
        ?.querySelector('.resource-row--selected')
        ?.scrollIntoView({ block: 'nearest' })
      managerShell.value
        ?.querySelector('.version-row--project')
        ?.scrollIntoView({ block: 'nearest' })
    })
  } else {
    loading.value = false
    importOpen.value = false
    tokenPopoverOpen.value = false
    tokenInput.value = ''
  }
})

watch(
  urlInput,
  () => {
    preview.value = null
    selectedFileId.value = null
    preferredImportFileId.value = null
    acceptedAnimaLicense.value = false
  },
  { flush: 'sync' },
)

watch(selectedFileId, () => {
  acceptedAnimaLicense.value = false
})

onMounted(() => {
  try {
    unsubscribeInstall = requireApi().onInstallChanged((job) => {
      upsertJob(job)
      if (job.status === 'completed') {
        void loadCatalog()
      }
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
        void loadStorageSummary()
      }
    })
  } catch (cause) {
    error.value = failureMessage(cause)
  }
  if (show.value) {
    void loadAll()
  }
})

onBeforeUnmount(() => {
  readGuard.dispose()
  unsubscribeInstall?.()
  tokenInput.value = ''
})
</script>

<template>
  <NModal
    v-model:show="show"
    :closeOnEsc="!importOpen"
    :maskClosable="false"
    transform-origin="center"
  >
    <div
      ref="managerShell"
      aria-label="Model Manager"
      aria-modal="true"
      class="manager-shell"
      role="dialog"
    >
      <header class="manager-header">
        <div class="title-line">
          <h1>Model Manager</h1>
          <NTooltip trigger="hover">
            <template v-slot:trigger>
              <NButton aria-label="About Model Manager" circle quaternary size="tiny">
                <template v-slot:icon><NIcon :component="InfoIcon" /></template>
              </NButton>
            </template>
            Install and manage models used by your projects.
          </NTooltip>
        </div>
        <div class="header-actions">
          <NPopover
            v-model:show="tokenPopoverOpen"
            placement="bottom-end"
            trigger="click"
            :width="310"
          >
            <template v-slot:trigger>
              <NButton
                secondary
                size="small"
                :type="tokenStatus?.kind === 'connected' ? 'success' : 'warning'"
              >
                {{
                  tokenStatus?.kind === 'connected'
                    ? 'CivitAI connected'
                    : tokenStatus?.kind === 'failed'
                      ? 'CivitAI connection failed'
                      : tokenStatus?.kind === 'unavailable'
                        ? 'Secure storage unavailable'
                        : 'CivitAI token needed'
                }}
              </NButton>
            </template>
            <div class="token-panel">
              <strong>CivitAI token</strong>
              <p>{{ tokenStatus?.detail ?? 'Checking token status…' }}</p>
              <form
                v-if="tokenStatus?.kind !== 'unavailable'"
                class="token-form"
                @submit.prevent="saveToken"
              >
                <NInput
                  v-model:value="tokenInput"
                  aria-label="CivitAI API token"
                  placeholder="Personal API token"
                  type="password"
                />
                <NButton
                  attrType="submit"
                  :disabled="!tokenInput.trim()"
                  :loading="busy === 'token'"
                  type="primary"
                >
                  {{ isConnected ? 'Change token' : 'Save token' }}
                </NButton>
              </form>
              <div class="token-actions">
                <NButton size="small" text @click="loadTokenStatus">Check connection</NButton>
                <NButton v-if="isConnected" size="small" text type="error" @click="removeToken">
                  Remove token
                </NButton>
              </div>
            </div>
          </NPopover>
          <NButton type="primary" @click="openImport()">
            <template v-slot:icon><NIcon :component="PlusIcon" /></template>
            Add from CivitAI URL
          </NButton>
          <NButton
            aria-label="Close Model Manager"
            circle
            quaternary
            title="Close Model Manager"
            @click="show = false"
          >
            <template v-slot:icon><NIcon :component="XIcon" /></template>
          </NButton>
        </div>
      </header>

      <div v-if="error || notice" aria-live="polite" class="manager-feedback">
        <NAlert
          v-if="error"
          key="n-alert-1"
          closable
          title="Model Manager"
          type="error"
          @close="error = null"
        >
          {{ error }}
        </NAlert>
        <NAlert v-else-if="notice" key="n-alert-2" closable type="success" @close="notice = null">
          {{ notice }}
        </NAlert>
      </div>
      <div v-if="focusedModelMissing || focusedVersionMissing" class="manager-feedback">
        <NAlert
          v-if="focusedModelMissing"
          key="focused-model-missing"
          title="Project model unavailable"
          type="warning"
        >
          {{ focusedResource?.resourceName }} is not in this model library. The Project selection is
          unchanged.
        </NAlert>
        <NAlert
          v-else
          key="focused-version-missing"
          title="Project version unavailable"
          type="warning"
        >
          {{ focusedResource?.versionName }} is not installed for
          {{ focusedResource?.resourceName }}. The Project selection is unchanged.
        </NAlert>
      </div>

      <NSplit
        v-model:size="navigationPaneSize"
        class="manager-body"
        max="300px"
        min="190px"
        :pane1Style="{ minWidth: '190px', maxWidth: 'min(300px, 25%)' }"
      >
        <template v-slot:1>
          <aside aria-label="Model filters" class="manager-navigation">
            <section class="navigation-section">
              <h2>Model Types</h2>
              <NButton
                v-for="choice of typeChoices"
                :key="choice.value"
                :aria-pressed="typeFilter === choice.value"
                block
                class="navigation-choice"
                :class="{ 'navigation-choice--selected': typeFilter === choice.value }"
                quaternary
                @click="selectType(choice.value)"
              >
                <span>{{ choice.label }}</span>
                <span>{{ typeCount(choice.value) }}</span>
              </NButton>
            </section>
            <section class="navigation-section">
              <h2>Status</h2>
              <NButton
                v-for="choice of statusChoices"
                :key="choice.value"
                :aria-pressed="statusFilter === choice.value"
                block
                class="navigation-choice"
                :class="{ 'navigation-choice--selected': statusFilter === choice.value }"
                quaternary
                @click="selectStatus(choice.value)"
              >
                <span>{{ choice.label }}</span>
                <span>{{ statusCount(choice.value) }}</span>
              </NButton>
            </section>
            <div class="storage-summary">
              <div class="storage-usage">
                <span>Models use</span>
                <strong>{{ formatBytes(storageBytes) }}</strong>
              </div>
              <NButton block size="small" tertiary @click="openModelFolder">Open Folder</NButton>
            </div>
          </aside>
        </template>
        <template v-slot:2>
          <NSplit
            v-model:size="resourcePaneSize"
            class="manager-content-split"
            :max="0.78"
            min="320px"
            :pane1Style="{ minWidth: '320px', maxWidth: 'calc(100% - 280px)' }"
          >
            <template v-slot:1>
              <section aria-label="Installed models" class="resource-panel">
                <header class="list-toolbar">
                  <label class="toolbar-field toolbar-field--search">
                    <span>Name</span>
                    <NInput
                      v-model:value="search"
                      clearable
                      placeholder="Search installed models"
                    />
                  </label>
                  <label class="toolbar-field toolbar-field--family">
                    <span>Base model</span>
                    <NSelect v-model:value="familyFilter" :options="familyChoices" />
                  </label>
                  <label class="toolbar-field toolbar-field--sort">
                    <span>Sort by</span>
                    <NSelect v-model:value="sortOrder" :options="sortChoices" />
                  </label>
                  <NButton
                    aria-label="Reset filters"
                    circle
                    class="reset-filters"
                    :disabled="!hasActiveFilters"
                    quaternary
                    title="Reset filters"
                    @click="resetFilters"
                  >
                    <template v-slot:icon><NIcon :component="FilterOffIcon" /></template>
                  </NButton>
                </header>

                <NScrollbar class="resource-scroll">
                  <div v-if="loading" class="list-state">
                    <NSpin size="small" />
                    Loading models…
                  </div>
                  <div v-else-if="showJobs" class="job-list">
                    <div class="queue-heading">
                      <strong>Install Queue</strong>
                      <NButton size="small" text @click="showCatalog">Back to models</NButton>
                    </div>
                    <NEmpty v-if="jobs.length === 0" description="No install jobs yet" />
                    <article v-for="job of jobs" :key="job.id" class="job-row">
                      <div class="job-heading">
                        <strong>{{ job.modelName }}</strong>
                        <NTag
                          size="small"
                          :type="
                            job.status === 'failed'
                              ? 'error'
                              : job.status === 'completed'
                                ? 'success'
                                : 'default'
                          "
                        >
                          {{ job.status }}
                        </NTag>
                      </div>
                      <span>{{ job.versionName }}</span>
                      <NProgress
                        :percentage="jobPercentage(job)"
                        :showIndicator="false"
                        type="line"
                      />
                      <span>
                        {{ formatBytes(job.bytesDownloaded) }} / {{ formatBytes(job.totalBytes) }}
                      </span>
                      <NAlert v-if="job.error" type="error">{{ job.error.message }}</NAlert>
                      <NButton
                        v-if="jobCancelable(job)"
                        :disabled="busy !== null"
                        size="small"
                        tertiary
                        type="error"
                        @click="cancelJob(job.id)"
                      >
                        Cancel
                      </NButton>
                    </article>
                  </div>
                  <NEmpty
                    v-else-if="visibleCatalog.length === 0"
                    class="catalog-empty"
                    :description="
                      catalog.length ? 'No models match these filters' : 'No models installed yet'
                    "
                  >
                    <template v-slot:extra>
                      <NButton v-if="catalog.length" key="n-button-1" @click="resetFilters">
                        Reset filters
                      </NButton>
                      <NButton v-else key="n-button-2" secondary @click="openImport()">
                        Add from CivitAI URL
                      </NButton>
                    </template>
                  </NEmpty>
                  <div v-else class="resource-list">
                    <article
                      v-for="resource of visibleCatalog"
                      :key="resource.id"
                      class="resource-row"
                      :class="{ 'resource-row--selected': selectedResource?.id === resource.id }"
                      :style="accentStyle"
                    >
                      <NButton
                        :aria-pressed="selectedResource?.id === resource.id"
                        class="resource-select"
                        text
                        @click="selectedId = resource.id"
                      >
                        <div class="resource-thumbnail">
                          <img
                            v-if="resource.previewDataUrl"
                            alt=""
                            :src="resource.previewDataUrl"
                          />
                          <span v-else>{{ resource.name.slice(0, 1).toUpperCase() }}</span>
                        </div>
                        <div class="resource-main">
                          <strong :title="resource.name">{{ resource.name }}</strong>
                          <span>
                            {{ resource.author || resource.resourceType }} ·
                            {{ versionFor(resource)?.name ?? 'No version' }}
                          </span>
                          <div class="resource-meta">
                            <NTag size="small">{{ resource.resourceType }}</NTag>
                            <span>
                              {{
                                versionFor(resource)?.baseModelFamily ??
                                (resource.resourceType === 'upscaler'
                                  ? 'Any model'
                                  : 'Unknown family')
                              }}
                            </span>
                            <span>{{ formatBytes(totalSize(resource)) }}</span>
                          </div>
                        </div>
                        <NTag size="small" :type="needsAttention(resource) ? 'warning' : 'success'">
                          {{ resourceStatus(resource) }}
                        </NTag>
                      </NButton>
                    </article>
                  </div>
                </NScrollbar>

                <footer v-if="prominentJob" class="install-strip">
                  <strong>
                    Installing {{ prominentJob.modelName }} · {{ prominentJob.versionName }}
                  </strong>
                  <NProgress
                    :percentage="jobPercentage(prominentJob)"
                    :showIndicator="false"
                    type="line"
                  />
                  <small>
                    {{ prominentJob.status }} · {{ formatBytes(prominentJob.bytesDownloaded) }} /
                    {{ formatBytes(prominentJob.totalBytes) }}
                  </small>
                  <div class="install-actions">
                    <NButton size="small" tertiary type="error" @click="cancelJob(prominentJob.id)">
                      Cancel
                    </NButton>
                    <NButton size="small" tertiary @click="queueView = true">View Queue</NButton>
                  </div>
                </footer>
              </section>
            </template>
            <template v-slot:2>
              <aside aria-label="Model details" class="details-panel">
                <NScrollbar>
                  <div v-if="selectedResource && !showJobs" class="details-scroll">
                    <NCard class="model-card" size="small">
                      <template v-slot:cover>
                        <div class="large-preview">
                          <img
                            v-if="selectedResource.previewDataUrl"
                            alt=""
                            :src="selectedResource.previewDataUrl"
                          />
                          <span v-else>{{ selectedResource.name.slice(0, 1).toUpperCase() }}</span>
                        </div>
                      </template>
                      <template v-slot:header>
                        <h2>{{ selectedResource.name }}</h2>
                      </template>
                      <p v-if="selectedResource.description">{{ selectedResource.description }}</p>
                      <div class="detail-tags">
                        <NTag
                          size="small"
                          :type="needsAttention(selectedResource) ? 'warning' : 'success'"
                        >
                          {{ resourceStatus(selectedResource) }}
                        </NTag>
                        <NTag size="small">{{ selectedResource.resourceType }}</NTag>
                        <NTag v-if="detailVersion?.baseModelFamily" size="small">
                          {{ detailVersion.baseModelFamily }}
                        </NTag>
                        <NTag
                          v-if="detailVersion?.predictionType"
                          key="n-tag-2"
                          size="small"
                          type="info"
                        >
                          {{ detailVersion.predictionType }}
                        </NTag>
                      </div>
                    </NCard>
                    <NCard size="small">
                      <template v-slot:header><h3>Installed Versions</h3></template>
                      <template v-slot:header-extra>
                        <NButton
                          v-if="selectedResource.modelId !== null"
                          :loading="busy === 'updates'"
                          size="small"
                          tertiary
                          @click="checkUpdates(selectedResource)"
                        >
                          <template v-slot:icon><NIcon :component="RefreshIcon" /></template>
                          Check updates
                        </NButton>
                      </template>
                      <div class="version-list">
                        <article
                          v-for="version of selectedResource.versions"
                          :key="version.id"
                          class="version-row"
                          :class="{
                            'version-row--project':
                              focusedResource?.resourceId === selectedResource.id &&
                              focusedResource.versionId === version.id,
                          }"
                        >
                          <div class="version-main">
                            <strong>{{ version.name }}</strong>
                            <span>
                              {{ formatBytes(version.fileSizeBytes) }} · {{ version.fileStatus }}
                            </span>
                            <div
                              v-if="
                                selectedResource.resourceType === 'checkpoint' &&
                                version.baseModelFamily === 'illustrious'
                              "
                              class="version-prediction"
                            >
                              <label :for="`prediction-${version.id}`">Prediction type</label>
                              <NSelect
                                :id="`prediction-${version.id}`"
                                :aria-label="`Prediction type for ${version.name}`"
                                :disabled="busy !== null || version.fileStatus !== 'ready'"
                                :options="predictionChoices"
                                size="small"
                                :value="version.predictionType"
                                @update:value="
                                  (value) =>
                                    selectPredictionType(selectedResource!.id, version.id, value)
                                "
                              />
                              <small>{{ predictionSourceLabel(version) }}</small>
                            </div>
                            <span v-if="version.dependencyIssues.length" class="dependency-warning">
                              Missing: {{ version.dependencyIssues.join(', ') }}
                            </span>
                          </div>
                          <div class="version-actions">
                            <NTag
                              v-if="
                                focusedResource?.resourceId === selectedResource.id &&
                                focusedResource.versionId === version.id
                              "
                              key="selected-in-project"
                              size="small"
                              type="info"
                            >
                              Selected in Project
                            </NTag>
                            <NTag
                              v-if="selectedResource.defaultVersionId === version.id"
                              key="n-tag-2"
                              size="small"
                              type="success"
                            >
                              Default
                            </NTag>
                            <NButton
                              v-if="
                                version.fileStatus !== 'ready' &&
                                selectedResource.modelId !== null &&
                                version.civitaiVersionId !== null &&
                                version.civitaiFileId !== null
                              "
                              key="repair-version"
                              :disabled="busy !== null"
                              size="small"
                              @click="
                                openVersionImport(
                                  selectedResource!.modelId!,
                                  version.civitaiVersionId!,
                                  version.civitaiFileId!,
                                )
                              "
                            >
                              Repair
                            </NButton>
                            <NButton
                              v-else-if="selectedResource.defaultVersionId !== version.id"
                              key="set-default-version"
                              :disabled="busy !== null || version.fileStatus !== 'ready'"
                              size="small"
                              @click="setDefault(selectedResource.id, version.id)"
                            >
                              Set Default
                            </NButton>
                          </div>
                        </article>
                        <div v-if="checkedUpdates.has(selectedResource.id)" class="updates-list">
                          <strong>
                            {{
                              updates[selectedResource.id]?.length
                                ? 'Newer versions'
                                : 'No newer versions found'
                            }}
                          </strong>
                          <article
                            v-for="version of updates[selectedResource.id] ?? []"
                            :key="version.id"
                            class="version-row"
                          >
                            <span>{{ version.name }}</span>
                            <NButton
                              size="small"
                              @click="openVersionImport(selectedResource.modelId!, version.id)"
                            >
                              Install Version
                            </NButton>
                          </article>
                        </div>
                      </div>
                    </NCard>
                    <NCard v-if="detailVersion?.trainedWords.length" size="small">
                      <template v-slot:header><h3>Trigger Words</h3></template>
                      <div class="detail-tags">
                        <NTag v-for="word of detailVersion.trainedWords" :key="word" size="small">
                          {{ word }}
                        </NTag>
                      </div>
                    </NCard>
                    <NCard size="small">
                      <template v-slot:header><h3>Metadata</h3></template>
                      <dl class="metadata-list">
                        <dt>Version</dt>
                        <dd>{{ detailVersion?.name ?? '—' }}</dd>
                        <dt>File</dt>
                        <dd :title="detailVersion?.fileName">
                          {{ detailVersion?.fileName ?? '—' }}
                        </dd>
                      </dl>
                    </NCard>
                    <NButton
                      v-if="selectedResource.sourceUrl"
                      secondary
                      type="primary"
                      @click="openSource(selectedResource.sourceUrl)"
                    >
                      <template v-slot:icon><NIcon :component="ExternalLinkIcon" /></template>
                      Open CivitAI source
                    </NButton>
                  </div>
                  <NEmpty
                    v-else
                    class="details-empty"
                    :description="showJobs ? 'Choose a model to see details' : 'No model selected'"
                  />
                </NScrollbar>
              </aside>
            </template>
          </NSplit>
        </template>
      </NSplit>
    </div>
  </NModal>

  <NModal v-model:show="importOpen" :maskClosable="false">
    <NCard
      aria-labelledby="model-import-title"
      aria-modal="true"
      class="import-dialog"
      contentScrollable
      role="dialog"
      size="small"
    >
      <template v-slot:header>
        <div class="dialog-title">
          <h2 id="model-import-title">Add from CivitAI URL</h2>
          <p>Review the exact version and file before downloading.</p>
        </div>
      </template>
      <template v-slot:header-extra>
        <NButton aria-label="Close import dialog" circle quaternary @click="importOpen = false">
          <template v-slot:icon><NIcon :component="XIcon" /></template>
        </NButton>
      </template>
      <div class="import-content">
        <NAlert v-if="importError" closable type="error" @close="importError = null">
          {{ importError }}
        </NAlert>
        <section v-if="!isConnected" class="token-setup">
          <NAlert
            title="CivitAI token required"
            :type="tokenStatus?.kind === 'unavailable' ? 'error' : 'warning'"
          >
            {{
              tokenStatus?.detail ??
              'A token is required before model metadata and downloads can be fetched.'
            }}
          </NAlert>
          <form
            v-if="tokenStatus?.kind !== 'unavailable'"
            class="token-form"
            @submit.prevent="saveToken"
          >
            <NInput
              v-model:value="tokenInput"
              aria-label="CivitAI API token for import"
              placeholder="Personal API token"
              type="password"
            />
            <NButton
              attrType="submit"
              :disabled="!tokenInput.trim()"
              :loading="busy === 'token'"
              type="primary"
            >
              Save token
            </NButton>
          </form>
        </section>
        <label class="import-url-label">
          Model URL
          <NInput
            v-model:value="urlInput"
            clearable
            placeholder="https://civitai.com/models/…"
            @keyup.enter="previewUrl()"
          />
        </label>
        <NButton
          :disabled="!isConnected || !urlInput.trim() || busy !== null"
          :loading="busy === 'preview'"
          secondary
          @click="previewUrl()"
        >
          Fetch preview
        </NButton>
        <section v-if="preview?.kind === 'select-version'" class="import-selection">
          <h3>{{ preview.modelName }}</h3>
          <p>Select a CivitAI version to inspect its files.</p>
          <NButton
            v-for="version of preview.versions"
            :key="version.id"
            block
            class="version-option"
            @click="selectImportVersion(preview.modelId, version.id)"
          >
            {{ version.name }} · {{ version.baseModel ?? 'Unknown family' }}
          </NButton>
        </section>
        <section v-if="filePreview" class="import-selection">
          <div class="import-identity">
            <div class="import-thumbnail">
              <img
                v-if="filePreview.previewImageDataUrl"
                alt=""
                :src="filePreview.previewImageDataUrl"
              />
              <span v-else>{{ filePreview.modelName.slice(0, 1).toUpperCase() }}</span>
            </div>
            <div>
              <h3>{{ filePreview.modelName }}</h3>
              <p>
                {{ filePreview.author ?? 'CivitAI' }} · {{ filePreview.versionName }} ·
                {{ filePreview.resourceType }} · {{ filePreview.baseModel }}
              </p>
            </div>
          </div>
          <p v-if="filePreview.description" class="import-description">
            {{ filePreview.description }}
          </p>
          <label class="file-choice">
            File
            <NSelect
              v-model:value="selectedFileId"
              :options="
                filePreview.files.map((file) => ({
                  label: importFileLabel(file),
                  value: file.fileId,
                }))
              "
            />
          </label>
          <p v-if="selectedFile" class="file-note">
            {{ selectedFile.format ?? 'Model file' }} ·
            {{
              selectedFile.sha256
                ? 'SHA-256 will be verified'
                : 'File identity will be checked during download'
            }}
          </p>
          <NAlert
            v-if="selectedFile?.alreadyInstalled"
            key="n-alert-2"
            title="Already installed"
            type="success"
          >
            This exact CivitAI file is already in your library.
            <NButton
              v-if="duplicateResource"
              size="small"
              text
              type="primary"
              @click="showAlreadyInstalled"
            >
              Show in Model Manager
            </NButton>
          </NAlert>
          <NAlert
            v-else-if="selectedFile?.needsRepair"
            key="repair-exact-file"
            title="Repair this version"
            type="warning"
          >
            This exact CivitAI version is in your library, but its model file or required components
            are missing or failed verification. Repair reuses valid files and keeps its version and
            project references.
          </NAlert>
          <NAlert
            v-else-if="selectedFile?.reusesInstalledFile"
            key="reuse-verified-file"
            title="Verified file already available"
            type="info"
          >
            Add this version separately using the existing file. The selected file needs no new
            download.
          </NAlert>
          <div v-if="filePreview.dependencies.length" class="dependency-list">
            <strong>Required files installed together</strong>
            <div
              v-for="dependency of filePreview.dependencies"
              :key="dependency.role"
              class="dependency-row"
            >
              <span>
                {{ dependency.name }}
                <small>({{ dependency.role === 'qwen3_encoder' ? 'Qwen3 encoder' : 'VAE' }})</small>
              </span>
              <span>
                {{ dependency.alreadyInstalled ? 'Installed' : formatBytes(dependency.sizeBytes) }}
              </span>
            </div>
          </div>
          <strong class="total-size">
            Estimated additional download: {{ formatBytes(selectedAdditionalBytes) }}
          </strong>
          <NAlert
            v-if="selectedFile && !selectedFileSizeKnown"
            key="model-download-size"
            title="Download size unavailable"
            type="error"
          >
            CivitAI did not provide a valid size for this file. Fetch the preview again or choose
            another file before installing.
          </NAlert>
          <NAlert
            v-if="
              selectedFileSizeKnown &&
              filePreview.resourceType === 'checkpoint' &&
              filePreview.baseModelFamily === 'anima' &&
              (selectedAdditionalBytes === null || filePreview.dependencies.length < 2)
            "
            key="anima-install-details"
            title="Installation details incomplete"
            type="error"
          >
            The full Anima download and required files must be known before installation.
          </NAlert>
          <NAlert
            v-if="selectedFileLicense"
            key="anima-license"
            title="Anima use restriction"
            type="warning"
          >
            {{ selectedFileLicense.summary }}
            <NButton
              class="license-link"
              size="small"
              text
              type="primary"
              @click="openSource(selectedFileLicense.url)"
            >
              Read {{ selectedFileLicense.name }}
              <NIcon :component="ExternalLinkIcon" />
            </NButton>
          </NAlert>
          <NAlert
            v-else-if="conditionalAnimaLicense"
            key="anima-conditional-license"
            title="Source hash unavailable"
            type="info"
          >
            CivitAI did not provide a SHA-256 hash for this file. If its downloaded bytes match
            CircleStone Anima Base, the Base license also applies.
            <NButton
              class="license-link"
              size="small"
              text
              type="primary"
              @click="openSource(animaBaseLicenseUrl)"
            >
              Read CircleStone Anima Base license
              <NIcon :component="ExternalLinkIcon" />
            </NButton>
          </NAlert>
          <NAlert
            v-if="
              filePreview.baseModelFamily === 'anima' && filePreview.resourceType === 'checkpoint'
            "
            key="anima-companion-license"
            title="Required component terms"
            type="warning"
          >
            The Qwen3 encoder and VAE installed or reused with this checkpoint are CircleStone files
            for non-commercial, non-production use. A custom checkpoint may have separate terms. If
            the selected file is the official Base checkpoint, the same CircleStone terms apply to
            it too.
            <NButton
              class="license-link"
              size="small"
              text
              type="primary"
              @click="openSource(animaBaseLicenseUrl)"
            >
              Read CircleStone license
              <NIcon :component="ExternalLinkIcon" />
            </NButton>
            <NCheckbox v-model:checked="acceptedAnimaLicense" class="license-acknowledgment">
              I understand these component terms and the Base terms if applicable.
            </NCheckbox>
          </NAlert>
          <NButton class="source-link" size="small" text @click="openPreviewSource">
            Open CivitAI source
            <NIcon :component="ExternalLinkIcon" />
          </NButton>
        </section>
      </div>
      <template v-slot:footer>
        <div class="import-actions">
          <NButton @click="importOpen = false">Cancel</NButton>
          <NButton
            :disabled="!canInstall || busy !== null"
            :loading="busy === 'install'"
            type="primary"
            @click="startInstall"
          >
            <template v-slot:icon>
              <NIcon :component="selectedFile?.needsRepair ? RefreshIcon : DownloadIcon" />
            </template>
            {{
              selectedFile?.needsRepair
                ? `Repair ${filePreview?.versionName ?? 'model'}`
                : selectedFile?.reusesInstalledFile
                  ? `Add ${filePreview?.versionName ?? 'version'} from library`
                  : `Install ${filePreview?.versionName ?? 'model'}`
            }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.manager-shell {
  display: flex;
  flex-direction: column;
  width: min(1440px, calc(100vw - 64px));
  height: min(890px, calc(100vh - 32px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.manager-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 64px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--app-border);
}
.title-line,
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-line h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.manager-feedback {
  flex: 0 0 auto;
  padding: 8px 14px 0;
}
.manager-body,
.manager-content-split {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.manager-body {
  flex: 1 1 0;
  height: auto;
}
.manager-navigation {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
  padding: 18px;
}
.navigation-section {
  display: grid;
  gap: 3px;
}
.navigation-section h2,
.toolbar-field > span,
.details-scroll h3 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.navigation-choice {
  width: 100%;
}
.navigation-choice :deep(.n-button__content) {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
.navigation-choice--selected {
  background: var(--app-elevated-hover);
}
.storage-summary {
  display: grid;
  gap: 10px;
  margin-top: auto;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.storage-usage {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.resource-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-right: 1px solid var(--app-border);
}
.list-toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  grid-template-areas: 'search search reset' 'family sort .';
  align-items: end;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
}
.toolbar-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.toolbar-field > span {
  margin: 0;
}
.toolbar-field--search {
  grid-area: search;
}
.toolbar-field--family {
  grid-area: family;
}
.toolbar-field--sort {
  grid-area: sort;
}
.reset-filters {
  grid-area: reset;
}
.resource-scroll {
  min-height: 0;
  height: 100%;
}
.resource-list,
.job-list {
  display: grid;
  align-content: start;
  gap: 6px;
  padding: 12px 14px;
}
.resource-row {
  position: relative;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.resource-row:hover,
.resource-row--selected {
  border-color: var(--app-border);
  background: var(--app-elevated-hover);
}
.resource-row--selected::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--resource-accent);
  content: '';
}
.resource-select {
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 76px;
  padding: 10px 12px;
  text-align: left;
}
.resource-select :deep(.n-button__content) {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  text-align: left;
  white-space: normal;
}
.resource-thumbnail,
.import-thumbnail {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-chrome);
  color: var(--app-text-muted);
  font-size: 20px;
}
.resource-thumbnail img,
.import-thumbnail img,
.large-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.resource-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.resource-main > strong,
.resource-main > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resource-main > span,
.resource-meta {
  color: var(--app-text-muted);
  font-size: 12px;
}
.resource-meta,
.detail-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.list-state,
.catalog-empty {
  margin: 28px auto;
}
.list-state {
  display: flex;
  align-items: center;
  gap: 12px;
}
.queue-heading,
.job-heading,
.dependency-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.job-row {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.job-row > span,
.install-strip small {
  color: var(--app-text-muted);
  font-size: 12px;
}
.job-row > button {
  justify-self: start;
}
.install-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'title actions' 'progress actions' 'subtitle actions';
  align-items: center;
  gap: 2px 12px;
  min-height: 66px;
  padding: 8px 14px;
  border-top: 1px solid var(--app-border);
}
.install-strip > strong {
  grid-area: title;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.install-strip > :nth-child(2) {
  grid-area: progress;
}
.install-strip > small {
  grid-area: subtitle;
}
.install-actions {
  grid-area: actions;
  display: flex;
  gap: 8px;
}
.details-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.details-panel :deep(.n-scrollbar) {
  height: 100%;
}
.details-scroll {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 14px;
}
.details-scroll h2,
.details-scroll p {
  margin: 0;
}
.details-scroll h2 {
  font-size: 18px;
  overflow-wrap: anywhere;
}
.details-scroll h3 {
  margin: 0;
}
.large-preview {
  display: grid;
  place-items: center;
  height: clamp(160px, 23vh, 230px);
  overflow: hidden;
  background: var(--app-elevated);
  color: var(--app-text-muted);
  font-size: 52px;
}
.model-card p {
  margin-bottom: 10px;
}
.detail-tags {
  margin-top: 10px;
}
.version-list {
  display: grid;
  gap: 6px;
}
.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}
.version-main {
  display: grid;
  min-width: 0;
}
.version-main > span {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version-prediction {
  display: grid;
  gap: 4px;
  width: min(220px, 100%);
  margin-top: 8px;
}
.version-prediction label {
  font-size: 12px;
  font-weight: 600;
}
.version-prediction small {
  color: var(--app-text-muted);
  line-height: 1.3;
}
.version-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.version-row strong,
.version-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.updates-list {
  display: grid;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}
.metadata-list {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 14px;
  margin: 0;
}
.metadata-list dt {
  color: var(--app-text-muted);
}
.metadata-list dd {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.details-empty {
  margin: 30px auto;
}
.token-panel,
.token-form,
.import-content,
.import-selection,
.dependency-list {
  display: grid;
  gap: 10px;
}
.token-panel p {
  margin: 0;
  color: var(--app-text-muted);
}
.token-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.import-dialog {
  width: min(610px, calc(100vw - 90px));
  max-height: min(780px, calc(100vh - 60px));
}
.dialog-title {
  display: grid;
  gap: 4px;
}
.dialog-title h2,
.dialog-title p,
.import-selection h3,
.import-selection p {
  margin: 0;
}
.dialog-title h2 {
  font-size: 17px;
}
.dialog-title p,
.import-selection p,
.file-note {
  color: var(--app-text-muted);
}
.import-url-label,
.file-choice {
  display: grid;
  gap: 6px;
  font-weight: 600;
}
.import-selection {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}
.version-option {
  justify-content: flex-start;
}
.import-identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}
.import-identity > div:last-child {
  min-width: 0;
}
.dependency-list {
  padding: 10px 0;
  border-block: 1px solid var(--app-border);
}
.dependency-row small {
  color: var(--app-text-muted);
}
.total-size {
  font-size: 13px;
}
.license-link,
.license-acknowledgment,
.source-link {
  margin-top: 8px;
}
.license-acknowledgment {
  display: block;
}
.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 1100px) {
  .manager-shell {
    width: calc(100vw - 24px);
  }

  .manager-header {
    gap: 12px;
    padding-inline: 16px;
  }

  .title-line h1 {
    font-size: 18px;
  }

  .version-row {
    flex-wrap: wrap;
  }

  .version-actions {
    margin-left: auto;
  }
}
</style>
