<template>
  <span class="entity-thumbnail"><slot /></span>
</template>

<style scoped>
.entity-thumbnail {
  position: relative;
  display: block;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 2px;
  background: var(--app-surface-soft);
}
</style>
