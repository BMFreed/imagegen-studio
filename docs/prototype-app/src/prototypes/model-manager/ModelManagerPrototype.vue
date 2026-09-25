<script setup lang="ts">
import { NModal, NSplit } from 'naive-ui'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import type {
  ModelResource,
  ModelResourceVersion,
  ModelVersionInstallActivity,
} from './model-manager.types'

import { AppLayer } from '../../theme/app-layers'
import CivitaiImportModal from './CivitaiImportModal.vue'
import { availableModelVersions, modelResources, selectedModelId } from './model-manager.mock'
import ModelDetailsPanel from './ModelDetailsPanel.vue'
import ModelManagerHeader from './ModelManagerHeader.vue'
import ModelManagerNavigation from './ModelManagerNavigation.vue'
import ModelResourceList from './ModelResourceList.vue'
import ModelVersionPreviewModal from './ModelVersionPreviewModal.vue'

const selectedId = ref(selectedModelId)
const resources = ref<ModelResource[]>(structuredClone(modelResources))
const showImportModal = ref(false)
const showVersionPreview = ref(false)
const modelTypeFilter = ref('all')
const statusFilter = ref('all')
const searchFilter = ref('')
const baseModelFilter = ref('all')
const sortValue = ref('name')
const managerOpen = ref(false)
const navigationPaneSize = ref<number | string>('220px')
const resourcePaneSize = ref<number | string>('calc(100% - 520px)')
const versionInstall = ref<ModelVersionInstallActivity | null>(null)
const checkedUpdateIds = ref<string[]>([])
let installTimer: ReturnType<typeof setTimeout> | undefined

defineEmits<{
  close: []
}>()

const hasActiveFilters = computed(
  () =>
    modelTypeFilter.value !== 'all' ||
    statusFilter.value !== 'all' ||
    searchFilter.value.trim() !== '' ||
    baseModelFilter.value !== 'all',
)

function getSelectedResource(): ModelResource {
  const resource = resources.value.find((candidate) => candidate.id === selectedId.value)
  const fallbackResource = resources.value[0]

  if (resource) {
    return resource
  }

  if (fallbackResource) {
    return fallbackResource
  }

  throw new Error('Model Manager prototype requires at least one mock resource.')
}

const selectedResource = computed(getSelectedResource)

function checkForUpdates() {
  const resource = selectedResource.value
  const available = availableModelVersions[resource.id]
  resource.availableVersion =
    available && !resource.versions?.some((version) => version.id === available.id)
      ? structuredClone(available)
      : undefined
  if (!checkedUpdateIds.value.includes(resource.id)) {
    checkedUpdateIds.value = [...checkedUpdateIds.value, resource.id]
  }
}

function previewAvailableVersion() {
  if (selectedResource.value.availableVersion) {
    showVersionPreview.value = true
  }
}

function installAvailableVersion() {
  const resource = selectedResource.value
  const available = resource.availableVersion
  if (!available || installTimer) {
    return
  }

  showVersionPreview.value = false
  versionInstall.value = {
    modelName: resource.name,
    percentage: 64,
    status: 'downloading',
    versionLabel: available.label,
  }

  installTimer = setTimeout(() => {
    const installedVersion: ModelResourceVersion = {
      description: available.description,
      fileName: available.fileName,
      id: available.id,
      isDefault: false,
      label: available.label,
      sizeLabel: available.sizeLabel,
    }
    resource.versions = [installedVersion, ...(resource.versions ?? [])]
    resource.availableVersion = undefined
    versionInstall.value = { ...versionInstall.value!, percentage: 100, status: 'completed' }
    installTimer = undefined
  }, 650)
}

function cancelVersionInstall() {
  if (!installTimer || !versionInstall.value) {
    return
  }

  clearTimeout(installTimer)
  installTimer = undefined
  versionInstall.value = { ...versionInstall.value, percentage: 0, status: 'cancelled' }
}

function setDefaultVersion(versionId: string) {
  const resource = selectedResource.value
  const target = resource.versions?.find((version) => version.id === versionId)
  if (!target) {
    return
  }

  for (const version of resource.versions ?? []) {
    version.isDefault = version.id === versionId
  }
  resource.versionLabel = target.label.split(' ')[0]
  resource.sizeLabel = target.sizeLabel
}

function resetFilters() {
  modelTypeFilter.value = 'all'
  statusFilter.value = 'all'
  searchFilter.value = ''
  baseModelFilter.value = 'all'
}

function requestClose() {
  managerOpen.value = false
}

function handleVisibilityChange(visible: boolean) {
  if (!visible) {
    requestClose()
  }
}

onMounted(() => {
  void nextTick(() => {
    managerOpen.value = true
  })
})

onUnmounted(() => {
  clearTimeout(installTimer)
})
</script>

<template>
  <NModal
    :closeOnEsc="!showImportModal"
    :maskClosable="false"
    :show="managerOpen"
    transformOrigin="center"
    :zIndex="AppLayer.appOverlay"
    @afterLeave="$emit('close')"
    @update:show="handleVisibilityChange"
  >
    <div aria-label="Model Manager prototype" aria-modal="true" class="manager-shell" role="dialog">
      <ModelManagerHeader @close="requestClose" @openImport="showImportModal = true" />
      <NSplit v-model:size="navigationPaneSize" class="manager-body" max="320px" min="190px">
        <template v-slot:1>
          <aside class="manager-column manager-column--navigation">
            <ModelManagerNavigation
              v-model:modelType="modelTypeFilter"
              v-model:status="statusFilter"
            />
          </aside>
        </template>
        <template v-slot:2>
          <NSplit
            v-model:size="resourcePaneSize"
            class="manager-content-split"
            :max="0.75"
            min="460px"
          >
            <template v-slot:1>
              <main class="resource-content">
                <ModelResourceList
                  v-model:baseModel="baseModelFilter"
                  v-model:search="searchFilter"
                  v-model:sort="sortValue"
                  :hasActiveFilters
                  :resources
                  :selectedId
                  :versionInstall
                  @cancelInstall="cancelVersionInstall"
                  @resetFilters="resetFilters"
                  @select="selectedId = $event"
                />
              </main>
            </template>
            <template v-slot:2>
              <aside class="manager-column manager-column--details">
                <ModelDetailsPanel
                  :resource="selectedResource"
                  :updatesChecked="checkedUpdateIds.includes(selectedResource.id)"
                  @checkForUpdates="checkForUpdates"
                  @previewVersion="previewAvailableVersion"
                  @setDefaultVersion="setDefaultVersion"
                />
              </aside>
            </template>
          </NSplit>
        </template>
      </NSplit>
    </div>
  </NModal>
  <CivitaiImportModal v-model:show="showImportModal" />
  <ModelVersionPreviewModal
    v-model:show="showVersionPreview"
    :resource="selectedResource"
    @install="installAvailableVersion"
  />
</template>

<style scoped>
.manager-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1440px, calc(100vw - 96px));
  height: min(890px, calc(100vh - 32px));
  min-height: 0;
  overflow: visible;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.manager-body {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.manager-content-split {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.manager-column,
.resource-content {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
</style>
