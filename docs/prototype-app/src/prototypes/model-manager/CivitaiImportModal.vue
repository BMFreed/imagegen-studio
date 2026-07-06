<script setup lang="ts">
import { Download as DownloadIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon, NInput, NModal } from 'naive-ui';
import { ref } from 'vue';

import ResourceThumbnail from '../../components/ResourceThumbnail.vue';

const show = defineModel<boolean>('show', { required: true });
const urlValue = ref('https://civitai.com/models/112233?modelVersionId=445566');
</script>

<template>
  <NModal v-model:show="show" :maskClosable="true">
    <section
      aria-labelledby="civitai-import-title"
      aria-modal="true"
      class="import-dialog"
      role="dialog"
    >
      <header class="dialog-header">
        <div>
          <h2 id="civitai-import-title">Add from CivitAI URL</h2>
          <p>Paste a model link, review what will be installed, then start the download.</p>
        </div>
        <NButton
          aria-label="Close import dialog"
          circle
          quaternary
          size="small"
          @click="show = false"
        >
          <template v-slot:icon>
            <NIcon :component="XIcon" />
          </template>
        </NButton>
      </header>

      <div class="import-content">
        <NInput v-model:value="urlValue" />

        <article class="import-preview">
          <ResourceThumbnail tone="blue" />
          <div class="preview-copy">
            <strong>Soft Ink Detailer</strong>
            <span>Author · InkForge</span>
            <span>Version · v0.2 · LoRA · Illustrious · 228 MB</span>
          </div>
        </article>
      </div>

      <div class="modal-actions">
        <NButton class="install-button" type="primary">
          <template v-slot:icon>
            <NIcon :component="DownloadIcon" />
          </template>
          Install
        </NButton>
        <NButton tertiary @click="show = false">
          <template v-slot:icon>
            <NIcon :component="XIcon" />
          </template>
          Cancel
        </NButton>
      </div>
    </section>
  </NModal>
</template>

<style scoped>
.import-content {
  display: grid;
  gap: 14px;
}

.import-dialog {
  display: grid;
  gap: 16px;
  width: 560px;
  padding: 18px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: 0 24px 70px var(--app-shadow-dialog);
}

.dialog-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}

h2 {
  margin: 0 0 5px;
  font-size: 17px;
}

.dialog-header p {
  margin: 0;
}

.import-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.preview-copy {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.modal-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.install-button {
  justify-content: center;
}
</style>
