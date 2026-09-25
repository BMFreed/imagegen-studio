<script setup lang="ts">
import { FolderOff as EmptyIcon } from '@vicons/tabler'
import { NEmpty, NIcon } from 'naive-ui'
</script>

<template>
  <section aria-label="Home" class="home-view">
    <aside aria-label="Workspace navigation" class="workspace-sidebar">
      <h2>Workspaces</h2>
      <div aria-current="page" class="sidebar-item sidebar-item--selected">Projects</div>
    </aside>
    <div class="project-browser">
      <header class="browser-heading">
        <h1>Projects</h1>
      </header>
      <NEmpty class="project-placeholder" description="Project browsing is not available yet">
        <template v-slot:icon><NIcon :component="EmptyIcon" /></template>
      </NEmpty>
    </div>
  </section>
</template>

<style scoped>
.home-view {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  background: var(--app-surface);
}

.workspace-sidebar {
  padding: 21px 12px;
  border-right: 1px solid var(--app-border);
}

.workspace-sidebar h2 {
  margin: 0 8px 15px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-item {
  padding: 8px 11px;
  border-radius: var(--app-radius);
}

.sidebar-item--selected {
  background: var(--app-elevated-hover);
}

.project-browser {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.browser-heading {
  display: flex;
  align-items: center;
  min-height: 53px;
  padding: 0 24px;
  border-bottom: 1px solid var(--app-border);
}

.browser-heading h1 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.project-placeholder {
  margin: auto;
  padding: 24px;
}
</style>
