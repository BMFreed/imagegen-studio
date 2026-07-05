# AGENTS.md

## Project stack

- Use Vue Single File Components, TypeScript, Vite, Naive UI and pnpm.
- Do not introduce Tailwind CSS, UnoCSS, SCSS or CSS Modules unless explicitly requested.

## Styling

- Put component-specific styles in the same `.vue` file under `<style scoped>`.
- Use plain CSS and semantic class names local to the component.
- Avoid inline styles except when a library API genuinely requires them.
- Use standard CSS layout primitives: grid, flexbox, positioning, overflow and container queries.

## Naive UI

- Prefer Naive UI components and props before custom CSS.
- Prefer Naive UI `themeOverrides` for global component styling.
- Use local scoped CSS for component layout and composition.
- Use `:deep()` only when Naive props or theme overrides cannot solve the problem cleanly.

## Tokens

- Naive UI theme overrides are the source of truth for Naive component colors.
- Project CSS variables are for app shell, layout values and non-Naive surfaces.
- Do not add random hard-coded colors in components; add or adjust a token/theme override instead.

## Prototypes

- `docs/prototype-app` is the current Vue/Naive prototype playground.
- Model Manager visual source of truth lives in `docs/prototype-app`.
- Older standalone HTML prototypes stay as historical references unless explicitly migrated.

## Design guidance

- For UI/design work, read `.codex/skills/frontend-design-principles/`.
- For ImageGen Studio app screens, use the skill's `app.md` guidance.
- This `AGENTS.md` takes precedence over the skill for implementation constraints.

## Checks

- Run `pnpm run typecheck` after TypeScript/Vue changes.
- Run `pnpm run prototype:test` after prototype UI changes.
