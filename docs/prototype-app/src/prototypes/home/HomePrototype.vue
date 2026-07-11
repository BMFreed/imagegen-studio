<script setup lang="ts">
import { NSplit, useDialog, useMessage } from 'naive-ui';
import { computed, ref, toRaw, watch } from 'vue';

import type {
  ExternalProjectDraft,
  HomeBrowseSelection,
  HomeProjectAction,
  HomeProjectOpenIntent,
  HomeProjectRecord,
  HomeScenarioId,
  HomeSort,
  HomeStatusFilter,
  HomeViewMode,
  HomeWorkspace,
  NewProjectDraft,
} from './home.types';

import { createHomeScenario } from './home.mock';
import {
  createProjectFromDraft,
  createProjectFromExternalDraft,
  filterHomeProjects,
  getProjectConditionLabels,
  getProjectsForBrowseSelection,
  getWorkspaceProjectCount,
  sortHomeProjects,
} from './home.utils';
import HomeBrowser from './HomeBrowser.vue';
import HomeInspector from './HomeInspector.vue';
import HomeSidebar from './HomeSidebar.vue';
import MoveProjectModal from './MoveProjectModal.vue';
import MoveToTrashModal from './MoveToTrashModal.vue';
import NewProjectModal from './NewProjectModal.vue';
import OpenExternalProjectModal from './OpenExternalProjectModal.vue';
import RecoveryModal from './RecoveryModal.vue';
import RenameProjectModal from './RenameProjectModal.vue';
import WorkspaceModal from './WorkspaceModal.vue';
import WorkspaceSettingsModal from './WorkspaceSettingsModal.vue';

const props = defineProps<{
  dirtyProjectIds: string[];
  openProjectIds: string[];
  scenario: HomeScenarioId;
}>();

const emit = defineEmits<{
  manageModels: [];
  managePresets: [];
  openProject: [
    value: { project: HomeProjectRecord; recovered?: boolean; target: 'current' | 'new' },
  ];
  projectChanged: [project: HomeProjectRecord];
}>();

const dialog = useDialog();
const message = useMessage();
const initialScenario = createHomeScenario(props.scenario);
const workspaces = ref(initialScenario.workspaces);
const projects = ref(initialScenario.projects);
const hasInstalledModel = ref(initialScenario.hasInstalledModel);

const browseSelection = ref<HomeBrowseSelection>({ kind: 'all' });
const search = ref('');
const sort = ref<HomeSort>('lastOpened');
const status = ref<HomeStatusFilter>('all');
const viewMode = ref<HomeViewMode>('grid');
const selectedProjectId = ref<string>();
const inspectorCollapsed = ref(false);
const sidebarPaneSize = ref<number | string>('clamp(232px, 18vw, 252px)');
const expandedBrowserPaneSize = ref<number | string>('calc(100% - clamp(330px, 28vw, 400px))');
const initialSidebarWidth = Math.min(252, Math.max(232, globalThis.innerWidth * 0.18));
const initialWorkspaceWidth = Math.max(1, globalThis.innerWidth - initialSidebarWidth);
const browserPaneMin = Math.min(0.6, 500 / initialWorkspaceWidth);
const browserPaneMax = Math.max(browserPaneMin, 1 - 280 / initialWorkspaceWidth);
const browserPaneSize = computed<number | string>({
  get: () => (inspectorCollapsed.value ? 'calc(100% - 44px)' : expandedBrowserPaneSize.value),
  set: (value) => {
    if (!inspectorCollapsed.value) {
      expandedBrowserPaneSize.value = value;
    }
  },
});

const showNewProject = ref(false);
const showOpenExternal = ref(false);
const showWorkspace = ref(false);
const showWorkspaceSettings = ref(false);
const showMove = ref(false);
const showRename = ref(false);
const showRecovery = ref(false);
const showTrash = ref(false);
const activeWorkspaceId = ref<string>();
const activeProjectId = ref<string>();
const pendingOpenIntent = ref<HomeProjectOpenIntent>();

