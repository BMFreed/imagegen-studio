<script setup lang="ts">
import { NCheckbox, NCollapseItem, NText } from 'naive-ui';

defineProps<{
  name: string;
  title: string;
}>();

const included = defineModel<boolean>('included', { required: true });
</script>

<template>
  <NCollapseItem :name :title>
    <template v-slot:header-extra>
      <NCheckbox v-model:checked="included" @click.stop>Included</NCheckbox>
    </template>
    <slot v-if="included" />
    <NText v-else depth="3">This section will not be saved in the preset.</NText>
  </NCollapseItem>
</template>
