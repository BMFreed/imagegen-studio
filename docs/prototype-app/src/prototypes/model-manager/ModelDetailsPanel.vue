<script setup lang="ts">
import {
  Download as DownloadIcon,
  Folder as FolderIcon,
  InfoCircle as InfoIcon,
  Link as LinkIcon,
  Trash as TrashIcon,
} from '@vicons/tabler';
import { NButton, NCard, NIcon, NPopover, NScrollbar, NTag } from 'naive-ui';

import type { ModelResource } from './model-manager.types';

import ResourceThumbnail from '../../components/ResourceThumbnail.vue';
import StatusBadge from '../../components/StatusBadge.vue';

defineProps<{
  resource: ModelResource;
}>();
</script>

<template>
  <aside class="details-panel">
    <NScrollbar>
      <div class="details-scroll">
        <NCard :bordered="true" class="details-card preview-card" size="small">
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
              <NTag v-for="badge of resource.badges" :key="badge" :bordered="false" size="small">{{
                badge
              }}</NTag>
              <NTag v-if="resource.predictionType" :bordered="false" size="small" type="info">{{
                resource.predictionType
              }}</NTag>
            </div>
          </template>
        </NCard>

        <NCard :bordered="true" class="details-card" size="small">
          <template v-slot:header>
            <h3>Installed Versions</h3>
          </template>
          <template v-slot:header-extra>
            <NButton ghost size="small">
              <template v-slot:icon>
                <NIcon :component="DownloadIcon" />
              </template>
              Install Version
            </NButton>
          </template>
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
                  <NButton v-else ghost size="small">Set Default</NButton>
                </div>
              </div>
            </NCard>
          </div>
        </NCard>

        <NCard
          v-if="resource.triggerWords?.length"
          :bordered="true"
          class="details-card"
          size="small"
        >
          <template v-slot:header>
            <h3>Trigger Words</h3>
          </template>
          <div class="trigger-list">
            <NTag
              v-for="word of resource.triggerWords"
              :key="word"
              :bordered="false"
              size="small"
              >{{ word }}</NTag
            >
          </div>
        </NCard>

        <NCard :bordered="true" class="details-card" size="small">
          <template v-slot:header>
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
