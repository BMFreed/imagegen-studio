# Model Manager

## Feature

Model Manager is the app-level place where the user installs, inspects, repairs, removes and selects reusable generation resources:

- checkpoints / main models;
- LoRAs;
- textual inversion embeddings;
- VAEs;
- ESRGAN/upscale models;
- future post-MVP resources such as ControlNet models.

It is not a CivitAI marketplace browser in MVP. It is a local model library and install manager.

## Reference

Primary reference: InvokeAI Model Manager V2 and backend model management system.

Current visual prototype reference: `docs/prototype-app`. The older standalone HTML file `docs/prototypes/model-manager.html` remains historical reference only for the first Model Manager layout exploration.

Useful InvokeAI areas:

- `invokeai/backend/model_manager/README.md` — model lifecycle split into identification, loading/cache and running;
- `invokeai/app/services/model_install/model_install_common.py` — install job sources, statuses and job metadata;
- `invokeai/frontend/web/src/features/modelManagerV2/subpanels/ModelManager.tsx` — list + selected model panel structure;
- `invokeai/frontend/web/src/features/modelManagerV2/subpanels/ModelManagerPanel/ModelListNavigation.tsx` — search/filter/bulk action pattern;
- `invokeai/frontend/web/src/features/modelManagerV2/subpanels/ModelManagerPanel/ModelListItem.tsx` — compact list rows with thumbnail, badges and missing-file warning;
- `invokeai/frontend/web/src/features/modelManagerV2/subpanels/AddModelPanel/InstallModelForm.tsx` — install from URL/local path pattern;
- `invokeai/frontend/web/src/features/modelManagerV2/subpanels/AddModelPanel/ModelInstallQueue/ModelInstallQueue.tsx` — install queue with pause/resume/cancel/prune actions;
- `invokeai/frontend/web/src/features/modelManagerV2/subpanels/ModelPanel/ModelView.tsx` — model detail panel, metadata, default settings and action buttons.

Secondary reference: Forge extra-network cards for rich LoRA/embedding metadata, previews, trigger words and compact resource cards.

## Existing Project Context

Model Manager must follow the project-wide InvokeAI-first / no-NIH policy.

Already fixed project decisions:

- Electron main process owns model management, filesystem, SQLite, downloads, validation and worker process boundaries.
- Renderer talks to model management only through typed `window.api`.
- SQLite is the source of truth for installed reusable resources.
- Heavy resource files live on disk, not in SQLite and not inside `.igs` by default.
- `.igs` projects store model references and compatibility metadata, not copied model weights.
- MVP installs models from CivitAI URLs only.
- CivitAI API token is required for CivitAI download.
- CivitAI in-app search / marketplace browsing is not MVP.
- SDXL/Illustrious-like `.safetensors` files remain source files; the worker loads them through the Invoke-like Diffusers single-file path and caches loaded components in RAM/VRAM.
- Model metadata includes `baseModelFamily` and `predictionType`.
- `predictionType` is compatibility metadata, not a creative user setting.
- Missing model/LoRA/embedding resources must be diagnosable when applying presets or recalling generation snapshots.

## ImageGen Studio Decision

Build an app-level Model Manager that feels like a compact desktop resource library, not a web marketplace.

Model Manager should borrow InvokeAI's durable mechanics:

- model resource taxonomy;
- identification metadata;
- install queue;
- missing-file status;
- search and filters;
- model detail panel;
- default model settings where useful;
- install/repair/remove actions;
- resource cards used by Generate selectors.

But adapt the product shape:

- CivitAI URL-first import in MVP;
- no marketplace browsing;
- no generic HuggingFace install UI in MVP;
- no local arbitrary file import in MVP unless explicitly promoted from later scope;
- no hidden destructive conversion to Diffusers directories;
- no project-specific model storage;
- no undo/redo for Model Manager actions.

## Entry Points

Model Manager is an app-level modal or dedicated overlay, not a `Project` tab.

Required entry points:

- `Home` toolbar/button: opens Model Manager.
- `Project` top menu/context menu: opens Model Manager.
- Generate `Model` selector: `Manage Models` opens Model Manager focused on checkpoints.
- Generate `LoRAs` selector: `Manage Models` opens Model Manager focused on LoRAs.
- Generate `Embeddings` selector: `Manage Models` opens Model Manager focused on embeddings.
- Missing resource warning from a preset/snapshot: opens Model Manager filtered to the missing resource identity where possible.

