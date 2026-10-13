<script setup lang="ts">
import type { ModelCatalogItem, ModelVersionView } from '../../shared/api.js'

defineProps<{
  added?: boolean
  defaultSelectable: boolean
  hasReadyVersion: boolean
  resource: ModelCatalogItem
  statusLabel?: string
  triggerPhrases?: string[]
  version: ModelVersionView | null
}>()
</script>

<template>
  <div class="model-option" :class="{ 'model-option--added': added }">
    <img
      v-if="version?.thumbnailDataUrl"
      alt=""
      class="model-preview"
      :src="version.thumbnailDataUrl"
    />
    <span v-else aria-hidden="true" class="model-preview model-preview--empty">—</span>
    <span class="model-description">
      <strong>{{ resource.name }}</strong>
      <small v-if="version">
        {{
          version.baseModelFamily === 'anima'
            ? 'Anima'
            : version.baseModelFamily === 'illustrious'
              ? 'Illustrious'
              : 'Unknown family'
        }}
        · {{ version.name }} ·
        {{
          statusLabel ??
          (defaultSelectable ? 'Default' : hasReadyVersion ? 'Choose version' : 'Unavailable')
        }}
      </small>
      <small v-else>{{ hasReadyVersion ? 'Choose version' : 'No available versions' }}</small>
      <small v-if="triggerPhrases?.length">{{ triggerPhrases.join(', ') }}</small>
    </span>
  </div>
</template>

<style scoped>
.model-option--added {
  opacity: 0.55;
}
.model-option {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 4px 0;
}

.model-preview {
  flex: 0 0 38px;
  width: 38px;
  height: 42px;
  object-fit: cover;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.model-preview--empty {
  display: grid;
  place-items: center;
  color: var(--app-text-muted);
}

.model-description {
  display: grid;
  gap: 2px;
  min-width: 0;
  white-space: normal;
  line-height: 1.3;
}

.model-description strong {
  overflow-wrap: anywhere;
  color: var(--app-text);
  font-size: var(--app-font-size);
  font-weight: 600;
}

.model-description small {
  overflow-wrap: anywhere;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
</style>
