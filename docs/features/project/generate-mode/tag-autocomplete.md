# Tag Autocomplete

## Feature

Tag autocomplete helps users write prompts for Danbooru-trained anime/illustration models by suggesting canonical Danbooru-style tags while typing.

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
- Embeddings are handled by a separate resource-selection feature, not prompt text autocomplete.
- Wildcards are not needed for the current product direction and are not supported.

Manual tag database update is supported. Automatic scheduled update can be added later.

## Scope

MVP:

- install a bundled seed Danbooru-style tag set;
- manually update the tag set from an app-managed source;
- search by canonical tag and aliases;
- insert canonical tags into positive/negative prompt fields;
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
- embedding token autocomplete;
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
- Rule34, custom CSV import, translation search, chants/styles, embeddings autocomplete, and wildcard expansion are not part of this feature.
