import { type IDragEvent, makeAutoScroll, makeDroppable, useDnDProvider } from '@vue-dnd-kit/core'
import { type Ref, toRef } from 'vue'

import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import { commitProjectMutation } from './project-history'

export function useProjectLayerDnd(
  session: ProjectSession,
  listRef: Ref<HTMLElement | null>,
  scrollContainer: Ref<HTMLElement | null>,
) {
  const provider = useDnDProvider()
  provider.keyboard.keys.forDrag = []
  provider.keyboard.keys.forDrop = []
  makeAutoScroll(scrollContainer, { speed: 8, threshold: 54 })
  return makeDroppable(
    listRef,
    {
      events: {
        onDrop(event: IDragEvent) {
          const result = event.helpers.suggestSort('vertical')
          if (!result) {
            return false
          }
          const target = result.targetItems as ProjectCompositingLayer[]
          if (
            session.document.layers.map((layer) => layer.id).join('|') ===
            target.map((layer) => layer.id).join('|')
          ) {
            return true
          }
          commitProjectMutation(session, 'Reorder layers', (document) => {
            document.layers = [...target]
          })
          return true
        },
      },
      groups: ['project-layers'],
    },
    () => session.document.layers,
  )
}

export function scrollContainerRef<T extends { scrollContainer: HTMLElement | null }>(props: T) {
  return toRef(props, 'scrollContainer')
}