const selectedWorkspace = computed(() => {
  const selection = browseSelection.value;
  return selection.kind === 'workspace'
    ? workspaces.value.find((workspace) => workspace.id === selection.workspaceId)
    : undefined;
});
const selectedProject = computed(() =>
  projects.value.find((project) => project.id === selectedProjectId.value),
);
const activeProject = computed(() =>
  projects.value.find((project) => project.id === activeProjectId.value),
);
const activeWorkspace = computed(() =>
  workspaces.value.find((workspace) => workspace.id === activeWorkspaceId.value),
);
const selectedProjectWorkspace = computed(() =>
  selectedProject.value
    ? workspaces.value.find((workspace) => workspace.id === selectedProject.value?.workspaceId)
    : undefined,
);
const defaultWorkspaceId = computed(() => {
  if (selectedWorkspace.value?.availability === 'available') {
    return selectedWorkspace.value.id;
  }
  return workspaces.value.find((workspace) => workspace.isDefault)?.id ?? 'uncategorized';
});
const browseProjects = computed(() =>
  getProjectsForBrowseSelection(projects.value, browseSelection.value),
);
const visibleProjects = computed(() => {
  const filtered = filterHomeProjects(
    browseProjects.value,
    search.value,
    status.value,
    props.openProjectIds,
    workspaces.value,
  );
  return sortHomeProjects(filtered, sort.value);
});
const conditionsById = computed<Record<string, string[]>>(() =>
  Object.fromEntries(
    visibleProjects.value.map((project) => [
      project.id,
      getProjectConditionLabels(project, props.openProjectIds, workspaces.value),
    ]),
  ),
);
const projectCounts = computed<Record<string, number>>(() =>
  Object.fromEntries(
    workspaces.value.map((workspace) => [
      workspace.id,
      getWorkspaceProjectCount(projects.value, workspace.id),
    ]),
  ),
);
const trashedCount = computed(
  () => projects.value.filter((project) => project.trashedAt !== undefined).length,
);
const browserTitle = computed(() => {
  if (browseSelection.value.kind === 'trash') {
    return 'Trash';
  }
  return selectedWorkspace.value?.name ?? 'Projects';
});
const hasActiveFilters = computed(() => search.value.trim() !== '' || status.value !== 'all');
const showWorkspaceOnCard = computed(() => browseSelection.value.kind !== 'workspace');

function cloneProject(project: HomeProjectRecord) {
  return structuredClone(toRaw(project));
}

watch(
  () => visibleProjects.value.map((project) => project.id).join(','),
  () => {
    if (
      selectedProjectId.value &&
      !visibleProjects.value.some((project) => project.id === selectedProjectId.value)
    ) {
      selectedProjectId.value = undefined;
    }
  },
);

function selectBrowse(value: 'all' | 'trash') {
  browseSelection.value = { kind: value };
  selectedProjectId.value = undefined;
}

function selectWorkspace(workspaceId: string) {
  browseSelection.value = { kind: 'workspace', workspaceId };
  selectedProjectId.value = undefined;
}

function resetFilters() {
  search.value = '';
  status.value = 'all';
}

function requestOpen(intent: HomeProjectOpenIntent) {
  const project = projects.value.find((candidate) => candidate.id === intent.projectId);
  const workspace = project
    ? workspaces.value.find((candidate) => candidate.id === project.workspaceId)
    : undefined;
  if (
    !project ||
    project.trashedAt ||
    project.health !== 'ready' ||
    workspace?.availability !== 'available'
  ) {
    return;
  }
  if (project.recoveryAvailable) {
    pendingOpenIntent.value = intent;
    activeProjectId.value = project.id;
    showRecovery.value = true;
    return;
  }
  emit('openProject', { project: cloneProject(project), target: intent.target });
}

function resolveRecovery(recovered: boolean) {
  const project = activeProject.value;
  const intent = pendingOpenIntent.value;
  if (!project || !intent) {
    return;
  }
  project.recoveryAvailable = false;
  emit('projectChanged', cloneProject(project));
  emit('openProject', { project: cloneProject(project), recovered, target: intent.target });
  pendingOpenIntent.value = undefined;
}

function createProject(value: NewProjectDraft) {
  const project = createProjectFromDraft(value);
  projects.value.push(project);
  message.success('Project created');
  emit('openProject', { project: cloneProject(project), target: 'current' });
}

function openExternal(draft: ExternalProjectDraft) {
  const project = createProjectFromExternalDraft(draft);
  projects.value.push(project);
  message.success(
    draft.operation === 'move' ? 'Project moved and imported' : 'Project copied and imported',
  );
  emit('openProject', { project: cloneProject(project), target: 'current' });
}

function addWorkspace(workspace: HomeWorkspace) {
  workspaces.value.push(workspace);
  selectWorkspace(workspace.id);
  message.success('Workspace added');
}

function saveWorkspace(workspace: HomeWorkspace) {
  const index = workspaces.value.findIndex((candidate) => candidate.id === workspace.id);
  if (index >= 0) {
    workspaces.value[index] = workspace;
  }
  projects.value
    .filter((project) => project.workspaceId === workspace.id)
    .forEach((project) => emit('projectChanged', cloneProject(project)));
  message.success('Workspace updated');
}

