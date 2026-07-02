<template>
  <aside class="details-panel">
    <NScrollbar>
      <div class="details-scroll">
        <section class="preview-section">
          <ResourceThumbnail :tone="resource.thumbnailTone" class="large-preview" />
          <div class="identity-copy">
            <h2>{{ resource.name }}</h2>
            <p>{{ resource.description }}</p>
          </div>
          <div class="badge-row">
            <StatusBadge :status="resource.status" />
            <NTag v-for="badge in resource.badges" :key="badge" size="small" :bordered="false">{{ badge }}</NTag>
            <NTag v-if="resource.predictionType" size="small" :bordered="false" type="info">{{ resource.predictionType }}</NTag>
          </div>
        </section>

        <section class="details-card">
          <header class="section-header">
            <h3>Installed Versions</h3>
            <NButton tertiary size="small">
              <template #icon>
                <NIcon :component="DownloadIcon" />
              </template>
              Install Version
            </NButton>
          </header>
          <div class="version-list">
            <article v-for="version in resource.versions" :key="version.id" class="version-row">
              <div>
                <strong>{{ version.label }}</strong>
                <p>{{ version.description }} · {{ version.sizeLabel }}</p>
              </div>
              <NTag v-if="version.isDefault" size="small" :bordered="false" type="success">Default</NTag>
              <NButton v-else secondary size="small">Set Default</NButton>
            </article>
          </div>
        </section>

        <section v-if="resource.triggerWords?.length" class="details-card">
          <header class="section-header">
            <h3>Trigger Words</h3>
          </header>
          <div class="trigger-list">
            <NTag v-for="word in resource.triggerWords" :key="word" size="small">{{ word }}</NTag>
          </div>
        </section>

        <section class="details-card">
          <h3>Metadata</h3>
          <dl class="metadata-grid">
            <div>
              <dt>Version</dt>
              <dd>{{ resource.versionLabel }}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{{ resource.source }}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{{ resource.name.replaceAll(' ', '_') }}.safetensors</dd>
            </div>
            <div>
              <dt>Used by</dt>
              <dd>3 presets, 12 project snapshots</dd>
            </div>
          </dl>
        </section>

        <section class="action-grid" aria-label="Model actions">
          <NButton secondary class="action-wide">
            <template #icon>
              <NIcon :component="LinkIcon" />
            </template>
            Copy Link
          </NButton>
          <NButton secondary>
            <template #icon>
              <NIcon :component="FolderIcon" />
            </template>
            Show in Folder
          </NButton>
          <NButton tertiary type="error">
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
import { Download as DownloadIcon, Folder as FolderIcon, Link as LinkIcon, Trash as TrashIcon } from '@vicons/tabler';
import { NButton, NIcon, NScrollbar, NTag } from 'naive-ui';
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
}

.details-scroll {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.preview-section {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface-raised);
}

.large-preview {
  width: 100%;
  height: 178px;
}

.identity-copy {
  display: grid;
  gap: 4px;
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  color: var(--app-text);
  font-size: 19px;
}

h3 {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

p {
  color: var(--app-text-muted);
}

.badge-row,
.trigger-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.details-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface-raised);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.version-list {
  display: grid;
  gap: 8px;
}

.version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: var(--app-radius);
  background: var(--app-control);
}

.version-row strong {
  color: var(--app-text);
}

.version-row p {
  margin-top: 2px;
  font-size: 12px;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.metadata-grid div {
  min-width: 0;
}

dt {
  color: var(--app-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

dd {
  overflow: hidden;
  margin: 3px 0 0;
  color: var(--app-text);
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
