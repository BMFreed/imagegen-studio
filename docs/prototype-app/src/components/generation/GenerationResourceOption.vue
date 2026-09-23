<script setup lang="ts">
import { Check as CheckIcon } from '@vicons/tabler'
import { NIcon } from 'naive-ui'

import type { GenerationResourceRef } from './generation.types'

import { resourcePreviews } from './generation-resource-previews'

defineProps<{
  alreadyAdded?: boolean
  resource: GenerationResourceRef & {
    baseModel?: string
    previewSrc?: string
    triggerPhrases?: string[]
  }
}>()
</script>

<template>
  <div class="resource-option">
    <img
      v-if="resource.previewSrc || resourcePreviews[resource.id]"
      alt=""
      class="resource-preview"
      :src="resource.previewSrc || resourcePreviews[resource.id]"
    />
    <span v-else aria-hidden="true" class="resource-preview resource-preview--empty">—</span>
    <div class="resource-description">
      <span class="resource-heading">
        <strong>{{ resource.name }}</strong>
        <span v-if="alreadyAdded" class="resource-added">
          <NIcon aria-hidden="true" :component="CheckIcon" />
          Added
        </span>
      </span>
      <span class="resource-meta">
        {{ resource.baseModel ?? 'Base model unknown' }}
        <span v-if="resource.version">· {{ resource.version }}</span>
        <span v-if="resource.missing">· Missing</span>
      </span>
      <span v-if="resource.triggerPhrases" class="resource-triggers">
        {{
          resource.triggerPhrases.length ? resource.triggerPhrases.join(', ') : 'No trigger words'
        }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.resource-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 6px 0;
}
.resource-preview {
  flex: 0 0 48px;
  width: 48px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.resource-preview--empty {
  display: grid;
  place-items: center;
  color: var(--app-text-muted);
}
.resource-description {
  display: grid;
  gap: 3px;
  min-width: 0;
  white-space: normal;
  line-height: 1.35;
}
.resource-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px;
  min-width: 0;
}
.resource-description strong {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.resource-added {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: color-mix(in srgb, var(--workspace-green) 58%, var(--app-text-muted));
  font-size: 11px;
  white-space: nowrap;
}
.resource-added .n-icon {
  font-size: 13px;
}
.resource-meta {
  color: var(--app-text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.resource-triggers {
  color: var(--app-text);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
