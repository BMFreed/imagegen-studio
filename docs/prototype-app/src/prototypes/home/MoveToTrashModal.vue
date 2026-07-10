<script setup lang="ts">
import { NButton, NCard, NModal } from 'naive-ui';

import type { HomeProjectRecord } from './home.types';

defineProps<{ blocked: boolean; project?: HomeProjectRecord }>();
defineEmits<{ confirm: []; switchProject: [] }>();
const show = defineModel<boolean>('show', { required: true });
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false"
    ><NCard
      aria-label="Move Project to Trash"
      class="trash-modal"
      role="dialog"
      size="small"
      title="Move Project to Trash"
      ><template v-if="blocked"
        ><p>
          <strong>{{ project?.displayName }}</strong> is open. Close the project before moving its
          .igs file to Trash.
        </p></template
      ><template v-else
        ><p>
          Move <strong>{{ project?.fileName }}</strong> to ImageGen Studio Trash? You can restore it
          later or delete it permanently from the Trash view.
        </p></template
      ><template v-slot:footer
        ><div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton
          ><NButton
            v-if="blocked"
            key="n-button-1"
            type="primary"
            @click="
              $emit('switchProject');
              show = false;
            "
            >Switch to Project</NButton
          ><NButton
            v-else
            key="n-button-2"
            type="error"
            @click="
              $emit('confirm');
              show = false;
            "
            >Move to Trash</NButton
          >
        </div></template
      ></NCard
    ></NModal
  >
</template>

<style scoped>
.trash-modal {
  width: min(520px, calc(100vw - 48px));
}
.trash-modal p {
  color: var(--app-text-muted);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