function requestRemoveWorkspace(workspaceId: string) {
  const workspace = workspaces.value.find((candidate) => candidate.id === workspaceId);
  if (!workspace || workspace.isDefault) {
    return;
  }
  const containsOpenProject = projects.value.some(
    (project) => project.workspaceId === workspaceId && props.openProjectIds.includes(project.id),
  );
  if (containsOpenProject) {
    dialog.warning({
      content: 'Close projects from this workspace before removing its registration.',
      positiveText: 'OK',
      title: 'Workspace contains open projects',
    });
    return;
  }
  showWorkspaceSettings.value = false;
  dialog.warning({
    content: `Remove ${workspace.name} from Home? Its folder and .igs files will stay on disk.`,
    negativeText: 'Cancel',
    onPositiveClick: () => {
      workspaces.value = workspaces.value.filter((candidate) => candidate.id !== workspaceId);
      projects.value = projects.value.filter((project) => project.workspaceId !== workspaceId);
      selectWorkspace('uncategorized');
      message.success('Workspace removed from Home');
    },
    positiveText: 'Remove Workspace',
    title: 'Remove Workspace',
  });
}

function handleWorkspaceAction(value: { action: string; workspaceId: string }) {
  const workspace = workspaces.value.find((candidate) => candidate.id === value.workspaceId);
  if (!workspace) {
    return;
  }
  switch (value.action) {
    case 'locate': {
      workspace.availability = 'available';
      message.success('Workspace folder located and rescanned');

      break;
    }
    case 'remove': {
      requestRemoveWorkspace(workspace.id);

      break;
    }
    case 'rescan': {
      message.success(`${workspace.name} rescanned`);

      break;
    }
    case 'reveal': {
      message.info(`Showing ${workspace.path}`);

      break;
    }
    case 'settings': {
      activeWorkspaceId.value = workspace.id;
      showWorkspaceSettings.value = true;

      break;
    }
    // No default
  }
}

function handleProjectAction(value: HomeProjectAction) {
  const project = projects.value.find((candidate) => candidate.id === value.projectId);
  if (!project) {
    return;
  }
  activeProjectId.value = project.id;
  selectedProjectId.value = project.id;
  switch (value.action) {
    case 'delete-permanently': {
      dialog.error({
        content: `Permanently delete ${project.fileName}? This mock action cannot be undone.`,
        negativeText: 'Cancel',
        onPositiveClick: () => {
          projects.value = projects.value.filter((candidate) => candidate.id !== project.id);
          selectedProjectId.value = undefined;
          message.success('Project permanently deleted');
        },
        positiveText: 'Delete Permanently',
        title: 'Delete Project Permanently',
      });

      break;
    }
    case 'move': {
      if (props.dirtyProjectIds.includes(project.id)) {
        dialog.warning({
          content: 'Save or close this project before moving its .igs file.',
          onPositiveClick: () => requestOpen({ projectId: project.id, target: 'current' }),
          positiveText: 'Switch to Project',
          title: 'Project has unsaved changes',
        });
      } else {
        showMove.value = true;
      }

      break;
    }
    case 'open':
    case 'open-new': {
      requestOpen({ projectId: project.id, target: value.action === 'open' ? 'current' : 'new' });

      break;
    }
    case 'rename': {
      showRename.value = true;

      break;
    }
    case 'restore': {
      project.trashedAt = undefined;
      selectedProjectId.value = undefined;
      message.success('Project restored');

      break;
    }
    case 'reveal': {
      message.info(
        `Showing ${project.fileName} in ${workspaces.value.find((workspace) => workspace.id === project.workspaceId)?.name ?? 'workspace'}`,
      );

      break;
    }
    case 'trash': {
      showTrash.value = true;

      break;
    }
    // No default
  }
}

function renameProject(value: { name: string; projectId: string }) {
  const project = projects.value.find((candidate) => candidate.id === value.projectId);
  if (!project) {
    return;
  }
  project.displayName = value.name;
  project.fileName = `${value.name}.igs`;
  emit('projectChanged', cloneProject(project));
  message.success('Project renamed');
}

function moveProject(value: { projectId: string; workspaceId: string }) {
  const project = projects.value.find((candidate) => candidate.id === value.projectId);
  if (!project) {
    return;
  }
  project.workspaceId = value.workspaceId;
  selectedProjectId.value = undefined;
  emit('projectChanged', cloneProject(project));
  message.success('Project moved');
}

function moveToTrash() {
  const project = activeProject.value;
  if (!project) {
    return;
  }
  project.trashedAt = new Date().toISOString();
  selectedProjectId.value = undefined;
  message.success('Project moved to Trash');
}

function locateProject(projectId: string) {
  const project = projects.value.find((candidate) => candidate.id === projectId);
  if (!project) {
    return;
  }
  project.health = 'ready';
  project.thumbnailState = 'missing';
  message.success('Project file located');
}

function removeProject(projectId: string) {
  projects.value = projects.value.filter((project) => project.id !== projectId);
  selectedProjectId.value = undefined;
  message.success('Project removed from Home');
}

