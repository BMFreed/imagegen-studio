<script setup lang="ts">
defineProps<{ selected: boolean }>()
</script>

<template>
  <article class="entity-surface" :class="{ 'entity-surface--selected': selected }">
    <div class="entity-header"><slot /></div>
    <div v-if="$slots['details']" class="entity-details"><slot name="details" /></div>
  </article>
</template>

<style scoped>
.entity-surface {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
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
.entity-header :deep(.n-icon) {
  font-size: 18px;
}
.entity-details {
  padding: 0 9px 9px;
}
</style>
