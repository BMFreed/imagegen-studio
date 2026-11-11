<script setup lang="ts">
import {
  parseProjectWorkspaceAddInput,
  PROJECT_WORKSPACE_COLORS,
  PROJECT_WORKSPACE_NAME_MAX_LENGTH,
  type ProjectWorkspaceAddInput,
  type ProjectWorkspaceSummary,
} from '../../shared/projects/project-workspaces.js'

import { NAlert, NButton, NCard, NForm, NFormItem, NInput, NModal, NSelect } from 'naive-ui'
import { computed, ref, useId, watch } from 'vue'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'

const props = defineProps<{
  busy: boolean
  error: string | null
  workspace: ProjectWorkspaceSummary | null
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{
  remove: []
  save: [input: ProjectWorkspaceAddInput]
}>()
const formId = useId()
const displayName = ref('')
const color = ref('teal')
const allowedColors: ReadonlySet<string> = new Set(PROJECT_WORKSPACE_COLORS)
const colorOptions = PROJECT_WORKSPACE_COLORS.map((value) => ({
  label: value[0].toUpperCase() + value.slice(1),
  value,
}))
const input = computed(() => {
  try {
    return parseProjectWorkspaceAddInput({ color: color.value, displayName: displayName.value })
  } catch {
    return null
  }
})
const colorProblem = computed(() =>
  allowedColors.has(color.value) ? undefined : 'Choose a workspace color.',
)
const nameProblem = computed(() =>
  !displayName.value.trim()
    ? 'Enter a workspace name.'
    : displayName.value.trim().length > PROJECT_WORKSPACE_NAME_MAX_LENGTH
      ? 'Workspace name is too long.'
      : undefined,
)

// A catalog refresh must not replace an unsaved draft for the same workspace.
watch([show, () => props.workspace?.id], () => {
  if (show.value && props.workspace) {
    displayName.value = props.workspace.displayName
    color.value = props.workspace.color
  }
})

function close() {
  if (!props.busy) {
    show.value = false
  }
}
function save() {
  if (!props.busy && props.workspace && input.value) {
    emit('save', { ...input.value })
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
      aria-label="Workspace Settings"
      class="workspace-settings-modal"
      contentScrollable
      role="dialog"
      size="small"
      title="Workspace Settings"
    >
      <NForm :id="formId" :disabled="busy" labelPlacement="top" @submit.prevent="save">
        <NAlert v-if="error" class="workspace-error" role="alert" type="error">{{ error }}</NAlert>
        <NFormItem
          :feedback="nameProblem"
          label="Workspace name"
          :validationStatus="nameProblem ? 'error' : undefined"
        >
          <NInput
            v-model:value="displayName"
            :disabled="busy || workspace?.isDefault"
            :inputProps="{ 'aria-label': 'Workspace name' }"
            :maxlength="PROJECT_WORKSPACE_NAME_MAX_LENGTH"
          />
        </NFormItem>
        <NFormItem label="Folder">
          <NInput
            :inputProps="{ 'aria-label': 'Workspace folder' }"
            readonly
            :value="workspace?.directoryPath ?? ''"
          />
        </NFormItem>
        <NFormItem
          :feedback="colorProblem"
          label="Color"
          :validationStatus="colorProblem ? 'error' : undefined"
        >
          <NSelect v-model:value="color" aria-label="Workspace color" :options="colorOptions" />
        </NFormItem>
      </NForm>
      <template v-slot:footer>
        <div class="settings-footer">
          <NButton
            v-if="workspace && !workspace.isDefault"
            :disabled="busy"
            type="error"
            @click="emit('remove')"
          >
            Remove Workspace
          </NButton>
          <div class="modal-actions">
            <NButton :disabled="busy" @click="close">Cancel</NButton>
            <NButton
              attrType="submit"
              :disabled="busy || !workspace || !input"
              :form="formId"
              :loading="busy"
              type="primary"
            >
              Save
            </NButton>
          </div>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.workspace-settings-modal {
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
}
.workspace-error {
  margin-bottom: 16px;
}
.settings-footer,
.modal-actions {
  display: flex;
  gap: 8px;
}
.settings-footer {
  justify-content: space-between;
}
.modal-actions {
  margin-left: auto;
}
</style>