function rebuildPreview(projectId: string) {
  const project = projects.value.find((candidate) => candidate.id === projectId);
  if (!project) {
    return;
  }
  project.thumbnailState = 'ready';
  message.success('Preview rebuilt');
}

function showErrorDetails(projectId: string) {
  const project = projects.value.find((candidate) => candidate.id === projectId);
  if (!project) {
    return;
  }
  dialog.error({
    content: `${project.fileName} could not be parsed. Mock error: invalid layer index at offset 0x4A2. The file was not modified.`,
    positiveText: 'Close',
    title: 'Project Error Details',
  });
}

function switchActiveProject() {
  const project = activeProject.value;
  if (project) {
    requestOpen({ projectId: project.id, target: 'current' });
  }
}
</script>

<template>
  <section
    aria-label="Home prototype"
    class="home-prototype"
    :class="{ 'home-prototype--inspector-collapsed': inspectorCollapsed }"
  >
    <NSplit v-model:size="sidebarPaneSize" class="home-shell-split" max="360px" min="210px">
      <template v-slot:1>
        <HomeSidebar
          :browseSelection
          :projectCounts
          :trashedCount
          :workspaces
          @addWorkspace="showWorkspace = true"
          @importProject="showOpenExternal = true"
          @manageModels="$emit('manageModels')"
          @managePresets="$emit('managePresets')"
          @newProject="showNewProject = true"
          @selectBrowse="selectBrowse"
          @selectWorkspace="selectWorkspace"
          @workspaceAction="handleWorkspaceAction"
        />
      </template>
      <template v-slot:2>
        <NSplit
          v-model:size="browserPaneSize"
          class="home-content-split"
          :disabled="inspectorCollapsed"
          :max="browserPaneMax"
          :min="browserPaneMin"
        >
          <template v-slot:1>
            <HomeBrowser
              v-model:search="search"
              v-model:sort="sort"
              v-model:status="status"
              v-model:viewMode="viewMode"
              :conditionsById
              :filtered="hasActiveFilters"
              :hasActiveFilters
              :hasInstalledModel
              :projects="visibleProjects"
              :selectedId="selectedProjectId"
              :showWorkspace="showWorkspaceOnCard"
              :title="browserTitle"
              :trashView="browseSelection.kind === 'trash'"
              :workspace="selectedWorkspace"
              :workspaces
              @action="handleProjectAction"
              @manageModels="$emit('manageModels')"
              @newProject="showNewProject = true"
              @open="requestOpen"
              @openProject="showOpenExternal = true"
              @reset="resetFilters"
              @select="selectedProjectId = $event"
              @workspaceAction="handleWorkspaceAction"
            />
          </template>
          <template v-slot:2>
            <HomeInspector
              v-model:collapsed="inspectorCollapsed"
              :openProjectIds
              :project="selectedProject"
              :trashView="browseSelection.kind === 'trash'"
              :workspace="selectedProjectWorkspace"
              :workspaces
              @action="handleProjectAction"
              @locateProject="locateProject"
              @open="requestOpen"
              @rebuildPreview="rebuildPreview"
              @removeProject="removeProject"
              @showErrorDetails="showErrorDetails"
              @workspaceAction="handleWorkspaceAction"
            />
          </template>
        </NSplit>
      </template>
    </NSplit>

    <NewProjectModal
      v-model:show="showNewProject"
      :defaultWorkspaceId
      :projects
      :workspaces
      @create="createProject"
    />
    <OpenExternalProjectModal
      v-model:show="showOpenExternal"
      :defaultWorkspaceId
      :workspaces
      @confirm="openExternal"
    />
    <WorkspaceModal v-model:show="showWorkspace" :workspaces @add="addWorkspace" />
    <WorkspaceSettingsModal
      v-model:show="showWorkspaceSettings"
      :workspace="activeWorkspace"
      :workspaces
      @remove="requestRemoveWorkspace"
      @save="saveWorkspace"
    />
    <MoveProjectModal
      v-model:show="showMove"
      :project="activeProject"
      :workspaces
      @move="moveProject"
    />
    <RenameProjectModal
      v-model:show="showRename"
      :project="activeProject"
      :projects
      @rename="renameProject"
    />
    <RecoveryModal
      v-model:show="showRecovery"
      :project="activeProject"
      @discard="resolveRecovery(false)"
      @recover="resolveRecovery(true)"
    />
    <MoveToTrashModal
      v-model:show="showTrash"
      :blocked="activeProject ? openProjectIds.includes(activeProject.id) : false"
      :project="activeProject"
      @confirm="moveToTrash"
      @switchProject="switchActiveProject"
    />
  </section>
</template>

<style scoped>
.home-prototype {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.home-shell-split,
.home-content-split {
  min-width: 0;
  min-height: 0;
}
</style>
