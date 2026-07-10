<script setup lang="ts">
import { Home as HomeIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon, NTabPane, NTabs } from 'naive-ui';
import { nextTick, ref } from 'vue';

import type { DocumentTabModel } from './app-shell.types';

const props = defineProps<{
  tabs: DocumentTabModel[];
}>();

const emit = defineEmits<{
  close: [id: string];
}>();

const activeId = defineModel<string>('activeId', { required: true });
const tablist = ref<HTMLElement>();

function focusTab(index: number) {
  nextTick(() => {
    tablist.value?.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus();
  });
}

function handleTabKeydown(event: KeyboardEvent, index: number) {
  let targetIndex: number | undefined;

  switch (event.key) {
    case 'ArrowLeft': {
      targetIndex = (index - 1 + props.tabs.length) % props.tabs.length;

      break;
    }
    case 'ArrowRight': {
      targetIndex = (index + 1) % props.tabs.length;

      break;
    }
    case 'End': {
      targetIndex = props.tabs.length - 1;

      break;
    }
    case 'Home': {
      targetIndex = 0;

      break;
    }
    // No default
  }

  if (targetIndex === undefined) {
    return;
  }

  event.preventDefault();
  const target = props.tabs[targetIndex];
  if (target) {
    activeId.value = target.id;
    focusTab(targetIndex);
  }
}
</script>

<template>
  <nav ref="tablist" aria-label="Open documents" class="document-tabs" role="tablist">
    <NTabs
      v-model:value="activeId"
      class="document-tabs-control"
      :paneWrapperStyle="{ display: 'none' }"
      size="small"
      :tabsPadding="12"
      type="card"
    >
      <NTabPane v-for="(tab, index) of tabs" :key="tab.id" :name="tab.id">
        <template v-slot:tab>
          <div class="document-tab">
            <NButton
              :aria-selected="tab.id === activeId"
              class="tab-select"
              role="tab"
              :tabindex="tab.id === activeId ? 0 : -1"
              text
              @click.stop="activeId = tab.id"
              @keydown="handleTabKeydown($event, index)"
            >
              <span class="tab-leading">
                <NIcon v-if="tab.kind === 'home'" :component="HomeIcon" />
                <span
                  v-else
                  class="workspace-marker"
                  :style="{ backgroundColor: tab.workspaceColor ?? 'var(--workspace-green)' }"
                />
              </span>
              <span v-overflow-title class="tab-title">{{ tab.title }}</span>
              <span v-if="tab.dirty" aria-label="Unsaved changes" class="dirty-dot" />
            </NButton>
            <NButton
              :aria-label="`Close ${tab.title}`"
              circle
              class="tab-close"
              quaternary
              size="tiny"
              :title="`Close ${tab.title}`"
              @click.stop="emit('close', tab.id)"
            >
              <template v-slot:icon><NIcon :component="XIcon" /></template>
            </NButton>
          </div>
        </template>
      </NTabPane>
    </NTabs>
  </nav>
</template>

<style scoped>
.document-tabs {
  min-width: 0;
  height: 40px;
  overflow: hidden;
  background: var(--app-chrome);
  border-bottom: 1px solid var(--app-border);
  user-select: none;
}

.document-tabs-control {
  height: 40px;
}

.document-tabs-control :deep(.n-tabs-nav) {
  height: 40px;
}

.document-tabs-control :deep(.n-tabs-tab) {
  min-width: 156px;
  max-width: 270px;
  padding: 0;
}

.document-tabs-control :deep(.n-tabs-tab__label) {
  width: 100%;
  min-width: 0;
}

.document-tab {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 32px;
}

.tab-select {
  --n-padding: 0 4px 0 10px;
  min-width: 0;
  height: 100%;
  flex: 1 1 auto;
}

.tab-select :deep(.n-button__content) {
  gap: 7px;
  width: 100%;
  min-width: 0;
}

.tab-leading {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.tab-leading :deep(.n-icon) {
  font-size: 15px;
}

.workspace-marker {
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

.dirty-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--status-warning);
}

.tab-title {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  flex: 0 0 auto;
  margin-right: 3px;
  opacity: 0.58;
}
</style>
