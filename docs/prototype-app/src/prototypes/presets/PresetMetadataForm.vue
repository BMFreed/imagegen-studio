<script setup lang="ts">
import { NCard, NDynamicTags, NForm, NFormItem, NInput, NSelect, NSwitch } from 'naive-ui'

import type { PresetDefinition, PresetWorkflow } from './presets.types'

import { normalizePayloadForWorkflow, workflowLabels } from './presets.utils'

const definition = defineModel<PresetDefinition>({ required: true })

const workflowOptions = Object.entries(workflowLabels).map(([value, label]) => ({
  label,
  value,
}))

function updateWorkflow(workflow: PresetWorkflow) {
  definition.value.workflow = workflow
  definition.value.payload = normalizePayloadForWorkflow(definition.value.payload, workflow)
}
</script>

<template>
  <NCard size="small">
    <NForm labelPlacement="top" size="small">
      <NFormItem
        label="Name"
        :validationStatus="definition.name.trim().length === 0 ? 'error' : undefined"
      >
        <NInput v-model:value="definition.name" :inputProps="{ 'aria-label': 'Preset name' }" />
      </NFormItem>
      <NFormItem label="Description">
        <NInput
          v-model:value="definition.description"
          :autosize="{ minRows: 2, maxRows: 3 }"
          :inputProps="{ 'aria-label': 'Preset description' }"
          type="textarea"
        />
      </NFormItem>
      <div class="identity-grid">
        <NFormItem label="Workflow">
          <NSelect
            aria-label="Workflow"
            :options="workflowOptions"
            :value="definition.workflow"
            @update:value="updateWorkflow"
          />
        </NFormItem>
        <NFormItem label="Favorite">
          <NSwitch v-model:value="definition.favorite" aria-label="Favorite" />
        </NFormItem>
      </div>
      <NFormItem label="Tags">
        <NDynamicTags v-model:value="definition.tags" aria-label="Preset tags" />
      </NFormItem>
    </NForm>
  </NCard>
</template>

<style scoped>
.identity-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
}
</style>
