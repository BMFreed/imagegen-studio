"""A content-pinned, local-only SDXL component config for single-file loading.

The files are not bundled yet. The runtime installer must provide this exact snapshot before
the inference entrypoint can send ready. An arbitrary Hugging Face cache entry is not enough.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from imagegen_worker.derivatives import DerivativeError

SDXL_CONFIG_SOURCE = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_CONFIG_REVISION = "462165984030d82259a11f4367a4eed129e94a7b"
PINNED_SDXL_FILES: dict[str, str] = {
    "model_index.json": "6d7b93508390ab91ac5bfbe4aeb4dc2d83f7bb1b05fb069d714b5b0c75f70d44",
    "scheduler/scheduler_config.json": (
        "af3e45a949aff8b8341ab8b811429ec03fee857a700a1d9477363e4fff9666e2"
    ),
    "text_encoder/config.json": "39b8b2e4b1949e36969caa425b6c81c68bace99198dd9078ce05d16ad401fe7f",
    "text_encoder_2/config.json": (
        "a892d1c3a69a7e9247a24de2bc1d5891e3109a54696e53be20093af671072c34"
    ),
    "tokenizer/merges.txt": "9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a",
    "tokenizer/special_tokens_map.json": (
        "c4864a9376a8401918425bed71fc14fc0e81f9b59ec45c1cf96cccb2df508eac"
    ),
    "tokenizer/tokenizer_config.json": (
        "19d7b034cb0cc3ce9766c2231373ab8aa8991fc72e2c8f76558bfaae3de0d563"
    ),
    "tokenizer/vocab.json": "e089ad92ba36837a0d31433e555c8f45fe601ab5c221d4f607ded32d9f7a4349",
    "tokenizer_2/merges.txt": "9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a",
    "tokenizer_2/special_tokens_map.json": (
        "f118ab3a983206e4f32583448de6bd6aae4ee21869135cef1f5848a753cdaab6"
    ),
    "tokenizer_2/tokenizer_config.json": (
        "c9d23941f76a41cbd50eda9290f57be7828f0a7a677939e9ef181f7e12bd1bdf"
    ),
    "tokenizer_2/vocab.json": "e089ad92ba36837a0d31433e555c8f45fe601ab5c221d4f607ded32d9f7a4349",
    "unet/config.json": "30ebc70750223e59006f7f2b4e1e6c102570aa19a9c4ae3e1fbe7591332dbae6",
    "vae/config.json": "0b331c8ac22ded5f9997a144a575c1d113d6169aff262c353f39015bd24a6264",
    "vae_1_0/config.json": "89a914a415bc3211fe15306c5b1d89774d928d6cc6c91dc8e86208710829355c",
    "vae_decoder/config.json": "89a914a415bc3211fe15306c5b1d89774d928d6cc6c91dc8e86208710829355c",
    "vae_encoder/config.json": "89a914a415bc3211fe15306c5b1d89774d928d6cc6c91dc8e86208710829355c",
}


def verify_pinned_config(
    root_value: str | None,
    *,
    pinned_files: dict[str, str] | None = None,
) -> Path:
    """Require a complete local config before any model loader can infer or fetch one."""
    if not root_value:
        raise DerivativeError("INFERENCE_UNAVAILABLE", "The offline SDXL config is unavailable.")
    root = Path(root_value)
    if not root.is_absolute() or ".." in root.parts or root != root.resolve() or not root.is_dir():
        raise DerivativeError("INFERENCE_UNAVAILABLE", "The offline SDXL config is unavailable.")
    expected_files = pinned_files or PINNED_SDXL_FILES
    actual_files: set[str] = set()
    for entry in root.rglob("*"):
        if entry.is_dir() and not entry.is_symlink():
            continue
        if not entry.is_file():
            raise DerivativeError("INFERENCE_UNAVAILABLE", "The offline SDXL config is unsafe.")
        actual_files.add(entry.relative_to(root).as_posix())
    if actual_files != set(expected_files):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "The offline SDXL config is incomplete.")
    for relative_name, expected_digest in expected_files.items():
        entry = root / relative_name
        if not entry.is_file():
            raise DerivativeError("INFERENCE_UNAVAILABLE", "The offline SDXL config is incomplete.")
        digest = hashlib.sha256()
        try:
            with entry.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
        except OSError as error:
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE", "The offline SDXL config is unavailable."
            ) from error
        if digest.hexdigest() != expected_digest:
            raise DerivativeError("INFERENCE_UNAVAILABLE", "The offline SDXL config changed.")
    return root


def configured_sdxl_path() -> Path:
    return verify_pinned_config(os.environ.get("IGS_SDXL_CONFIG_DIR"))
