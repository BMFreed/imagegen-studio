import { inject, type InjectionKey, provide, type Ref } from 'vue'

export interface EntityRowState {
  locked: boolean
  name: string
  selected: boolean
  summary: string
  visible: boolean
  warning?: { label: string; message: string }
}
export interface EntityRowAction {
  disabled?: boolean
  key: string
  label: string
  run: () => void
}

/**
 * Presentation and commands supplied by the owning adapter, never a document model.
 * ProjectEntitySurface owns three event zones: passive surface clicks select, actions own their
 * clicks, and passive details select unless a nested control (native interactive element or
 * `data-entity-control` wrapper) owns the click. The header selection button remains the keyboard
 * and drag-handle target.
 */
export interface EntityRowController {
  menu: Readonly<Ref<EntityRowAction[]>>
  popoverOpen?: Ref<boolean>
  select: () => void
  state: Readonly<Ref<EntityRowState>>
  toggleLock: () => void
  toggleVisible: () => void
}
const entityRowKey: InjectionKey<EntityRowController> = Symbol('project-entity-row')

export function provideEntityRow(controller: EntityRowController) {
  provide(entityRowKey, controller)
}
export function useEntityRow() {
  const controller = inject(entityRowKey)
  if (!controller) {
    throw new Error('ProjectEntitySurface requires an entity row provider')
  }
  return controller
}
