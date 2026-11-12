<script setup lang="ts">
import type { ProjectSummary } from '../../shared/api.js'
import type { ProjectTrashSummary } from '../../shared/projects/project-trash.js'
import type { ProjectWorkspaceSummary } from '../../shared/projects/project-workspaces.js'

import { ChevronRight as CollapseIcon, ChevronLeft as ExpandIcon } from '@vicons/tabler'
import { NAlert, NButton, NEmpty, NTag } from 'naive-ui'
import { computed } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import HomeProjectPreview from './HomeProjectPreview.vue'

const props = defineProps<{
  busy: boolean
  canManageMissing: boolean
  canRebuild: boolean
  healthLabel: string | null
  isOpen: boolean
  pendingAction: { kind: 'open' | 'rebuild'; projectId: string } | null
  project: ProjectSummary | undefined
  recoveryLabel: string | null
  trashProject: ProjectTrashSummary | null
  workspace: ProjectWorkspaceSummary | undefined
  workspaceName: string
}>()
const collapsed = defineModel<boolean>('collapsed', { required: true })
defineEmits<{
  deleteProject: [project: ProjectTrashSummary]
  locateProject: [project: ProjectSummary]
  locateWorkspace: [workspaceId: string]
  moveProject: [project: ProjectSummary]
  openProject: [projectId: string]
  rebuildPreview: [projectId: string]
  removeMissingProject: [project: ProjectSummary]
  renameProject: [project: ProjectSummary]
  restoreProject: [project: ProjectTrashSummary]
  revealProject: [projectId: string]
}>()

const pending = computed(() => Boolean(props.project?.pendingMove || props.project?.pendingRename))
const canOpen = computed(
  () =>
    !props.busy &&
    !props.trashProject &&
    !pending.value &&
    props.project?.health === 'ready' &&
    props.workspace?.availability === 'available',
)
const canMove = computed(() => !props.busy && !pending.value && props.project?.health === 'ready')
const previewSource = computed(() =>
  props.trashProject?.deletionStatus !== 'deleting' &&
  !pending.value &&
  props.project?.health === 'ready' &&
  props.workspace?.availability === 'available' &&
  props.project.previewStatus === 'rendered'
    ? props.project.previewUrl
    : null,
)
function timestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
</script>

