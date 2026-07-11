<script setup lang="ts">
import { NButton, NModal } from 'naive-ui';

defineProps<{ negativeCount: number; positiveCount: number }>();
const show = defineModel<boolean>('show', { default: false });
const emit = defineEmits<{ resolve: [resolution: 'keep' | 'remove'] }>();
</script>

<template>
  <NModal
    v-model:show="show"
    aria-label="LoRA trigger phrases"
    class="lora-trigger-dialog"
    preset="card"
    title="LoRA trigger phrases"
  >
    <p>
      {{ positiveCount + negativeCount }} prompt
      {{ positiveCount + negativeCount === 1 ? 'token is' : 'tokens are' }} linked only to the LoRA
      being disabled or removed.
    </p>
    <p class="affected-prompts">
      <span v-if="positiveCount">Positive Prompt: {{ positiveCount }}</span>
      <span v-if="negativeCount">Negative Prompt: {{ negativeCount }}</span>
    </p>
    <p>How should the prompt be updated?</p>
    <template v-slot:footer>
      <div class="dialog-actions">
        <NButton @click="show = false">Cancel</NButton>
        <NButton @click="emit('resolve', 'remove')">Remove Trigger Phrases</NButton>
        <NButton type="primary" @click="emit('resolve', 'keep')">Keep as Prompt Text</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.lora-trigger-dialog {
  width: min(560px, calc(100vw - 48px));
}
.lora-trigger-dialog p {
  margin: 0;
  color: var(--app-text-muted);
}
.affected-prompts {
  display: flex;
  gap: 12px;
  padding-block: 8px;
  color: var(--app-text);
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
