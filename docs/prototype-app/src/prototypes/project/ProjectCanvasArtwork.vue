<script setup lang="ts">
import type { ProjectArtworkTone } from './project.types'

withDefaults(defineProps<{ tone?: ProjectArtworkTone }>(), { tone: 'emerald' })
</script>

<template>
  <div aria-hidden="true" class="canvas-art" :class="`canvas-art--${tone}`">
    <span class="portrait-face" />
    <span class="portrait-body" />
  </div>
</template>

<style scoped>
.canvas-art {
  --art-glow: #53c77a;
  --art-mid: #184d3b;
  --art-deep: #081216;
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 62% 26%,
      color-mix(in srgb, var(--art-glow) 28%, transparent),
      transparent 28%
    ),
    linear-gradient(135deg, var(--art-deep), var(--art-mid) 55%, #070a0f);
}
.canvas-art::before {
  position: absolute;
  inset: 0;
  content: '';
  background:
    linear-gradient(
      104deg,
      transparent 0 38%,
      color-mix(in srgb, var(--art-glow) 32%, transparent) 39% 42%,
      transparent 43%
    ),
    radial-gradient(ellipse at 50% 72%, #09080d 0 34%, transparent 35%);
}
.portrait-face {
  position: absolute;
  top: 17%;
  left: 41%;
  width: 19%;
  height: 23%;
  border-radius: 48% 52% 45% 48%;
  background: linear-gradient(120deg, #e4c5b5, #72524d 70%);
  box-shadow: 0 0 32px color-mix(in srgb, var(--art-glow) 24%, transparent);
}
.portrait-body {
  position: absolute;
  top: 37%;
  left: 28%;
  width: 48%;
  height: 55%;
  clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%);
  background: linear-gradient(
    100deg,
    #11101a,
    color-mix(in srgb, var(--art-mid) 70%, black),
    #09080d
  );
}
.canvas-art--blue {
  --art-glow: #74a8ff;
  --art-mid: #213e73;
  --art-deep: #080d18;
}
.canvas-art--rose {
  --art-glow: #b96a83;
  --art-mid: #5c1e36;
  --art-deep: #180b12;
}
.canvas-art--violet {
  --art-glow: #b58cff;
  --art-mid: #4f3470;
  --art-deep: #110b19;
}
</style>
