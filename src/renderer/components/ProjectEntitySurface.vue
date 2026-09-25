<script setup lang="ts">
import { Eye, EyeOff, Lock } from '@vicons/tabler'
import { NButton, NIcon } from 'naive-ui'

import { useProjectEntityRow } from './project-entity-row.js'

const row = useProjectEntityRow()

function selectFromSurface(event: MouseEvent) {
  if (event.button !== 0 || event.defaultPrevented) {
    return
  }
  if (
    event.target instanceof Element &&
    event.target.closest('button, input, textarea, select, a[href]')
  ) {
    return
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
      <span
        :aria-label="row.state.value.visible ? 'Visible' : 'Hidden'"
        class="entity-status-icon"
        role="img"
      >
        <NIcon :component="row.state.value.visible ? Eye : EyeOff" :size="17" />
      </span>
      <NButton
        :aria-label="`Select ${row.state.value.name}`"
        :aria-pressed="row.state.value.selected"
        class="entity-select"
        text
        @click="row.select"
      >
        <span class="entity-preview"><slot name="preview" /></span>
        <span class="entity-info">
          <strong :title="row.state.value.name">{{ row.state.value.name }}</strong>
          <span :title="row.state.value.summary">{{ row.state.value.summary }}</span>
        </span>
      </NButton>
      <span v-if="row.state.value.locked" aria-label="Locked" class="entity-status-icon" role="img">
        <NIcon :component="Lock" :size="17" />
      </span>
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

.entity-status-icon {
  display: flex;
  flex: 0 0 20px;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
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
