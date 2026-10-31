"""Execute pinned Invoke operator definitions without importing its application.

The selected AST nodes, including method bodies and decorators, are unchanged.
Small class containers omit invocation registration and unrelated methods. Mask
image/tensor services and output DTOs are transport adapters only. NumPy, Pillow,
Torch, torchvision and Diffusers remain real. Only the no-IP-Adapter lane is
qualified. This is Invoke source on the supplied shared runtime, not an installed
Invoke environment or application-lifecycle qualification.
"""

from __future__ import annotations

import ast
import hashlib
import importlib
import json
import math
import os
import re
import stat
import sys
import typing
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path, PurePosixPath
from types import ModuleType, SimpleNamespace
from typing import Any, cast

REVISION = "a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd"
MODULE_PREFIX = "_igs_invoke_reference_"
_MAX_FILE_BYTES = 2 * 1024 * 1024
_BASE = "invokeai/backend/stable_diffusion/"
SELECTIONS: dict[str, tuple[str, ...]] = {
    _BASE + "diffusion/conditioning_data.py": (
        "BasicConditioningInfo",
        "SDXLConditioningInfo",
        "Range",
        "TextConditioningRegions",
        "ConditioningMode",
        "TextConditioningData",
    ),
    _BASE + "denoise_context.py": ("UNetKwargs",),
    _BASE + "diffusion/regional_prompt_data.py": ("RegionalPromptData",),
    "invokeai/app/invocations/sd/denoise_latents.py": (
        "DenoiseLatentsInvocation._preprocess_regional_prompt_mask",
        "DenoiseLatentsInvocation._concat_regional_text_embeddings",
    ),
    _BASE + "diffusion/custom_atttention.py": ("CustomAttnProcessor2_0",),
    _BASE + "extensions/ip_adapter.py": ("IPAdapterExt.run_adapters",),
    "invokeai/backend/util/mask.py": ("to_standard_mask_dim", "to_standard_float_mask"),
    "invokeai/app/invocations/mask.py": ("AlphaMaskToTensorInvocation.invoke",),
}


class SourceReferenceError(ValueError):
    """A source identity or bounded-loading refusal, never a parity result."""


def _require(value: bool, message: str) -> None:
    if not value:
        raise SourceReferenceError(message)


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _ast_sha(node: ast.AST) -> str:
    return _sha(ast.dump(node, include_attributes=False).encode())


