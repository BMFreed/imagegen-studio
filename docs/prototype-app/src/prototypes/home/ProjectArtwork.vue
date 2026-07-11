<script setup lang="ts">
import type { ProjectThumbnailTone } from './home.types'

defineProps<{
  tone: ProjectThumbnailTone
}>()
</script>

<template>
  <div aria-hidden="true" class="project-artwork" :class="`project-artwork--${tone}`" />
</template>

<style scoped>
.project-artwork {
  --art-dark: #071217;
  --art-light: #26885a;
  --art-mid: #025925;
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      circle at 58% 34%,
      color-mix(in srgb, var(--art-light) 45%, transparent),
      transparent 18%
    ),
    radial-gradient(circle at 50% 48%, var(--art-dark) 0 10%, transparent 11%),
    linear-gradient(128deg, transparent 0 44%, var(--art-mid) 44% 62%, transparent 62%),
    linear-gradient(36deg, var(--art-dark) 0 42%, var(--art-light) 42% 69%, #10151d 69%);
}

.project-artwork--blue {
  --art-dark: #0c1320;
  --art-light: #6fbeb0;
  --art-mid: #256fe3;
}

.project-artwork--gray {
  --art-dark: #151b24;
  --art-light: #aab3c0;
  --art-mid: #556170;
  filter: grayscale(0.2);
}

.project-artwork--rose {
  --art-dark: #180f16;
  --art-light: #998359;
  --art-mid: #601a3a;
}

.project-artwork--violet {
  --art-dark: #17111f;
  --art-light: #9a79c8;
  --art-mid: #573987;
}
</style>
