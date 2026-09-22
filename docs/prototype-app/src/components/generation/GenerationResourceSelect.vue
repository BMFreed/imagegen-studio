<script setup lang="ts">
import { NSelect, type SelectGroupOption, type SelectInst, type SelectOption } from 'naive-ui'
import {
  computed,
  h,
  type InputHTMLAttributes,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  watch,
} from 'vue'

import type { GenerationResourceRef } from './generation.types'

import GenerationResourceOption from './GenerationResourceOption.vue'

// The selected value is a resource id by default. Callers using names must supply
// unique names (Project does this for its separate model/version controls).
type Resource = GenerationResourceRef & {
  baseModel?: string
  previewSrc?: string
  triggerPhrases?: string[]
}
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
const select = ref<SelectInst | null>(null)
const menuId = useId()
const menuOpen = ref(false)
const activeOptionId = ref<string | undefined>()
let pendingObserver: MutationObserver | undefined
let disposed = false

function stopObservingPendingOption() {
  pendingObserver?.disconnect()
  pendingObserver = undefined
  activeOptionId.value = undefined
}
function syncPendingOption(menu: HTMLElement) {
  // Naive does not expose its keyboard-pending option through a prop or event.
  // Keep this one DOM dependency local to the adapter and cover it in browser tests.
  activeOptionId.value =
    menu.querySelector<HTMLElement>('.n-base-select-option--pending[id]')?.id ?? undefined
}
function observePendingOption() {
  const menu = document.getElementById(menuId)
  if (!menu || !menuOpen.value || disposed) {
    return
  }
  pendingObserver?.disconnect()
  pendingObserver = new MutationObserver(() => syncPendingOption(menu))
  pendingObserver.observe(menu, {
    attributeFilter: ['class'],
    attributes: true,
    childList: true,
    subtree: true,
  })
  syncPendingOption(menu)
}
async function focusSearchAfterKeyboardFocus(event: FocusEvent) {
  if (menuOpen.value || !(event.target instanceof HTMLElement)) {
    return
  }
  const trigger = event.target
  await nextTick()
  if (document.activeElement === trigger) {
    select.value?.focusInput()
  }
}
watch(menuOpen, async (open) => {
  stopObservingPendingOption()
  if (!open) {
    return
  }
  await nextTick()
  requestAnimationFrame(observePendingOption)
})
onBeforeUnmount(() => {
  disposed = true
  stopObservingPendingOption()
})
const options = computed(() =>
  props.resources.map((resource) => ({
    disabled: Boolean(resource.missing) || props.disabledIds.includes(resource.id),
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
    ? h(GenerationResourceOption, {
        alreadyAdded: props.disabledIds.includes(resource.id),
        resource,
      })
    : String(option.label)
}
function filter(pattern: string, option: SelectOption) {
  return String(option['searchText']).includes(pattern.trim().toLowerCase())
}
const inputProps = computed<InputHTMLAttributes>(() => ({
  'aria-activedescendant': menuOpen.value ? activeOptionId.value : undefined,
  'aria-autocomplete': 'list',
  'aria-controls': menuOpen.value ? menuId : undefined,
  'aria-expanded': menuOpen.value,
  'aria-label': `${props.ariaLabel} search`,
  role: 'combobox',
}))
const menuProps = computed(() => ({
  'aria-label': `${props.ariaLabel} options`,
  id: menuId,
  role: 'listbox',
}))
function nodeProps(option: SelectGroupOption | SelectOption) {
  return {
    'aria-disabled': 'disabled' in option && Boolean(option.disabled),
    'aria-selected': 'value' in option && option.value === value.value,
    id:
      'value' in option && option.value !== undefined
        ? `${menuId}-option-${encodeURIComponent(String(option.value))}`
        : undefined,
    role: 'option',
  }
}
</script>

<template>
  <NSelect
    ref="select"
    v-model:value="value"
    :aria-label
    :clearable
    :disabled
    :filter
    filterable
    :inputProps
    :menuProps
    :nodeProps
    :options
    :placeholder
    :renderLabel
    :renderTag="({ option }) => String(option.label)"
    showOnFocus
    :virtualScroll="false"
    @focus="focusSearchAfterKeyboardFocus"
    @update:show="menuOpen = $event"
  />
</template>
