<script setup lang="ts">
import {
  NButton,
  NCard,
  NFormItem,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
} from 'naive-ui';
import { computed, reactive, watch } from 'vue';

import type { ExternalProjectDraft, HomeWorkspace } from './home.types';

const props = defineProps<{
  defaultWorkspaceId: string;
  workspaces: HomeWorkspace[];
}>();

const emit = defineEmits<{
  confirm: [draft: ExternalProjectDraft];
}>();

const show = defineModel<boolean>('show', { required: true });
const draft = reactive<ExternalProjectDraft>({
  destinationWorkspaceId: props.defaultWorkspaceId,
  fileName: 'Field Notes.igs',
  operation: 'move',
  sourcePath: '~/Downloads/Field Notes.igs',
});
const workspaceOptions = computed(() =>
  props.workspaces
    .filter((workspace) => workspace.availability === 'available')
    .map((workspace) => ({ label: workspace.name, value: workspace.id })),
);

watch(show, (visible) => {
  if (visible) {
    draft.destinationWorkspaceId = props.defaultWorkspaceId;
    draft.operation = 'move';
  }
});

function confirmExternalProject() {
  emit('confirm', { ...draft });
  show.value = false;
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Import Existing Project"
      class="home-modal"
      role="dialog"
      size="small"
      title="Import Existing Project"
    >
      <p class="modal-copy">
        The selected file is outside known workspaces. Choose where ImageGen Studio should manage
        it.
      </p>
      <NFormItem label="Selected project"
        ><NInput aria-label="Selected project" readonly :value="draft.fileName"
      /></NFormItem>
      <NFormItem label="Source"
        ><NInput aria-label="Source" readonly :value="draft.sourcePath"
      /></NFormItem>
      <NFormItem label="Destination workspace"
        ><NSelect
          v-model:value="draft.destinationWorkspaceId"
          aria-label="Destination workspace"
          :options="workspaceOptions"
      /></NFormItem>
      <NFormItem label="File operation">
        <NRadioGroup v-model:value="draft.operation">
          <NRadioButton value="move">Move</NRadioButton>
          <NRadioButton value="copy">Copy</NRadioButton>
        </NRadioGroup>
      </NFormItem>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton
          ><NButton type="primary" @click="confirmExternalProject">{{
            draft.operation === 'move' ? 'Move & Import' : 'Copy & Import'
          }}</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.home-modal {
  width: min(560px, calc(100vw - 48px));
}
.modal-copy {
  margin: 0 0 14px;
  color: var(--app-text-muted);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
