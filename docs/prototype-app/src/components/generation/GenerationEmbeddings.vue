<script setup lang="ts">
import { NSelect, NTag } from 'naive-ui';
import { computed, ref } from 'vue';

import type { GenerationResourceRef } from './generation.types';

const props = defineProps<{ disabled?: boolean; resources: GenerationResourceRef[] }>();
const embeddings = defineModel<GenerationResourceRef[]>({ required: true });
const selectedId = ref<string | null>(null);
const options = computed(() =>
  props.resources.map((resource) => ({
    disabled: embeddings.value.some((item) => item.id === resource.id),
    label: resource.name,
    value: resource.id,
  })),
);
function add(id: string | null) {
  const resource = props.resources.find((item) => item.id === id);
  if (resource && !embeddings.value.some((item) => item.id === id)) {
    embeddings.value.push(structuredClone(resource));
  }
  selectedId.value = null;
}
</script>

<template>
  <div class="embedding-editor">
    <NSelect
      v-model:value="selectedId"
      aria-label="Add Embedding"
      clearable
      :disabled
      :options
      placeholder="Add Embedding"
      @update:value="add"
    />
    <div class="embedding-list">
      <NTag
        v-for="(embedding, index) of embeddings"
        :key="embedding.id"
        closable
        :disabled
        @close="embeddings.splice(index, 1)"
        >{{ embedding.name }}</NTag
      >
    </div>
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
