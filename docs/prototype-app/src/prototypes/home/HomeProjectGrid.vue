<script setup lang="ts">
import type { HomeProjectAction, HomeProjectRecord, HomeWorkspace } from './home.types';

import HomeProjectCard from './HomeProjectCard.vue';

defineProps<{
  conditionsById: Record<string, string[]>;
  projects: HomeProjectRecord[];
  selectedId?: string;
  showWorkspace: boolean;
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
  <div aria-label="Project grid" class="project-grid">
    <HomeProjectCard
      v-for="project of projects"
      :key="project.id"
      :conditions="conditionsById[project.id] ?? []"
      :project
      :selected="project.id === selectedId"
      :showWorkspace
      :trashView
      :workspaceName="workspaces.find((item) => item.id === project.workspaceId)?.name ?? 'Unknown'"
      @action="$emit('action', $event)"
      @open="$emit('open', $event)"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  align-content: start;
  gap: 14px;
  padding: 14px 18px 24px;
}
</style>
