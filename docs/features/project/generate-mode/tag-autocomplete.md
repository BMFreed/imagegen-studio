# Tag Autocomplete

## Feature

Unified prompt autocomplete helps users write prompts by combining canonical Danbooru-style tags with local resource-aware suggestions.

The feature is aimed at SDXL/Illustrious-like models where Danbooru tags are a meaningful part of the model's training vocabulary.

## Reference

Reference implementation: `a1111-sd-webui-tagcomplete`.

Useful ideas to adapt:

- tag index rows in the shape `tag,type,count,aliases`;
- search by canonical tag and aliases;
- sort by global post count plus local user usage;
- color/category metadata for tag types;
- manual refresh/update affordance;
- lightweight autocomplete popup with keyboard navigation.

The A1111/Gradio DOM implementation is not copied. ImageGen Studio should implement the feature as native Vue/Electron UI with typed storage and application services.

## ImageGen Studio Decision

Build an ImageGen Studio-native autocomplete system backed by a local SQLite tag index.

MVP source policy:

- Danbooru-style tag source only.
- Rule34 is not supported in MVP.
- e621 is not supported in MVP unless a later furry-model feature needs it.
- Custom extra CSV import is not supported in MVP.
- Translation search is not supported in MVP.
- Chants/styles are not supported.
- Installed textual-inversion embeddings are offered as resource-bearing prompt tokens.
- Trigger phrases from enabled selected LoRAs are offered as contextual prompt tokens.
- Wildcards are not needed for the current product direction and are not supported.

Manual tag database update is supported. Automatic scheduled update can be added later.

## Scope

MVP:

- install a bundled seed Danbooru-style tag set;
- manually update the tag set from an app-managed source;
- search by canonical tag and aliases;
- insert canonical tags into positive/negative prompt fields;
- insert installed embeddings into the specific positive/negative prompt being edited;
- include trigger phrases only from enabled, non-missing LoRAs in the active generation draft;
- show category/type and post count in suggestions;
- track local tag usage and use it as a sorting signal;
- show last update status and update errors in settings.

Post-MVP:

- scheduled auto-update;
- multiple tag sources;
- e621 source;
- translations;
- custom tag packs;
- richer visual tag explorer.

Rejected for this feature:

- Rule34 source;
- custom extra CSV import;
- wildcard expansion;
- chants/styles.

## Tag Index Format

A tag index row has this logical shape:

```text
tag,type,count,aliases
```

Example:

```csv
1girl,0,6008644,"1girls,sole_female"
```

Fields:

- `tag` — canonical tag inserted into the prompt.
- `type` — source category/type, such as general, character, copyright, artist, or meta.
- `count` — global source frequency used as a ranking signal.
- `aliases` — alternative names, spellings, abbreviations, or common mistakes that search should match.

Autocomplete always inserts `tag`, not the matched alias.

## Storage

Suggested tables:

```text
tag_sources
tag_sets
tags
tag_aliases
tag_usage
```

`tag_sources` describes where a tag set can be obtained from. For MVP this is the app-managed Danbooru source.

`tag_sets` describes an installed version of a source vocabulary:

- `id`
- `source_id`
- `name`
- `version`
- `fetched_at`
- `row_count`
- `status`

`tags` stores canonical tags:

- `id`
- `tag_set_id`
- `name`
- `normalized_name`
- `category`
- `post_count`

`tag_aliases` stores searchable aliases for canonical tags:

- `id`
- `tag_id`
- `alias`
- `normalized_alias`

`tag_usage` stores local user usage:

- `tag_id`
- `positive_use_count`
- `negative_use_count`
- `last_used_at`

`normalized_name` and `normalized_alias` are precomputed search keys. They should use the same normalization rules so matching is consistent.

## Search Behavior

Search matches:

- canonical tag names;
- aliases.

Search does not match translations in MVP.

Ranking uses:

- exact/prefix match before loose contains match;
- global `post_count`;
- local `tag_usage`;
- active prompt polarity, so positive and negative usage can diverge.

Clicking the prompt editor's `+` opens a compact input and immediately exposes a local browse view containing `Active LoRA triggers` and `Embeddings`. Double-click editing opens the same dropdown rather than a reduced plain-input mode. This makes the finite contextual resources discoverable without a separate selector or onboarding tooltip. A disabled instruction row at the top explains that Danbooru search begins after two normalized characters; after that threshold the same dropdown filters all sources and adds the `Danbooru tags` group.

When focus is already inside the prompt token editor, `Ctrl/Cmd+Space` opens the same add/autocomplete flow. It is a keyboard accelerator, not the only discoverability mechanism.

The Vue prototype treats spaces and underscores as equivalent, returns at most five items per group and twelve overall, and orders groups as `Active LoRA triggers`, `Embeddings`, then `Danbooru tags`. The menu has a usable width independent of the deliberately tiny inline input. LoRA triggers are available in both prompt polarities. Negative embedding metadata affects ranking and the inserted token, but the user still chooses the destination prompt.

Autocomplete never inserts LoRA trigger phrases automatically when a LoRA is selected. Temporarily disabling a LoRA removes its phrases from new autocomplete results but leaves existing linked tokens untouched and shows no interruption. Only removing a LoRA that would orphan linked trigger tokens asks the user to keep them as ordinary prompt text, remove them, or cancel the removal.

## Manual Update

Manual update means "download and install the newest app-supported tag database now".

It is not the same as the A1111 temp-file refresh workaround. ImageGen Studio owns its storage and should not need a UI restart or temp-file rebuild for normal operation.

Manual update is still useful because:

- users can update without waiting for an app release;
- failed downloads can be retried explicitly;
- automatic updates can remain disabled;
- settings can show `lastUpdatedAt`, source, row count, and error state.

## Dependencies

- SQLite storage.
- Electron main process update service.
- Renderer prompt editor.
- App settings screen.
- Model compatibility metadata, so autocomplete can be enabled for Danbooru-trained model families and disabled or de-emphasized for model families that do not benefit from it.

## Acceptance Criteria

- A user typing in a prompt field sees Danbooru-style suggestions.
- Suggestions include canonical tag, category/type, and post count.
- Searching by alias returns the canonical tag.
- Selecting a suggestion inserts the canonical tag.
- Positive and negative prompts track usage separately.
- A user can manually update the installed tag database.
- The UI shows the installed tag set status, row count, and last update time.
- Rule34, custom CSV import, translation search, chants/styles, wildcard expansion and production network-backed suggestions are not part of the Vue prototype.
