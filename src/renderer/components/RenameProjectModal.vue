<script setup lang="ts">
import type { ProjectSummary } from '../../shared/api.js'
import { validateProjectRenameName } from '../../shared/projects/project-rename.js'

import { NAlert, NButton, NCard, NFormItem, NInput, NModal } from 'naive-ui'
import { computed } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  blocked: boolean
  busy: boolean
  error: string | null
  frozenName: string | null
  pendingMessage: string | null
  project: ProjectSummary | null
}>()
const show = defineModel<boolean>('show', { required: true })
const name = defineModel<string>('name', { required: true })
const emit = defineEmits<{ rename: []; switchProject: [] }>()
const nameError = computed(() => validateProjectRenameName(name.value))
function close() {
  if (!props.busy) {
    show.value = false
  }
}
function rename() {
  if (!props.busy && !props.blocked && props.project && !nameError.value) {
    emit('rename')
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
      aria-label="Rename Project"
      class="rename-project-modal"
      contentScrollable
      role="dialog"
      size="small"
      title="Rename Project"
    >
      <p v-if="blocked">
        <strong>{{ project?.title }}</strong>
        has unsaved changes. Save or close the Project before renaming it.
      </p>
      <template v-else>
        <p v-if="pendingMessage">
          The rename is pending. Retry after resolving the reported issue. Closing this dialog keeps
          the pending rename.
        </p>
        <NFormItem
          :feedback="nameError ?? undefined"
          label="Project name"
          :validationStatus="nameError ? 'error' : undefined"
        >
          <NInput
            v-model:value="name"
            :disabled="busy || frozenName !== null"
            :inputProps="{ 'aria-label': 'Project name' }"
            @keydown.enter.prevent="rename"
          />
        </NFormItem>
        <p>The display name and .igs filename will be updated together.</p>
      </template>
      <NAlert v-if="pendingMessage" class="rename-project-feedback" type="warning">
        {{ pendingMessage }}
      </NAlert>
      <NAlert v-if="error" key="n-alert-2" class="rename-project-feedback" type="error">
        {{ error }}
      </NAlert>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton :disabled="busy" @click="close">
            {{ blocked || frozenName !== null ? 'Close' : 'Cancel' }}
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
            :disabled="busy || !project || Boolean(nameError)"
            :loading="busy"
            type="primary"
            @click="rename"
          >
            {{ frozenName !== null ? 'Retry Rename' : 'Rename' }}
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.rename-project-modal {
  width: min(480px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
}
.rename-project-modal p {
  overflow-wrap: anywhere;
}
.rename-project-feedback {
  margin-top: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
