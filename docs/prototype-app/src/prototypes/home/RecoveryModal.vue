<script setup lang="ts">
import { NButton, NCard, NModal } from 'naive-ui'

import type { HomeProjectRecord } from './home.types'

defineProps<{ project?: HomeProjectRecord }>()
defineEmits<{ discard: []; recover: [] }>()
const show = defineModel<boolean>('show', { required: true })
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="Recover Project"
      class="recovery-modal"
      role="dialog"
      size="small"
      title="Recovery available"
    >
      <p>
        ImageGen Studio found unfinished changes for
        <strong>{{ project?.displayName }}</strong>
        after an interrupted session.
      </p>
      <p>
        Recovering opens those changes as an unsaved document. The saved .igs will not be
        overwritten until you explicitly save.
      </p>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton>
          <NButton
            @click="
              () => {
                $emit('discard')
                show = false
              }
            "
          >
            Discard Recovery and Open Saved
          </NButton>
          <NButton
            type="primary"
            @click="
              () => {
                $emit('recover')
                show = false
              }
            "
          >
            Recover
          </NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.recovery-modal {
  width: min(600px, calc(100vw - 48px));
}
.recovery-modal p {
  color: var(--app-text-muted);
  line-height: 1.5;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
