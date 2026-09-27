<script setup lang="ts">
import { ArrowDown, ArrowUp, Braces, Copy, Eraser, ListSearch } from '@vicons/tabler'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'

withDefaults(
  defineProps<{
    attentionTargetAvailable: boolean
    disabled?: boolean
    dynamicPreviewAvailable?: boolean
    empty?: boolean
  }>(),
  { disabled: false, dynamicPreviewAvailable: false, empty: false },
)
const emit = defineEmits<{
  browse: []
  clear: []
  copy: []
  decrease: []
  dynamicPreview: []
  increase: []
}>()
</script>

<template>
  <div class="prompt-actions">
    <IconButton
      compact
      :disabled
      :icon="ListSearch"
      label="Browse prompt suggestions"
      preserveFocus
      tooltip="Browse prompt suggestions (Ctrl/Cmd+Space)"
      @click="emit('browse')"
    />
    <IconButton
      compact
      :disabled="disabled || !attentionTargetAvailable"
      :icon="ArrowUp"
      label="Increase prompt attention"
      preserveFocus
      :tooltip="
        attentionTargetAvailable
          ? 'Increase attention (Ctrl/Cmd+Up)'
          : 'Place the caret in a prompt phrase first'
      "
      @click="emit('increase')"
    />
    <IconButton
      compact
      :disabled="disabled || !attentionTargetAvailable"
      :icon="ArrowDown"
      label="Decrease prompt attention"
      preserveFocus
      :tooltip="
        attentionTargetAvailable
          ? 'Decrease attention (Ctrl/Cmd+Down)'
          : 'Place the caret in a prompt phrase first'
      "
      @click="emit('decrease')"
    />
    <IconButton
      v-if="dynamicPreviewAvailable"
      compact
      :disabled
      :icon="Braces"
      label="Preview dynamic prompt"
      @click="emit('dynamicPreview')"
    />
    <IconButton
      compact
      :disabled="disabled || empty"
      :icon="Copy"
      label="Copy prompt"
      @click="emit('copy')"
    />
    <IconButton
      compact
      :disabled="disabled || empty"
      :icon="Eraser"
      label="Clear prompt"
      preserveFocus
      @click="emit('clear')"
    />
  </div>
</template>

<style scoped>
.prompt-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
</style>
