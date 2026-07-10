<script setup lang="ts">
import { NButton, NCard, NFormItem, NModal, NSelect } from 'naive-ui';
import { computed, ref, watch } from 'vue';

import type { HomeProjectRecord, HomeWorkspace } from './home.types';

const props = defineProps<{ project?: HomeProjectRecord; workspaces: HomeWorkspace[] }>();
const emit = defineEmits<{ move: [value: { projectId: string; workspaceId: string }] }>();
const show = defineModel<boolean>('show', { required: true });
const workspaceId = ref('');
const options = computed(() =>
  props.workspaces
    .filter(
      (workspace) =>
        workspace.availability === 'available' && workspace.id !== props.project?.workspaceId,
    )
    .map((workspace) => ({ label: workspace.name, value: workspace.id })),
);
watch(show, (visible) => {
  if (visible) {
    workspaceId.value = options.value[0]?.value ?? '';
  }
});
function move() {
  if (!props.project || !workspaceId.value) {
    return;
  }
  emit('move', { projectId: props.project.id, workspaceId: workspaceId.value });
  show.value = false;
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false"
    ><NCard
      aria-label="Move Project"
      class="home-modal"
      role="dialog"
      size="small"
      :title="`Move ${project?.displayName ?? 'Project'}`"
      ><NFormItem label="Destination workspace"
        ><NSelect
          v-model:value="workspaceId"
          aria-label="Destination workspace"
          :options /></NFormItem
      ><template v-slot:footer
        ><div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton
          ><NButton :disabled="!workspaceId" type="primary" @click="move">Move Project</NButton>
        </div></template
      ></NCard
    ></NModal
  >
</template>

<style scoped>
.home-modal {
  width: min(480px, calc(100vw - 48px));
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
