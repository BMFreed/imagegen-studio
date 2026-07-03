<template>
  <section class="manager-backdrop" aria-label="Model Manager prototype">
    <section class="manager-shell">
      <ModelManagerHeader @open-import="showImportModal = true" />
      <div class="manager-body">
        <aside class="manager-column manager-column--navigation">
          <ModelManagerNavigation />
        </aside>
        <main class="resource-content">
          <ModelResourceList :resources="modelResources" :selected-id="selectedId" @select="selectedId = $event" />
        </main>
        <aside class="manager-column manager-column--details">
          <ModelDetailsPanel :resource="selectedResource" />
        </aside>
      </div>
    </section>
    <CivitaiImportModal v-model:show="showImportModal" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import CivitaiImportModal from './CivitaiImportModal.vue';
import ModelDetailsPanel from './ModelDetailsPanel.vue';
import ModelManagerHeader from './ModelManagerHeader.vue';
import ModelManagerNavigation from './ModelManagerNavigation.vue';
import ModelResourceList from './ModelResourceList.vue';
import { modelResources, selectedModelId } from './model-manager.mock';

const selectedId = ref(selectedModelId);
const showImportModal = ref(false);

const selectedResource = computed(() => {
  return modelResources.find((resource) => resource.id === selectedId.value) ?? modelResources[0];
});
</script>

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
  width: min(1280px, calc(100vw - 96px));
  height: min(760px, calc(100vh - 140px));
  min-height: 620px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: 0 24px 70px var(--app-shadow-shell);
}

.manager-body {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr) 370px;
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
