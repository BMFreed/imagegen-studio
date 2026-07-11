<script setup lang="ts">
import { NButton, NCard, NFormItem, NInput, NModal, NSelect } from 'naive-ui'
import { computed, reactive, watch } from 'vue'

import type { HomeWorkspace } from './home.types'

import { validateWorkspaceName } from './home.utils'

const props = defineProps<{ workspace?: HomeWorkspace; workspaces: HomeWorkspace[] }>()
const emit = defineEmits<{ remove: [id: string]; save: [workspace: HomeWorkspace] }>()
const show = defineModel<boolean>('show', { required: true })
const draft = reactive({ color: '', name: '' })
const colors = [
  { label: 'Green', value: '#64e36e' },
  { label: 'Blue', value: '#74a8ff' },
  { label: 'Amber', value: '#f0b65f' },
  { label: 'Violet', value: '#b58cff' },
  { label: 'Teal', value: '#83cbb8' },
]
const error = computed(() =>
  props.workspace
    ? validateWorkspaceName(draft.name, props.workspace.path, props.workspaces, props.workspace.id)
    : 'Workspace unavailable',
)
watch([show, () => props.workspace], () => {
  if (show.value && props.workspace) {
    Object.assign(draft, { color: props.workspace.color, name: props.workspace.name })
  }
})
function save() {
  if (!props.workspace || error.value) {
    return
  }
  emit('save', { ...props.workspace, color: draft.color, name: draft.name.trim() })
  show.value = false
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Workspace Settings"
      class="home-modal"
      role="dialog"
      size="small"
      title="Workspace Settings"
    >
      <NFormItem
        :feedback="error || undefined"
        label="Workspace name"
        :validationStatus="error ? 'error' : undefined"
      >
        <NInput
          v-model:value="draft.name"
          :disabled="workspace?.isDefault"
          :inputProps="{ 'aria-label': 'Workspace name' }"
        />
      </NFormItem>
      <NFormItem label="Folder">
        <NInput
          :inputProps="{ 'aria-label': 'Workspace folder' }"
          readonly
          :value="workspace?.path"
        />
      </NFormItem>
      <NFormItem label="Color">
        <NSelect v-model:value="draft.color" aria-label="Workspace color" :options="colors" />
      </NFormItem>
      <template v-slot:footer>
        <div class="settings-footer">
          <NButton
            v-if="workspace && !workspace.isDefault"
            type="error"
            @click="$emit('remove', workspace.id)"
          >
            Remove Workspace
          </NButton>
          <div class="modal-actions">
            <NButton @click="show = false">Cancel</NButton>
            <NButton :disabled="Boolean(error)" type="primary" @click="save">Save</NButton>
          </div>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.home-modal {
  width: min(520px, calc(100vw - 48px));
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
