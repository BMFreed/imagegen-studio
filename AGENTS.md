# AGENTS.md

## Project stack

- Use Vue Single File Components, TypeScript, Vite, Naive UI and pnpm.
- Do not introduce Tailwind CSS, UnoCSS, SCSS or CSS Modules unless explicitly requested.

## InvokeAI as the basis for non-UI logic

- Take all non-UI application logic from InvokeAI and adapt it to ImageGen Studio's stack and product contracts. This includes inference, workers, model/resource management, storage, queues and recovery.
- Before designing, implementing or changing non-UI behavior, read the corresponding current InvokeAI implementation and its callers. Use the local source checkout (`../sources/InvokeAI`); record the consulted revision and relevant source paths. Prior summaries or similar-looking algorithms do not replace this source check.
- Reuse and adapt the existing InvokeAI mechanism rather than independently inventing a parallel implementation. Keep UI presentation and interaction aligned with this project's UI guidance and sources of truth.
- If the required mechanism is absent from InvokeAI, cannot be reused, or cannot be adapted to our stack/contracts, tell the user what could not be taken and why before introducing a custom alternative. Never silently substitute an independent implementation for an InvokeAI-based one.

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

- For UI audits, visual checks, or requests to inspect and fix a broken screen/element, use [ui-audit](.codex/skills/ui-audit/SKILL.md). A user does not need to provide a CSS diagnosis. Audit-only requests end with findings; change UI only when the user's request authorizes fixes.
- Use its [visual checklist](.codex/skills/ui-audit/references/visual-checklist.md) to judge the named area in context. Inspect actual screenshots and relevant interaction states; passing code checks alone does not verify appearance.
- For new UI/design work, read `.codex/skills/frontend-design-principles/`; for ImageGen Studio app screens, use its `app.md` guidance. Existing-interface audits and local fixes preserve the approved design and do not start the skill's new design-direction/palette approval workflow.
- This `AGENTS.md` takes precedence over the skill for implementation constraints.

## Checks

- Run `pnpm run typecheck` after TypeScript/Vue changes.
- Run `pnpm run prototype:test` after prototype UI changes.

## Local test artifacts

- Before creating or reusing data under `~/.codex/artifacts/imagegen-studio/`, read [Artifact lifecycle](docs/engineering/artifact-lifecycle.md). Inventory disk usage before heavy runs and clean up at run completion and task handoff.
- Separate compact evidence from bulky disposable payloads. Prefer one verified compatible reusable ML runtime/catalog; additional copies need a concrete test reason and a disposal checkpoint.
- Clean only confirmed idle, agent-generated data within this artifact root during authorized implementation/test work. Audit-only tasks remain read-only. Routine cleanup within this boundary does not need repeated approval.
- Preserve active processes, cross-run dependencies, current reusable environments and mutation rollback data. Confirm physical process exit and restoration before deleting; directory age and a finished parent process are insufficient.
- The initial soft budgets are 30 GiB for the artifact root and 1 GiB for compact evidence. They trigger inspection/pruning, never deletion of protected data; record necessary exceptions and when they can be released.
- Never sweep the root blindly, follow symlinks into external data, or delete ordinary app data, original model/image files outside the root or global package caches. Record actual reclaimed space and retained dependencies.

## Product contracts and engineering workflow

- Before behavior/scope changes, read the relevant entry in `docs/product-promises.md` and its supporting contract. Preserve negative scope and record prototype gaps separately from production intent.
- For medium/high-risk changes, read and follow `docs/engineering/research-protocol.md` before editing implementation. Classify risk by consequences; low-impact copy/style changes use a short local check.
- For reviews and implementation verification, use `docs/engineering/review-protocol.md` at the appropriate risk tier. Promise-impacting and high-risk changes require the full behavior/evidence pass.
- Treat `.igs` persistence/recovery, resource lifecycle, worker/queue persistence, immutable provenance and destructive filesystem/IPC behavior as high risk when those boundaries change.
- Research and implementation are phases within an authorized change; do not insert an automatic approval gate between them. Analysis-only requests remain read-only. Explicit user scope and tool permissions govern mutations, delegation, commits and publication.
- Report actual evidence and boundaries: prototype mocks do not prove production persistence, and a test file does not prove a successful run. Update promise status and its matrix row together when evidence changes readiness.
- Integration notes and pending process pilots live in `docs/engineering/README.md`; no work project stand or imported MR-review skill is required.
