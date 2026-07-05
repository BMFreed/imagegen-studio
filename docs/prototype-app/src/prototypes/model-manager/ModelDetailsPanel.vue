<template>
  <aside class="details-panel">
    <NScrollbar>
      <div class="details-scroll">
        <NCard size="small" class="details-card preview-card" :bordered="true">
          <template #cover>
          <ResourceThumbnail :tone="resource.thumbnailTone" class="large-preview" />
          </template>
          <template #header>
            <h2>{{ resource.name }}</h2>
          </template>
            <p>{{ resource.description }}</p>
          <template #footer>
          <div class="badge-row">
            <StatusBadge :status="resource.status" variant="neutral" />
            <NTag v-for="badge in resource.badges" :key="badge" size="small" :bordered="false">{{ badge }}</NTag>
            <NTag v-if="resource.predictionType" size="small" :bordered="false" type="info">{{ resource.predictionType }}</NTag>
          </div>
          </template>
        </NCard>

        <NCard size="small" class="details-card" :bordered="true">
          <template #header>
            <h3>Installed Versions</h3>
          </template>
          <template #header-extra>
            <NButton ghost size="small">
              <template #icon>
                <NIcon :component="DownloadIcon" />
              </template>
              Install Version
            </NButton>
          </template>
          <div class="version-list">
            <NCard v-for="version in resource.versions" :key="version.id" size="small" class="version-card" :bordered="true">
              <div class="version-card-content">
                <div>
                  <strong>{{ version.label }}</strong>
                  <p>{{ version.sizeLabel }}</p>
                </div>
                <div class="version-actions">
                  <NPopover trigger="click" placement="left">
                    <template #trigger>
                      <NButton quaternary circle size="tiny" aria-label="Version notes">
                        <template #icon>
                          <NIcon :component="InfoIcon" />
                        </template>
                      </NButton>
                    </template>
                    {{ version.description }}
                  </NPopover>
                  <NTag v-if="version.isDefault" type="success">Default</NTag>
                  <NButton v-else ghost size="small">Set Default</NButton>
                </div>
              </div>
            </NCard>
          </div>
        </NCard>

        <NCard v-if="resource.triggerWords?.length" size="small" class="details-card" :bordered="true">
          <template #header>
            <h3>Trigger Words</h3>
          </template>
          <div class="trigger-list">
            <NTag v-for="word in resource.triggerWords" :key="word" size="small" :bordered="false">{{ word }}</NTag>
          </div>
        </NCard>

        <NCard size="small" class="details-card" :bordered="true">
          <template #header>
            <h3>Metadata</h3>
          </template>
          <dl class="metadata-grid">
            <div>
              <dt>Version</dt>
              <dd v-overflow-title>{{ resource.versionLabel }}</dd>
            </div>
            <div class="metadata-item metadata-item--wide">
              <dt>File</dt>
              <dd v-overflow-title>{{ resource.name.replaceAll(' ', '_') }}.safetensors</dd>
            </div>
            <div>
              <dt>Used by</dt>
              <dd v-overflow-title>3 presets, 12 project snapshots</dd>
            </div>
          </dl>
        </NCard>

        <section class="action-grid" aria-label="Model actions">
          <NButton secondary type="primary" class="action-wide">
            <template #icon>
              <NIcon :component="LinkIcon" />
            </template>
            Copy Link
          </NButton>
          <NButton secondary type="info">
            <template #icon>
              <NIcon :component="FolderIcon" />
            </template>
            Show in Folder
          </NButton>
          <NButton secondary type="error">
            <template #icon>
              <NIcon :component="TrashIcon" />
            </template>
            Remove
          </NButton>
        </section>
      </div>
    </NScrollbar>
  </aside>
</template>

<script setup lang="ts">
import { Download as DownloadIcon, Folder as FolderIcon, InfoCircle as InfoIcon, Link as LinkIcon, Trash as TrashIcon } from '@vicons/tabler';
import { NButton, NCard, NIcon, NPopover, NScrollbar, NTag } from 'naive-ui';
import ResourceThumbnail from '../../components/ResourceThumbnail.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import type { ModelResource } from './model-manager.types';

defineProps<{
  resource: ModelResource;
}>();
</script>

<style scoped>
.details-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.details-scroll {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.preview-card :deep(.n-card__content) {
  display: grid;
  gap: 12px;
}

.large-preview {
  width: 100%;
  height: 320px;
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

.version-card {
  background: transparent;
}

.version-card-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
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

.metadata-grid {
  display: grid;
  gap: 12px;
  margin: 0;
}

.metadata-grid div {
  min-width: 0;
}

.metadata-item--wide {
  grid-column: 1 / -1;
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
