<script setup lang="ts">
import { FolderOff as EmptyIcon } from '@vicons/tabler'
import { NButton, NEmpty, NIcon } from 'naive-ui'

defineProps<{
  filtered: boolean
  trashView: boolean
}>()

defineEmits<{
  newProject: []
  openProject: []
  reset: []
}>()
</script>

<template>
  <NEmpty
    class="home-empty"
    :description="
      filtered
        ? 'No projects match this search or filter'
        : trashView
          ? 'Trash is empty'
          : 'No projects in this workspace yet'
    "
  >
    <template v-slot:icon><NIcon :component="EmptyIcon" /></template>
    <template v-slot:extra>
      <div class="empty-actions">
        <NButton v-if="filtered" @click="$emit('reset')">Reset filters</NButton>
        <template v-else-if="!trashView">
          <NButton type="primary" @click="$emit('newProject')">New Project</NButton>
          <NButton @click="$emit('openProject')">Import Project</NButton>
        </template>
      </div>
    </template>
  </NEmpty>
</template>

<style scoped>
.home-empty {
  margin: 96px auto 0;
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}
</style>
