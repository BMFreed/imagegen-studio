# AGENTS.md

## Project stack

- Use Vue Single File Components, TypeScript, Vite, Naive UI and pnpm.
- Do not introduce Tailwind CSS, UnoCSS, SCSS or CSS Modules unless explicitly requested.

## Styling

- Put component-specific styles in the same `.vue` file under `<style scoped>`.
- Use plain CSS and semantic class names local to the component.
- Avoid inline styles except when a library API genuinely requires them.
- Use standard CSS layout primitives: grid, flexbox, positioning, overflow and container queries.

## Vue patterns

- Use `defineModel` for component `v-model` bindings.
- Do not hand-write `prop` plus `update:*` emit pairs for ordinary model bindings.
- Use explicit `defineProps` / `defineEmits` for non-model props/events or when custom model behavior genuinely needs it.

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
- Home, Project, Model Manager and preset-system visual sources of truth live in `docs/prototype-app`.
- Do not recreate standalone HTML prototypes; use Vue components, mock scenarios and Playwright coverage in `docs/prototype-app`.
- For repeated icon actions, layer rows, resource pickers and labeled controls, read `docs/engineering/ui-component-contracts.md` and the referenced component API before composing or styling them.

## Design guidance

- For UI/design work, read `.codex/skills/frontend-design-principles/`.
- For ImageGen Studio app screens, use the skill's `app.md` guidance.
- This `AGENTS.md` takes precedence over the skill for implementation constraints.

## Checks

- Run `pnpm run typecheck` after TypeScript/Vue changes.
- Run `pnpm run prototype:test` after prototype UI changes.

## Product contracts and engineering workflow

- Before behavior/scope changes, read the relevant entry in `docs/product-promises.md` and its supporting contract. Preserve negative scope and record prototype gaps separately from production intent.
- For medium/high-risk changes, read and follow `docs/engineering/research-protocol.md` before editing implementation. Classify risk by consequences; low-impact copy/style changes use a short local check.
- For reviews and implementation verification, use `docs/engineering/review-protocol.md` at the appropriate risk tier. Promise-impacting and high-risk changes require the full behavior/evidence pass.
- Treat `.igs` persistence/recovery, resource lifecycle, worker/queue persistence, immutable provenance and destructive filesystem/IPC behavior as high risk when those boundaries change.
- Research and implementation are phases within an authorized change; do not insert an automatic approval gate between them. Analysis-only requests remain read-only. Explicit user scope and tool permissions govern mutations, delegation, commits and publication.
- Report actual evidence and boundaries: prototype mocks do not prove production persistence, and a test file does not prove a successful run. Update promise status and its matrix row together when evidence changes readiness.
- Integration notes and pending process pilots live in `docs/engineering/README.md`; no work project stand or imported MR-review skill is required.