def _read_regular(root: Path, relative: str) -> bytes:
    path = PurePosixPath(relative)
    _require(
        not path.is_absolute()
        and bool(path.parts)
        and all(part not in ("", ".", "..") for part in path.parts),
        "Unsafe reference member path.",
    )
    current = root
    for part in path.parts[:-1]:
        current /= part
        _require(stat.S_ISDIR(current.lstat().st_mode), "Reference parent is not a directory.")
    filename = root.joinpath(*path.parts)
    before = filename.lstat()
    _require(stat.S_ISREG(before.st_mode), "Reference member is not a regular file.")
    _require(0 <= before.st_size <= _MAX_FILE_BYTES, "Reference member exceeds its read bound.")
    descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(descriptor, "rb") as stream:
        opened = os.fstat(stream.fileno())
        _require(
            (opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino),
            "Reference member changed before reading.",
        )
        raw = stream.read(_MAX_FILE_BYTES + 1)
        after = os.fstat(stream.fileno())
    _require(len(raw) == before.st_size, "Reference member length changed.")
    _require(
        (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
        "Reference member changed during reading.",
    )
    return raw


def _definition(tree: ast.Module, qualified: str) -> ast.stmt:
    parts = qualified.split(".")
    body: list[ast.stmt] = tree.body
    selected: ast.stmt | None = None
    for name in parts:
        matches = [
            node
            for node in body
            if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name == name
        ]
        _require(len(matches) == 1, f"Missing or ambiguous source definition: {qualified}")
        selected = matches[0]
        body = selected.body
    assert selected is not None
    return selected


def _execute(namespace: dict[str, Any], definitions: list[ast.stmt], filename: str) -> None:
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    module = ast.Module(body=[future, *definitions], type_ignores=[])
    ast.fix_missing_locations(module)
    exec(compile(module, filename, "exec"), namespace)


@contextmanager
def load_reference(
    torch: Any, diffusers: Any, reference_root: Path, manifest_sha256: str
) -> Generator[Any, None, None]:
    """Yield exact source definitions and restore only the owned module slot.

    The caller supplies an explicitly pinned ROOT-owned source snapshot. No
    source repository, interpreter, package environment or model is modified.
    Ordinary dependency imports may populate their normal Python import cache.
    """
    _require(
        reference_root.is_absolute() and reference_root.resolve() == reference_root,
        "Reference root must be an explicit canonical absolute directory.",
    )
    _require(stat.S_ISDIR(reference_root.lstat().st_mode), "Reference root is not a directory.")
    _require(bool(re.fullmatch(r"[0-9a-f]{64}", manifest_sha256)), "Invalid manifest pin.")
    manifest_raw = _read_regular(reference_root, "invoke-reference.manifest.json")
    _require(_sha(manifest_raw) == manifest_sha256, "Reference manifest SHA256 mismatch.")
    manifest: Any = json.loads(manifest_raw)
    _require(
        manifest["schema"] == "invoke-regional-source-reference-v1"
        and manifest["revision"] == REVISION,
        "Reference schema/revision mismatch.",
    )
    files: dict[str, bytes] = {}
    for relative, expected in manifest["files"].items():
        raw = _read_regular(reference_root, relative)
        _require(
            len(raw) == expected["bytes"] and _sha(raw) == expected["sha256"],
            f"Reference source SHA256 mismatch: {relative}",
        )
        files[relative] = raw
    definitions: dict[str, dict[str, ast.stmt]] = {}
    fingerprints: dict[str, dict[str, str]] = {}
    for relative, names in SELECTIONS.items():
        _require(relative in files, f"Missing reference file: {relative}")
        tree = ast.parse(files[relative], filename=str(reference_root / relative))
        definitions[relative] = {}
        fingerprints[relative] = {}
        for name in names:
            definition = _definition(tree, name)
            digest = _ast_sha(definition)
            _require(
                manifest["definitions"][relative][name] == digest,
                f"Reference AST SHA256 mismatch: {relative}:{name}",
            )
            definitions[relative][name] = definition
            fingerprints[relative][name] = digest

    processors: Any = importlib.import_module("diffusers.models.attention_processor")
    torchvision: Any = importlib.import_module("torchvision")
    numpy: Any = importlib.import_module("numpy")
    module = ModuleType(f"{MODULE_PREFIX}{id(definitions):x}")
    namespace = vars(module)
    namespace.update(
        {
            name: vars(typing)[name]
            for name in ("List", "Optional", "Tuple", "Union", "Dict", "Type")
        }
    )
    namespace.update(
        Any=Any,
        Enum=Enum,
        F=torch.nn.functional,
        cast=cast,
        dataclass=dataclass,
        field=field,
        math=math,
        np=numpy,
        torch=torch,
        torchvision=torchvision,
        Attention=processors.Attention,
        AttnProcessor2_0=processors.AttnProcessor2_0,
        TensorField=SimpleNamespace,
        MaskOutput=SimpleNamespace,
    )
    _require(module.__name__ not in sys.modules, "Reference module slot already exists.")
    sys.modules[module.__name__] = module
    try:
        # Class bodies are complete originals. Their type annotations are
        # deferred so application-only typing imports are unnecessary.
        for relative in (
            _BASE + "diffusion/conditioning_data.py",
            _BASE + "denoise_context.py",
            _BASE + "diffusion/regional_prompt_data.py",
            "invokeai/backend/util/mask.py",
        ):
            _execute(
                namespace, list(definitions[relative].values()), str(reference_root / relative)
            )
        for relative, container in (
            ("invokeai/app/invocations/sd/denoise_latents.py", "DenoiseLatentsInvocation"),
            (_BASE + "extensions/ip_adapter.py", "IPAdapterExt"),
            ("invokeai/app/invocations/mask.py", "AlphaMaskToTensorInvocation"),
        ):
            wrapper = ast.ClassDef(
                name=container,
                bases=[],
                keywords=[],
                body=list(definitions[relative].values()),
                decorator_list=[],
                type_params=[],
            )
            _execute(namespace, [wrapper], str(reference_root / relative))
        relative = _BASE + "diffusion/custom_atttention.py"
        _execute(namespace, list(definitions[relative].values()), str(reference_root / relative))

        def canvas_mask(image: Any, invert: bool = False) -> Any:
            """Use the original invocation with in-memory image/tensor transport."""
            _require(image.mode == "RGBA", "Reference Canvas input must be RGBA.")
            stored: list[Any] = []

            def get_pil(name: str, *, mode: str) -> Any:
                _require(name == "owned-input" and mode == "RGBA", "Unexpected image transport.")
                return image

            def save(value: Any) -> str:
                _require(not stored, "Unexpected repeated tensor save.")
                stored.append(value)
                return "owned-mask"

            owner = namespace["AlphaMaskToTensorInvocation"]()
            owner.image = SimpleNamespace(image_name="owned-input")
            owner.invert = invert
            output = owner.invoke(
                SimpleNamespace(
                    images=SimpleNamespace(get_pil=get_pil), tensors=SimpleNamespace(save=save)
                )
            )
            _require(
                len(stored) == 1
                and output.mask.tensor_name == "owned-mask"
                and (output.height, output.width) == tuple(stored[0].shape[1:]),
                "Unexpected mask output transport.",
            )
            return stored[0]

        reference = SimpleNamespace(
            **{
                name: namespace[name]
                for name in (
                    "BasicConditioningInfo",
                    "SDXLConditioningInfo",
                    "Range",
                    "TextConditioningRegions",
                    "ConditioningMode",
                    "TextConditioningData",
                    "UNetKwargs",
                    "RegionalPromptData",
                    "DenoiseLatentsInvocation",
                    "IPAdapterExt",
                    "AlphaMaskToTensorInvocation",
                    "CustomAttnProcessor2_0",
                    "to_standard_mask_dim",
                    "to_standard_float_mask",
                )
            },
            canvas_mask=canvas_mask,
            revision=REVISION,
            manifest_sha256=manifest_sha256,
            source_definitions=fingerprints,
            source_files={name: _sha(raw) for name, raw in files.items()},
            module_name=module.__name__,
            diffusers_version=diffusers.__version__,
        )
        yield reference
        _require(
            _read_regular(reference_root, "invoke-reference.manifest.json") == manifest_raw,
            "Reference manifest changed during consumption.",
        )
        for relative, raw in files.items():
            _require(_read_regular(reference_root, relative) == raw, "Reference source changed.")
        for relative, names in definitions.items():
            for name, node in names.items():
                _require(_ast_sha(node) == fingerprints[relative][name], "Selected AST changed.")
    finally:
        _require(sys.modules.get(module.__name__) is module, "Owned reference slot was replaced.")
        del sys.modules[module.__name__]
