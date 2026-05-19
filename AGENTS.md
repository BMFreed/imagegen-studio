# AGENTS.md

## CSS and styling rules

- Do not use Tailwind CSS.
- Do not use UnoCSS.
- Do not use utility-first CSS frameworks.
- Do not add Tailwind-like utility class strings manually.
- Do not introduce CSS Modules unless explicitly requested.
- Do not introduce SCSS unless explicitly requested.

## Vue component styles

- Use plain CSS inside Vue Single File Components.
- Put component-specific styles in the same `.vue` file as the component.
- Use `<style scoped>` for component styles.
- Do not create separate CSS files for individual component styles.
- Avoid inline styles.

Preferred structure:

```vue
<template>
  <section class="example-panel">
    <header class="panel-header">
      <h2 class="panel-title">Title</h2>
    </header>
  </section>
</template>

<style scoped>
.example-panel {
  display: grid;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
</style>
```

## Class naming

- Use simple semantic class names local to the component.
- Do not enforce strict BEM.
- Prefer readable names that describe the UI role of the element.
- Avoid generic class names like `.wrapper`, `.inner`, `.box`, `.content`, `.text` unless the context is genuinely obvious.
- State/modifier classes may use the `--modifier` suffix when useful.

Good examples:

```css
.layers-panel {}
.panel-header {}
.panel-title {}
.layer-list {}
.layer-item {}
.layer-item--active {}
.layer-item--hidden {}
```

Avoid:

```css
.wrapper {}
.inner {}
.box {}
.content {}
.text {}
```

## Design tokens

- Use CSS variables for shared design values such as spacing, colors, radii, panel sizes, and z-index values.
- Prefer project-level CSS variables over repeated hard-coded values.
- Component styles may use local CSS variables when they improve readability.

Example:

```css
.layers-panel {
  gap: var(--app-space-2);
  background: var(--app-panel-bg);
  border-right: 1px solid var(--app-border-color);
}
```

## Naive UI styling

- Prefer Naive UI props before custom CSS.
- Prefer Naive UI `themeOverrides` for global customization of Naive UI components.
- Use local wrapper CSS for component-specific layout.
- Use `:deep()` only when there is no suitable Naive UI prop or theme override.
- Do not use `:deep()` as the default styling strategy.

Preferred order:

1. Naive UI props.
2. Naive UI theme overrides.
3. Local scoped CSS on wrapper elements.
4. `:deep()` only as a last resort.

## Layout

- Use regular CSS layout primitives: grid, flexbox, positioning, overflow, and container queries when appropriate.
- Keep layout styles close to the component they belong to.
- Prefer explicit layout class names over utility-style class lists.

## Prohibited patterns

Do not write code like this:

```vue
<div class="flex items-center gap-2 rounded-lg p-4">
```

Do not expose styling through inline objects unless explicitly required:

```vue
<div :style="{ padding: '12px', display: 'grid' }">
```

Do not use CSS Modules by default:

```vue
<div :class="$style.panelHeader">
```

Use this instead:

```vue
<div class="panel-header">
```
