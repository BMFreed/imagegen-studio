<script setup lang="ts">
import type { ProjectRegionalGuidanceReferenceImageView } from '../../shared/api.js'
import type { ProjectRegionalGuidanceReferenceImageChange } from '../../shared/projects/regional-guidance.js'

import { ArrowDown, ArrowUp, X } from '@vicons/tabler'
import { ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'

const props = defineProps<{
  disabled: boolean
  images: readonly ProjectRegionalGuidanceReferenceImageView[]
  ownerKey: string
}>()
const emit = defineEmits<{
  change: [change: ProjectRegionalGuidanceReferenceImageChange]
}>()
const failedThumbnails = ref<Record<string, string>>({})

watch(
  () => props.images,
  (images) => {
    failedThumbnails.value = Object.fromEntries(
      images.flatMap((image) =>
        failedThumbnails.value[image.id] === image.thumbnailUrl
          ? [[image.id, image.thumbnailUrl]]
          : [],
      ),
    )
  },
)

function thumbnailFailed(referenceId: string, thumbnailUrl: string) {
  failedThumbnails.value = { ...failedThumbnails.value, [referenceId]: thumbnailUrl }
}

function remove(referenceId: string) {
  if (!props.disabled && props.images.some((image) => image.id === referenceId)) {
    emit('change', { kind: 'remove', referenceId })
  }
}

function move(referenceId: string, delta: -1 | 1) {
  const index = props.images.findIndex((image) => image.id === referenceId)
  const targetIndex = index + delta
  if (!props.disabled && index >= 0 && targetIndex >= 0 && targetIndex < props.images.length) {
    emit('change', { kind: 'move', referenceId, targetIndex })
  }
}
</script>

<template>
  <section aria-label="Regional reference images" class="regional-references" data-entity-control>
    <span class="regional-reference-heading">Reference Images</span>
    <ul class="regional-reference-list">
      <li
        v-for="(reference, index) of images"
        :key="`${ownerKey}:${reference.id}`"
        class="regional-reference"
        :data-regional-reference-id="reference.id"
      >
        <div class="regional-reference-preview">
          <img
            v-if="
              reference.thumbnailUrl && failedThumbnails[reference.id] !== reference.thumbnailUrl
            "
            :key="reference.thumbnailUrl"
            :alt="reference.name"
            decoding="async"
            :src="reference.thumbnailUrl"
            @error="thumbnailFailed(reference.id, reference.thumbnailUrl)"
          />
          <span v-else :aria-label="`Thumbnail unavailable for ${reference.name}`" role="img">
            —
          </span>
        </div>
        <div class="regional-reference-metadata">
          <span class="regional-reference-name">{{ reference.name }}</span>
          <span>
            {{ reference.sourceFormat }} · {{ reference.asset.width }} ×
            {{ reference.asset.height }} px
          </span>
          <span v-if="failedThumbnails[reference.id] === reference.thumbnailUrl">
            Thumbnail unavailable
          </span>
        </div>
        <div class="regional-reference-actions">
          <IconButton
            compact
            :disabled="disabled || index === 0"
            :icon="ArrowUp"
            :label="`Move reference ${reference.name} earlier`"
            @click="move(reference.id, -1)"
          />
          <IconButton
            compact
            :disabled="disabled || index === images.length - 1"
            :icon="ArrowDown"
            :label="`Move reference ${reference.name} later`"
            @click="move(reference.id, 1)"
          />
          <IconButton
            compact
            :disabled
            :icon="X"
            :label="`Remove reference ${reference.name}`"
            @click="remove(reference.id)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.regional-references,
.regional-reference-list,
.regional-reference-metadata {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.regional-references {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.regional-reference-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.regional-reference {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: start;
  gap: 4px 8px;
  min-width: 0;
}

.regional-reference-preview {
  display: grid;
  width: 40px;
  height: 40px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: repeating-conic-gradient(var(--app-surface) 0% 25%, var(--app-elevated) 0% 50%) 0 /
    12px 12px;
}

.regional-reference-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.regional-reference-metadata {
  gap: 0;
  overflow-wrap: anywhere;
}

.regional-reference-name {
  color: var(--app-text);
}

.regional-reference-actions {
  display: flex;
  grid-column: 2;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