Opening Model Manager should not close the current `Project` tab, should not affect project undo/redo and should not mutate active generation settings unless the user explicitly chooses a model/resource from a Generate selector.

## Information Architecture

Use an app-level overlay with a three-column operational layout:

```text
Model Manager
├─ Header
│  ├─ title and short description
│  ├─ CivitAI token status pill
│  ├─ Add from CivitAI URL
│  └─ close
├─ Left Navigation
│  ├─ Library filters: All Models, Checkpoints, LoRA, Embeddings, VAE, Upscalers
│  ├─ Status filters: Installed, Downloading, Needs Attention
│  └─ Storage/download summary with Open Folder
├─ Resource List Panel
│  ├─ search
│  ├─ base model filter
│  ├─ sort
│  ├─ installed / missing / downloading resources
│  └─ compact install strip
├─ Details Panel
│  ├─ preview
│  ├─ identity and metadata
│  ├─ installed versions
│  ├─ local file status
│  └─ actions
└─ Import Dialog
   ├─ CivitAI URL
   ├─ import preview
   └─ install / cancel
```

### Header

The header should include:

- title and short description;
- compact CivitAI token status pill;
- `Add from CivitAI URL` primary action;
- close action.

The header should stay task-focused. It should not contain marketplace discovery, featured models, recommendations or promotional content in MVP.

The CivitAI token status pill is the persistent entry point for token management:

- connected state: `CivitAI connected`;
- missing state: `CivitAI token needed`;
- failed state: `CivitAI connection failed`;
- click opens a compact popover with `Change token`, `Remove token` and `Check connection`;
- if the user clicks `Add from CivitAI URL` without a valid token, the same token setup flow is shown before URL preview.

Do not add a separate always-visible `Storage` button in the header for MVP. The planned storage action is `Open Folder` in the side summary. More advanced storage settings should not be promoted until they become real product scope.

`Add from CivitAI URL` opens a dedicated import dialog/drawer. Import preview must not be shown permanently inside the selected-model details panel, because that makes it look like metadata for the currently selected model.

### Left Navigation

The left navigation owns broad filtering and compact status summaries.

Library filters:

- `All Models`;
- `Checkpoints`;
- `LoRA`;
- `Embeddings`;
- `VAE`;
- `Upscalers`.

Status filters:

- `Installed`;
- `Downloading`;
- `Needs Attention`.

The side summary shows:

- storage used;
- active model downloads;
- `Open Folder`.

The side summary is not a full storage settings page. It is a compact utility area.

### Resource List Toolbar

The resource list toolbar owns day-to-day search and narrowing:

- search input;
- base model family filter;
- sort select;

Do not duplicate Library/Status filters in the header.

### Resource List

Each row should show:

- thumbnail / preview;
- model display name;
- version name when available;
- resource type badge;
- base model family badge;
- status badge;
- file size;
- compatibility warning icon when metadata is missing or suspicious;
- missing-file warning when DB metadata exists but the local file is absent.

The list should support:

- single selection to show details;
- keyboard navigation;
- sorting by name, recently installed and size;
- search by name, version, trigger phrase, CivitAI id and local filename.

### Details Panel

The selected resource detail panel follows the prototype's compact structure.

Visible MVP detail content:

- preview image;
- display name;
- short description;
- status/type/base-model badges;
- `predictionType` badge for main checkpoints when known, such as `v-pred`;
- installed versions;
- selected/default version;
- managed file path;
- file size;
- usage summary, for example presets and project snapshots.

For LoRA and embeddings, the same details area should additionally expose trigger words / activation tokens in a dedicated section or popover.

Do not expose local resource id, file hash, loader internals or full diagnostics in the default details view. Those can exist behind diagnostics / `Show details` later, but are not part of the visible MVP action grid.

Actions:

- copy CivitAI link;
- reveal file in folder;
- remove local resource;

Visible action layout:

- `Copy Link` spans the full action grid width;
- `Show in Folder` and `Remove` appear below as a two-button row.

Contextual actions:

- missing resources can show `Repair` directly in the resource row;
- lower-level actions such as copy hash, re-identify local file, edit metadata and diagnostics should not be visible in the default detail action grid for MVP.

Do not expose low-level loader internals as primary UI. They can appear in diagnostics/dev details only.

### Installed Versions

Several versions of one CivitAI model can be installed side by side.

The version list in Details Panel should use explicit actions:

