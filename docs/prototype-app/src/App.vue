<script setup lang="ts">
import {
  darkTheme,
  NButton,
  NConfigProvider,
  NDialogProvider,
  NEmpty,
  NMessageProvider,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type { DocumentTabModel } from './components/app-shell.types';
import type { HomeProjectRecord, HomeScenarioId } from './prototypes/home/home.types';

import AppChrome from './components/AppChrome.vue';
import DocumentTabs from './components/DocumentTabs.vue';
import ProjectContextMock from './components/ProjectContextMock.vue';
import HomePrototype from './prototypes/home/HomePrototype.vue';
import ModelManagerPrototype from './prototypes/model-manager/ModelManagerPrototype.vue';
import ApplyPresetPrototype from './prototypes/presets/ApplyPresetPrototype.vue';
import PresetManagerPrototype from './prototypes/presets/PresetManagerPrototype.vue';
import { currentProjectPresetSource } from './prototypes/presets/presets.mock';
import { appLayerCssVariables } from './theme/app-layers';
import { imageGenNaiveTheme } from './theme/naive-theme';

type PrototypeId = 'apply-preset' | 'home' | 'model-manager' | 'preset-manager' | 'save-preset';

const prototypeIds = new Set<PrototypeId>([
  'apply-preset',
  'home',
  'model-manager',
  'preset-manager',
  'save-preset',
]);
const scenarioIds = new Set<HomeScenarioId>(['default', 'first-run', 'no-model', 'problems']);
const searchParameters = new URLSearchParams(globalThis.location.search);
const requestedPrototype = searchParameters.get('prototype');
const requestedScenario = searchParameters.get('scenario');

const activePrototype = computed<PrototypeId>(() =>
  prototypeIds.has(requestedPrototype as PrototypeId)
    ? (requestedPrototype as PrototypeId)
    : 'home',
);
const homeScenario = computed<HomeScenarioId>(() =>
  scenarioIds.has(requestedScenario as HomeScenarioId)
    ? (requestedScenario as HomeScenarioId)
    : 'default',
);
const usesProjectContext = computed(
  () => activePrototype.value === 'apply-preset' || activePrototype.value === 'save-preset',
);

const workspaceColors: Record<string, string> = {
  'archive-drive': '#b8a06a',
  'character-studies': '#74a8ff',
  'regional-drafts': '#b58cff',
  uncategorized: '#64e36e',
  'upscale-tests': '#f0b65f',
};
const homeTab: DocumentTabModel = { dirty: false, id: 'home', kind: 'home', title: 'Home' };
const homeDocumentTabs = ref<DocumentTabModel[]>([
  homeTab,
  {
    dirty: false,
    id: 'sample-project-b',
    kind: 'project',
    title: 'Sample Project B.igs',
    workspaceColor: workspaceColors['uncategorized'],
  },
  {
    dirty: false,
    id: 'sample-project-a',
    kind: 'project',
    title: 'Sample Project A.igs',
    workspaceColor: workspaceColors['uncategorized'],
  },
]);
const staticDocumentTabs: DocumentTabModel[] = [
  homeTab,
  {
    dirty: true,
    id: 'sample-project-b',
    kind: 'project',
    title: 'Sample Project B.igs',
    workspaceColor: workspaceColors['uncategorized'],
  },
  {
    dirty: false,
    id: 'sample-project-a',
    kind: 'project',
    title: 'Sample Project A.igs',
    workspaceColor: workspaceColors['character-studies'],
  },
];
const activeDocumentId = ref(activePrototype.value === 'home' ? 'home' : 'sample-project-b');
const showHomeModelManager = ref(false);
const showHomePresetManager = ref(false);
const showStandaloneModelManager = ref(true);

const documentTabs = computed(() =>
  activePrototype.value === 'home' ? homeDocumentTabs.value : staticDocumentTabs,
);
const openProjectIds = computed(() =>
  homeDocumentTabs.value.filter((tab) => tab.kind === 'project').map((tab) => tab.id),
);
const dirtyProjectIds = computed(() =>
  homeDocumentTabs.value.filter((tab) => tab.kind === 'project' && tab.dirty).map((tab) => tab.id),
);

function requestHome() {
  if (activePrototype.value !== 'home') {
    globalThis.location.href = '/';
    return;
  }
  if (!homeDocumentTabs.value.some((tab) => tab.id === 'home')) {
    homeDocumentTabs.value.unshift({ ...homeTab });
  }
  activeDocumentId.value = 'home';
}

function openHomeModelManager() {
  showHomePresetManager.value = false;
  showHomeModelManager.value = true;
}

function openHomePresetManager() {
  showHomeModelManager.value = false;
  showHomePresetManager.value = true;
}

function closeDocument(id: string) {
  const index = homeDocumentTabs.value.findIndex((tab) => tab.id === id);
  if (index < 0) {
    return;
  }
  homeDocumentTabs.value.splice(index, 1);
  if (activeDocumentId.value === id) {
    activeDocumentId.value =
      homeDocumentTabs.value[index]?.id ?? homeDocumentTabs.value[index - 1]?.id ?? '';
  }
}

function openHomeProject(value: {
  project: HomeProjectRecord;
  recovered?: boolean;
  target: 'current' | 'new';
}) {
  const existing = homeDocumentTabs.value.find((tab) => tab.id === value.project.id);
  if (existing) {
    if (value.recovered) {
      existing.dirty = true;
    }
    activeDocumentId.value = existing.id;
    return;
  }
  const tab: DocumentTabModel = {
    dirty: value.recovered ?? false,
    id: value.project.id,
    kind: 'project',
    title: value.project.fileName,
    workspaceColor: workspaceColors[value.project.workspaceId] ?? '#64e36e',
  };
  const homeIndex = homeDocumentTabs.value.findIndex((candidate) => candidate.id === 'home');
  if (value.target === 'current' && homeIndex >= 0) {
    homeDocumentTabs.value.splice(homeIndex, 1, tab);
  } else {
    homeDocumentTabs.value.splice(
      homeIndex >= 0 ? homeIndex + 1 : homeDocumentTabs.value.length,
      0,
      tab,
    );
  }
  activeDocumentId.value = tab.id;
}

function syncProjectTab(project: HomeProjectRecord) {
  const tab = homeDocumentTabs.value.find((candidate) => candidate.id === project.id);
  if (!tab) {
    return;
  }
  tab.title = project.fileName;
  tab.workspaceColor = workspaceColors[project.workspaceId] ?? tab.workspaceColor;
}
</script>

<template>
  <NConfigProvider :theme="darkTheme" :themeOverrides="imageGenNaiveTheme">
    <NDialogProvider>
      <NMessageProvider>
        <div class="app-shell" :style="appLayerCssVariables">
          <AppChrome @home="requestHome" />
          <div class="app-workspace">
            <DocumentTabs
              v-model:activeId="activeDocumentId"
              :tabs="documentTabs"
              @close="closeDocument"
            />
            <main class="prototype-stage">
              <template v-if="activePrototype === 'home'">
                <HomePrototype
                  v-show="activeDocumentId === 'home'"
                  :aria-hidden="showHomeModelManager || showHomePresetManager || undefined"
                  :dirtyProjectIds
                  :inert="showHomeModelManager || showHomePresetManager || undefined"
                  :openProjectIds
                  :scenario="homeScenario"
                  @manageModels="openHomeModelManager"
                  @managePresets="openHomePresetManager"
                  @openProject="openHomeProject"
                  @projectChanged="syncProjectTab"
                />
                <ProjectContextMock v-if="activeDocumentId && activeDocumentId !== 'home'" />
                <NEmpty v-if="!activeDocumentId" description="No document open">
                  <template v-slot:extra>
                    <NButton type="primary" @click="requestHome">Open Home</NButton>
                  </template>
                </NEmpty>
              </template>
              <ProjectContextMock v-else-if="usesProjectContext" />
              <section v-else aria-hidden="true" class="home-context">
                <div class="workspace-sidebar">
                  <span class="sidebar-title">Workspaces</span>
                  <span class="sidebar-item sidebar-item--active">Uncategorized</span>
                  <span class="sidebar-item">Character studies</span>
                  <span class="sidebar-item">Upscale tests</span>
                </div>
                <div class="workspace-grid">
                  <div class="workspace-card" />
                  <div class="workspace-card workspace-card--wide" />
                  <div class="workspace-card" />
                </div>
              </section>
            </main>
            <ModelManagerPrototype
              v-if="activePrototype === 'model-manager' && showStandaloneModelManager"
              @close="showStandaloneModelManager = false"
            />
            <PresetManagerPrototype
              v-if="activePrototype === 'home' && showHomePresetManager"
              key="home-preset-manager"
              @close="showHomePresetManager = false"
            />
            <ModelManagerPrototype
              v-if="activePrototype === 'home' && showHomeModelManager"
              key="model-manager-prototype-2"
              @close="showHomeModelManager = false"
            />
            <PresetManagerPrototype
              v-if="activePrototype === 'preset-manager'"
              key="preset-manager"
            />
            <ApplyPresetPrototype v-else-if="activePrototype === 'apply-preset'" />
            <PresetManagerPrototype
              v-else-if="activePrototype === 'save-preset'"
              key="save-preset"
              :initialCreateIntent="currentProjectPresetSource"
            />
          </div>
        </div>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr);
  height: 100vh;
  isolation: isolate;
}

.app-workspace {
  position: relative;
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr);
  min-height: 0;
}

.prototype-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.prototype-stage > :deep(.n-empty) {
  margin-top: 140px;
}

.home-context {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
}

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border-right: 1px solid var(--app-border);
}

.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-item {
  padding: 9px 10px;
  border-radius: var(--app-radius);
}

.sidebar-item--active {
  background: var(--app-elevated-hover);
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 260px));
  align-content: start;
  gap: 18px;
  padding: 64px 72px;
}

.workspace-card {
  height: 210px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.workspace-card--wide {
  height: 260px;
}
</style>
