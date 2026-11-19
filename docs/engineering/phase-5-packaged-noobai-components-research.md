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
by the installed inference work. A released standalone VAE and the
combined final-release setup, upgrade and generation matrix remain open.
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