- the default version shows `Default`;
- inactive installed versions use `Set Default`;
- installing another version uses `Install Version`;
- avoid vague labels such as `Show` when the action changes default selection behavior.

Default version is only a starting point for new model selections. It must not silently change existing projects, presets or generation snapshots.

Project / Generate owns the actual selected version for a project. The model card in Generate must expose a `Version` select for the selected model. By default it uses the latest installed/default version, but an existing project can keep or switch to any installed version explicitly.

Do not implement a visible `Refresh Info` / `Update Metadata` action in MVP. We do not currently have evidence that CivitAI metadata refresh is important enough to promote as a product feature.

## MVP Scope

MVP includes:

- open Model Manager from Home, Project and Generate selectors;
- list installed resources from SQLite;
- install from CivitAI URL;
- require active CivitAI API token before download;
- fetch CivitAI metadata and preview before download;
- show an import preview before starting the install;
- download to a temporary file;
- show download/install progress;
- verify size and hash when available;
- move verified file to managed models directory;
- create SQLite records for model/resource/version/local file;
- store preview/avatar metadata;
- detect duplicate already-installed resources by CivitAI version id and/or file hash;
- show resource details;
- show missing-file status;
- remove local resource with confirmation;
- prevent deletion while resource is currently used by a running job;
- keep snapshots/presets readable after deletion by storing human-readable copied metadata in snapshots;
- expose installed resources to Generate model, LoRA and embeddings selectors;
- show compatibility warnings for active model family mismatch.

## Post-MVP / Later

Post-MVP:

- local file import by path/hash;
- scan folder for models;
- repair/relink missing local files;
- one-click model update by CivitAI identity;
- bulk actions;
- richer model relationships;
- optional non-destructive disk cache for expensive model conversion or cold-load optimization;
- ControlNet resources once ControlNet itself is added after MVP.

Rejected for MVP:

- built-in CivitAI marketplace browser;
- silent auto-update;
- installing arbitrary unknown resources without clear metadata;
- hidden destructive conversion from `.safetensors` to Diffusers directory;
- storing reusable model weights inside `.igs`;
- project-local model libraries.

## Core User Flow

### First Run / Empty Library

1. User opens the app.
2. `Home` shows no installed model state.
3. User clicks `Manage Models`.
4. Model Manager opens with an empty state.
5. Empty state explains that the user needs to add a model from a CivitAI URL.
6. User clicks `Add from CivitAI URL`.
7. If no CivitAI token is configured, app opens token setup before allowing download.
8. User configures token.
9. User pastes a CivitAI model/version URL.
10. App validates URL and fetches metadata.
11. App shows import preview.
12. User confirms.
13. Install job appears in install queue.
14. When completed, model appears in resource list and becomes selectable in Generate.

```mermaid
flowchart TD
  A["Home"] --> B["Open Model Manager"]
  B --> C{"Any installed checkpoints?"}
  C -- "No" --> D["Empty library state"]
  D --> E["Add from CivitAI URL"]
  E --> F{"CivitAI token configured?"}
  F -- "No" --> G["Configure token"]
  G --> H["Paste CivitAI URL"]
  F -- "Yes" --> H
  H --> I["Fetch metadata and preview"]
  I --> J{"Metadata valid?"}
  J -- "No" --> K["Show error"]
  J -- "Yes" --> L["Show import preview"]
  L --> M{"User confirms?"}
  M -- "No" --> D
  M -- "Yes" --> N["Create install job"]
  N --> O["Download and verify"]
  O --> P{"Install completed?"}
  P -- "No" --> Q["Show failed job with retry/cancel"]
  P -- "Yes" --> R["Resource appears in library"]
  R --> S["Available in Generate selectors"]
```

### Import From CivitAI URL

The import flow is preview-first. The app should not start downloading a large model before the user sees what will be installed.

Validation steps:

- parse supported CivitAI URL forms;
- extract model id / model version id where possible;
- require API token;
- fetch model/version metadata;
- select downloadable file;
- detect resource type from metadata and file name where possible;
- detect duplicate local resource;
- show preview with name, author, version, type, base model, file size, preview image and CivitAI URL.

The user can cancel before the install job is created.

