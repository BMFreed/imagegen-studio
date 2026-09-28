<script setup lang="ts">
import { AspectRatio } from '@vicons/tabler'
import { NButton, NCard, NIcon, NTooltip } from 'naive-ui'
import { computed } from 'vue'

import type { ResolutionSize } from '../../../../../src/renderer/components/resolution-control'
import type { ProjectSession } from './project.types'

import ResolutionControl from '../../../../../src/renderer/components/ResolutionControl.vue'
import { commitProjectMutation } from './project-history'

const props = defineProps<{ session: ProjectSession }>()
const size = computed<ResolutionSize>({
  get: () => props.session.document.canvas,
  set: (next) => {
    if (next.width === null || next.height === null) {
      return
    }
    const canvas = { height: next.height, width: next.width }
    commitProjectMutation(props.session, 'Resize Project Canvas', (document) => {
      document.canvas = canvas
      document.generationDraft.payload.size = { ...canvas }
    })
  },
})

function fitToLayers() {
  const hasVisible = props.session.document.layers.some((layer) => layer.visible)
  const next = hasVisible ? { height: 1184, width: 888 } : { height: 1024, width: 1024 }
  size.value = next
  props.session.ui.aspectRatio = { id: 'free', locked: false, value: next.width / next.height }
}
</script>

<template>
  <NCard size="small" title="Canvas Size">
    <template v-slot:header-extra>
      <NTooltip>
        <template v-slot:trigger>
          <NButton
            aria-label="Fit canvas to visible layers"
            circle
            quaternary
            size="tiny"
            @click="fitToLayers"
          >
            <template v-slot:icon><NIcon :component="AspectRatio" :size="16" /></template>
          </NButton>
        </template>
        Fit canvas to visible layers
      </NTooltip>
    </template>
    <ResolutionControl
      v-model="size"
      v-model:aspectRatio="session.ui.aspectRatio"
      heightLabel="Canvas height"
      layout="expanded-preview"
      :max="4096"
      :min="64"
      swapLabel="Swap canvas dimensions"
      widthLabel="Canvas width"
    />
  </NCard>
</template>
