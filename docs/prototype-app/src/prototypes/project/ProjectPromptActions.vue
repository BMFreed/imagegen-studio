<script setup lang="ts">
import { ArrowDown, ArrowUp, Braces, Copy, Eraser, ListSearch } from '@vicons/tabler'
import { NButton, NIcon, NTooltip } from 'naive-ui'

defineProps<{ attentionTargetAvailable: boolean }>()
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
    <NTooltip placement="right">
      <template v-slot:trigger>
        <NButton
          aria-label="Browse prompt suggestions"
          circle
          quaternary
          size="tiny"
          @click.stop="emit('browse')"
          @mousedown.prevent
        >
          <template v-slot:icon><NIcon :component="ListSearch" /></template>
        </NButton>
      </template>
      Browse prompt suggestions (Ctrl/Cmd+Space)
    </NTooltip>
    <NTooltip placement="right">
      <template v-slot:trigger>
        <NButton
          aria-label="Increase prompt attention"
          circle
          :disabled="!attentionTargetAvailable"
          quaternary
          size="tiny"
          @click.stop="emit('increase')"
          @mousedown.prevent
        >
          <template v-slot:icon><NIcon :component="ArrowUp" /></template>
        </NButton>
      </template>
      {{
        attentionTargetAvailable
          ? 'Increase attention (Ctrl/Cmd+Up)'
          : 'Place the caret in a prompt phrase first'
      }}
    </NTooltip>
    <NTooltip placement="right">
      <template v-slot:trigger>
        <NButton
          aria-label="Decrease prompt attention"
          circle
          :disabled="!attentionTargetAvailable"
          quaternary
          size="tiny"
          @click.stop="emit('decrease')"
          @mousedown.prevent
        >
          <template v-slot:icon><NIcon :component="ArrowDown" /></template>
        </NButton>
      </template>
      {{
        attentionTargetAvailable
          ? 'Decrease attention (Ctrl/Cmd+Down)'
          : 'Place the caret in a prompt phrase first'
      }}
    </NTooltip>
    <NTooltip placement="right">
      <template v-slot:trigger>
        <NButton
          aria-label="Preview dynamic prompt"
          circle
          quaternary
          size="tiny"
          @click="emit('dynamicPreview')"
        >
          <template v-slot:icon><NIcon :component="Braces" /></template>
        </NButton>
      </template>
      Preview dynamic prompt
    </NTooltip>
    <NTooltip placement="right">
      <template v-slot:trigger>
        <NButton aria-label="Copy prompt" circle quaternary size="tiny" @click="emit('copy')">
          <template v-slot:icon><NIcon :component="Copy" /></template>
        </NButton>
      </template>
      Copy prompt
    </NTooltip>
    <NTooltip placement="right">
      <template v-slot:trigger>
        <NButton
          aria-label="Clear prompt"
          circle
          quaternary
          size="tiny"
          @click="emit('clear')"
          @mousedown.prevent
        >
          <template v-slot:icon><NIcon :component="Eraser" /></template>
        </NButton>
      </template>
      Clear prompt
    </NTooltip>
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
