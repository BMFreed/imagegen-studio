<script setup lang="ts">
import { NCollapseItem } from 'naive-ui';

withDefaults(
  defineProps<{
    contentVisible?: boolean;
    name: string;
    title: string;
  }>(),
  { contentVisible: true },
);
</script>

<template>
  <NCollapseItem :name>
    <template v-slot:header>
      <span class="section-heading">
        <strong>{{ title }}</strong>
        <slot name="context" />
      </span>
    </template>
    <template v-slot:header-extra>
      <span class="section-controls" @click.stop>
        <slot name="actions" />
        <slot name="control" />
      </span>
    </template>
    <slot v-if="contentVisible" />
    <slot v-else name="empty" />
  </NCollapseItem>
</template>

<style scoped>
.section-heading {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.section-heading :deep(.n-text) {
  overflow: hidden;
  font-size: 11px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
