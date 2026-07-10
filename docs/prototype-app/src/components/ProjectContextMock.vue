<template>
  <section aria-hidden="true" class="project-context">
    <aside class="settings-panel">
      <div class="mode-switch" />
      <div
        v-for="height of [72, 126, 94, 152, 112]"
        :key="height"
        class="context-card"
        :style="{ height: `${height}px` }"
      />
    </aside>
    <main class="canvas-context">
      <div class="viewport-toolbar" />
      <div class="canvas-frame">
        <div class="canvas-art" />
      </div>
    </main>
    <aside class="layers-panel">
      <div class="layers-heading" />
      <div v-for="index of 4" :key="index" class="layer-row" />
    </aside>
  </section>
</template>

<style scoped>
.project-context {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr) 330px;
  min-height: 0;
}

.settings-panel,
.layers-panel {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 16px;
  border-right: 1px solid var(--app-border);
}

.layers-panel {
  border-right: 0;
  border-left: 1px solid var(--app-border);
}

.mode-switch,
.context-card,
.viewport-toolbar,
.layers-heading,
.layer-row {
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.mode-switch {
  height: 34px;
}

.canvas-context {
  display: grid;
  grid-template-rows: 30px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  padding: 8px;
}

.viewport-toolbar {
  width: 280px;
  height: 26px;
  justify-self: center;
}

.canvas-frame {
  place-self: center;
  width: min(52%, 560px);
  aspect-ratio: 3 / 4;
  padding: 1px;
  background: var(--workspace-green);
}

.canvas-art {
  width: 100%;
  height: 100%;
  background:
    linear-gradient(150deg, transparent 48%, var(--app-elevated) 49% 60%, transparent 61%),
    var(--app-chrome);
}

.layers-heading {
  height: 36px;
}

.layer-row {
  height: 58px;
}
</style>
