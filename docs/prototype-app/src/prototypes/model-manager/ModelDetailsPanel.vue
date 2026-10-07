<script setup lang="ts">
import type { SetCheckpointNoiseProfileChange } from '../../../../../src/shared/api.js'

import {
  Download as DownloadIcon,
  Folder as FolderIcon,
  InfoCircle as InfoIcon,
  Link as LinkIcon,
  Refresh as RefreshIcon,
  Trash as TrashIcon,
} from '@vicons/tabler'
import { NButton, NCard, NIcon, NPopover, NScrollbar, NTag, NTooltip } from 'naive-ui'
import { computed } from 'vue'

import type { ModelResource } from './model-manager.types'

import CheckpointNoiseProfileControls from '../../../../../src/renderer/components/CheckpointNoiseProfileControls.vue'
import ResourceThumbnail from '../../components/ResourceThumbnail.vue'
import StatusBadge from '../../components/StatusBadge.vue'

const props = defineProps<{
  resource: ModelResource
  updatesChecked: boolean
}>()

defineEmits<{
  checkForUpdates: []
  previewVersion: []
  setDefaultVersion: [versionId: string]
  setNoiseProfile: [versionId: string, change: SetCheckpointNoiseProfileChange]
}>()

function referenceVersionLabel(versionId: string): string {
  return (
    props.resource.versions?.find((version) => version.id === versionId)?.label ??
    'Unavailable version'
  )
}

const defaultFileName = computed(
  () =>
    props.resource.versions?.find((version) => version.isDefault)?.fileName ??
    `${props.resource.name.replaceAll(' ', '_')}.safetensors`,
)

const usageSummary = computed(() => {
  const references = props.resource.references
  if (!references) {
    return '3 presets, 12 project snapshots'
  }

  return ['Project', 'Preset', 'Result']
    .map((kind) => {
      const count = references.filter((reference) => reference.kind === kind).length
      return `${count} ${kind.toLowerCase()}${count === 1 ? '' : 's'}`
    })
    .join(', ')
})
</script>

