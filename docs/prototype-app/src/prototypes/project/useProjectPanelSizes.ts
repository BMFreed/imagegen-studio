import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

import type { ProjectSession } from './project.types'

const COLLAPSED_WIDTH = 44
const LEFT_MIN = 290
const LEFT_MAX = 540
const RIGHT_MIN = 300
const RIGHT_MAX = 540

export function useProjectPanelSizes(session: ProjectSession) {
  const outerHost = ref<HTMLElement | null>(null)
  const innerHost = ref<HTMLElement | null>(null)
  const outerWidth = ref(1200)
  const innerWidth = ref(880)
  let observer: ResizeObserver | undefined

  const leftPixels = computed(() =>
    session.ui.leftCollapsed ? COLLAPSED_WIDTH : clamp(session.ui.leftWidth, LEFT_MIN, LEFT_MAX),
  )
  const rightPixels = computed(() =>
    session.ui.rightCollapsed
      ? COLLAPSED_WIDTH
      : clamp(session.ui.rightWidth, RIGHT_MIN, RIGHT_MAX),
  )
  const leftSize = computed({
    get: () => clamp(leftPixels.value / outerWidth.value, 0.01, 0.95),
    set: (ratio: number) => {
      if (!session.ui.leftCollapsed) {
        session.ui.leftWidth = clamp(Math.round(ratio * outerWidth.value), LEFT_MIN, LEFT_MAX)
      }
    },
  })
  const centerSize = computed({
    get: () => clamp(1 - rightPixels.value / innerWidth.value, 0.05, 0.99),
    set: (ratio: number) => {
      if (!session.ui.rightCollapsed) {
        session.ui.rightWidth = clamp(
          Math.round((1 - ratio) * innerWidth.value),
          RIGHT_MIN,
          RIGHT_MAX,
        )
      }
    },
  })
  const leftMin = computed(() =>
    session.ui.leftCollapsed ? leftSize.value : LEFT_MIN / outerWidth.value,
  )
  const leftMax = computed(() =>
    session.ui.leftCollapsed ? leftSize.value : LEFT_MAX / outerWidth.value,
  )
  const centerMin = computed(() =>
    session.ui.rightCollapsed ? centerSize.value : 1 - RIGHT_MAX / innerWidth.value,
  )
  const centerMax = computed(() =>
    session.ui.rightCollapsed ? centerSize.value : 1 - RIGHT_MIN / innerWidth.value,
  )

  function observe(element: Ref<HTMLElement | null>, target: Ref<number>) {
    if (element.value) {
      target.value = Math.max(1, element.value.clientWidth)
      observer?.observe(element.value)
    }
  }

  onMounted(() => {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === outerHost.value) {
          outerWidth.value = Math.max(1, entry.contentRect.width)
        }
        if (entry.target === innerHost.value) {
          innerWidth.value = Math.max(1, entry.contentRect.width)
        }
      }
    })
    observe(outerHost, outerWidth)
    observe(innerHost, innerWidth)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return { centerMax, centerMin, centerSize, innerHost, leftMax, leftMin, leftSize, outerHost }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
