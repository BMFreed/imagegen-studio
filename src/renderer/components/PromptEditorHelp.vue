<script setup lang="ts">
import { InfoCircle, X } from '@vicons/tabler'
import { NButton, NIcon, NPopover } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const HINT_STORAGE_KEY = 'imagegen-studio.prompt-editor-hint-dismissed.v1'
const props = defineProps<{
  completionSources: string
  editorFocused: boolean
  title: string
}>()
const emit = defineEmits<{ focusEditor: [] }>()
const dismissed = ref(readDismissed())
const hovered = ref(false)
const infoFocused = ref(false)
const show = computed(
  () => hovered.value || infoFocused.value || (props.editorFocused && !dismissed.value),
)

function readDismissed() {
  try {
    return localStorage.getItem(HINT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
watch(
  () => props.editorFocused,
  (focused) => {
    if (focused) {
      dismissed.value = readDismissed()
    }
  },
)
function dismiss() {
  dismissed.value = true
  hovered.value = false
  infoFocused.value = false
  try {
    localStorage.setItem(HINT_STORAGE_KEY, '1')
  } catch {
    // Help remains usable when the preference store is unavailable.
  }
}
</script>

<template>
  <NPopover :show to="body" trigger="manual">
    <template v-slot:trigger>
      <NButton
        :aria-label="`About ${title} editor`"
        circle
        quaternary
        size="small"
        :themeOverrides="{ heightSmall: '24px', iconSizeSmall: '18px' }"
        @blur="infoFocused = false"
        @click="emit('focusEditor')"
        @focus="infoFocused = true"
        @mousedown.prevent
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
      >
        <template v-slot:icon><NIcon :component="InfoCircle" :size="18" /></template>
      </NButton>
    </template>
    <div class="prompt-help">
      <span>Triple-click selects a comma-separated phrase.</span>
      <span>Ctrl/Cmd+Space browses {{ completionSources }}.</span>
      <span>Ctrl/Cmd+Up / Down adjusts attention.</span>
      <NButton
        v-if="!dismissed"
        class="prompt-help-dismiss"
        size="tiny"
        text
        @click="dismiss"
        @mousedown.prevent
      >
        <template v-slot:icon><NIcon :component="X" /></template>
        Don't show again
      </NButton>
    </div>
  </NPopover>
</template>

<style scoped>
.prompt-help {
  display: grid;
  gap: 3px;
  width: min(330px, calc(100vw - 32px));
  font-size: var(--app-font-size-meta);
}
.prompt-help-dismiss {
  justify-self: end;
  margin-top: 6px;
}
</style>