```mermaid
sequenceDiagram
  actor User
  participant UI as Renderer UI
  participant API as Typed window.api
  participant Main as Electron Main
  participant CivitAI
  participant DB as SQLite
  participant FS as Filesystem

  User->>UI: Paste CivitAI URL
  UI->>API: models.previewCivitaiImport(url)
  API->>Main: Validate command payload
  Main->>Main: Validate URL and token
  Main->>CivitAI: Fetch model/version metadata
  CivitAI-->>Main: Metadata, files, previews
  Main->>DB: Check duplicates by ids/hash
  Main-->>UI: Import preview DTO
  User->>UI: Confirm install
  UI->>API: models.installFromCivitaiUrl(url, selectedFile)
  API->>Main: Create install job
  Main->>DB: Persist install job
  Main->>FS: Download to temporary file
  Main-->>UI: models.installProgress events
  Main->>Main: Verify size/hash
  Main->>FS: Move to managed models directory
  Main->>DB: Create/update resource records
  Main-->>UI: models.installDone event
```

### Install Queue

Model downloads can be long-running. Treat install jobs as first-class state, not as invisible toasts.

Model downloads belong to Model Manager. The app chrome download activity button opens Model Manager focused on the `Downloading` status / install queue. It does not open a separate Download Manager in MVP.

Generation and upscale jobs use the separate Queue Manager described in `docs/features/queue-manager.md`.

Install job statuses:

```ts
type ModelInstallStatus =
  | 'waiting'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'identifying'
  | 'completed'
  | 'failed'
  | 'canceled'
```

Each install queue row should show:

- thumbnail/name/version if metadata is known;
- target file;
- downloaded bytes / total bytes;
- progress percent;
- current status;
- pause/resume when supported;
- cancel;
- retry failed;
- reveal error details.

The compact install strip should use an explicit `View Queue` button. Avoid a bare `Queue` label, because it does not explain whether it opens the queue, adds something to the queue or changes current item state.

Bulk queue actions:

- pause all active downloads;
- resume all paused downloads;
- cancel all cancelable jobs;
- clear completed/failed/canceled jobs.

MVP can implement only cancel/retry/clear if pause/resume adds too much risk, but the user flow should be designed around a queue, not one-off modal progress.

```mermaid
stateDiagram-v2
  [*] --> waiting
  waiting --> downloading
  downloading --> paused
  paused --> downloading
  downloading --> verifying
  verifying --> identifying
  identifying --> completed
  waiting --> canceled
  downloading --> canceled
  paused --> canceled
  verifying --> failed
  identifying --> failed
  downloading --> failed
  failed --> waiting: retry
  completed --> [*]
  canceled --> [*]
```

### Duplicate Install

When the user imports a resource that appears to be already installed:

- if exact CivitAI model version id and file hash match, show `Already installed`;
- do not download again by default;
- offer `Show in library`;
- offer `Re-download / repair` only if the local file is missing, corrupted or user explicitly chooses reinstall.

If same CivitAI model but different version:

- treat it as a different generation resource;
- show a warning that presets/snapshots require exact version matches;
- allow installing side-by-side.

```mermaid
flowchart TD
  A["Import preview"] --> B{"Exact version/hash installed?"}
  B -- "Yes" --> C["Show Already Installed"]
  C --> D["Show in library"]
  C --> E{"Local file missing/corrupt?"}
  E -- "Yes" --> F["Offer repair/re-download"]
  E -- "No" --> G["No new install"]
  B -- "No" --> H{"Same model, different version?"}
  H -- "Yes" --> I["Show side-by-side version warning"]
  I --> J["Allow install"]
  H -- "No" --> J
```

### Remove Local Resource

Removing a model removes the local reusable resource, but does not rewrite history.

Rules:

- if the resource is used by a running generation/upscale job, deletion is blocked;
- if used by pending jobs, warn and ask whether to cancel affected jobs first;
- if referenced by presets or `.igs` snapshots, deletion is allowed only after confirmation;
- snapshots remain readable because they store copied human-readable metadata;
- after deletion, selectors and presets show missing-resource diagnostics.

```mermaid
flowchart TD
  A["User clicks Remove"] --> B{"Used by running job?"}
  B -- "Yes" --> C["Block removal and explain"]
  B -- "No" --> D{"Used by pending jobs?"}
  D -- "Yes" --> E["Warn and offer cancel affected jobs"]
  D -- "No" --> F{"Referenced by presets/snapshots?"}
  E --> F
  F -- "Yes" --> G["Confirm with missing-resource warning"]
  F -- "No" --> H["Simple confirm"]
  G --> I{"User confirms?"}
  H --> I
  I -- "No" --> J["Keep resource"]
  I -- "Yes" --> K["Remove file and mark resource removed/missing"]
  K --> L["Update selectors and diagnostics"]
```

