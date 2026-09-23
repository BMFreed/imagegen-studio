<script setup lang="ts">
import { AlertTriangle, DotsVertical, Eye, EyeOff, Lock, LockOpen } from '@vicons/tabler'
import { NButton, NDropdown, NIcon, NPopover, NTooltip } from 'naive-ui'
import { computed } from 'vue'

import { useEntityRow } from './project-entity-row'

const row = useEntityRow()
const state = row.state
const menuOptions = computed(() =>
  row.menu.value.map(({ disabled, key, label }) => ({ disabled, key, label })),
)
const selectionButtonTheme = {
  textColorTextFocus: 'var(--n-text-color)',
  textColorTextHover: 'var(--n-text-color)',
  textColorTextPressed: 'var(--n-text-color)',
}
function runAction(key: number | string) {
  const action = row.menu.value.find((action) => action.key === key)
  if (action && !action.disabled) {
    action.run()
  }
}
function closePopover() {
  if (row.popoverOpen) {
    row.popoverOpen.value = false
  }
}

const nestedControlSelector = [
  '[data-entity-zone="actions"]',
  '[data-entity-control]',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="textbox"]',
].join(', ')

function selectFromSurface(event: MouseEvent) {
  if (event.button !== 0 || event.defaultPrevented) {
    return
  }

  // The surface and passive details select the row. Sibling actions and editors
  // own their clicks, including clicks on icons or padding inside a field.
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
    :class="{ 'entity-surface--selected': state.selected }"
    data-entity-zone="surface"
    @click="selectFromSurface"
  >
    <div class="entity-header">
      <span class="entity-leading-action" data-entity-zone="actions">
        <NButton
          :aria-label="`${state.visible ? 'Hide' : 'Show'} ${state.name}`"
          circle
          quaternary
          size="tiny"
          @click="row.toggleVisible"
        >
          <template v-slot:icon>
            <NIcon :component="state.visible ? Eye : EyeOff" :size="18" />
          </template>
        </NButton>
      </span>
      <NButton
        :aria-label="`Select ${state.name}`"
        :aria-pressed="state.selected"
        class="selection-button"
        text
        :themeOverrides="selectionButtonTheme"
        @click="row.select"
      >
        <span class="entity-previews"><slot name="preview" /></span>
        <span class="entity-info">
          <strong v-overflow-title class="entity-title">{{ state.name }}</strong>
          <span v-overflow-title class="entity-summary">{{ state.summary }}</span>
        </span>
      </NButton>
      <div class="entity-actions" data-entity-zone="actions">
        <NTooltip v-if="state.warning">
          <template v-slot:trigger>
            <span :aria-label="state.warning.label" class="entity-warning" role="img" tabindex="0">
              <NIcon :component="AlertTriangle" :size="18" />
            </span>
          </template>
          {{ state.warning.message }}
        </NTooltip>
        <slot name="header-actions" />
        <NButton
          :aria-label="`${state.locked ? 'Unlock' : 'Lock'} ${state.name}`"
          circle
          quaternary
          size="tiny"
          @click="row.toggleLock"
        >
          <template v-slot:icon>
            <NIcon :component="state.locked ? Lock : LockOpen" :size="18" />
          </template>
        </NButton>
        <NPopover
          placement="left-start"
          :show="row.popoverOpen?.value ?? false"
          trigger="manual"
          @clickoutside="closePopover"
        >
          <template v-slot:trigger>
            <span class="entity-menu-anchor">
              <NDropdown :options="menuOptions" trigger="click" @select="runAction">
                <NButton
                  :aria-label="`Layer actions for ${state.name}`"
                  circle
                  quaternary
                  size="tiny"
                >
                  <template v-slot:icon><NIcon :component="DotsVertical" :size="18" /></template>
                </NButton>
              </NDropdown>
            </span>
          </template>
          <slot name="menu-overlay" />
        </NPopover>
      </div>
    </div>
    <div v-if="$slots['details']" class="entity-details" data-entity-zone="details">
      <slot name="details" />
    </div>
  </article>
</template>

<style scoped>
.entity-surface {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
  cursor: default;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}
.entity-surface:hover {
  background: var(--app-elevated-hover);
  border-color: var(--app-border);
}
.entity-surface--selected,
.entity-surface--selected:hover {
  background: var(--app-elevated-hover);
  border-color: color-mix(in srgb, var(--workspace-green) 65%, transparent);
}
.entity-surface:focus-within {
  outline: 1px solid var(--workspace-green);
  outline-offset: -1px;
}
.entity-header {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 2px;
  padding: 2px 3px;
}
.selection-button {
  min-width: 0;
  flex: 1;
  height: 48px;
  justify-content: start;
  padding: 4px 6px;
  cursor: default;
}
.selection-button :deep(.n-button__content) {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  justify-content: start;
}
.entity-previews,
.entity-leading-action,
.entity-actions,
.entity-menu-anchor {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.entity-previews {
  gap: 7px;
}
.entity-actions {
  gap: 2px;
}
.entity-info {
  display: grid;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.entity-title,
.entity-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entity-title {
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
.entity-summary {
  font-size: 11px;
  line-height: 17px;
  color: var(--app-text-muted);
}
.entity-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--status-warning);
}
.entity-warning .n-icon {
  display: flex;
}
.entity-warning:focus-visible {
  outline: 1px solid var(--workspace-green);
  border-radius: var(--app-radius);
}
.entity-details {
  padding: 0 9px 9px;
}
</style>
