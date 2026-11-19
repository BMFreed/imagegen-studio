# Live NoobAI-compatible component installs in AppImage

This checkpoint extends [managed NoobAI checkpoint installation](./phase-5-packaged-noobai-versions-research.md)
through the [Model Manager](../features/model-manager.md). It selects two
published Illustrious-family files already used with exact NoobAI
checkpoints in the [installed inference matrix](./phase-2c-noobai-component-inference-research.md).

| File | Model / version / file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| DigitalArt LoRA, obuyb404 | 1121001 / 1260279 / 1165414 | 114,437,420 | c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9 |
| IllustriousPhoto embedding, CautionMergeAhead | 2360940 / 2655289 / 2542976 | 49,736 | 91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36 |

The live version API returned both exact file IDs and SHA-256 values.
The source labels both files Illustrious and reports their published
types separately. [DigitalArt metadata](https://civitai.com/api/v1/model-versions/1260279)
· [IllustriousPhoto metadata](https://civitai.com/api/v1/model-versions/2655289)

## Source basis and scope

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/routers/model_manager.py::install_model` calls
`invokeai/app/services/model_install/model_install_default.py::heuristic_import`,
`_import_from_url` and `_enqueue_remote_download`. The download owner
in `invokeai/app/services/download/download_default.py::_do_download`
authenticates the source and streams the selected file. The LoRA loader
in `invokeai/app/invocations/model.py` checks the exact model identifier.
`invokeai/backend/model_manager/load/model_loaders/textual_inversion.py`
loads the embedding from the selected record path. This checkpoint
exercises Studio's current installer and exact registry. Production
changes are outside its scope.

The stock AppImage SHA-256 is
`15d10d8c73305769cbe9ee68b89b8265b56ab427b811acc745d41a4f0f6fce35`.
All 42 packaged production members match the current desktop build.
Each install uses a separate fresh catalog with normal Preview and
explicit confirmation. Live authentication is restricted to the
isolated install lifetime. The completed file and job are checked again
after credential removal and normal restart.

## Results

Both cases passed on Linux. DigitalArt reached Completed in 20.560 seconds
from the observed install start. IllustriousPhoto reached Completed in
2.135 seconds. The install and credential-free reopen each ended at a
normal physical exit, for four exits in total. Catalog and SQLite checks
confirmed the exact CivitAI model, version and file IDs, authors,
filenames, source family and trained words. Each fresh catalog contained
one resource, one version, one ready file, one completed job and one
ready artifact. LoRA and embedding both used the neutral prediction
metadata. The embedding filename persisted as
`illustriousphoto.safetensors`. The fixture derives `<illustriousphoto>`
from that filename.

An independent read-only review hashed both actual model bodies,
verified the SQLite integrity and foreign keys, and checked the four
physical close receipts. A separate scan of twenty retained log,
report and database files found zero credential or signed query
matches. Seven focused suites passed 160 tests with zero failures
and zero skips. Scoped lint, formatting and syntax checks passed.

The current observations cover Preview, Install, the persisted catalog
and restart. Prompt token use and CUDA inference are covered separately
by the installed inference work. The combined final-release setup,
upgrade and generation matrix remains open.
All eight [product promises](../product-promises.md) retain their
current status.

## Retention

The compact evidence roots are
`runs/packaged-noobai-install/20261119-r9` and
`runs/packaged-noobai-install/20261119-r10` under the local artifact root.
Each retains its report, progress log, two physical exit receipts,
screenshots, source pins and a SHA-256-checked snapshot of its closed
catalog. The SQLite WAL was empty in both profiles. The profiles and short
scratch directories were released once their processes and readers had
exited. The disposed paths accounted for 136,454,144 allocated bytes.
The stock AppImage used for these runs remains in its existing location.

## Published standalone VAE

The CivitAI release `1219546 / 1594319` is `sdxl-vae-anime-test`
`beta-120000` from Euge_. Laxhar's NoobAI release credits the author
and links to the same account. The CivitAI API reports resource type
`VAE` and raw base label `NoobAI`. It offers two SafeTensor files
with 334,640,988 bytes and SHA-256
`fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6`.
[NoobAI credits](https://huggingface.co/Laxhar/noobai-XL-1.0#participants-and-contributors),
[CivitAI model](https://civitai.com/api/v1/models/1219546),
[published version and file IDs](https://civitai.com/api/v1/model-versions/1594319).

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`
on the URL installation path described above.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts`
selects the compatible VAE before construction of the graph,
`invokeai/app/invocations/model.py::VAELoaderInvocation` resolves the
selected registered key, and
`invokeai/backend/model_manager/load/model_loaders/vae.py` loads the
single-file AutoencoderKL. Studio's current installer and exact VAE
preparation already cover these boundaries.

The same stock AppImage passed two live runs in separate fresh profiles.
The primary `1494307` completed in 17.610 seconds from the observed install
start. The second run confirmed `1494323` after explicitly changing the
default selection in Preview and completed in 22.601 seconds. Each run
preserved its own exact file ID, filename, SHA-256 and byte count, and
the catalog retained raw `NoobAI` metadata under the Illustrious family.
Both runs reopened after credential removal and had two normal physical
exits. The equal hash verifies the bytes. Preview, the completed job
and durable catalog establish the selected file ID and name.

A separate process used the actual installed `1494323` bytes and a copy
of its closed catalog to call
`ModelService.resolveVerifiedGenerationVaeForPlan`. It passed the
production Safetensors structure check. Substituting the primary file ID
in that exact reference, while keeping the same hash and local binding,
returned `MODEL_VERSION_MISMATCH`. The original reference still passed.
This check covers Main preparation. The CUDA follow-up is below.
Eight focused suites passed 191 tests
with zero failures and zero skips. The first wrapper launch reached no
tests because the user service lacked the Node path. The bounded rerun
included the checkout's Node path and completed.

The two evidence roots are `runs/packaged-noobai-install/20261119-r11`
and `runs/packaged-noobai-install/20261119-r12` under the local artifact
root. An independent audit rehashed both bodies and verified the exact
SQLite rows and four normal physical exits. The closed database snapshots
and compact reports were retained. The temporary primary copy and
scratch data accounted for 355,311,616 allocated bytes. One managed copy of
`1494323` and its catalog are retained for CUDA qualification. The
production app archive is unchanged.

## CUDA generation with the installed VAE

The `noobai-eps-vae` qualification uses the same stock AppImage and the
private signed installed runtime from the
[packaged trained checkpoint](./phase-5-packaged-trained-generation-research.md).
It uses the exact NoobAI EPS checkpoint
`833294 / 1022833 / 928571` and the managed Euge_ VAE
`1219546 / 1594319 / 1494323`. The fresh test database imports the five
original model, file and install-job rows from the closed catalog in
one transaction. This preserves the VAE's actual local IDs and
successful install record. The borrowed EPS uses the existing
ModelRepository publication path.

Fresh InvokeAI source check at `4875d96531ca6712b288f6e660fcbb34143408c1`
covered `invokeai/frontend/webv2/src/features/generation/core/graph.ts`
from `getCompatibleVae` to `addDecodeOutput`,
`invokeai/app/invocations/model.py::VAELoaderInvocation`,
`invokeai/app/invocations/vae/latents_to_image.py::LatentsToImageInvocation`,
and `invokeai/backend/model_manager/load/model_loaders/vae.py`. The graph
resolves the selected registered VAE before decode. For the independent
model-record boundary, `invokeai/app/services/model_install/model_install_default.py::_register`
publishes through `invokeai/app/services/model_records/model_records_sql.py::add_model`.
Studio's existing production owners carry the equivalent exact
selection into the frozen worker request and decode.

The 256×256 TXT case uses seed 0, Euler/Normal, three steps, CFG 4
and VAE precision Auto. Its control is the retained Embedded
NoobAI EPS run with the same stock AppImage and signed runtime.
The test uses the public VAE picker and Generate, resets the draft VAE
after admission, then checks the exact frozen VAE in the completed
candidate, explicit Add, Save and Project reopen.

The final run completed one real admission and one completion, followed by
two normal physical AppImage exits. The CUDA observer matched 38 samples to
the actual job's Python PID, start ticks and cgroup. The highest matched
reading was 7,434 MiB. Native host memory peaked at 7,658,917,888 bytes
and recorded zero cgroup OOM events. Both owned scopes had swap disabled.
The wrapper elapsed time was 246.538 seconds on this host with concurrent
desktop GPU activity.

The Embedded control and final case have byte-equal input PNGs and equal
worker request fields other than the VAE descriptor. An independent decoded
PNG comparison found 65,499 of 65,536 pixels changed. This is a fixed-input
decode comparison. The exact portable reference, without a managed path,
remains in the accepted layer. The draft and reopened draft stay Embedded.
The original live install job and file bytes survive. The guarded harness
restored all 112 original installed-slot entries and reverified the signed
worker inputs and stock AppImage.

Three earlier attempts stopped before admission. R1 refused the permission
bits on files inside the retained private run directory. R2 showed that a full
catalog clone carries the original absolute Workspace path. R3 reached the
project and timed out while reopening the checkpoint version picker.
The final fixture validates the source in its owner directory, imports the
five model and installation rows into a fresh database, and waits for the
real single-version Default to resolve before selecting the VAE. All three
earlier attempts restored the original slot. Six focused suites passed
98 tests with zero failures and zero skips. Scoped lint and syntax checks
passed.

The final evidence is under
`runs/packaged-installed-engine/20261118/trained-noobai-eps-vae-r4`.
An independent readback checked all five original source rows in each
closed SQLite, both byte-identical Projects, the accepted Raster and
both normal exits. The four attempts' disposable profiles and scratch
accounted for 44,216,320 allocated bytes. One managed VAE copy was
retained for the combined case below.
The combined LoRA, embedding and VAE follow-up is below.
Other inference modes and visual acceptance remain in the
[MVP backlog](./mvp-acceptance-backlog.md).

## Packaged NoobAI generation with all three managed components

The `noobai-eps-stack` fixture uses NoobAI EPS `833294 / 1022833 / 928571`,
DigitalArt LoRA `1121001 / 1260279 / 1165414` at weight −0.5,
IllustriousPhoto `2360940 / 2655289 / 2542976` in the negative prompt
and Euge_'s VAE `1219546 / 1594319 / 1494323` at Auto precision.
Only the exact original files are admitted. The LoRA and embedding
are fresh stock AppImage installs into separate profiles. Together
with the retained VAE install, their three closed catalogs contribute
15 original records in one transaction. Only model and install tables
are imported. The managed file rows, local IDs and completed install
jobs keep their actual source values. The EPS checkpoint is a borrowed
verified precondition.

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts`
routes the SDXL LoRA collection to UNet and both CLIP owners and the
chosen VAE into decode. `invokeai/app/invocations/model.py` resolves
registered LoRA and VAE keys.
`invokeai/app/invocations/text_encoder/compel.py` applies LoRA and
textual inversion in the same conditioning pass.
`invokeai/app/util/ti_utils.py` and
`invokeai/backend/model_manager/load/model_loaders/textual_inversion.py`
resolve and load the selected embedding record. The test uses the
existing Studio exact-resource preparation and installed worker.

One 256×256 TXT request uses Euler/Normal, fixed seed 0, CFG 4 and
three steps. It authors the LoRA, embedding completion and VAE through
the Project controls. After admission it resets VAE, removes LoRA and
clears the embedding token from the draft. The expected accepted
configuration retains the signed weight, negative prompt sidecar and
portable VAE reference. The package, runtime and resource files are
checked again after normal close and reopen.

The run passed on the first attempt. It produced one actual admission,
one completed result, one explicitly accepted Raster and two normal
physical AppImage exits. The accepted Project reopened byte-identically
and kept the exact VAE, LoRA weight −0.5 and negative embedding sidecar.
The reopened draft used Embedded, an empty LoRA stack and a plain negative
prompt. The three original installation jobs remained completed.

The matching CUDA PID and cgroup had 42 samples, with a maximum observed
7,984 MiB on the RTX 4080. The first native scope peaked at 9,401,856,000
host bytes and recorded zero OOM events with swap disabled. The wrapper
ran for 154.237 seconds and verified exact restoration of 112 original
runtime-slot entries. Eight focused suites passed 162 tests with zero
failures and zero skips. Scoped formatting, lint and syntax checks passed.

The final evidence is under
`runs/packaged-installed-engine/20261118/trained-noobai-eps-stack-r1`.
An independent readback matched all 15 source records against both
closed catalogs, checked both byte-identical Projects and verified
the accepted Raster and physical exits. The original evidence for
the three component installs remains in
`runs/packaged-noobai-install/20261119-r12`, `20261119-r13` and
`20261119-r14`. Disposing of the three temporary installed bodies,
profiles and scratch released 491,671,552 allocated bytes after the
combined case. Exact source identities, closed catalogs and native
result evidence remain available.

The scope is one packaged TXT workload at the tested settings. The
combined frozen Retry, legacy queue and incompatible worker cases,
additional inference modes and visual acceptance remain open.