### Missing Resource Repair

A resource is `missing` when SQLite metadata exists but the local file is absent or fails verification.

Repair options:

- re-download from CivitAI if `civitaiModelVersionId` and file metadata are known;
- later: relink local file by hash;
- later: scan folder.

MVP repair can be limited to CivitAI re-download.

```mermaid
flowchart TD
  A["Open missing resource"] --> B{"Known CivitAI version/file?"}
  B -- "Yes" --> C["Show Repair from CivitAI"]
  C --> D["Create install job targeting same resource identity"]
  D --> E["Download, verify, restore local file"]
  B -- "No" --> F["Show missing metadata diagnostics"]
  F --> G["Relink/scan deferred to post-MVP"]
```

## Integration With Generate

Generate mode must consume Model Manager state, not duplicate it.

Main model selector:

- reads installed checkpoints from Model Manager;
- filters by supported base model family;
- shows missing/incompatible status;
- opens Model Manager through `Manage Models`;
- can focus the selected model in Model Manager.

LoRA selector:

- reads installed LoRAs from Model Manager;
- shows thumbnails directly in dropdown rows;
- shows trigger words and base model family;
- opens detail popover from explicit info button;
- opens Model Manager through `Manage Models`.

Embeddings selector:

- reads installed embeddings from Model Manager;
- shows activation/negative tokens;
- opens detail popover from explicit info button;
- opens Model Manager through `Manage Models`.

Generation snapshots:

- store resource ids and copied human-readable metadata;
- are not mutated when a model is renamed, removed or updated;
- can resolve current local resources by id/hash/CivitAI version;
- show missing resource diagnostics when exact resource is not available.

```mermaid
flowchart LR
  MM["Model Manager / SQLite resources"] --> MS["Generate model selector"]
  MM --> LS["LoRA selector"]
  MM --> ES["Embeddings selector"]
  MS --> GJ["Frozen generation job"]
  LS --> GJ
  ES --> GJ
  GJ --> QS["Queue item"]
  QS --> W["Python worker"]
  W --> R["Generation result"]
  R --> GS["Generation snapshot in .igs"]
  GS --> MR["Future missing-resource diagnostics"]
  MM --> MR
```

## Data Model Expectations

The exact schema can evolve during implementation, but the user flow assumes these logical records:

```text
model_resource
├─ id
├─ type
├─ display_name
├─ description
├─ thumbnail_path / thumbnail_cache_key
├─ base_model_family
├─ format
├─ prediction_type
├─ civitai_model_id
├─ civitai_model_version_id
├─ file_hash
├─ created_at
└─ updated_at

local_model_file
├─ id
├─ resource_id
├─ managed_path
├─ original_filename
├─ size_bytes
├─ hash
├─ status
└─ verified_at

model_install_job
├─ id
├─ download_url
├─ target_resource_id
├─ status
├─ bytes_downloaded
├─ total_bytes
├─ error_code
├─ error_message
├─ preview_payload_json
├─ created_at
└─ updated_at
```

## Error Handling

Use clear, task-level messages. Do not expose raw stack traces by default.

MVP examples:

```text
Не удалось получить данные модели.
CivitAI API token недействителен.
Файл модели недоступен.
Модель уже установлена.
Скачанный файл не прошёл проверку hash.
Файл модели отсутствует на диске.
Нельзя удалить модель, пока она используется активной задачей.
```

Detailed technical errors can be available behind `Show details` for debugging and bug reports.

## Acceptance Criteria

- User can open Model Manager from Home.
- User can open Model Manager from Project/global menu.
- User can open Model Manager from Generate model, LoRA and embeddings selectors.
- User can paste a CivitAI URL and see import preview before downloading.
- Import is blocked until CivitAI token is configured.
- User can start model install and see it in an install queue.
- Download progress is visible and survives Model Manager close/reopen during the app session.
- Completed install creates SQLite resource records and a managed local file.
- Installed checkpoint appears in Generate model selector.
- Installed LoRA appears in LoRA selector with thumbnail metadata when available.
- Installed embedding appears in Embeddings selector with token metadata when available.
- Duplicate exact resource install does not download again by default.
- Missing local file is shown as a missing resource state.
- Remove is blocked for resources used by running jobs.
- Remove confirmation warns when resource is referenced by presets/snapshots.
- Generation snapshots remain readable after a resource is removed.
- Model Manager actions are not part of project undo/redo.
