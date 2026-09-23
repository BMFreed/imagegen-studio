<script setup lang="ts">
import { computed, ref } from 'vue'

import type { GenerationPayload } from '../../components/generation/generation.types'
import type { PresetSectionKey } from '../presets/presets.types'
import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import {
  presetSectionHasMissingResources,
  sectionLabels,
  sectionOrder,
  summarizePresetSection,
} from '../presets/presets.utils'
import { currentCanvasPayload, resultProvenance } from './project-provenance'
import { deriveGenerationMode } from './project.utils'

const props = defineProps<{ layer: ProjectCompositingLayer; session: ProjectSession }>()
function describeSection(payload: GenerationPayload, section: PresetSectionKey) {
  const summary = summarizePresetSection(payload, section)
  if (section === 'prompt' || section === 'negativePrompt') {
    const refs = payload[section]?.embeddingRefs ?? []
    return (
      summary +
      (refs.length
        ? `\nEmbeddings: ${refs
            .map(
              (r) =>
                `${r.resource.name} [${r.resource.id}]${r.resource.version ? ` · ${r.resource.version}` : ''}`,
            )
            .join(', ')}`
        : '')
    )
  }
  if (section === 'model' && payload.model) {
    return `${summary} · ${payload.model.predictionType ?? 'Prediction type unavailable'}\n${payload.model.id}`
  }
  if (section === 'loras') {
    return (
      payload.loras
        ?.map(
          (l) =>
            `${l.enabled ? 'Enabled' : 'Disabled'} · ${l.resource.name} · ${l.resource.version ?? l.resource.id} · ${l.weight}`,
        )
        .join('\n') || 'None'
    )
  }
  return summary
}
const showSame = ref(false)
const baseline = computed(() => resultProvenance(props.layer))
const current = computed(() => currentCanvasPayload(props.session))
function status(a: unknown, b: unknown, missing = false) {
  return missing
    ? 'Missing resource'
    : a === undefined
      ? b === undefined
        ? 'Unavailable'
        : 'Added'
      : b === undefined
        ? 'Removed'
        : JSON.stringify(a) === JSON.stringify(b)
          ? 'Same'
          : 'Changed'
}
const rows = computed(() => {
  const record = baseline.value
  if (!record) {
    return []
  }
  const rows = sectionOrder.map((section) => ({
    after: describeSection(current.value, section),
    before:
      section === 'seed'
        ? `${describeSection(record.payload, section)}\nRequested policy: ${record.requestedSeedPolicy ?? 'Unavailable'}`
        : describeSection(record.payload, section),
    label: sectionLabels[section],
    status:
      record.unavailableSections?.includes(section) ||
      ((section === 'cfgRescale' || section === 'vaePrecision') &&
        record.payload[section] === undefined)
        ? 'Unavailable'
        : status(
            record.payload[section],
            current.value[section],
            presetSectionHasMissingResources(record.payload, section) ||
              presetSectionHasMissingResources(current.value, section),
          ),
  }))
  const mode = deriveGenerationMode({
    ...props.session,
    ui: { ...props.session.ui, selection: undefined },
  })
  rows.push({
    after: mode,
    before: record.mode,
    label: 'Generation mode',
    status: status(record.mode, mode),
  })
  return rows
})
</script>

<template>
  <section aria-label="Compare generation settings" class="comparison-panel">
    <header>
      <strong>{{ layer.name }}</strong>
      <span>Generation settings · read only</span>
    </header>
    <p>
      {{ rows.filter((r) => r.status !== 'Same').length }} sections to review ·
      {{ rows.filter((r) => r.status === 'Same').length }} same
    </p>
    <div class="column-headings">
      <strong>Generated with</strong>
      <strong>Current Canvas</strong>
    </div>
    <div class="comparison-scroll">
      <article
        v-for="row of rows.filter((r) => showSame || r.status !== 'Same')"
        :key="row.label"
        class="comparison-row"
      >
        <header>
          <strong>{{ row.label }}</strong>
          <span>{{ row.status }}</span>
        </header>
        <div class="values">
          <p>{{ row.before }}</p>
          <p>{{ row.after }}</p>
        </div>
      </article>
    </div>
    <label class="same-toggle">
      <input v-model="showSame" type="checkbox" />
      Show unchanged sections
    </label>
  </section>
</template>

<style scoped>
.comparison-panel {
  width: min(680px, calc(100vw - 64px));
  color: var(--app-text);
}
header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
header span,
p,
.same-toggle {
  color: var(--app-text-muted);
}
.column-headings,
.values {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}
.column-headings {
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
}
.comparison-scroll {
  max-height: min(480px, calc(100vh - 260px));
  overflow: auto;
}
.comparison-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--app-border);
}
.values p {
  color: var(--app-text);
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.same-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 12px;
}
</style>
