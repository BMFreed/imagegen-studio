"""Opt-in current Invoke CLIP boundary on ImageGen's common pinned runtime.

This is not an installed Invoke application. Original selected methods/classes
execute unchanged; app model/conditioning services and empty LoRA IO are adapters.
No UNet, scheduler step, VAE operation or image publication is permitted. No
pytest dependency is needed by the installed-Python CLI. ROOT owns all execution.

CLI: python -I -B THIS --contract EXACT_RUN/conditioning-contract.json
     --contract-sha256 SHA --mode small|run|verify
Workspace pytest also discovers the model-free unittest manifest guards.
"""

from __future__ import annotations

import argparse
import ast
import copy
import hashlib
import importlib
import importlib.util
import json
import os
import random
import re
import stat
import sys
import tempfile
import time
import unittest
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import wraps
from pathlib import Path, PurePosixPath
from types import ModuleType, SimpleNamespace
from typing import Any, cast

RUN = (
    Path.home()
    / ".codex/artifacts/imagegen-studio/runs/ordinary-invoke-conditioning/20261111-fixed-cat"
)
REPO = Path(__file__).resolve().parents[2]
BASE = "b7f3caa2a3ccaec6b7368c203dafff57aa99dcf2"
INVOKE_REVISION = "4875d96531ca6712b288f6e660fcbb34143408c1"
PROMPT = (
    "a simple illustration of one cat head, front view, two pointed ears, "
    "two eyes, plain light background"
)
MODEL_SHA = "3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9"
OLD_RUN = RUN.parents[1] / "ordinary-resolution/20261111-fixed-cat"
SOURCE_MANIFEST = "invoke-conditioning-source.manifest.json"
SELF = "worker-python/tests/test_ordinary_invoke_conditioning_parity.py"
HELPER = "worker-python/tests/invoke_operator_reference.py"
SOURCE_SELECTIONS = {
    "invokeai/app/invocations/text_encoder/compel.py": (
        "SDXLPromptInvocationBase.run_clip_compel",
        "SDXLCompelPromptInvocation.invoke",
    ),
    "invokeai/backend/stable_diffusion/diffusion/conditioning_data.py": (
        "BasicConditioningInfo",
        "SDXLConditioningInfo",
    ),
    "invokeai/app/util/ti_utils.py": ("extract_ti_triggers_from_prompt", "generate_ti_list"),
    "invokeai/backend/model_patcher.py": ("ModelPatcher.apply_ti", "ModelPatcher.apply_clip_skip"),
    "invokeai/backend/textual_inversion.py": ("TextualInversionManager",),
    "invokeai/backend/util/devices.py": ("TorchDevice.choose_torch_dtype", "TorchDevice._to_dtype"),
}
SHA = re.compile(r"[0-9a-f]{64}\Z")
MAX_BYTES = 32 * 1024**2


def _require(value: object, message: str) -> None:
    if not value:
        raise AssertionError(message)


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read(path: Path, maximum: int = MAX_BYTES) -> bytes:
    before = path.lstat()
    _require(
        stat.S_ISREG(before.st_mode) and path.resolve() == path, "Canonical regular input required"
    )
    _require(before.st_size <= maximum, "Input exceeds read budget")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        opened = os.fstat(stream.fileno())
        _require((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), "Input replaced")
        binary = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    _require(
        len(binary) == before.st_size
        and before.st_mtime_ns == after.st_mtime_ns
        and before.st_ctime_ns == after.st_ctime_ns,
        "Input changed",
    )
    return binary


def _json(path: Path) -> dict[str, Any]:
    value: Any = json.loads(_read(path))
    _require(type(value) is dict, "Expected JSON object")
    return cast(dict[str, Any], value)


def _pinned(value: dict[str, Any], exact: Path | None = None) -> bytes:
    _require(set(value) == {"path", "byteSize", "sha256"}, "Descriptor fields differ")
    path = Path(value["path"])
    _require(exact is None or path == exact, "Descriptor path differs")
    _require(
        type(value["byteSize"]) is int and 0 <= value["byteSize"] <= MAX_BYTES,
        "Descriptor read budget differs",
    )
    binary = _read(path)
    _require(
        len(binary) == value["byteSize"] and _sha(binary) == value["sha256"], "Pinned bytes differ"
    )
    return binary


