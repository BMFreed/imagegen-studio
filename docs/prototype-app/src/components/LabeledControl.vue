<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{
  id?: string
  label: string
  value?: number | string
}>()

const generatedId = useId()
const controlId = computed(() => props.id ?? generatedId)
</script>

<template>
  <div class="labeled-control">
    <label class="labeled-control-label" :for="controlId">{{ label }}</label>
    <div class="labeled-control-body"><slot :controlId /></div>
    <output v-if="value !== undefined" class="labeled-control-value" :for="controlId">
      {{ value }}
    </output>
  </div>
</template>

<style scoped>
.labeled-control {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}
.labeled-control-label {
  white-space: nowrap;
}
.labeled-control-body {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}
.labeled-control-value {
  font-variant-numeric: tabular-nums;
}
</style>
