<script setup lang="ts">
import { NModal, NSplit } from 'naive-ui'
import { computed, nextTick, onMounted, ref } from 'vue'

import type { ModelResource } from './model-manager.types'

import { AppLayer } from '../../theme/app-layers'
import CivitaiImportModal from './CivitaiImportModal.vue'
import { modelResources, selectedModelId } from './model-manager.mock'
import ModelDetailsPanel from './ModelDetailsPanel.vue'
import ModelManagerHeader from './ModelManagerHeader.vue'
import ModelManagerNavigation from './ModelManagerNavigation.vue'
import ModelResourceList from './ModelResourceList.vue'

const selectedId = ref(selectedModelId)
const showImportModal = ref(false)
const modelTypeFilter = ref('all')
const statusFilter = ref('all')
const searchFilter = ref('')
const baseModelFilter = ref('all')
const sortValue = ref('name')
const managerOpen = ref(false)
const navigationPaneSize = ref<number | string>('220px')
const resourcePaneSize = ref<number | string>('calc(100% - 520px)')

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
  const resource = modelResources.find((resource) => resource.id === selectedId.value)
  const fallbackResource = modelResources[0]

  if (resource) {
    return resource
  }

  if (fallbackResource) {
    return fallbackResource
  }

  throw new Error('Model Manager prototype requires at least one mock resource.')
}

const selectedResource = computed(getSelectedResource)

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
                  :resources="modelResources"
                  :selectedId
                  @resetFilters="resetFilters"
                  @select="selectedId = $event"
                />
              </main>
            </template>
            <template v-slot:2>
              <aside class="manager-column manager-column--details">
                <ModelDetailsPanel :resource="selectedResource" />
              </aside>
            </template>
          </NSplit>
        </template>
      </NSplit>
    </div>
  </NModal>
  <CivitaiImportModal v-model:show="showImportModal" />
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
