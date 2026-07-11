<script setup lang="ts">
import { DotsVertical as DotsIcon } from '@vicons/tabler'
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { computed } from 'vue'

import type { HomeProjectAction } from './home.types'

const props = defineProps<{
  projectId: string
  trashView: boolean
}>()

const emit = defineEmits<{
  action: [value: HomeProjectAction]
  select: [id: string]
}>()

const options = computed(() =>
  props.trashView
    ? [
        { key: 'restore', label: 'Restore' },
        { key: 'delete-permanently', label: 'Delete Permanently' },
      ]
    : [
        { key: 'open', label: 'Open' },
        { key: 'open-new', label: 'Open in New Tab' },
        { key: 'rename', label: 'Rename' },
        { key: 'move', label: 'Move to Workspace' },
        { key: 'reveal', label: 'Show in Folder' },
        { key: 'trash', label: 'Move to Trash' },
      ],
)

function selectAction(key: string) {
  emit('action', {
    action: key as HomeProjectAction['action'],
    projectId: props.projectId,
  })
}
</script>

<template>
  <NDropdown :options trigger="click" @select="selectAction">
    <NButton
      aria-label="Project actions"
      circle
      quaternary
      size="small"
      title="Project actions"
      @auxclick.stop
      @click.stop="$emit('select', projectId)"
      @dblclick.stop
    >
      <template v-slot:icon><NIcon :component="DotsIcon" /></template>
    </NButton>
  </NDropdown>
</template>
