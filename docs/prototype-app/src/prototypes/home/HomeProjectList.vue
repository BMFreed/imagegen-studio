<script setup lang="ts">
import type { HomeProjectAction, HomeProjectRecord, HomeWorkspace } from './home.types';

import HomeProjectListRow from './HomeProjectListRow.vue';

defineProps<{
  conditionsById: Record<string, string[]>;
  projects: HomeProjectRecord[];
  selectedId?: string;
  trashView: boolean;
  workspaces: HomeWorkspace[];
}>();

defineEmits<{
  action: [value: HomeProjectAction];
  open: [value: { projectId: string; target: 'current' | 'new' }];
  select: [id: string];
}>();
</script>

<template>
  <div aria-label="Project list" class="project-list">
    <HomeProjectListRow
      v-for="project of projects"
      :key="project.id"
      :conditions="conditionsById[project.id] ?? []"
      :project
      :selected="project.id === selectedId"
      :trashView
      :workspaceName="workspaces.find((item) => item.id === project.workspaceId)?.name ?? 'Unknown'"
      @action="$emit('action', $event)"
      @open="$emit('open', $event)"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.project-list {
  display: grid;
  align-content: start;
  gap: 7px;
  padding: 12px 18px 24px;
}
</style>
