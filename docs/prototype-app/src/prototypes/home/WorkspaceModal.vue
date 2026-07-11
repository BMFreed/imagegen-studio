<script setup lang="ts">
import { NButton, NCard, NFormItem, NInput, NModal, NSelect } from 'naive-ui'
import { computed, reactive, watch } from 'vue'

import type { HomeWorkspace } from './home.types'

import { validateWorkspaceName } from './home.utils'

const props = defineProps<{ workspaces: HomeWorkspace[] }>()
const emit = defineEmits<{ add: [workspace: HomeWorkspace] }>()
const show = defineModel<boolean>('show', { required: true })

const draft = reactive({
  color: '#83cbb8',
  name: 'Environment studies',
  path: '~/Pictures/ImageGen/Environment studies',
})
const colorOptions = [
  { label: 'Green', value: '#64e36e' },
  { label: 'Blue', value: '#74a8ff' },
  { label: 'Amber', value: '#f0b65f' },
  { label: 'Violet', value: '#b58cff' },
  { label: 'Teal', value: '#83cbb8' },
]
const error = computed(() => validateWorkspaceName(draft.name, draft.path, props.workspaces))

watch(show, (visible) => {
  if (visible) {
    Object.assign(draft, {
      color: '#83cbb8',
      name: 'Environment studies',
      path: '~/Pictures/ImageGen/Environment studies',
    })
  }
})

function addWorkspace() {
  if (error.value) {
    return
  }
  emit('add', {
    availability: 'available',
    color: draft.color,
    id: `workspace-${Date.now()}`,
    isDefault: false,
    name: draft.name.trim(),
    path: draft.path.trim(),
  })
  show.value = false
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Add Workspace"
      class="home-modal"
      role="dialog"
      size="small"
      title="Add Workspace"
    >
      <NFormItem
        :feedback="error || undefined"
        label="Workspace name"
        :validationStatus="error ? 'error' : undefined"
      >
        <NInput v-model:value="draft.name" :inputProps="{ 'aria-label': 'Workspace name' }" />
      </NFormItem>
      <NFormItem label="Folder">
        <NInput v-model:value="draft.path" :inputProps="{ 'aria-label': 'Workspace folder' }" />
      </NFormItem>
      <NFormItem label="Color">
        <NSelect v-model:value="draft.color" aria-label="Workspace color" :options="colorOptions" />
      </NFormItem>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton>
          <NButton :disabled="Boolean(error)" type="primary" @click="addWorkspace">
            Add Workspace
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
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
