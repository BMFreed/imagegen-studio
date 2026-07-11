<script setup lang="ts">
import { type MenuOption, NMenu } from 'naive-ui'
import { computed, h } from 'vue'

import type { PresetRecord, PresetWorkflow } from './presets.types'

import { workflowLabels } from './presets.utils'

type WorkflowFilter = 'all' | PresetWorkflow

const props = defineProps<{
  presets: PresetRecord[]
}>()

const workflow = defineModel<WorkflowFilter>('workflow', { required: true })

function makeMenuLabel(label: string, count: number) {
  return () =>
    h('div', { class: 'menu-label' }, [
      h('span', label),
      h('span', { class: 'menu-count' }, String(count)),
    ])
}

const workflowOptions = computed<MenuOption[]>(() => [
  { key: 'all', label: makeMenuLabel('All Presets', props.presets.length) },
  ...(['textToImage', 'imageToImage', 'smartPatch'] as const).map((value) => ({
    key: value,
    label: makeMenuLabel(
      workflowLabels[value],
      props.presets.filter((preset) => preset.workflow === value).length,
    ),
  })),
])
</script>

<template>
  <nav aria-label="Preset workflows" class="preset-navigation">
    <section class="nav-section">
      <h2>Workflows</h2>
      <NMenu v-model:value="workflow" :indent="16" :options="workflowOptions" />
    </section>
  </nav>
</template>

<style scoped>
.preset-navigation {
  height: 100%;
  padding: 18px;
}

.nav-section {
  display: grid;
  gap: 6px;
}

h2 {
  margin: 0 0 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:deep(.menu-label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
</style>