<template>
  <aside class="details-panel">
    <NScrollbar>
      <div class="details-scroll">
        <NCard :bordered="true" class="preview-card" size="small">
          <template v-slot:cover>
            <ResourceThumbnail class="large-preview" :tone="resource.thumbnailTone" />
          </template>
          <template v-slot:header>
            <h2>{{ resource.name }}</h2>
          </template>
          <p>{{ resource.description }}</p>
          <template v-slot:footer>
            <div class="badge-row">
              <StatusBadge :status="resource.status" variant="neutral" />
              <NTag v-for="badge of resource.badges" :key="badge" :bordered="false" size="small">
                {{ badge }}
              </NTag>
              <NTooltip v-if="resource.predictionType" trigger="hover">
                <template v-slot:trigger>
                  <NTag :bordered="false" size="small" type="info">
                    {{ resource.predictionType }}
                  </NTag>
                </template>
                Prediction type: {{ resource.predictionType }}
              </NTooltip>
            </div>
          </template>
        </NCard>

        <NCard :bordered="true" size="small">
          <template v-slot:header>
            <h3>Installed Versions</h3>
          </template>
          <template v-slot:header-extra>
            <div class="version-header-actions">
              <NButton size="small" tertiary @click="$emit('checkForUpdates')">
                <template v-slot:icon>
                  <NIcon :component="RefreshIcon" />
                </template>
                Check for updates
              </NButton>
              <NButton
                v-if="resource.availableVersion"
                ghost
                size="small"
                @click="$emit('previewVersion')"
              >
                <template v-slot:icon>
                  <NIcon :component="DownloadIcon" />
                </template>
                Install Version
              </NButton>
            </div>
          </template>
          <div v-if="resource.availableVersion" class="available-version">
            <NTag :bordered="false" size="small" type="info">Update available</NTag>
            <strong>{{ resource.availableVersion.label }}</strong>
            <span>{{ resource.availableVersion.sizeLabel }} · CivitAI</span>
          </div>
          <p v-else-if="updatesChecked" class="update-check-result">No newer versions found.</p>
          <div class="version-list">
            <NCard
              v-for="version of resource.versions"
              :key="version.id"
              :bordered="true"
              class="version-card"
              size="small"
            >
              <div class="version-card-content">
                <div>
                  <strong>{{ version.label }}</strong>
                  <p>{{ version.sizeLabel }}</p>
                </div>
                <div class="version-actions">
                  <NPopover placement="left" trigger="click">
                    <template v-slot:trigger>
                      <NButton aria-label="Version notes" circle quaternary size="tiny">
                        <template v-slot:icon>
                          <NIcon :component="InfoIcon" />
                        </template>
                      </NButton>
                    </template>
                    {{ version.description }}
                  </NPopover>
                  <NTag v-if="version.isDefault" type="success">Default</NTag>
                  <NButton
                    v-else
                    ghost
                    size="small"
                    @click="$emit('setDefaultVersion', version.id)"
                  >
                    Set Default
                  </NButton>
                </div>
              </div>
              <CheckpointNoiseProfileControls
                v-if="version.noiseProfile"
                class="version-noise-controls"
                :disabled="resource.status !== 'installed'"
                :policy="version.noiseProfile"
                :versionName="version.label"
                @change="(change) => $emit('setNoiseProfile', version.id, change)"
              />
            </NCard>
          </div>
          <div v-if="resource.references?.length" class="reference-summary">
            <strong>Existing uses</strong>
            <p>Changing the default only affects new selections.</p>
            <ul aria-label="Existing exact-version references">
              <li v-for="reference of resource.references" :key="reference.id">
                <span>{{ reference.kind }} · {{ reference.label }}</span>
                <span>{{ referenceVersionLabel(reference.versionId) }}</span>
              </li>
            </ul>
          </div>
        </NCard>

        <NCard v-if="resource.triggerWords?.length" :bordered="true" size="small">
          <template v-slot:header>
            <h3>Trigger Words</h3>
          </template>
          <div class="trigger-list">
            <NTag v-for="word of resource.triggerWords" :key="word" :bordered="false" size="small">
              {{ word }}
            </NTag>
          </div>
        </NCard>

        <NCard :bordered="true" size="small">
          <template v-slot:header>
            <h3>Metadata</h3>
          </template>
          <dl class="metadata-grid">
            <div>
              <dt>Version</dt>
              <dd v-overflow-title>{{ resource.versionLabel }}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd v-overflow-title>{{ defaultFileName }}</dd>
            </div>
            <div>
              <dt>Used by</dt>
              <dd v-overflow-title>{{ usageSummary }}</dd>
            </div>
          </dl>
        </NCard>

        <section aria-label="Model actions" class="action-grid">
          <NButton class="action-wide" secondary type="primary">
            <template v-slot:icon>
              <NIcon :component="LinkIcon" />
            </template>
            Copy Link
          </NButton>
          <NButton secondary type="info">
            <template v-slot:icon>
              <NIcon :component="FolderIcon" />
            </template>
            Show in Folder
          </NButton>
          <NButton secondary type="error">
            <template v-slot:icon>
              <NIcon :component="TrashIcon" />
            </template>
            Remove
          </NButton>
        </section>
      </div>
    </NScrollbar>
  </aside>
</template>

<style scoped>
.details-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.details-panel :deep(.n-scrollbar) {
  height: 100%;
}

.details-scroll {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.large-preview {
  width: 100%;
  height: clamp(160px, 23vh, 230px);
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  font-size: 18px;
}

h3 {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.badge-row,
.trigger-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.version-list {
  display: grid;
  gap: 6px;
}

.version-header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.available-version {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.available-version span:last-child {
  color: var(--app-text-muted);
  font-size: 12px;
}

.update-check-result {
  margin-bottom: 10px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.version-card {
  background: transparent;
}

.version-card-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.version-noise-controls {
  margin-top: 12px;
}

.version-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.version-card p {
  margin-top: 2px;
  font-size: 12px;
}

.reference-summary {
  display: grid;
  gap: 5px;
  margin-top: 12px;
}

.reference-summary > strong {
  font-size: 12px;
}

.reference-summary p {
  color: var(--app-text-muted);
  font-size: 12px;
}

.reference-summary ul {
  display: grid;
  gap: 4px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.reference-summary li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.reference-summary li span:last-child {
  flex: 0 0 auto;
  color: var(--app-text-muted);
}

.metadata-grid {
  display: grid;
  gap: 12px;
  margin: 0;
}

.metadata-grid div {
  min-width: 0;
}

dt {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

dd {
  overflow: hidden;
  margin: 3px 0 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.action-wide {
  grid-column: 1 / -1;
}
</style>