def _write(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


@contextmanager
def _tools() -> Generator[Any, None, None]:
    name = "_igs_ordinary_reference_tools"
    _require(name not in sys.modules, "Owned helper module exists")
    spec = importlib.util.spec_from_file_location(name, REPO / HELPER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
        yield cast(Any, module)
    finally:
        _require(sys.modules.pop(name) is module, "Owned helper slot changed")


def _source(root: Path, digest: str) -> tuple[dict[str, Any], dict[str, dict[str, ast.stmt]]]:
    _require(root.is_absolute() and root.resolve() == root, "Canonical source root required")
    raw = _read(root / SOURCE_MANIFEST)
    _require(_sha(raw) == digest, "Source manifest pin differs")
    manifest: Any = json.loads(raw)
    _require(
        manifest["schema"] == "invoke-ordinary-conditioning-source-v1"
        and manifest["revision"] == INVOKE_REVISION,
        "Source schema/revision differs",
    )
    _require(6 <= len(manifest["files"]) <= 16, "Source census differs")
    definitions: dict[str, dict[str, ast.stmt]] = {}
    with _tools() as helper:
        for name, expected in manifest["files"].items():
            binary = helper._read_regular(root, name)
            _require(
                len(binary) == expected["bytes"] and _sha(binary) == expected["sha256"],
                "Source file pin differs",
            )
        for name, selections in SOURCE_SELECTIONS.items():
            binary = helper._read_regular(root, name)
            tree = ast.parse(binary, filename=str(root / name))
            definitions[name] = {}
            _require(
                set(manifest["definitions"][name]) == set(selections), "Source selection differs"
            )
            for qualified in selections:
                node = helper._definition(tree, qualified)
                _require(
                    helper._ast_sha(node) == manifest["definitions"][name][qualified],
                    "Source AST pin differs",
                )
                definitions[name][qualified] = node
    return cast(dict[str, Any], manifest), definitions


def _contract(path: Path, digest: str) -> dict[str, Any]:
    _require(
        path == RUN / "conditioning-contract.json" and SHA.fullmatch(digest),
        "Exact contract required",
    )
    binary = _read(path)
    _require(_sha(binary) == digest, "Contract pin differs")
    value: dict[str, Any] = json.loads(binary)
    _require(
        set(value)
        == {
            "schema",
            "base",
            "invokeRevision",
            "prompt",
            "negative",
            "checkpoint",
            "input",
            "source",
            "runtime",
            "qualifiedFiles",
        },
        "Contract fields differ",
    )
    _require(
        value["schema"] == "ordinary-invoke-conditioning-v1"
        and value["base"] == BASE
        and value["invokeRevision"] == INVOKE_REVISION
        and value["prompt"] == PROMPT
        and value["negative"] == "",
        "Fixed experiment differs",
    )
    checkpoint = value["checkpoint"]
    _require(
        checkpoint["path"]
        == str(
            Path.home()
            / ".codex/artifacts/imagegen-studio/shared/illustrious-epsilon-source-20261026/"
            "Illustrious-XL-v0.1.safetensors"
        )
        and checkpoint["sha256"] == MODEL_SHA
        and checkpoint["byteSize"] == 6_938_040_760,
        "Official checkpoint differs",
    )
    _require(set(value["input"]) == {"handoff", "request", "target"}, "Input roles differ")
    for role, directory, suffix in (
        ("handoff", "resolution-handoffs", "json"),
        ("request", "", "request.json"),
        ("target", "resolution-targets", "png"),
    ):
        _pinned(value["input"][role], OLD_RUN / directory / f"seed123-1024.{suffix}")
    _require(value["source"]["root"] == str(RUN / "invoke-source"), "Source root differs")
    _source(Path(value["source"]["root"]), value["source"]["manifestSha256"])
    _require(
        {
            SELF,
            HELPER,
            "worker-python/src/imagegen_worker/inference.py",
            "worker-python/src/imagegen_worker/protocol.py",
        }.issubset(value["qualifiedFiles"]),
        "Source owner omitted",
    )
    for name, descriptor in value["qualifiedFiles"].items():
        relative = PurePosixPath(name)
        _require(
            not relative.is_absolute() and not {".", ".."} & set(relative.parts),
            "Unsafe qualified source",
        )
        data = _read(REPO / name)
        _require(
            len(data) == descriptor["bytes"] and _sha(data) == descriptor["sha256"],
            "Qualified source changed",
        )
    _pinned(value["runtime"]["workerReport"])
    return value


def _class(name: str, methods: list[ast.stmt], bases: tuple[str, ...] = ()) -> ast.ClassDef:
    return ast.ClassDef(
        name=name,
        bases=[ast.Name(id=x, ctx=ast.Load()) for x in bases],
        keywords=[],
        body=methods,
        decorator_list=[],
        type_params=[],
    )


@contextmanager
def _reference(
    definitions: dict[str, dict[str, ast.stmt]], torch: Any, *, full: bool = False
) -> Generator[Any, None, None]:
    module = ModuleType("_igs_ordinary_conditioning_source")
    _require(module.__name__ not in sys.modules, "Owned source module exists")
    namespace: dict[str, Any] = vars(module)
    namespace.update(
        torch=torch,
        dataclass=dataclass,
        Any=Any,
        cast=cast,
        contextmanager=contextmanager,
        re=re,
        ConditioningFieldData=SimpleNamespace,
        ConditioningField=SimpleNamespace,
        ConditioningOutput=SimpleNamespace,
    )
    sys.modules[module.__name__] = module
    try:
        with _tools() as helper:
            condition = "invokeai/backend/stable_diffusion/diffusion/conditioning_data.py"
            helper._execute(namespace, list(definitions[condition].values()), condition)
            path = "invokeai/app/invocations/text_encoder/compel.py"
            if full:
                compel: Any = importlib.import_module("compel")
                transformers: Any = importlib.import_module("transformers")
                provider: Any = importlib.import_module("compel.embeddings_provider")
                namespace.update(
                    Compel=compel.Compel,
                    ReturnedEmbeddingsType=compel.ReturnedEmbeddingsType,
                    SplitLongTextMode=compel.SplitLongTextMode,
                    BaseTextualInversionManager=provider.BaseTextualInversionManager,
                    CLIPTextModel=transformers.CLIPTextModel,
                    CLIPTextModelWithProjection=transformers.CLIPTextModelWithProjection,
                    CLIPTokenizer=transformers.CLIPTokenizer,
                    NAME_TO_PRECISION={
                        "float16": torch.float16,
                        "float32": torch.float32,
                        "bfloat16": torch.bfloat16,
                    },
                    get_config=lambda: SimpleNamespace(precision="auto"),
                )
                for selected, container in (
                    ("invokeai/backend/util/devices.py", "TorchDevice"),
                    ("invokeai/backend/model_patcher.py", "ModelPatcher"),
                ):
                    helper._execute(
                        namespace,
                        [_class(container, list(definitions[selected].values()))],
                        selected,
                    )
                for selected in (
                    "invokeai/backend/textual_inversion.py",
                    "invokeai/app/util/ti_utils.py",
                ):
                    helper._execute(namespace, list(definitions[selected].values()), selected)
                helper._execute(
                    namespace,
                    [
                        _class(
                            "SDXLPromptInvocationBase",
                            [definitions[path]["SDXLPromptInvocationBase.run_clip_compel"]],
                        )
                    ],
                    path,
                )
                namespace["LayerPatcher"] = SimpleNamespace(
                    apply_smart_model_patches=_empty_patches
                )
            else:
                namespace["SDXLPromptInvocationBase"] = type("SDXLPromptInvocationBase", (), {})
            helper._execute(
                namespace,
                [
                    _class(
                        "SDXLCompelPromptInvocation",
                        [definitions[path]["SDXLCompelPromptInvocation.invoke"]],
                        ("SDXLPromptInvocationBase",),
                    )
                ],
                path,
            )
        yield cast(Any, module)
    finally:
        _require(sys.modules.pop(module.__name__) is module, "Owned source module slot changed")


@contextmanager
def _empty_patches(**options: Any) -> Generator[None, None, None]:
    _require(
        list(options["patches"]) == [] and options["cached_weights"] is None,
        "Only empty LoRA IO is admitted",
    )
    yield


def _configured(reference: Any) -> Any:
    invocation = reference.SDXLCompelPromptInvocation()
    for key, value in {
        "prompt": PROMPT,
        "style": PROMPT,
        "original_width": 1024,
        "original_height": 1024,
        "crop_top": 0,
        "crop_left": 0,
        "target_width": 1024,
        "target_height": 1024,
        "mask": None,
    }.items():
        setattr(invocation, key, value)
    return invocation


def _saved_context() -> Any:
    saved: list[Any] = []

    def save(value: Any) -> str:
        saved.append(value)
        return str(len(saved))

    return SimpleNamespace(conditioning=SimpleNamespace(save=save), saved=saved)


def _small(contract: dict[str, Any]) -> dict[str, Any]:
    torch: Any = importlib.import_module("torch")
    _, definitions = _source(Path(contract["source"]["root"]), contract["source"]["manifestSha256"])
    with _reference(definitions, torch) as reference:

        def execute(invocation: Any) -> Any:
            def supplied(
                _context: Any,
                clip: str,
                prompt: str,
                pooled: bool,
                _prefix: str,
                *,
                zero_on_empty: bool,
            ) -> tuple[Any, Any]:
                _require(prompt == PROMPT and zero_on_empty, "Small source adapter settings differ")
                if clip == "clip1":
                    _require(not pooled, "Small CLIP1 pool differs")
                    return torch.ones((1, 77, 2)), None
                _require(clip == "clip2" and pooled, "Small CLIP2 settings differ")
                return torch.full((1, 154, 3), 2.0), torch.full((1, 3), 7.0)

            invocation.clip, invocation.clip2 = "clip1", "clip2"
            invocation.run_clip_compel = supplied
            context = _saved_context()
            invocation.invoke(context)
            return context.saved[0].conditionings[0]

        def check(value: Any, *, time_ids: bool) -> None:
            _require(value.embeds.shape == (1, 154, 5), "Small concat shape differs")
            _require(
                torch.equal(value.embeds[:, :77, :2], torch.ones((1, 77, 2)))
                and torch.count_nonzero(value.embeds[:, 77:, :2]) == 0
                and torch.equal(value.embeds[:, :, 2:], torch.full((1, 154, 3), 2.0)),
                "Small concat/padding differs",
            )
            _require(
                torch.equal(value.pooled_embeds, torch.full((1, 3), 7.0)), "Small pool differs"
            )
            if time_ids:
                _require(
                    torch.equal(value.add_time_ids, torch.tensor([[1024, 1024, 0, 0, 1024, 1024]])),
                    "Small timeIds semantic mismatch",
                )

        check(execute(_configured(reference)), time_ids=True)
        path = "invokeai/app/invocations/text_encoder/compel.py"
        original = definitions[path]["SDXLCompelPromptInvocation.invoke"]
        mutant = copy.deepcopy(original)
        changes = [0]

        class WrongTimeId(ast.NodeTransformer):
            def visit_Attribute(self, node: ast.Attribute) -> ast.AST:
                if node.attr == "target_width":
                    changes[0] += 1
                    node.attr = "crop_left"
                return self.generic_visit(node)

        WrongTimeId().visit(mutant)
        _require(changes == [1], "Time-ID mutation did not reach one source expression")
        namespace: dict[str, Any] = dict(cast(dict[str, Any], vars(reference)))
        with _tools() as helper:
            helper._execute(
                namespace,
                [_class("MutantInvocation", [mutant], ("SDXLPromptInvocationBase",))],
                path,
            )
        previous = reference.SDXLCompelPromptInvocation
        reference.SDXLCompelPromptInvocation = namespace["MutantInvocation"]
        try:
            bad = execute(_configured(reference))
            check(bad, time_ids=False)  # neighboring concat/pool control remains GREEN
            try:
                check(bad, time_ids=True)
            except AssertionError as error:
                _require(
                    str(error) == "Small timeIds semantic mismatch",
                    "Mutation failed for another reason",
                )
            else:
                raise AssertionError("Time-ID semantic mutation escaped")
        finally:
            reference.SDXLCompelPromptInvocation = previous
        check(execute(_configured(reference)), time_ids=True)
    return {
        "status": "PASS",
        "sourceSemanticMutation": "GREEN / timeIds RED + concatPool GREEN / restored GREEN",
        "modelLoads": 0,
        "encoderForwards": 0,
        "unetForwards": 0,
        "vaeOperations": 0,
        "scope": (
            "Original current Invoke SDXL invoke with CPU adapter tensors; no trained parity claim"
        ),
    }


def _tensor_bytes(value: Any) -> bytes:
    return cast(bytes, value.detach().to("cpu").contiguous().numpy().tobytes())


def _model_state(pipeline: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for component in ("text_encoder", "text_encoder_2", "unet", "vae"):
        model = getattr(pipeline, component)
        parameters: list[tuple[Any, ...]] = []
        for name, value in (
            *model.named_parameters(),
            *(("buffer:" + name, value) for name, value in model.named_buffers()),
        ):
            digest = hashlib.sha256()
            flat = value.detach().reshape(-1)
            for chunk in flat.split(4 * 1024**2):
                digest.update(_tensor_bytes(chunk))
            parameters.append(
                (
                    name,
                    id(value),
                    value.data_ptr(),
                    value._version,
                    str(value.dtype),
                    str(value.device),
                    tuple(value.shape),
                    digest.hexdigest(),
                )
            )
        modules = [
            (
                name,
                id(module),
                module.training,
                tuple((key, id(hook)) for key, hook in module._forward_hooks.items()),
                tuple((key, id(hook)) for key, hook in module._forward_pre_hooks.items()),
            )
            for name, module in model.named_modules()
        ]
        result[component] = {
            "parameters": parameters,
            "modules": modules,
            "processors": tuple(
                (name, id(value)) for name, value in getattr(model, "attn_processors", {}).items()
            ),
        }
    return result


def _tokenizer_state(pipeline: Any) -> dict[str, Any]:
    return {
        name: {
            "identity": id(tokenizer),
            "vocab": tokenizer.get_vocab(),
            "added": tokenizer.get_added_vocab(),
            "special": tokenizer.special_tokens_map,
            "maximum": tokenizer.model_max_length,
            "padding": tokenizer.padding_side,
            "truncation": tokenizer.truncation_side,
        }
        for name, tokenizer in (("clip1", pipeline.tokenizer), ("clip2", pipeline.tokenizer_2))
    }


@contextmanager
def _denied_evaluation(runtime: Any) -> Generator[dict[str, int], None, None]:
    counts = {"unetForwards": 0, "vaeOperations": 0, "schedulerSteps": 0, "pipelineCalls": 0}
    restores: list[tuple[Any, str, Any]] = []
    for owner, attribute, key in (
        (runtime.diffusers.UNet2DConditionModel, "forward", "unetForwards"),
        (runtime.diffusers.AutoencoderKL, "encode", "vaeOperations"),
        (runtime.diffusers.AutoencoderKL, "decode", "vaeOperations"),
        (runtime.diffusers.AutoencoderKL, "forward", "vaeOperations"),
        (runtime.diffusers.EulerDiscreteScheduler, "step", "schedulerSteps"),
        (runtime.diffusers.StableDiffusionXLPipeline, "__call__", "pipelineCalls"),
    ):
        original = getattr(owner, attribute)

        def make_denied(old: Any, counter: str) -> Any:
            @wraps(old)
            def denied(*_args: Any, **_kwargs: Any) -> Any:
                counts[counter] += 1
                raise AssertionError(f"Forbidden trained evaluation: {counter}")

            return denied

        replacement = make_denied(original, key)
        restores.append((owner, attribute, original))
        setattr(owner, attribute, replacement)
    try:
        yield counts
    finally:
        for owner, attribute, original in reversed(restores):
            setattr(owner, attribute, original)
        _require(
            all(getattr(owner, name) is original for owner, name, original in restores),
            "Forbidden-call slots did not restore",
        )


@contextmanager
def _capture_encoders(pipeline: Any) -> Generator[list[dict[str, Any]], None, None]:
    calls: list[dict[str, Any]] = []
    handles: list[Any] = []
    pending: dict[str, list[dict[str, Any]]] = {"clip1": [], "clip2": []}
    for name, encoder in (("clip1", pipeline.text_encoder), ("clip2", pipeline.text_encoder_2)):

        def pre(label: str) -> Any:
            def before(_model: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
                ids: Any = kwargs.get("input_ids", args[0] if args else None)
                _require(ids is not None, "Encoder did not receive token IDs")
                mask = kwargs.get("attention_mask", args[1] if len(args) > 1 else None)
                row = {
                    "encoder": label,
                    "inputIds": ids.detach().to("cpu").clone(),
                    "attentionMask": None if mask is None else mask.detach().to("cpu").clone(),
                    "hiddenStates": bool(kwargs.get("output_hidden_states", False)),
                }
                pending[label].append(row)

            return before

        def post(label: str) -> Any:
            def after(_model: Any, _args: tuple[Any, ...], output: Any) -> None:
                row = pending[label].pop(0)
                hidden = getattr(output, "hidden_states", None)
                row["penultimate"] = (
                    None if hidden is None else hidden[-2].detach().to("cpu").clone()
                )
                pool = getattr(output, "text_embeds", None)
                row["projectedPool"] = None if pool is None else pool.detach().to("cpu").clone()
                calls.append(row)

            return after

        handles.extend(
            (
                encoder.register_forward_pre_hook(pre(name), with_kwargs=True),
                encoder.register_forward_hook(post(name)),
            )
        )
    try:
        yield calls
    finally:
        for handle in handles:
            handle.remove()
        _require(not any(pending.values()), "Encoder capture incomplete")


def _context_for_models(pipeline: Any, torch: Any) -> Any:
    context = _saved_context()
    components = {
        "clip1": pipeline.text_encoder,
        "clip2": pipeline.text_encoder_2,
        "tokenizer1": pipeline.tokenizer,
        "tokenizer2": pipeline.tokenizer_2,
    }

    @contextmanager
    def on_device(model: Any) -> Generator[tuple[None, Any], None, None]:
        yield None, model

    def load(key: str) -> Any:
        _require(key in components, "Unexpected source model IO")
        model = components[key]
        if key.startswith("tokenizer"):
            return _tokenizer_context(model)
        return SimpleNamespace(
            model=model,
            config=SimpleNamespace(base="sdxl"),
            compute_device=torch.device("cuda"),
            model_on_device=lambda: on_device(model),
        )

    context.models = SimpleNamespace(load=load)
    context.config = SimpleNamespace(get=lambda: SimpleNamespace(log_tokenization=False))

    def progress(value: str) -> None:
        _require(value == "Building conditioning", "Unexpected source progress")

    context.util = SimpleNamespace(signal_progress=progress)
    return context


@contextmanager
def _tokenizer_context(tokenizer: Any) -> Generator[Any, None, None]:
    yield tokenizer


def _equal_tensor(left: Any, right: Any, name: str, torch: Any) -> None:
    _require(
        tuple(left.shape) == tuple(right.shape)
        and left.dtype == right.dtype
        and torch.equal(left.detach().to("cpu"), right.detach().to("cpu")),
        f"Tensor parity differs: {name}",
    )


def _retained_tensor(name: str, value: Any) -> dict[str, Any]:
    binary = _tensor_bytes(value)
    _require(len(binary) <= 4 * 1024**2, "Consumed tensor exceeds retention budget")
    path = RUN / "payloads/tensors" / f"{name}.bin"
    with path.open("xb") as stream:
        stream.write(binary)
    return {
        "path": str(path),
        "byteSize": len(binary),
        "sha256": _sha(binary),
        "dtype": str(value.dtype),
        "shape": list(value.shape),
    }


def _runtime_fence(contract: dict[str, Any]) -> dict[str, Any]:
    report = json.loads(_pinned(contract["runtime"]["workerReport"]))
    app = (
        Path.home() / ".codex/artifacts/imagegen-studio/shared/regional-public-worker-014-20261103/"
        "data/imagegen-studio"
    )
    installed = report["installed"]
    _require(
        report["status"] == "activated-qualified"
        and report["appData"] == str(app)
        and report["confirmedWorkerExit"] is True
        and installed["editable"] is False
        and installed["pythonVersion"] == "3.12.13"
        and report["ready"]["workerVersion"] == "0.14.0",
        "Installed runtime identity differs",
    )
    worker = Path(installed["workerRoot"])
    prefix = Path(installed["prefix"])
    config = prefix / "resources/sdxl-config"
    _require(
        worker.is_relative_to(app / "runtime")
        and prefix.is_relative_to(app / "runtime")
        and str(config) == contract["runtime"]["configDir"],
        "Installed roots differ",
    )

    def tree(root: Path) -> dict[str, Any]:
        _require(root.resolve() == root and root.is_dir(), "Canonical runtime tree required")
        result: dict[str, Any] = {}
        for directory, folders, files in os.walk(root, followlinks=False):
            folders[:] = [name for name in folders if name != "__pycache__"]
            for name in folders:
                _require(not (Path(directory) / name).is_symlink(), "Runtime tree link refused")
            for name in files:
                if name.endswith(".pyc"):
                    continue
                path = Path(directory) / name
                binary = _read(path)
                result[path.relative_to(root).as_posix()] = {
                    "bytes": len(binary),
                    "sha256": _sha(binary),
                }
        return result

    workers = tree(worker)
    _require(
        workers == installed["workerFiles"] == tree(REPO / "worker-python/src/imagegen_worker"),
        "Installed/source worker bytes differ",
    )
    inputs = report["inputs"]
    _require(
        workers
        == {
            name.removeprefix("imagegen_worker/"): value
            for name, value in inputs["worker"]["files"].items()
        },
        "Report worker inputs differ",
    )
    configurations = tree(config)
    _require(configurations == inputs["config"]["files"], "Installed config bytes differ")
    for name, key in (("pyproject.toml", "pyprojectSha256"), ("uv.lock", "lockSha256")):
        _require(
            _sha(_read(REPO / "worker-python" / name)) == inputs["worker"][key],
            "Runtime dependency source differs",
        )
    marker = _json(app / "qualification-runtime.json")
    pointer = _json(app / "runtime/current-runtime.json")
    _require(
        marker["report"] == contract["runtime"]["workerReport"]["path"]
        and marker["status"] == "passed"
        and marker["confirmedWorkerExit"] is True
        and pointer["pythonExecutable"]
        == report["pythonExecutable"]
        == contract["runtime"]["pythonExecutable"]
        and pointer["runtimeId"] == marker["runtimeId"] == report["runtimeId"],
        "Active runtime pointer differs",
    )
    return {
        "workerRoot": str(worker),
        "workerFiles": workers,
        "configFiles": configurations,
        "marker": marker,
        "pointer": pointer,
        "scope": (
            "Declared source/config/runtime companions; bytecode cache and "
            "other package internals not requalified"
        ),
    }


def _run(contract: dict[str, Any], contract_path: Path, contract_sha: str) -> dict[str, Any]:
    started = time.monotonic()
    _require(
        Path(sys.executable).resolve() == Path(contract["runtime"]["pythonExecutable"]).resolve(),
        "Wrong runtime interpreter",
    )
    fence = _runtime_fence(contract)
    try:
        inference: Any = importlib.import_module("imagegen_worker.inference")
        protocol: Any = importlib.import_module("imagegen_worker.protocol")
        _require(
            Path(inference.__file__).resolve() == Path(fence["workerRoot"]) / "inference.py",
            "Wrong production owner import",
        )
        runtime = inference.qualify_ml_runtime()
        torch: Any = runtime.torch
        _, definitions = _source(
            Path(contract["source"]["root"]), contract["source"]["manifestSha256"]
        )
        request_doc = json.loads(_pinned(contract["input"]["request"]))
        handoff = json.loads(_pinned(contract["input"]["handoff"]))
        request = copy.deepcopy(request_doc["request"])
        job = request["job"]
        _require(
            job["bbox"] == {"height": 1024, "width": 1024, "x": -13, "y": 5}
            and job["prompts"] == {"positive": PROMPT, "negative": ""}
            and job["checkpoint"]["sha256"] == MODEL_SHA
            and handoff["authoredDocument"]["regionalGuidance"] == []
            and handoff["recipe"]["regions"] == [],
            "Historical ordinary Main input differs",
        )
        embeddings: Any = job.get("embeddings") or {}
        _require(
            job["sampling"]["seed"] == 123
            and job["sampling"]["steps"] == 30
            and job["sampling"]["scheduler"] == "euler"
            and job["sampling"]["cfgScale"] == 5
            and job["sampling"].get("cfgRescale", 0) == 0
            and job["sampling"]["noiseProfile"]
            == {
                "schemaVersion": 1,
                "baseSchedule": "sdxl-scaled-linear-v1",
                "rescaleBetasZeroSnr": False,
                "timestepSpacing": "leading",
            }
            and job["vaePrecision"] == "FP16"
            and not job.get("loras")
            and not job.get("vae")
            and not embeddings.get("positive")
            and not embeddings.get("negative"),
            "Historical resource/sampling policy differs",
        )
        payload = RUN / "payloads/native"
        payload.mkdir(mode=0o700)
        (RUN / "payloads/tensors").mkdir(mode=0o700)
        target = _pinned(contract["input"]["target"])
        _require(
            _sha(target) == job["target"]["sha256"] and len(target) == job["target"]["byteSize"],
            "Historical target differs",
        )
        (payload / "target.png").write_bytes(target)
        job["target"]["path"] = str(payload / "target.png")
        job["output"] = {
            "pngPath": str(payload / "never-published.png"),
            "stagingRoot": str(payload),
        }
        command = protocol.parse_request(request)
        _require(
            isinstance(command, protocol.GenerateIllustriousTxt2ImgCommand),
            "Wrong production command",
        )
        report: dict[str, Any] = {
            "schema": "ordinary-invoke-conditioning-result-v1",
            "status": "RUNNING",
            "scope": (
                "Current Invoke operator source on common pinned runtime; "
                "direct installed library calls, not worker RPC/full-stack/visual acceptance"
            ),
            "modelLoads": 0,
            "encoderForwards": 0,
            "tensors": {},
            "contractSha256": contract_sha,
            "sourceManifestSha256": contract["source"]["manifestSha256"],
            "runtimeFence": fence,
        }
        ours_calls: list[dict[str, Any]] = []
        source_calls: list[dict[str, Any]] = []
        try:
            with _denied_evaluation(runtime) as denied:
                report["deniedEvaluationCounters"] = denied
                report["modelLoads"] = 1
                pipeline, embedding_inputs = inference.load_illustrious_pipeline(
                    command,
                    config_dir=Path(contract["runtime"]["configDir"]),
                    runtime=runtime,
                    mode="txt2img",
                )
                _require(
                    not pipeline.text_encoder.training and not pipeline.text_encoder_2.training,
                    "Encoders must already be eval",
                )
                capture: Any = importlib.import_module("transformers.utils.output_capturing")
                for model in (pipeline.text_encoder, pipeline.text_encoder_2):
                    capture.maybe_install_capturing_hooks(getattr(model, "text_model", model))
                report["librarySetup"] = (
                    "Transformers lazy capture hooks installed before baseline; no warmup forward. "
                    "Tokenizer BPE cache may populate."
                )
                before = _model_state(pipeline)
                numpy: Any = importlib.import_module("numpy")
                numpy_rng = copy.deepcopy(numpy.random.get_state())
                tokenizer_before = _tokenizer_state(pipeline)
                rng = (
                    torch.get_rng_state().clone(),
                    [value.clone() for value in torch.cuda.get_rng_state_all()],
                    random.getstate(),
                )
                with _capture_encoders(pipeline) as ours_calls:
                    ours = inference.prepare_illustrious_conditioning(
                        command, pipeline, runtime, embedding_inputs
                    )
                with (
                    _reference(definitions, torch, full=True) as source,
                    _capture_encoders(pipeline) as source_calls,
                ):
                    context = _context_for_models(pipeline, torch)
                    invocation = _configured(source)
                    invocation.clip = SimpleNamespace(
                        text_encoder="clip1", tokenizer="tokenizer1", loras=[], skipped_layers=0
                    )
                    invocation.clip2 = SimpleNamespace(
                        text_encoder="clip2", tokenizer="tokenizer2", loras=[], skipped_layers=0
                    )
                    invocation.invoke(context)
                    invocation.prompt = invocation.style = ""
                    invocation.invoke(context)
                    positive, negative = [value.conditionings[0] for value in context.saved]
                    positive.to(device=torch.device("cuda"), dtype=torch.float16)
                    negative.to(device=torch.device("cuda"), dtype=torch.float16)
                    fields = {
                        "positive": (ours.positive, positive.embeds),
                        "negative": (ours.negative, negative.embeds),
                        "positivePooled": (ours.positive_pooled, positive.pooled_embeds),
                        "negativePooled": (ours.negative_pooled, negative.pooled_embeds),
                    }
                    for name, pair in fields.items():
                        for lane, tensor in zip(("ours", "source"), pair, strict=True):
                            report["tensors"][f"{lane}-{name}"] = _retained_tensor(
                                f"{lane}-{name}", tensor
                            )
                    report["encoderForwards"] = len(ours_calls) + len(source_calls)
                    report["encoderCallsByLane"] = {
                        "ours": len(ours_calls),
                        "source": len(source_calls),
                    }
                    _require(
                        len(ours_calls) == len(source_calls) == 3,
                        "Exactly three CLIP forwards per lane required",
                    )
                    report["encoderCalls"] = {}
                    for lane, calls in (("ours", ours_calls), ("source", source_calls)):
                        metadata_rows: list[dict[str, Any]] = []
                        for index, row in enumerate(calls):
                            roles: dict[str, str] = {}
                            for key in (
                                "inputIds",
                                "attentionMask",
                                "penultimate",
                                "projectedPool",
                            ):
                                if row[key] is not None:
                                    name = f"{lane}-call{index}-{key}"
                                    report["tensors"][name] = _retained_tensor(name, row[key])
                                    roles[key] = name
                            metadata_rows.append(
                                {
                                    "encoder": row["encoder"],
                                    "hiddenStates": row["hiddenStates"],
                                    "tensors": roles,
                                }
                            )
                        report["encoderCalls"][lane] = metadata_rows
                    for index, (left, right) in enumerate(
                        zip(ours_calls, source_calls, strict=True)
                    ):
                        _require(
                            left["encoder"] == right["encoder"]
                            and left["hiddenStates"] == right["hiddenStates"],
                            "Encoder call order/flags differ",
                        )
                        for key in ("inputIds", "attentionMask", "penultimate", "projectedPool"):
                            _require(
                                (left[key] is None) == (right[key] is None),
                                f"Encoder presence differs: {key}",
                            )
                            if left[key] is not None:
                                _equal_tensor(left[key], right[key], f"call{index}-{key}", torch)
                    for name, (left, right) in fields.items():
                        _equal_tensor(left, right, name, torch)
                    _require(
                        ours.positive_length == ours.negative_length == 77
                        and torch.count_nonzero(ours.negative)
                        == torch.count_nonzero(ours.negative_pooled)
                        == 0,
                        "Exact empty negative differs",
                    )
                    native_embeds = pipeline.encode_prompt(
                        prompt=None,
                        device=torch.device("cuda"),
                        num_images_per_prompt=1,
                        do_classifier_free_guidance=True,
                        prompt_embeds=ours.positive,
                        negative_prompt_embeds=ours.negative,
                        pooled_prompt_embeds=ours.positive_pooled,
                        negative_pooled_prompt_embeds=ours.negative_pooled,
                    )
                    for name, native, source_tensor in zip(
                        ("positive", "negative", "positivePooled", "negativePooled"),
                        native_embeds,
                        (
                            positive.embeds,
                            negative.embeds,
                            positive.pooled_embeds,
                            negative.pooled_embeds,
                        ),
                        strict=True,
                    ):
                        _equal_tensor(native, source_tensor, "nativePreprocessing-" + name, torch)
                    report["finalFrameScope"] = (
                        "Real Diffusers encode_prompt with supplied tensors and _get_add_time_ids; "
                        "prospective CFG assembly only, no actual UNet consumption"
                    )
                    native_time_ids = pipeline._get_add_time_ids(
                        (1024, 1024),
                        (0, 0),
                        (1024, 1024),
                        dtype=ours.positive.dtype,
                        text_encoder_projection_dim=pipeline.text_encoder_2.config.projection_dim,
                    ).to("cuda")
                    _equal_tensor(native_time_ids, positive.add_time_ids, "positiveTimeIds", torch)
                    _equal_tensor(native_time_ids, negative.add_time_ids, "negativeTimeIds", torch)
                    frames = {
                        "ours-CfgEmbeds": torch.cat((ours.negative, ours.positive)),
                        "source-CfgEmbeds": torch.cat((negative.embeds, positive.embeds)),
                        "ours-CfgPool": torch.cat((ours.negative_pooled, ours.positive_pooled)),
                        "source-CfgPool": torch.cat(
                            (negative.pooled_embeds, positive.pooled_embeds)
                        ),
                        "ours-TimeIds": torch.cat((native_time_ids, native_time_ids)),
                        "source-TimeIds": torch.cat((negative.add_time_ids, positive.add_time_ids)),
                    }
                    for key, tensor in frames.items():
                        report["tensors"][key] = _retained_tensor(key, tensor)
                    for name in ("CfgEmbeds", "CfgPool", "TimeIds"):
                        _equal_tensor(frames[f"ours-{name}"], frames[f"source-{name}"], name, torch)
                _require(
                    len(ours_calls) == len(source_calls) == 3,
                    "Native preprocessing unexpectedly encoded text",
                )
                _require(
                    _model_state(pipeline) == before,
                    "Measured model/parameter/hook/processor state changed",
                )
                _require(
                    _tokenizer_state(pipeline) == tokenizer_before,
                    "Measured tokenizer configuration/vocab changed",
                )
                _require(
                    torch.equal(torch.get_rng_state(), rng[0])
                    and all(
                        torch.equal(a, b)
                        for a, b in zip(torch.cuda.get_rng_state_all(), rng[1], strict=True)
                    )
                    and random.getstate() == rng[2]
                    and numpy.random.get_state()[0] == numpy_rng[0]
                    and numpy.array_equal(numpy.random.get_state()[1], numpy_rng[1])
                    and numpy.random.get_state()[2:] == numpy_rng[2:],
                    "Measured RNG state changed",
                )
                report["preservation"] = {
                    "parameterIdentityStorageVersionAndStreamingValueSha": True,
                    "moduleIdentityTrainingForwardHookSlots": True,
                    "attentionProcessorIdentity": True,
                    "tokenizerVocabSpecialAndConfig": True,
                    "cpuCudaPythonNumpyRng": True,
                    "bufferIdentityStorageVersionAndStreamingValueSha": True,
                    "excluded": "Tokenizer BPE cache population and unmeasured object graph",
                }
                _require(
                    all(value == 0 for value in denied.values()),
                    "Forbidden trained evaluation occurred",
                )
                _require(not command.output_path.exists(), "A PNG was unexpectedly published")
                _contract(contract_path, contract_sha)
                report["status"] = "PASS"
        except BaseException as error:
            report["status"] = "RED"
            report["error"] = {"type": type(error).__name__, "message": str(error)}
            raise
        finally:
            report["encoderForwards"] = len(ours_calls) + len(source_calls)
            report["elapsedSeconds"] = time.monotonic() - started
            _write(RUN / "conditioning-result.json", report)
        return report
    finally:
        _require(_runtime_fence(contract) == fence, "Installed runtime fence changed")


def _verify(contract: dict[str, Any], contract_sha: str) -> dict[str, Any]:
    report = _json(RUN / "conditioning-result.json")
    _require(
        report["status"] == "PASS"
        and report["contractSha256"] == contract_sha
        and report["modelLoads"] == 1
        and report["encoderForwards"] == 6
        and all(value == 0 for value in report["deniedEvaluationCounters"].values()),
        "Complete original result required",
    )
    total = 0
    for descriptor in report["tensors"].values():
        path = Path(descriptor["path"])
        _require(path.is_relative_to(RUN / "payloads/tensors"), "Tensor role escaped")
        data = _read(path)
        _require(
            len(data) == descriptor["byteSize"] and _sha(data) == descriptor["sha256"],
            "Retained tensor bytes differ",
        )
        total += len(data)
    _require(total <= 16 * 1024**2, "Consumed tensor retention budget exceeded")
    _source(Path(contract["source"]["root"]), contract["source"]["manifestSha256"])
    return {
        "status": "PASS",
        "tensorFiles": len(report["tensors"]),
        "tensorBytes": total,
        "newModelLoads": 0,
        "scope": "Retained bytes/source only, not a new numerical execution",
    }


class ManifestGuards(unittest.TestCase):
    def _fixture(self, root: Path) -> dict[str, Any]:
        files: dict[str, Any] = {}
        definitions: dict[str, Any] = {}
        with _tools() as helper:
            for name, selections in SOURCE_SELECTIONS.items():
                classes: dict[str, list[str]] = {}
                text = ""
                for qualified in selections:
                    if "." in qualified:
                        owner, method = qualified.split(".")
                        classes.setdefault(owner, []).append(method)
                    else:
                        text += (
                            f"class {qualified}:\n    pass\n\n"
                            if qualified[0].isupper()
                            else f"def {qualified}():\n    return None\n\n"
                        )
                for owner, methods in classes.items():
                    text += (
                        f"class {owner}:\n"
                        + "".join(
                            f"    def {method}(self):\n        return None\n" for method in methods
                        )
                        + "\n"
                    )
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text)
                binary = path.read_bytes()
                files[name] = {"bytes": len(binary), "sha256": _sha(binary)}
                tree = ast.parse(binary)
                definitions[name] = {
                    selection: helper._ast_sha(helper._definition(tree, selection))
                    for selection in selections
                }
        return {
            "schema": "invoke-ordinary-conditioning-source-v1",
            "revision": INVOKE_REVISION,
            "files": files,
            "definitions": definitions,
        }

    def _case(self, fault: str | None) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self._fixture(root)
            first = next(iter(SOURCE_SELECTIONS))
            if fault == "revision":
                manifest["revision"] = "0" * 40
            if fault == "ast":
                manifest["definitions"][first][SOURCE_SELECTIONS[first][0]] = "0" * 64
            if fault == "path":
                manifest["files"]["../escape.py"] = {"bytes": 0, "sha256": "0" * 64}
            path = root / SOURCE_MANIFEST
            path.write_text(json.dumps(manifest))
            digest = _sha(path.read_bytes())
            if fault == "manifest":
                digest = "0" * 64
            if fault == "file":
                (root / first).write_text("changed\n")
            if fault is None:
                actual, _ = _source(root, digest)
                self.assertEqual(actual, manifest)
            else:
                with self.assertRaises((AssertionError, ValueError)):
                    _source(root, digest)

    def test_positive_bounded_source_manifest(self) -> None:
        self._case(None)

    def test_manifest_pin_refusal(self) -> None:
        self._case("manifest")

    def test_revision_refusal(self) -> None:
        self._case("revision")

    def test_changed_file_refusal(self) -> None:
        self._case("file")

    def test_changed_ast_refusal(self) -> None:
        self._case("ast")

    def test_unsafe_member_refusal(self) -> None:
        self._case("path")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--contract-sha256", required=True)
    parser.add_argument("--mode", choices=("small", "run", "verify"), required=True)
    args = parser.parse_args()
    contract = _contract(args.contract, args.contract_sha256)
    if args.mode == "small":
        result = _small(contract)
        _write(RUN / "source-small-result.json", result)
    elif args.mode == "verify":
        result = _verify(contract, args.contract_sha256)
    else:
        result = _run(contract, args.contract, args.contract_sha256)
    print(
        json.dumps(
            {key: value for key, value in result.items() if key != "tensors"}, ensure_ascii=False
        )
    )


if __name__ == "__main__":
    main()
