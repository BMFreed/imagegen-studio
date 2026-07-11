<script setup lang="ts">
import { NButton, NCard, NFormItem, NInput, NModal } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import type { HomeProjectRecord } from './home.types'

import { validateProjectName } from './home.utils'

const props = defineProps<{ project?: HomeProjectRecord; projects: HomeProjectRecord[] }>()
const emit = defineEmits<{ rename: [value: { name: string; projectId: string }] }>()
const show = defineModel<boolean>('show', { required: true })
const name = ref('')
const error = computed(() =>
  props.project
    ? validateProjectName(name.value, props.project.workspaceId, props.projects, props.project.id)
    : 'Project unavailable',
)
watch([show, () => props.project], () => {
  if (show.value) {
    name.value = props.project?.displayName ?? ''
  }
})
function rename() {
  if (!props.project || error.value) {
    return
  }
  emit('rename', { name: name.value.trim(), projectId: props.project.id })
  show.value = false
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Rename Project"
      class="home-modal"
      role="dialog"
      size="small"
      title="Rename Project"
    >
      <NFormItem
        :feedback="error || undefined"
        label="Project name"
        :validationStatus="error ? 'error' : undefined"
      >
        <NInput v-model:value="name" :inputProps="{ 'aria-label': 'Project name' }" />
      </NFormItem>
      <p>The display name and .igs filename will be updated together.</p>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton>
          <NButton :disabled="Boolean(error)" type="primary" @click="rename">Rename</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.home-modal {
  width: min(480px, calc(100vw - 48px));
}
.home-modal p {
  color: var(--app-text-muted);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
