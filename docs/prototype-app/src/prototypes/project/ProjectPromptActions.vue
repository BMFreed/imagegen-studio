<script setup lang="ts">
import { ArrowDown, ArrowUp, Braces, Copy, Eraser, Hash } from '@vicons/tabler';
import { NButton, NIcon, NInput, NPopover, NTooltip } from 'naive-ui';
import { ref } from 'vue';

const tagOpen = ref(false);
const tag = ref('');
function insert() {
  if (!tag.value.trim()) {
    return;
  }
  // Event is intentionally emitted before closing so focus can return to the prompt.
  emit('insertTag', tag.value.trim());
  tag.value = '';
  tagOpen.value = false;
}
const emit = defineEmits<{
  clear: [];
  copy: [];
  decrease: [];
  dynamicPreview: [];
  increase: [];
  insertTag: [value: string];
}>();
</script>

<template>
  <div class="prompt-actions">
    <NTooltip
      ><template v-slot:trigger
        ><NButton
          aria-label="Increase prompt attention"
          circle
          quaternary
          size="tiny"
          @click="emit('increase')"
          @mousedown.prevent
          ><template v-slot:icon><NIcon :component="ArrowUp" /></template></NButton></template
      >Increase attention (Ctrl/Cmd+Up)</NTooltip
    >
    <NTooltip
      ><template v-slot:trigger
        ><NButton
          aria-label="Decrease prompt attention"
          circle
          quaternary
          size="tiny"
          @click="emit('decrease')"
          @mousedown.prevent
          ><template v-slot:icon><NIcon :component="ArrowDown" /></template></NButton></template
      >Decrease attention (Ctrl/Cmd+Down)</NTooltip
    >
    <NPopover v-model:show="tagOpen" placement="bottom-end" trigger="click">
      <template v-slot:trigger
        ><NTooltip
          ><template v-slot:trigger
            ><NButton aria-label="Insert prompt tag" circle quaternary size="tiny"
              ><template v-slot:icon><NIcon :component="Hash" /></template></NButton></template
          >Insert prompt tag</NTooltip
        ></template
      >
      <div class="tag-entry">
        <NInput
          v-model:value="tag"
          aria-label="Prompt tag"
          placeholder="cinematic lighting"
          size="small"
          @keyup.enter="insert"
        /><NButton size="small" type="primary" @click="insert">Insert</NButton>
      </div>
    </NPopover>
    <NTooltip
      ><template v-slot:trigger
        ><NButton
          aria-label="Preview dynamic prompt"
          circle
          quaternary
          size="tiny"
          @click="emit('dynamicPreview')"
          ><template v-slot:icon><NIcon :component="Braces" /></template></NButton></template
      >Preview dynamic prompt</NTooltip
    >
    <NTooltip
      ><template v-slot:trigger
        ><NButton aria-label="Copy prompt" circle quaternary size="tiny" @click="emit('copy')"
          ><template v-slot:icon><NIcon :component="Copy" /></template></NButton></template
      >Copy prompt</NTooltip
    >
    <NTooltip
      ><template v-slot:trigger
        ><NButton aria-label="Clear prompt" circle quaternary size="tiny" @click="emit('clear')"
          ><template v-slot:icon><NIcon :component="Eraser" /></template></NButton></template
      >Clear prompt</NTooltip
    >
  </div>
</template>

<style scoped>
.prompt-actions {
  display: flex;
  align-items: center;
  gap: 1px;
}
.tag-entry {
  display: flex;
  width: 280px;
  gap: 6px;
}
</style>
