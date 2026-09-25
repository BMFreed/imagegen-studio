<script setup lang="ts">
import { DotsVertical, Eye, EyeOff, Lock, LockOpen } from '@vicons/tabler'
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { computed } from 'vue'

import { useProjectEntityRow } from './project-entity-row.js'

const row = useProjectEntityRow()
const menuOptions = computed(() =>
  row.menu.value.map(({ disabled, key, label }) => ({ disabled, key, label })),
)
const selectionButtonTheme = {
  textColorTextFocus: 'var(--n-text-color)',
  textColorTextHover: 'var(--n-text-color)',
  textColorTextPressed: 'var(--n-text-color)',
}

function runAction(key: number | string) {
  const action = row.menu.value.find((item) => item.key === key)
  if (action && !action.disabled) {
    action.run()
  }
}

const nestedControlSelector = [
  '[data-entity-control]',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'a[href]',
  '[role="button"]',
].join(', ')

function selectFromSurface(event: MouseEvent) {
  if (event.button !== 0 || event.defaultPrevented) {
    return
  }
  for (const target of event.composedPath()) {
    if (target === event.currentTarget) {
      break
    }
    if (target instanceof Element && target.matches(nestedControlSelector)) {
      return
    }
  }
  row.select()
}
</script>

<template>
  <article
    class="entity-surface"
    :class="{ 'entity-surface--selected': row.state.value.selected }"
    @click="selectFromSurface"
  >
    <div class="entity-header">
      <NButton
        :aria-label="`${row.state.value.visible ? 'Hide' : 'Show'} ${row.state.value.name}`"
        circle
        class="entity-action"
        :disabled="row.state.value.disabled"
        quaternary
        size="tiny"
        @click="row.toggleVisible"
      >
        <template v-slot:icon>
          <NIcon :component="row.state.value.visible ? Eye : EyeOff" :size="17" />
        </template>
      </NButton>
      <NButton
        :aria-label="`Select ${row.state.value.name}`"
        :aria-pressed="row.state.value.selected"
        class="entity-select selection-button"
        text
        :themeOverrides="selectionButtonTheme"
        @click="row.select"
      >
        <span class="entity-preview"><slot name="preview" /></span>
        <span class="entity-info">
          <strong :title="row.state.value.name">{{ row.state.value.name }}</strong>
          <span :title="row.state.value.summary">{{ row.state.value.summary }}</span>
        </span>
      </NButton>
      <NButton
        :aria-label="`${row.state.value.locked ? 'Unlock' : 'Lock'} ${row.state.value.name}`"
        circle
        class="entity-action"
        :disabled="row.state.value.disabled"
        quaternary
        size="tiny"
        @click="row.toggleLock"
      >
        <template v-slot:icon>
          <NIcon :component="row.state.value.locked ? Lock : LockOpen" :size="17" />
        </template>
      </NButton>
      <NDropdown :options="menuOptions" trigger="click" @select="runAction">
        <NButton
          :aria-label="`Layer actions for ${row.state.value.name}`"
          circle
          class="entity-action"
          :disabled="row.state.value.disabled"
          quaternary
          size="tiny"
        >
          <template v-slot:icon><NIcon :component="DotsVertical" :size="17" /></template>
        </NButton>
      </NDropdown>
    </div>
    <div v-if="$slots.details" class="entity-details"><slot name="details" /></div>
  </article>
</template>

<style scoped>
.entity-surface {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
  cursor: default;
}

.entity-surface:hover {
  border-color: var(--app-border);
  background: var(--app-elevated-hover);
}

.entity-surface--selected,
.entity-surface--selected:hover {
  border-color: var(--app-tab-active-text);
  background: var(--app-elevated-hover);
}

.entity-surface:focus-within {
  outline: 1px solid var(--app-tab-active-text);
  outline-offset: -1px;
}

.entity-header {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 3px 5px;
}

.entity-action {
  flex: 0 0 22px;
}

.entity-select {
  flex: 1 1 auto;
  justify-content: start;
  min-width: 0;
  height: 42px;
  padding: 2px;
  cursor: default;
}

.entity-select :deep(.n-button__content) {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  width: 100%;
  text-align: left;
}

.entity-preview {
  flex: 0 0 35px;
  width: 35px;
  height: 35px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  background: var(--app-chrome);
}

.entity-preview :slotted(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.entity-info {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.4;
}

.entity-info > * {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-info strong {
  font-size: var(--app-font-size);
  font-weight: 600;
}

.entity-info span {
  color: var(--app-text-muted);
  font-size: 11px;
}

.entity-details {
  padding: 0 7px 7px 31px;
  color: var(--app-text-muted);
  font-size: 11px;
}
</style>
