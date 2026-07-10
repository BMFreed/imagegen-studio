<script setup lang="ts">
import { NSelect, NTag } from 'naive-ui';
import { computed, ref } from 'vue';

import type { PresetResourceRef } from './presets.types';

import { availableEmbeddings } from './presets.mock';

const embeddings = defineModel<PresetResourceRef[]>({ required: true });
const selectedResourceId = ref<string | null>(null);

const embeddingOptions = computed(() =>
  availableEmbeddings.map((resource) => ({
    disabled: embeddings.value.some((embedding) => embedding.id === resource.id),
    label: resource.name,
    value: resource.id,
  })),
);

function addEmbedding(resourceId: string | null) {
  const resource = availableEmbeddings.find((candidate) => candidate.id === resourceId);

  if (!resource || embeddings.value.some((embedding) => embedding.id === resource.id)) {
    return;
  }

  embeddings.value.push(structuredClone(resource));
  selectedResourceId.value = null;
}
</script>

<template>
  <div class="embedding-editor">
    <div class="embedding-list">
      <NTag
        v-for="(embedding, index) of embeddings"
        :key="embedding.id"
        closable
        @close="embeddings.splice(index, 1)"
      >
        {{ embedding.name }}
      </NTag>
    </div>
    <NSelect
      v-model:value="selectedResourceId"
      clearable
      :options="embeddingOptions"
      placeholder="Add Embedding"
      @update:value="addEmbedding"
    />
  </div>
</template>

<style scoped>
.embedding-editor {
  display: grid;
  gap: 10px;
}

.embedding-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
