<script setup lang="ts">
import {
  PROJECT_WORKSPACE_COLORS,
  PROJECT_WORKSPACE_NAME_MAX_LENGTH,
  type ProjectWorkspaceAddInput,
  type ProjectWorkspaceColor,
} from '../../shared/projects/project-workspaces.js'

import { NAlert, NButton, NCard, NForm, NFormItem, NInput, NModal, NSelect, NText } from 'naive-ui'
import { computed, ref, useId, watch } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{ busy: boolean; error: string | null }>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ add: [input: ProjectWorkspaceAddInput] }>()
const formId = useId()
const displayName = ref('')
const color = ref<ProjectWorkspaceColor>('teal')
const colorOptions = PROJECT_WORKSPACE_COLORS.map((value) => ({
  label: value[0].toUpperCase() + value.slice(1),
  value,
}))
const nameProblem = computed(() =>
  displayName.value.length > 0 && !displayName.value.trim()
    ? 'Enter a workspace name.'
    : displayName.value.trim().length > PROJECT_WORKSPACE_NAME_MAX_LENGTH
      ? 'Workspace name is too long.'
      : undefined,
)

watch(show, (visible) => {
  if (visible) {
    displayName.value = ''
    color.value = 'teal'
  }
})

function close() {
  if (!props.busy) {
    show.value = false
  }
}
function add() {
  if (!props.busy && displayName.value.trim() && !nameProblem.value) {
    emit('add', { color: color.value, displayName: displayName.value.trim() })
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
      aria-label="Add Workspace"
      class="home-modal"
      role="dialog"
      size="small"
      title="Add Workspace"
    >
      <NForm :id="formId" :disabled="busy" labelPlacement="top" @submit.prevent="add">
        <NAlert v-if="error" class="workspace-error" role="alert" type="error">{{ error }}</NAlert>
        <NFormItem
          :feedback="nameProblem"
          label="Workspace name"
          :validationStatus="nameProblem ? 'error' : undefined"
        >
          <NInput
            v-model:value="displayName"
            autofocus
            :inputProps="{ 'aria-label': 'Workspace name' }"
            :maxlength="PROJECT_WORKSPACE_NAME_MAX_LENGTH"
            placeholder="Workspace name"
          />
        </NFormItem>
        <NFormItem label="Color">
          <NSelect v-model:value="color" aria-label="Workspace color" :options="colorOptions" />
        </NFormItem>
        <NText depth="3">
          Choose a folder for this workspace next. Existing .igs files in that folder will appear in
          Projects. Canceling the folder picker keeps this draft.
        </NText>
      </NForm>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton :disabled="busy" @click="close">Cancel</NButton>
          <NButton
            attrType="submit"
            :disabled="busy || !displayName.trim() || Boolean(nameProblem)"
            :form="formId"
            :loading="busy"
            type="primary"
          >
            Choose Folder and Add
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.home-modal {
  width: min(520px, calc(100vw - 48px));
}
.workspace-error {
  margin-bottom: 16px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
