<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="imageGenNaiveTheme">
    <NDialogProvider>
      <NMessageProvider>
        <div class="app-shell">
          <AppChrome />
          <DocumentTabs />
          <main class="prototype-stage">
            <section class="home-context" aria-hidden="true">
              <div class="workspace-sidebar">
                <span class="sidebar-title">Workspaces</span>
                <span class="sidebar-item sidebar-item--active">Uncategorized</span>
                <span class="sidebar-item">Sample Project B</span>
                <span class="sidebar-item">Sample Project A</span>
              </div>
              <div class="workspace-grid">
                <div class="workspace-card" />
                <div class="workspace-card workspace-card--wide" />
                <div class="workspace-card" />
              </div>
            </section>
            <ModelManagerPrototype />
          </main>
        </div>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { darkTheme, NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
import AppChrome from './components/AppChrome.vue';
import DocumentTabs from './components/DocumentTabs.vue';
import ModelManagerPrototype from './prototypes/model-manager/ModelManagerPrototype.vue';
import { imageGenNaiveTheme } from './theme/naive-theme';
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: 40px 40px minmax(0, 1fr);
  width: 100vw;
  height: 100vh;
  background: var(--app-chrome);
}

.prototype-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--app-chrome);
}

.home-context {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  filter: blur(2px);
  opacity: 0.55;
}

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border-right: 1px solid var(--app-border);
  background: var(--app-chrome);
}

.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-item {
  padding: 9px 10px;
  border-radius: var(--app-radius);
}

.sidebar-item--active {
  background: #232327;
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 260px));
  align-content: start;
  gap: 18px;
  padding: 64px 72px;
}

.workspace-card {
  height: 210px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: #18181c;
}

.workspace-card--wide {
  height: 260px;
}
</style>
