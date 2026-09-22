import { computed, ref } from 'vue'

import type { EntityRowAction } from './project-entity-row'
import type { ProjectCompositingLayer } from './project.types'

import { provideEntityRow } from './project-entity-row'
import { resultProvenance } from './project-provenance'

export interface CompositingRowCommands {
  duplicate: () => void
  moveDown: () => void
  moveUp: () => void
  remove: () => void
  savePreset: () => void
  select: () => void
  toggleLock: () => void
  toggleVisible: () => void
  variants: () => void
}

/** Shared compositing actions; all model knowledge stays outside the base row. */
export function useCompositingLayerRow(
  props: { commands: CompositingRowCommands; layer: ProjectCompositingLayer; selected: boolean },
  summary: () => string,
) {
  const comparisonOpen = ref(false)
  const menu = computed<EntityRowAction[]>(() => {
    const hasProvenance = Boolean(resultProvenance(props.layer))
    return [
      {
        disabled: !hasProvenance,
        key: 'compare',
        label: hasProvenance
          ? 'Compare generation settings'
          : 'Compare generation settings · No generation data',
        run: () => {
          comparisonOpen.value = true
        },
      },
      {
        disabled: !hasProvenance,
        key: 'preset',
        label: 'Create Preset from Result',
        run: props.commands.savePreset,
      },
      { key: 'up', label: 'Move up', run: props.commands.moveUp },
      { key: 'down', label: 'Move down', run: props.commands.moveDown },
      { key: 'duplicate', label: 'Duplicate layer', run: props.commands.duplicate },
      { key: 'delete', label: 'Delete layer', run: props.commands.remove },
    ]
  })
  provideEntityRow({
    menu,
    popoverOpen: comparisonOpen,
    select: () => props.commands.select(),
    state: computed(() => ({
      locked: props.layer.locked,
      name: props.layer.name,
      selected: props.selected,
      summary: summary(),
      visible: props.layer.visible,
    })),
    toggleLock: () => props.commands.toggleLock(),
    toggleVisible: () => props.commands.toggleVisible(),
  })
}
