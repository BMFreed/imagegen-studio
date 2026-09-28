<script setup lang="ts">
import { InfoCircle, X } from '@vicons/tabler'
import { NButton, NIcon, NPopover } from 'naive-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const HINT_SHOWN_STORAGE_KEY = 'imagegen-studio.prompt-editor-hint-shown.v1'
const LEGACY_DISMISSED_STORAGE_KEY = 'imagegen-studio.prompt-editor-hint-dismissed.v1'
let shownThisSession = false
const props = defineProps<{
  completionSources: string
  editorFocused: boolean
  title: string
}>()
const emit = defineEmits<{ focusEditor: [] }>()
const autoOpen = ref(false)
const manuallyOpen = ref(false)
const hovered = ref(false)
const infoFocused = ref(false)
const popoverFocused = ref(false)
let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined
const show = computed(
  () =>
    autoOpen.value ||
    manuallyOpen.value ||
    hovered.value ||
    infoFocused.value ||
    popoverFocused.value,
)

function clearHoverCloseTimer() {
  if (hoverCloseTimer !== undefined) {
    clearTimeout(hoverCloseTimer)
    hoverCloseTimer = undefined
  }
}

function holdHover() {
  clearHoverCloseTimer()
  markShown()
  hovered.value = true
}

function releaseHover() {
  clearHoverCloseTimer()
  hoverCloseTimer = setTimeout(() => {
    hovered.value = false
    hoverCloseTimer = undefined
  }, 250)
}

onBeforeUnmount(clearHoverCloseTimer)

function alreadyShown() {
  if (shownThisSession) {
    return true
  }
  try {
    return (
      localStorage.getItem(HINT_SHOWN_STORAGE_KEY) === '1' ||
      localStorage.getItem(LEGACY_DISMISSED_STORAGE_KEY) === '1'
    )
  } catch {
    return false
  }
}

function markShown() {
  shownThisSession = true
  try {
    localStorage.setItem(HINT_SHOWN_STORAGE_KEY, '1')
  } catch {
    // The current app session still shares the one-time hint across editors.
  }
}

watch(
  () => props.editorFocused,
  (focused) => {
    if (!focused) {
      autoOpen.value = false
      manuallyOpen.value = false
      return
    }
    if (alreadyShown()) {
      return
    }
    markShown()
    autoOpen.value = true
  },
  { immediate: true },
)

function close() {
  clearHoverCloseTimer()
  autoOpen.value = false
  manuallyOpen.value = false
  hovered.value = false
  infoFocused.value = false
  popoverFocused.value = false
}

function openFromInfo() {
  markShown()
  manuallyOpen.value = true
  emit('focusEditor')
}

function openFromInfoFocus() {
  markShown()
  infoFocused.value = true
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
        @click="openFromInfo"
        @focus="openFromInfoFocus"
        @mousedown.prevent
        @mouseenter="holdHover"
        @mouseleave="releaseHover"
      >
        <template v-slot:icon><NIcon :component="InfoCircle" :size="18" /></template>
      </NButton>
    </template>
    <div class="prompt-help" @mouseenter="holdHover" @mouseleave="releaseHover">
      <span>Triple-click selects a comma-separated phrase.</span>
      <span>Ctrl/Cmd+Space browses {{ completionSources }}.</span>
      <span>Ctrl/Cmd+Up / Down adjusts attention.</span>
      <NButton
        aria-label="Close prompt help"
        circle
        class="prompt-help-close"
        quaternary
        size="small"
        :themeOverrides="{ heightSmall: '24px', iconSizeSmall: '16px' }"
        @blur="popoverFocused = false"
        @click="close"
        @focus="popoverFocused = true"
        @mousedown.prevent
      >
        <template v-slot:icon><NIcon :component="X" /></template>
      </NButton>
    </div>
  </NPopover>
</template>

<style scoped>
.prompt-help {
  position: relative;
  display: grid;
  gap: 3px;
  width: min(330px, calc(100vw - 32px));
  font-size: var(--app-font-size-meta);
}
.prompt-help > span:first-child {
  padding-right: 28px;
}
.prompt-help-close {
  position: absolute;
  top: 0;
  right: 0;
}
</style>
