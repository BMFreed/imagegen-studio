<script setup lang="ts">
import type { ProjectSummary, ProjectWorkspaceSummary } from '../../shared/api.js'

import { NAlert, NButton, NCard, NFormItem, NModal, NSelect } from 'naive-ui'
import { computed } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  blocked: boolean
  busy: boolean
  error: string | null
  frozenWorkspace: Pick<ProjectWorkspaceSummary, 'displayName' | 'id'> | null
  pendingMessage: string | null
  project: ProjectSummary | null
  workspaces: ProjectWorkspaceSummary[]
  workspacesLoading: boolean
}>()
const show = defineModel<boolean>('show', { required: true })
const workspaceId = defineModel<string | null>('workspaceId', { required: true })
const emit = defineEmits<{ move: []; switchProject: [] }>()
const options = computed(() =>
  props.frozenWorkspace
    ? [{ label: props.frozenWorkspace.displayName, value: props.frozenWorkspace.id }]
    : props.workspaces
        .filter(
          (workspace) =>
            workspace.id !== props.project?.workspaceId &&
            workspace.availability === 'available' &&
            workspace.writable,
        )
        .map((workspace) => ({ label: workspace.displayName, value: workspace.id })),
)
const hasDestination = computed(() =>
  options.value.some(({ value }) => value === workspaceId.value),
)
function close() {
  if (!props.busy) {
    show.value = false
  }
}
function move() {
  if (!props.busy && !props.blocked && props.project && hasDestination.value) {
    emit('move')
  }
}
</script>

<template>
  <NModal
    :closeOnEsc="!busy"
    :maskClosable="false"
    :show
    :zIndex="AppLayer.dialog"
    @update:show="!$event && close()"
  >
    <NCard
      aria-label="Move Project"
      class="move-project-modal"
      contentScrollable
      role="dialog"
      size="small"
      :title="`Move ${project?.title ?? 'Project'}`"
    >
      <p v-if="blocked">
        <strong>{{ project?.title }}</strong>
        is open. Close the project before moving it to another workspace.
      </p>
      <template v-else>
        <p v-if="pendingMessage">
          The move is pending. Retry after resolving the reported issue. Closing this dialog keeps
          the pending move.
        </p>
        <NFormItem label="Destination workspace">
          <NSelect
            v-model:value="workspaceId"
            aria-label="Destination workspace"
            :disabled="busy || Boolean(frozenWorkspace) || workspacesLoading"
            :loading="workspacesLoading"
            :options
            placeholder="Choose a workspace"
          />
        </NFormItem>
        <p v-if="!workspacesLoading && options.length === 0">
          No other writable workspace is available. Add a workspace or restore access to an existing
          one before moving this Project.
        </p>
      </template>
      <NAlert v-if="pendingMessage" class="move-project-feedback" type="warning">
        {{ pendingMessage }}
      </NAlert>
      <NAlert v-if="error" key="n-alert-2" class="move-project-feedback" type="error">
        {{ error }}
      </NAlert>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton :disabled="busy" @click="close">
            {{ frozenWorkspace ? 'Close' : 'Cancel' }}
          </NButton>
          <NButton
            v-if="blocked"
            key="n-button-1"
            :disabled="busy"
            type="primary"
            @click="emit('switchProject')"
          >
            Switch to Project
          </NButton>
          <NButton
            v-else
            key="n-button-2"
            :disabled="busy || !project || !hasDestination || workspacesLoading"
            :loading="busy"
            type="primary"
            @click="move"
          >
            {{ frozenWorkspace ? 'Retry Move' : 'Move Project' }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.move-project-modal {
  width: min(480px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
}
.move-project-modal p {
  overflow-wrap: anywhere;
}
.move-project-feedback {
  margin-top: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
