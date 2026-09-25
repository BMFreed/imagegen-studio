<script setup lang="ts">
import type { ApiResult, RuntimeStatus } from '../shared/api.js'

import { Home as HomeIcon, X as XIcon } from '@vicons/tabler'
import { darkTheme, NButton, NConfigProvider, NEmpty, NIcon } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppChrome from './components/AppChrome.vue'
import HomeView from './components/HomeView.vue'
import RuntimeNotice from './components/RuntimeNotice.vue'
import { imageGenNaiveTheme } from './theme/naive-theme.js'

const homeOpen = ref(true)
const status = ref<RuntimeStatus | null>(null)
const error = ref<string | null>(null)
const pending = ref<'check' | 'install' | 'repair' | null>(null)
let unsubscribeStatus: (() => void) | undefined

const showRuntimeNotice = computed(() => status.value?.kind !== 'ready' || error.value !== null)

function applyResult(result: ApiResult<RuntimeStatus>) {
  if (result.ok) {
    status.value = result.value
    error.value = null
  } else {
    error.value = result.error.message
  }
}

function unexpectedError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : 'An unexpected error occurred.'
}

function onHomeTabKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) {
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    homeOpen.value = true
  }
}

async function runAction(action: 'check' | 'install' | 'repair') {
  if (pending.value !== null) {
    return
  }
  pending.value = action
  error.value = null
  try {
    const runtimeApi = globalThis.window.api?.runtime
    if (!runtimeApi) {
      error.value = 'The desktop application connection is unavailable.'
      return
    }
    const result = await runtimeApi[action === 'check' ? 'getStatus' : action]()
    applyResult(result)
  } catch (cause) {
    unexpectedError(cause)
  } finally {
    pending.value = null
  }
}

onMounted(() => {
  try {
    unsubscribeStatus = globalThis.window.api?.runtime.onStatusChanged((nextStatus) => {
      status.value = nextStatus
      if (nextStatus.kind === 'ready') {
        error.value = null
      }
    })
  } catch (cause) {
    unexpectedError(cause)
  }
  void runAction('check')
})

onBeforeUnmount(() => {
  unsubscribeStatus?.()
})
</script>

<template>
  <NConfigProvider :theme="darkTheme" :themeOverrides="imageGenNaiveTheme">
    <div class="app-shell">
      <AppChrome :homeOpen @home="homeOpen = true" />
      <nav aria-label="Open documents" class="document-tabs" role="tablist">
        <div
          v-if="homeOpen"
          aria-label="Home"
          aria-selected="true"
          class="home-tab"
          role="tab"
          tabindex="0"
          @keydown="onHomeTabKeydown"
        >
          <NIcon :component="HomeIcon" />
          <span>Home</span>
          <NButton
            aria-label="Close Home"
            circle
            class="tab-close"
            quaternary
            size="tiny"
            @click="homeOpen = false"
          >
            <template v-slot:icon><NIcon :component="XIcon" /></template>
          </NButton>
        </div>
      </nav>
      <main class="app-stage">
        <RuntimeNotice
          v-if="showRuntimeNotice"
          :error
          :pending
          :status
          @check="runAction('check')"
          @install="runAction('install')"
          @repair="runAction('repair')"
        />
        <HomeView v-if="homeOpen" />
        <NEmpty v-else class="empty-document" description="No document open">
          <template v-slot:extra>
            <NButton type="primary" @click="homeOpen = true">Open Home</NButton>
          </template>
        </NEmpty>
      </main>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: var(--app-chrome-height) var(--app-tabs-height) minmax(0, 1fr);
  height: 100vh;
}

.document-tabs {
  min-width: 0;
  height: var(--app-tabs-height);
  padding-left: 8px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-chrome);
  user-select: none;
  -webkit-app-region: drag;
}

.home-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 166px;
  height: 100%;
  padding: 0 7px 0 10px;
  border: 1px solid var(--app-border);
  border-bottom-color: var(--app-surface);
  color: var(--app-tab-active-text);
  background: var(--app-surface);
  -webkit-app-region: no-drag;
}

.home-tab > span {
  flex: 1 1 auto;
}

.tab-close {
  flex: 0 0 auto;
  opacity: 0.58;
}

.app-stage {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--app-surface);
}

.empty-document {
  margin: auto;
}
</style>