<template>
  <aside
    aria-label="Project inspector"
    class="home-inspector"
    :class="{ 'home-inspector--collapsed': collapsed }"
  >
    <div class="inspector-toggle">
      <IconButton
        :icon="collapsed ? ExpandIcon : CollapseIcon"
        :label="collapsed ? 'Expand inspector' : 'Collapse inspector'"
        @click="collapsed = !collapsed"
      />
    </div>
    <div v-if="!collapsed" class="inspector-scroll">
      <NEmpty v-if="!project" class="inspector-empty" description="Select a project to preview">
        <template v-slot:extra>
          <p>Review its saved preview and details before opening.</p>
        </template>
      </NEmpty>
      <template v-else>
        <header class="inspector-header">
          <h2 :title="project.title">{{ project.title }}</h2>
          <span :title="workspaceName">{{ workspaceName }}</span>
        </header>

        <div class="condition-row">
          <NTag v-if="isOpen" size="small" type="success">Open</NTag>
          <NTag v-if="trashProject" key="n-tag-2" size="small" type="warning">
            {{ trashProject.deletionStatus === 'deleting' ? 'Deletion pending' : 'In Trash' }}
          </NTag>
          <NTag v-if="healthLabel" key="n-tag-3" size="small" type="warning">
            {{ healthLabel }}
          </NTag>
          <NTag
            v-if="!isOpen && !trashProject && !pending && recoveryLabel"
            key="n-tag-4"
            size="small"
            type="warning"
          >
            {{ recoveryLabel }}
          </NTag>
          <NTag
            v-if="!trashProject && workspace?.availability !== 'available'"
            key="n-tag-5"
            size="small"
            type="warning"
          >
            Workspace unavailable
          </NTag>
        </div>

        <NAlert v-if="project.pendingMove" key="n-alert-1" title="Move pending" type="warning">
          {{ project.pendingMove.message }}
          <div class="problem-actions">
            <NButton :disabled="busy" size="small" @click="$emit('moveProject', project)">
              Retry Move
            </NButton>
          </div>
        </NAlert>
        <NAlert
          v-else-if="project.pendingRename"
          key="n-alert-2"
          title="Rename pending"
          type="warning"
        >
          {{ project.pendingRename.message }}
          <div class="problem-actions">
            <NButton :disabled="busy" size="small" @click="$emit('renameProject', project)">
              Retry Rename
            </NButton>
          </div>
        </NAlert>
        <NAlert
          v-else-if="!trashProject && workspace?.availability !== 'available'"
          key="n-alert-3"
          title="Workspace unavailable"
          type="warning"
        >
          Restore access to the workspace folder to view the saved preview.
          <div v-if="workspace && !workspace.isDefault" class="problem-actions">
            <NButton :disabled="busy" size="small" @click="$emit('locateWorkspace', workspace.id)">
              Locate Folder
            </NButton>
          </div>
        </NAlert>
        <NAlert
          v-else-if="project.health !== 'ready'"
          key="n-alert-4"
          :title="healthLabel ?? 'Project unavailable'"
          type="warning"
        >
          <template v-if="project.health === 'missing'">
            Locate the saved Project file or remove its missing entry from Home.
            <div v-if="canManageMissing" class="problem-actions">
              <NButton :disabled="busy" size="small" @click="$emit('locateProject', project)">
                Locate Project
              </NButton>
              <NButton
                :disabled="busy"
                size="small"
                @click="$emit('removeMissingProject', project)"
              >
                Remove from Home
              </NButton>
            </div>
          </template>
          <template v-else>The saved Project cannot be opened or previewed.</template>
        </NAlert>
        <HomeProjectPreview
          v-else-if="previewSource"
          :key="`${project.id}:${previewSource}`"
          :source="previewSource"
        />
        <NEmpty
          v-else-if="project.previewStatus === 'empty'"
          class="preview-empty"
          description="Empty project"
        />
        <div v-else class="preview-unavailable">
          <NEmpty description="Preview unavailable" size="small">
            <template v-slot:extra>
              <p v-if="trashProject?.deletionStatus === 'deleting'">Project deletion is pending.</p>
              <p v-else-if="trashProject">Restore the Project to view its saved preview.</p>
              <p v-else>The Project can still be opened.</p>
              <NButton
                v-if="canRebuild"
                :disabled="busy"
                :loading="
                  pendingAction?.kind === 'rebuild' && pendingAction.projectId === project.id
                "
                size="small"
                @click="$emit('rebuildPreview', project.id)"
              >
                Rebuild Preview
              </NButton>
            </template>
          </NEmpty>
        </div>

        <dl class="detail-grid">
          <div v-if="project.bbox">
            <dt>Generation area size</dt>
            <dd>{{ project.bbox.width }} × {{ project.bbox.height }}</dd>
          </div>
          <div>
            <dt>Modified</dt>
            <dd>{{ timestamp(project.modifiedAt) }}</dd>
          </div>
          <div>
            <dt>Last opened</dt>
            <dd>{{ timestamp(project.lastOpenedAt) }}</dd>
          </div>
        </dl>

        <p v-if="project.recoveryReason && !isOpen && !pending" class="inspector-diagnostic">
          {{ project.recoveryReason }}
        </p>
        <p v-if="trashProject?.deletionError" class="inspector-diagnostic">
          {{ trashProject.deletionError }}
        </p>
        <div v-if="trashProject" class="inspector-actions">
          <NButton
            :disabled="busy || trashProject.deletionStatus === 'deleting'"
            type="primary"
            @click="$emit('restoreProject', trashProject)"
          >
            Restore Project
          </NButton>
          <NButton :disabled="busy" type="error" @click="$emit('deleteProject', trashProject)">
            Delete Permanently
          </NButton>
        </div>
        <div v-else class="inspector-actions">
          <NButton
            class="inspector-open"
            :disabled="!canOpen"
            :loading="pendingAction?.kind === 'open' && pendingAction.projectId === project.id"
            type="primary"
            @click="$emit('openProject', project.id)"
          >
            {{ isOpen ? 'Switch to Project' : 'Open Project' }}
          </NButton>
          <NButton :disabled="!canMove" @click="$emit('moveProject', project)">Move</NButton>
          <NButton :disabled="busy || pending" @click="$emit('revealProject', project.id)">
            Show in Folder
          </NButton>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.home-inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--app-border);
  background: var(--app-chrome);
}

.inspector-toggle {
  display: flex;
  justify-content: flex-end;
  padding: 6px;
}

.inspector-scroll {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow: auto;
  padding: 0 14px 18px;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
}

.inspector-empty {
  margin-block: auto;
  padding-block: 24px;
}

.inspector-empty p,
.preview-unavailable p {
  max-width: 28ch;
  margin: 0 0 8px;
  color: var(--app-text-muted);
  white-space: normal;
}

.inspector-header h2 {
  margin: 0 0 4px;
  font-size: 16px;
  overflow-wrap: anywhere;
}

.inspector-header span {
  display: block;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-row,
.problem-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.condition-row:empty {
  display: none;
}

.problem-actions {
  margin-top: 10px;
}

.preview-empty,
.preview-unavailable {
  display: grid;
  min-height: 220px;
  place-items: center;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.detail-grid div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.detail-grid dt {
  color: var(--app-text-muted);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.detail-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--app-font-size-meta);
}

.inspector-diagnostic {
  margin: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
  overflow-wrap: anywhere;
}

.inspector-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.inspector-open {
  grid-column: 1 / -1;
}
</style>
