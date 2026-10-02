<script setup lang="ts">
import { compareRasterGenerationSettings } from '../../../../../src/shared/projects/generation-settings-comparison.js'

import { DnDProvider } from '@vue-dnd-kit/core'
import { NInput, NInputNumber } from 'naive-ui'
import { computed, reactive, ref } from 'vue'

import GenerationSettingsComparison from '../../../../../src/renderer/components/GenerationSettingsComparison.vue'
import ProjectLayerStack from '../../../../../src/renderer/components/ProjectLayerStack.vue'
import { createGenerationComparisonMock } from './generation-comparison.mock.js'

const props = withDefaults(defineProps<{ scenario?: string }>(), { scenario: 'default' })
const fixture = reactive(createGenerationComparisonMock(props.scenario))
const selectedLayerId = ref<string | null>(fixture.generatedLayerId)
const comparisonLayerId = ref<string | null>(null)
const sections = computed(() =>
  fixture.error ? [] : compareRasterGenerationSettings(fixture.data, fixture.current),
)
</script>

<template>
  <main class="comparison-prototype">
    <header class="prototype-heading">
      <h1>Generation settings comparison</h1>
      <p>Mock inputs · production layer menu and comparison UI · no storage or worker.</p>
    </header>
    <div class="prototype-columns">
      <section aria-label="Mock Current Canvas controls" class="prototype-controls">
        <h2>Current Canvas</h2>
        <p>Open a generated layer's menu to compare its recorded settings.</p>
        <label>
          <span>Steps</span>
          <NInputNumber
            v-model:value="fixture.current.generationDraft.sampling.steps"
            class="steps-control"
            :inputProps="{ 'aria-label': 'Current steps' }"
            :max="200"
            :min="1"
            size="small"
          />
        </label>
        <label>
          <span>Prompt</span>
          <NInput
            v-model:value="fixture.current.generationDraft.positivePrompt.text"
            :autosize="{ maxRows: 5, minRows: 3 }"
            :inputProps="{ 'aria-label': 'Current positive prompt' }"
            size="small"
            type="textarea"
          />
        </label>
        <label>
          <span>Negative Prompt</span>
          <NInput
            v-model:value="fixture.current.generationDraft.negativePrompt.text"
            :autosize="{ maxRows: 3, minRows: 2 }"
            :inputProps="{ 'aria-label': 'Current negative prompt' }"
            size="small"
            type="textarea"
          />
        </label>
        <output aria-label="Mock current settings">
          Steps {{ fixture.current.generationDraft.sampling.steps }} · Seed
          {{ fixture.current.generationDraft.seed.value }}
        </output>
      </section>
      <DnDProvider :autoScrollViewport="false">
        <ProjectLayerStack
          v-model:comparisonLayerId="comparisonLayerId"
          v-model:selectedLayerId="selectedLayerId"
          :disabled="false"
          :generatedLayerIds="[fixture.generatedLayerId]"
          :importing="false"
          :layers="fixture.layers"
        >
          <template v-slot:comparison="{ layer }">
            <GenerationSettingsComparison
              :error="fixture.error"
              :layerName="layer.name"
              :loading="false"
              :sections
              @close="comparisonLayerId = null"
            />
          </template>
        </ProjectLayerStack>
      </DnDProvider>
    </div>
  </main>
</template>

<style scoped>
.comparison-prototype {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  color: var(--app-text);
  background: var(--app-bg);
}

.prototype-heading {
  padding: 16px 24px;
  border-bottom: 1px solid var(--app-border);
}

h1,
h2 {
  margin: 0;
  font-size: 16px;
}

p,
output {
  color: var(--app-text-muted);
}

p {
  margin: 6px 0 0;
}

.prototype-columns {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 320px;
  min-height: 0;
}

.prototype-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(400px, 100%);
  min-width: 0;
  box-sizing: border-box;
  padding: 24px;
  overflow: auto;
}

.prototype-controls label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.steps-control {
  width: 160px;
}

@media (max-width: 1000px) {
  .prototype-heading {
    padding: 12px 18px;
  }

  .prototype-controls {
    padding: 18px;
  }

  .prototype-columns {
    grid-template-columns: minmax(0, 1fr) 280px;
  }
}
</style>
