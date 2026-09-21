<script setup lang="ts">
import { NSelect, type SelectOption } from 'naive-ui'
import { computed, h } from 'vue'

import type { GenerationResourceRef } from './generation.types'

import GenerationResourceOption from './GenerationResourceOption.vue'

type Resource = GenerationResourceRef & { baseModel?: string; triggerPhrases?: string[] }
const props = withDefaults(
  defineProps<{
    ariaLabel: string
    clearable?: boolean
    disabled?: boolean
    disabledIds?: string[]
    placeholder?: string
    resources: Resource[]
    valueKey?: 'id' | 'name'
  }>(),
  { disabledIds: () => [], placeholder: 'Choose a resource', valueKey: 'id' },
)
const value = defineModel<string | null>()
const options = computed(() =>
  props.resources.map((resource) => ({
    disabled: props.disabledIds.includes(resource.id),
    label:
      props.valueKey === 'name'
        ? resource.name
        : `${resource.name}${resource.version ? ` · ${resource.version}` : ''}`,
    searchText: [
      resource.name,
      resource.version,
      resource.baseModel,
      ...(resource.triggerPhrases ?? []),
    ]
      .join(' ')
      .toLowerCase(),
    value: resource[props.valueKey],
  })),
)
function renderLabel(option: SelectOption) {
  const resource = props.resources.find((resource) => resource[props.valueKey] === option.value)
  return resource
    ? h(GenerationResourceOption, { alreadyAdded: Boolean(option.disabled), resource })
    : String(option.label)
}
function filter(pattern: string, option: SelectOption) {
  return String(option['searchText']).includes(pattern.toLowerCase())
}
</script>

<template>
  <NSelect
    v-model:value="value"
    :aria-label
    :clearable
    :disabled
    :filter
    filterable
    :inputProps="{ 'aria-label': `${ariaLabel} search` }"
    :nodeProps="(option) => ({ 'aria-disabled': Boolean(option.disabled), role: 'option' })"
    :options
    :placeholder
    :renderLabel
    :renderTag="({ option }) => String(option.label)"
    :virtualScroll="false"
  />
</template>
