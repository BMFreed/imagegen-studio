# Illustrious XL v0.1 compatibility evidence

The pointer and scheduler configuration are copied verbatim from the official
`OnomaAIResearch/Illustrious-xl-early-release-v0` repository at pinned revision
`dca0dac303e6dc4b0c31d8001bc685b89b5d0204`:

- [Checkpoint Git LFS pointer](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/raw/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/Illustrious-XL-v0.1.safetensors)
- [Scheduler configuration](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/raw/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/scheduler/scheduler_config.json)

The compressed safetensors header fixture is the original first 365,024 bytes
(8-byte header length and 365,016-byte JSON header) from a `Range:
bytes=0-365023` request to the [same pinned checkpoint](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/resolve/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/Illustrious-XL-v0.1.safetensors).
The response was HTTP 206 with `Content-Range: bytes 0-365023/6938040760`.
The uncompressed header SHA-256 is
`fdc4c10c26c4240e75b81d47e1950eb1a5424025b72d01109937ae9c067d0de6`.
Its `__metadata__` declares `modelspec.prediction_type: epsilon` and
`modelspec.architecture: stable-diffusion-xl-v1-base`.

The pointer identifies the full checkpoint bytes, not the small pointer file.
Tests parse these local evidence files without network access or loading the
6.94 GB model. A real inference run remains a separate release gate.
