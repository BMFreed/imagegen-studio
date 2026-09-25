<script setup lang="ts">
import { Download as DownloadIcon, X as XIcon } from '@vicons/tabler'
import { NButton, NCard, NIcon, NModal, NTag } from 'naive-ui'

import type { ModelResource } from './model-manager.types'

import ResourceThumbnail from '../../components/ResourceThumbnail.vue'

defineProps<{
  resource: ModelResource
}>()

defineEmits<{
  install: []
}>()

const show = defineModel<boolean>('show', { required: true })
</script>

<template>
  <NModal v-model:show="show" :maskClosable="true">
    <NCard
      aria-labelledby="version-preview-title"
      aria-modal="true"
      :bordered="true"
      class="version-dialog"
      role="dialog"
      size="small"
    >
      <template v-slot:header>
        <h2 id="version-preview-title">Install Version</h2>
      </template>
      <template v-slot:header-extra>
        <NButton
          aria-label="Close version preview"
          circle
          quaternary
          size="small"
          @click="show = false"
        >
          <template v-slot:icon>
            <NIcon :component="XIcon" />
          </template>
        </NButton>
      </template>

      <div v-if="resource.availableVersion" class="version-preview">
        <div class="resource-identity">
          <ResourceThumbnail :tone="resource.thumbnailTone" />
          <div>
            <strong>{{ resource.name }}</strong>
            <span>{{ resource.baseModel }} · {{ resource.type }} · CivitAI</span>
          </div>
          <NTag :bordered="false" size="small" type="info">Update available</NTag>
        </div>

        <dl class="preview-metadata">
          <div>
            <dt>Version</dt>
            <dd>{{ resource.availableVersion.label }}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd v-overflow-title>{{ resource.availableVersion.fileName }}</dd>
          </div>
          <div>
            <dt>Download size</dt>
            <dd>{{ resource.availableVersion.sizeLabel }}</dd>
          </div>
        </dl>

        <p class="version-note">{{ resource.availableVersion.description }}</p>
        <p class="install-consequence">
          This version is added alongside installed versions. The current default and existing
          project, preset and result references stay unchanged.
        </p>
      </div>

      <template v-slot:footer>
        <div class="modal-actions">
          <NButton :disabled="!resource.availableVersion" type="primary" @click="$emit('install')">
            <template v-slot:icon>
              <NIcon :component="DownloadIcon" />
            </template>
            Install Version
          </NButton>
          <NButton tertiary @click="show = false">Cancel</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.version-dialog {
  width: min(560px, calc(100vw - 32px));
}

h2,
p {
  margin: 0;
}

h2 {
  font-size: 17px;
}

.version-preview {
  display: grid;
  gap: 14px;
}

.resource-identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.resource-identity > div:nth-child(2) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.resource-identity span,
.version-note {
  color: var(--app-text-muted);
}

.preview-metadata {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.preview-metadata div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
}

dt {
  color: var(--app-text-muted);
}

dd {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-consequence {
  padding-left: 10px;
  border-left: 2px solid var(--app-border);
  color: var(--app-text-muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
