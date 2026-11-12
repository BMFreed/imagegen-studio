import { inject, type InjectionKey, provide, type Ref } from 'vue'

export interface ProjectEntityRowState {
  disabled: boolean
  locked: boolean
  name: string
  selected: boolean
  summary: string
  visible: boolean
}

export interface ProjectEntityRowAction {
  disabled?: boolean
  key: string
  label: string
  run: () => void
}

/** The shared row owns presentation; the entity adapter supplies its state and command. */
export interface ProjectEntityRowController {
  menu: Readonly<Ref<ProjectEntityRowAction[]>>
  popoverAfterLeave?: () => void
  popoverOpen?: Ref<boolean>
  select: () => void
  state: Readonly<Ref<ProjectEntityRowState>>
  toggleLock: () => void
  toggleVisible: () => void
}

const projectEntityRowKey: InjectionKey<ProjectEntityRowController> = Symbol('project-entity-row')

export function provideProjectEntityRow(controller: ProjectEntityRowController) {
  provide(projectEntityRowKey, controller)
}

export function useProjectEntityRow(): ProjectEntityRowController {
  const controller = inject(projectEntityRowKey)
  if (!controller) {
    throw new Error('ProjectEntitySurface requires an entity row adapter')
  }
  return controller
}
