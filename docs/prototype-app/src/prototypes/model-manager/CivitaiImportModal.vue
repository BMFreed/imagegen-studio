<template>
  <NModal :show="show" :mask-closable="true" @update:show="$emit('update:show', $event)">
    <section class="import-dialog" role="dialog" aria-modal="true" aria-labelledby="civitai-import-title">
      <header class="dialog-header">
        <div>
          <h2 id="civitai-import-title">Add from CivitAI URL</h2>
          <p>Paste a model link, review what will be installed, then start the download.</p>
        </div>
        <NButton quaternary circle size="small" aria-label="Close import dialog" @click="$emit('update:show', false)">
          <template #icon>
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
        <NButton type="primary" class="install-button">
          <template #icon>
            <NIcon :component="DownloadIcon" />
          </template>
          Install
        </NButton>
        <NButton tertiary @click="$emit('update:show', false)">
          <template #icon>
            <NIcon :component="XIcon" />
          </template>
          Cancel
        </NButton>
      </div>
    </section>
  </NModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Download as DownloadIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon, NInput, NModal } from 'naive-ui';
import ResourceThumbnail from '../../components/ResourceThumbnail.vue';

defineProps<{
  show: boolean;
}>();

defineEmits<{
  'update:show': [show: boolean];
}>();

const urlValue = ref('https://civitai.com/models/112233?modelVersionId=445566');
</script>

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
  background: #18181c;
  box-shadow: 0 24px 70px #0000009c;
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
  background: #202024;
}

.preview-copy {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.preview-copy strong {
}

.preview-copy span {
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
