<script setup lang="ts">
import type { ProjectLayerView, ProjectTab } from '../../shared/api.js'
import { projectAcceptedResultOwners } from '../../shared/projects/project-accepted-results.js'

import { Photo as ImageIcon } from '@vicons/tabler'
import { NButton, NCard, NEmpty, NIcon, NModal, NTag, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  disabled: boolean
  layers: ProjectLayerView[]
  results: ProjectTab['acceptedResults']
}>()
const emit = defineEmits<{ closed: []; selectLayer: [layerId: string] }>()
const show = defineModel<boolean>('show', { required: true })
const layersById = computed(() => new Map(props.layers.map((layer) => [layer.id, layer])))
const owners = computed(() => projectAcceptedResultOwners(props.layers))
function ownerLayer(resultId: string) {
  const owner = owners.value?.get(resultId)
  return owner && layersById.value.get(owner.layerId)
}
const failedImageUrls = ref(new Set<string>())

watch(
  () => props.results.map((result) => result.imageUrl),
  (urls) => {
    const current = new Set(urls)
    failedImageUrls.value = new Set([...failedImageUrls.value].filter((url) => current.has(url)))
  },
)

function markImageFailed(url: string) {
  failedImageUrls.value = new Set([...failedImageUrls.value, url])
}

function selectLayer(layerId: string) {
  if (!props.disabled && owners.value?.has(layerId)) {
    emit('selectLayer', layerId)
  }
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false" @afterLeave="emit('closed')">
    <NCard
      aria-label="Accepted results"
      class="accepted-results-modal"
      contentScrollable
      role="dialog"
      size="small"
      title="Accepted results"
    >
      <p class="history-description">
        Select a result to reveal its layer or inspect its Smart Patch variant.
      </p>
      <div v-if="results.length === 0" class="history-empty">
        <NEmpty description="No accepted results yet" size="small">
          <template v-slot:extra>
            <p>Accept a temporary result as a layer or Smart Patch variant to include it here.</p>
          </template>
        </NEmpty>
      </div>
      <div v-else aria-label="Accepted project results" class="accepted-results-list" role="list">
        <article
          v-for="result of results"
          :key="result.layerId"
          class="accepted-result"
          :data-layer-id="result.layerId"
          role="listitem"
        >
          <NButton
            :aria-label="
              owners?.get(result.layerId)?.kind === 'smart-patch-variant'
                ? `Show variant ${result.layerName} in ${ownerLayer(result.layerId)?.name}`
                : `Select layer ${result.layerName}`
            "
            block
            class="accepted-result-button"
            :disabled="disabled || !owners?.has(result.layerId)"
            quaternary
            @click="selectLayer(result.layerId)"
          >
            <span class="accepted-result-layout">
              <span aria-hidden="true" class="result-image">
                <img
                  v-if="!failedImageUrls.has(result.imageUrl)"
                  :key="result.imageUrl"
                  alt=""
                  decoding="async"
                  loading="lazy"
                  :src="result.imageUrl"
                  @error="markImageFailed(result.imageUrl)"
                />
                <span v-else class="preview-fallback">
                  <NIcon :component="ImageIcon" :size="24" />
                  <span>Preview unavailable</span>
                </span>
              </span>
              <span class="result-details">
                <strong class="result-name" :title="result.layerName">
                  {{ result.layerName }}
                </strong>
                <span
                  v-if="owners?.get(result.layerId)?.kind === 'smart-patch-variant'"
                  class="result-model"
                  :title="ownerLayer(result.layerId)?.name"
                >
                  Smart Patch: {{ ownerLayer(result.layerId)?.name }}
                </span>
                <span
                  class="result-model"
                  :title="`${result.modelName} · ${result.modelVersionName}`"
                >
                  {{ result.modelName }} · {{ result.modelVersionName }}
                </span>
                <span class="result-metadata">
                  <span>Seed {{ result.seed }}</span>
                  <span>Generated size: {{ result.width }} × {{ result.height }}</span>
                  <NTag
                    v-if="ownerLayer(result.layerId)?.visible === false"
                    :bordered="false"
                    size="tiny"
                  >
                    Hidden layer
                  </NTag>
                </span>
                <time class="accepted-at" :dateTime="result.acceptedAt" :title="result.acceptedAt">
                  Added {{ dateFormat.format(new Date(result.acceptedAt)) }}
                </time>
                <NTooltip>
                  <template v-slot:trigger>
                    <span class="checkpoint-identity">
                      Checkpoint SHA-256 {{ result.modelFileSha256.slice(0, 12) }}…
                    </span>
                  </template>
                  {{ result.modelFileSha256 }}
                </NTooltip>
              </span>
              <span class="select-label">
                {{
                  owners?.get(result.layerId)?.kind === 'smart-patch-variant'
                    ? 'Show variant'
                    : 'Select layer'
                }}
              </span>
            </span>
          </NButton>
        </article>
      </div>
      <template v-slot:footer>
        <div class="history-actions">
          <NButton secondary size="small" @click="show = false">Close</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.accepted-results-modal {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
}

.history-description {
  margin: 0 0 14px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.history-empty {
  padding: 24px 12px;
}

.history-empty p {
  max-width: 380px;
  margin: 0;
  white-space: normal;
}

.accepted-results-list {
  display: grid;
  gap: 6px;
}

.accepted-result-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: auto;
  padding: 10px;
}

.accepted-result-layout {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  white-space: normal;
}

.result-image {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  color: var(--app-text-muted);
  background: var(--app-chrome);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.result-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-fallback {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 4px;
  text-align: center;
  font-size: var(--app-font-size-meta);
  line-height: 1.2;
}

.result-details {
  display: grid;
  gap: 4px;
  min-width: 0;
  line-height: 1.4;
}

.result-name,
.result-model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-metadata {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.result-model,
.result-metadata,
.accepted-at,
.checkpoint-identity,
.select-label {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.checkpoint-identity {
  width: fit-content;
}

.history-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
