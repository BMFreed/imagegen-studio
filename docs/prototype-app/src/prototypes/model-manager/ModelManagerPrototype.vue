<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ModelResource } from './model-manager.types';

import CivitaiImportModal from './CivitaiImportModal.vue';
import { modelResources, selectedModelId } from './model-manager.mock';
import ModelDetailsPanel from './ModelDetailsPanel.vue';
import ModelManagerHeader from './ModelManagerHeader.vue';
import ModelManagerNavigation from './ModelManagerNavigation.vue';
import ModelResourceList from './ModelResourceList.vue';

const selectedId = ref(selectedModelId);
const showImportModal = ref(false);
const modelTypeFilter = ref('all');
const statusFilter = ref('all');
const searchFilter = ref('');
const baseModelFilter = ref('all');
const sortValue = ref('name');

const hasActiveFilters = computed(
  () =>
    modelTypeFilter.value !== 'all' ||
    statusFilter.value !== 'all' ||
    searchFilter.value.trim() !== '' ||
    baseModelFilter.value !== 'all',
);

function getSelectedResource(): ModelResource {
  const resource = modelResources.find((resource) => resource.id === selectedId.value);
  const fallbackResource = modelResources[0];

  if (resource) {
    return resource;
  }

  if (fallbackResource) {
    return fallbackResource;
  }

  throw new Error('Model Manager prototype requires at least one mock resource.');
}

const selectedResource = computed(getSelectedResource);

function resetFilters() {
  modelTypeFilter.value = 'all';
  statusFilter.value = 'all';
  searchFilter.value = '';
  baseModelFilter.value = 'all';
}
</script>

<template>
  <section aria-label="Model Manager prototype" class="manager-backdrop">
    <section class="manager-shell">
      <ModelManagerHeader @openImport="showImportModal = true" />
      <div class="manager-body">
        <aside class="manager-column manager-column--navigation">
          <ModelManagerNavigation
            v-model:modelType="modelTypeFilter"
            v-model:status="statusFilter"
          />
        </aside>
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
        <aside class="manager-column manager-column--details">
          <ModelDetailsPanel :resource="selectedResource" />
        </aside>
      </div>
    </section>
    <CivitaiImportModal v-model:show="showImportModal" />
  </section>
</template>

<style scoped>
.manager-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 36px;
  background: var(--app-overlay-backdrop);
  backdrop-filter: blur(7px);
}

.manager-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1440px, calc(100vw - 96px));
  height: min(860px, calc(100vh - 120px));
  min-height: 620px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: 0 24px 70px var(--app-shadow-shell);
}

.manager-body {
  display: grid;
  grid-template-columns: 230px minmax(540px, 1fr) clamp(420px, 36%, 500px);
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.manager-column,
.resource-content,
.manager-column--navigation,
.manager-column--details {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.manager-column--navigation,
.resource-content {
  border-right: 1px solid var(--app-border);
}
</style>
