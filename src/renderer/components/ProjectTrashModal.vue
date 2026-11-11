<script setup lang="ts">
import type { ProjectSummary } from '../../shared/api.js'
import type { ProjectTrashSummary } from '../../shared/projects/project-trash.js'

import { NAlert, NButton, NCard, NModal } from 'naive-ui'
import { computed } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  blocked: boolean
  busy: boolean
  error: string | null
  kind: 'delete' | 'trash'
  pendingMessage: string | null
  project: ProjectSummary | ProjectTrashSummary | null
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ confirm: []; switchProject: [] }>()
const title = computed(() =>
  props.kind === 'trash' ? 'Move Project to Trash' : 'Delete Project Permanently',
)
const fileName = computed(() =>
  props.project && 'fileName' in props.project
    ? props.project.fileName
    : (props.project?.title ?? 'Project'),
)
const deletionPending = computed(
  () =>
    props.kind === 'delete' &&
    Boolean(
      props.pendingMessage ||
      (props.project &&
        'deletionStatus' in props.project &&
        props.project.deletionStatus === 'deleting'),
    ),
)
function close() {
  if (!props.busy) {
    show.value = false
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
      :aria-label="title"
      class="project-trash-modal"
      contentScrollable
      role="dialog"
      size="small"
      :title
    >
      <template v-if="kind === 'trash'">
        <p v-if="blocked">
          <strong>{{ project?.title }}</strong>
          is open. Close the project before moving it to Trash.
        </p>
        <p v-else>
          Move
          <strong>{{ project?.title }}</strong>
          to ImageGen Studio Trash? You can restore it later or delete it permanently from Trash.
        </p>
      </template>
      <template v-else>
        <p v-if="deletionPending">
          Deletion of
          <strong>{{ fileName }}</strong>
          is pending. Retry when the reported issue is resolved. Closing this dialog keeps the
          pending item in Trash.
        </p>
        <p v-else>
          Permanently delete
          <strong>{{ fileName }}</strong>
          (
          <strong>{{ project?.title }}</strong>
          )? Its .igs file will be removed. This cannot be undone.
        </p>
      </template>
      <NAlert v-if="pendingMessage" class="project-trash-feedback" type="warning">
        {{ pendingMessage }}
      </NAlert>
      <NAlert v-if="error" key="n-alert-2" class="project-trash-feedback" type="error">
        {{ error }}
      </NAlert>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton :disabled="busy" @click="close">
            {{ deletionPending ? 'Close' : 'Cancel' }}
          </NButton>
          <NButton
            v-if="kind === 'trash' && blocked"
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
            :disabled="busy || !project"
            :loading="busy"
            type="error"
            @click="emit('confirm')"
          >
            {{
              kind === 'trash'
                ? 'Move to Trash'
                : deletionPending
                  ? 'Retry Delete'
                  : 'Delete Permanently'
            }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.project-trash-modal {
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
}
.project-trash-modal p {
  overflow-wrap: anywhere;
}
.project-trash-feedback {
  margin-top: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
