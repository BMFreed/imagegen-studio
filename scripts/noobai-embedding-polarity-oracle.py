"""Independent native dual-CLIP oracle; direct assignments are not generated images.

The CLI uses the installed interpreter/package and actual captured TXT jobs. Expected
conditioning uses only independently read tensors, native TI loading and native Compel.
Importing this module performs no ML work; mechanical tests use small random native layers.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib
import json
import os
import re
import stat
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ReferenceConditioning:
    positive: Any
    negative: Any
    positive_pooled: Any
    negative_pooled: Any
    positive_length: int
    negative_length: int


class HandoffObserved(Exception):
    """Only a checked native call may raise this sentinel."""


FIELDS = (
    ("positive", "hiddenPositiveMatches"),
    ("negative", "hiddenNegativeMatches"),
    ("positive_pooled", "pooledPositiveMatches"),
    ("negative_pooled", "pooledNegativeMatches"),
)
ASSIGNMENTS = ("trained/trained", "trained/zero", "zero/trained", "zero/zero")


def exact_snapshot(entry: Any, *, limit: int | None = None) -> bytes:
    """Independent no-follow snapshot; does not call a worker resource helper."""
    target = Path(entry.path)
    assert target.is_absolute() and target == target.resolve()
    descriptor = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        assert stat.S_ISREG(before.st_mode) and before.st_size == entry.byte_size
        assert limit is None or before.st_size <= limit
        raw = stream.read(before.st_size + 1)
        after = os.fstat(stream.fileno())
    assert len(raw) == before.st_size
    assert (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    ) == (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    )
    assert hashlib.sha256(raw).hexdigest() == entry.sha256
    return raw


def expected_embedding_state(entry: Any, torch: Any) -> dict[str, Any]:
    safetensors = importlib.import_module("safetensors.torch")
    state = safetensors.load(exact_snapshot(entry, limit=1024 * 1024))
    assert set(state) == {"clip_l", "clip_g"}
    counts = []
    for name, width in (("clip_l", 768), ("clip_g", 1280)):
        tensor = state[name]
        assert tensor.ndim == 2 and tensor.shape[1] == width and 0 < tensor.shape[0] <= 75
        assert tensor.dtype in (torch.float16, torch.bfloat16, torch.float32)
        assert bool(torch.isfinite(tensor).all())
        counts.append(tensor.shape[0])
    assert counts[0] == counts[1]
    return state


def reference_manager(pads: dict[int, list[int]]) -> Any:
    provider = importlib.import_module("compel.embeddings_provider")

    class IndependentManager(provider.BaseTextualInversionManager):
        def expand_textual_inversion_token_ids_if_necessary(self, ids: list[int]) -> list[int]:
            result = []
            for token in ids:
                result.append(token)
                result.extend(pads.get(token, []))
            return result

    return IndependentManager()


def build_reference_conditioning(
    command: Any, pipeline: Any, runtime: Any, *, namespace: str
) -> ReferenceConditioning:
    """One unweighted exact literal per sign; expected routing never uses worker aliases."""
    torch, compel = runtime.torch, runtime.compel
    assert re.fullmatch(r"igs_reference_[a-z0-9_]+", namespace)
    signed = (
        (command.positive_prompt, command.positive_embeddings),
        (command.negative_prompt, command.negative_embeddings),
    )
    states, aliases, prompts = [], [], []
    for index, (text, entries) in enumerate(signed):
        assert len(entries) == 1
        entry = entries[0]
        assert text.count(entry.token) == 1
        plain = text.replace(entry.token, "")
        assert not re.search(r"[()\[\]{}<>]|\.(?:swap|and|add|blend)\s*\(", plain)
        assert plain.strip()
        state = expected_embedding_state(entry, torch)
        alias = f"{namespace}_{index}"
        names = [alias] + [f"{alias}_{vector}" for vector in range(1, state["clip_l"].shape[0])]
        for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2):
            assert all(name not in tokenizer.get_vocab() for name in names)
        assert all(name not in text.lower() for name in names)
        states.append(state)
        aliases.append(alias)
        prompts.append(text.replace(entry.token, alias))
    builders = []
    for key, tokenizer, encoder, pooled in (
        ("clip_l", pipeline.tokenizer, pipeline.text_encoder, False),
        ("clip_g", pipeline.tokenizer_2, pipeline.text_encoder_2, True),
    ):
        assert not encoder.training and tokenizer.model_max_length == 77
        tensors = [state[key].to(dtype=encoder.dtype) for state in states]
        pipeline.load_textual_inversion(
            tensors,
            token=aliases,
            tokenizer=tokenizer,
            text_encoder=encoder,
            local_files_only=True,
        )
        pads = {}
        selected_ids = []
        for alias, tensor in zip(aliases, tensors, strict=True):
            ids = [
                tokenizer.convert_tokens_to_ids(alias if vector == 0 else f"{alias}_{vector}")
                for vector in range(tensor.shape[0])
            ]
            assert len(set(ids)) == len(ids)
            loaded = encoder.get_input_embeddings().weight[ids]
            assert torch.equal(loaded, tensor.to(device=loaded.device))
            pads[ids[0]] = ids[1:]
            selected_ids.append(ids)
        builder = compel.Compel(
            tokenizer=tokenizer,
            text_encoder=encoder,
            returned_embeddings_type=(
                compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED
            ),
            truncate_long_prompts=False,
            split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
            requires_pooled=pooled,
            textual_inversion_manager=reference_manager(pads),
        )
        for prompt, ids in zip(prompts, selected_ids, strict=True):
            expanded = builder.conditioning_provider.get_token_ids(
                [prompt], padding="max_length", truncation_override=True
            )[0]
            assert len(expanded) == 77
            start = expanded.index(ids[0]) if ids[0] in expanded else -1
            assert start >= 0 and expanded[start : start + len(ids)] == ids, (
                "Reference expansion did not preserve the selected signed vector sequence."
            )
            assert all(expanded.count(token) == 1 for token in ids)
            # The pinned EOS=2 CLIP compatibility branch pools the largest token ID.
            # With one binding it must select that binding's last vector, regardless
            # of the deliberately disjoint worker/reference alias vocabulary.
            if encoder.config.eos_token_id == 2:
                assert max(expanded) == ids[-1]
                assert expanded.index(max(expanded)) == start + len(ids) - 1
        builders.append(builder)
    values = []
    with torch.inference_mode():
        for prompt in prompts:
            first = builders[0](prompt)
            second, pooled = builders[1](prompt)
            assert first.shape == (1, 77, 768) and second.shape == (1, 77, 1280)
            assert pooled.shape == (1, 1280)
            values.append((torch.cat((first, second), dim=-1), pooled))
    return ReferenceConditioning(values[0][0], values[1][0], values[0][1], values[1][1], 77, 77)


def assert_conditioning_matches(actual: Any, expected: Any, torch: Any) -> dict[str, bool]:
    result = {}
    assert actual.positive_length == expected.positive_length == 77
    assert actual.negative_length == expected.negative_length == 77
    for field, flag in FIELDS:
        left, right = getattr(actual, field), getattr(expected, field)
        assert (
            left.shape == right.shape and left.dtype == right.dtype and left.device == right.device
        )
        assert bool(torch.isfinite(left).all()) and bool(torch.isfinite(right).all())
        label = {
            "positive": "positive embedding conditioning",
            "negative": "negative embedding conditioning",
            "positive_pooled": "positive pooled embedding conditioning",
            "negative_pooled": "negative pooled embedding conditioning",
        }[field]
        assert torch.equal(left, right), (
            f"Installed {label} differs from independent native reference."
        )
        result[flag] = True
    return result


def observe_native_handoff(
    command: Any, pipeline: Any, actual: Any, expected: Any, runtime: Any, runner: Any
) -> dict[str, Any]:
    """Observe the original worker conditioning, not reference input, at the real class call."""
    torch = runtime.torch
    pipeline_class = type(pipeline)
    original = pipeline_class.__call__
    generator = torch.Generator(device="cpu").manual_seed(command.seed)
    generator_before = generator.get_state().clone()
    observations = 0
    result: dict[str, Any] = {}

    def observed(self: Any, **kwargs: Any) -> Any:
        nonlocal observations
        assert self is pipeline
        observations += 1
        assert observations == 1
        for key, field, flag in (
            ("prompt_embeds", "positive", "hiddenPositiveMatches"),
            ("negative_prompt_embeds", "negative", "hiddenNegativeMatches"),
            ("pooled_prompt_embeds", "positive_pooled", "pooledPositiveMatches"),
            ("negative_pooled_prompt_embeds", "negative_pooled", "pooledNegativeMatches"),
        ):
            value, reference = kwargs[key], getattr(expected, field)
            assert value.dtype == reference.dtype and value.device == reference.device
            assert bool(torch.isfinite(value).all()) and bool(torch.isfinite(reference).all())
            assert torch.equal(value, reference), (
                f"Embedding polarity handoff: {key} is routed incorrectly."
            )
            result[flag] = True
        assert kwargs["generator"] is generator
        assert kwargs["width"] == command.width and kwargs["height"] == command.height
        assert kwargs["guidance_scale"] == command.cfg_scale and command.cfg_scale > 1
        assert kwargs["num_inference_steps"] == command.steps
        assert kwargs["guidance_rescale"] == command.cfg_rescale
        raise HandoffObserved()

    pipeline_class.__call__ = observed
    try:
        try:
            runner(
                pipeline,
                actual,
                width=command.width,
                height=command.height,
                steps=command.steps,
                cfg_scale=command.cfg_scale,
                cfg_rescale=command.cfg_rescale,
                generator=generator,
                torch=torch,
            )
        except HandoffObserved:
            assert observations == 1
        else:
            raise AssertionError("Native handoff did not reach its dedicated observed sentinel.")
    finally:
        pipeline_class.__call__ = original
    assert pipeline_class.__call__ is original
    assert torch.equal(generator.get_state(), generator_before)
    return {
        **result,
        "observations": observations,
        "generatorStateUnchanged": True,
        "methodRestored": True,
    }


def inspect_assignment(
    command: Any, pipeline: Any, runtime: Any, *, namespace: str
) -> tuple[dict[str, Any], Any]:
    subject = importlib.import_module("imagegen_worker.inference")
    with runtime.torch.inference_mode():
        actual = subject.build_sdxl_conditioning(command, pipeline, runtime)
        expected = build_reference_conditioning(command, pipeline, runtime, namespace=namespace)
    matches = assert_conditioning_matches(actual, expected, runtime.torch)
    handoff = observe_native_handoff(
        command, pipeline, actual, expected, runtime, subject.run_sdxl_pipeline
    )
    return {**matches, "handoff": handoff}, actual


def assert_branch_isolation(values: dict[str, Any], torch: Any) -> dict[str, Any]:
    assert set(values) == set(ASSIGNMENTS)
    result = {}
    for field, label in (
        ("positive", "positiveHidden"),
        ("negative", "negativeHidden"),
        ("positive_pooled", "positivePooled"),
        ("negative_pooled", "negativePooled"),
    ):
        tt, tz, zt, zz = (getattr(values[name], field) for name in ASSIGNMENTS)
        if field.startswith("positive"):
            unchanged = torch.equal(tt, tz) and torch.equal(zt, zz)
            changed = not torch.equal(tt, zt) and not torch.equal(tz, zz)
        else:
            unchanged = torch.equal(tt, zt) and torch.equal(tz, zz)
            changed = not torch.equal(tt, tz) and not torch.equal(zt, zz)
        assert unchanged, f"Embedding polarity isolation: opposite sign changed {field}."
        assert changed, (
            f"Embedding polarity isolation: own selected resource did not change {field}."
        )
        result[label] = {"oppositeUnchanged": True, "ownResourceChanges": True}
    return result


def file_identity(target: Path) -> tuple[int, ...]:
    entry = target.lstat()
    assert target.is_absolute() and target == target.resolve() and stat.S_ISREG(entry.st_mode)
    return (
        entry.st_dev,
        entry.st_ino,
        entry.st_mode,
        entry.st_size,
        entry.st_mtime_ns,
        entry.st_ctime_ns,
    )


def verify_descriptor(value: dict[str, Any]) -> tuple[int, ...]:
    assert set(value) == {"path", "sha256", "byteSize"}
    assert type(value["byteSize"]) is int and value["byteSize"] > 0
    assert re.fullmatch(r"[a-f0-9]{64}", value["sha256"])
    target = Path(value["path"])
    before = file_identity(target)
    assert before[3] == value["byteSize"]
    digest = hashlib.sha256()
    descriptor = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    assert digest.hexdigest() == value["sha256"] and file_identity(target) == before
    return before


def verify_worker_sources(root: Path, expected: dict[str, Any]) -> None:
    assert root.is_absolute() and root == root.resolve() and root.is_dir()
    assert len(expected) == 43
    actual = {}
    for target in root.rglob("*"):
        if "__pycache__" in target.parts or target.suffix == ".pyc":
            continue
        entry = target.lstat()
        assert not stat.S_ISLNK(entry.st_mode)
        if stat.S_ISDIR(entry.st_mode):
            continue
        assert stat.S_ISREG(entry.st_mode)
        relative = target.relative_to(root).as_posix()
        raw = target.read_bytes()
        actual[relative] = {"byteSize": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    assert actual == expected


def main(value: dict[str, Any]) -> dict[str, Any]:
    assert set(value) == {
        "schemaVersion",
        "workerRootPath",
        "workerSourceFiles",
        "configDir",
        "sources",
        "cases",
    }
    assert value["schemaVersion"] == 1
    worker_root = Path(value["workerRootPath"])
    verify_worker_sources(worker_root, value["workerSourceFiles"])
    sources = value["sources"]
    assert set(sources) == {"checkpoint", "vae", "lora", "embeddingTrained", "embeddingControl"}
    assert sources["embeddingTrained"]["sha256"] == (
        "91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36"
    )
    assert sources["embeddingControl"]["sha256"] == (
        "b736cd9c1f9ee07795c5917825baa95ae14bac6383bdddff5530dfefa4bece0d"
    )
    assert sources["embeddingTrained"]["byteSize"] == 49736
    assert sources["embeddingControl"]["byteSize"] == 49552
    assert sources["vae"]["sha256"] == (
        "f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7"
    )
    assert sources["lora"]["sha256"] == (
        "c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9"
    )
    before_files = {key: verify_descriptor(source) for key, source in sources.items()}
    cases = value["cases"]
    assert [case["choice"] for case in cases] == ["positive-zero", "negative-zero"]
    assert len({case["requestId"] for case in cases}) == 2
    for case in cases:
        assert set(case) == {"choice", "requestId", "job"}
    subject = importlib.import_module("imagegen_worker.inference")
    protocol = importlib.import_module("imagegen_worker.protocol")
    for name in ("inference", "inference_embeddings", "protocol"):
        module = importlib.import_module(f"imagegen_worker.{name}")
        assert Path(module.__file__).resolve().parent == worker_root
    assert subject.INFERENCE_WORKER_VERSION == "0.14.0"
    commands = [
        protocol.parse_request(
            {
                "type": "generate-illustrious-txt2img",
                "protocolVersion": "1",
                "requestId": case["requestId"],
                "job": case["job"],
            }
        )
        for case in cases
    ]
    for command in commands:
        assert type(command) is protocol.GenerateIllustriousTxt2ImgCommand
        assert command.width == command.height == 256 and command.steps == 3
        assert command.seed == 0 and command.cfg_scale == 5 and command.cfg_rescale == 0
        assert command.vae_precision == "FP32" and command.vae is not None
        assert len(command.loras) == 1 and command.loras[0].weight == -0.5
        for key, path, sha256, byte_size in (
            (
                "checkpoint",
                command.checkpoint_path,
                command.checkpoint_sha256,
                sources["checkpoint"]["byteSize"],
            ),
            ("vae", command.vae.path, command.vae.sha256, command.vae.byte_size),
            ("lora", command.loras[0].path, command.loras[0].sha256, command.loras[0].byte_size),
        ):
            assert sources[key] == {"path": str(path), "sha256": sha256, "byteSize": byte_size}
        assert len(command.positive_embeddings) == len(command.negative_embeddings) == 1
        assert (
            command.positive_embeddings[0].token
            == command.negative_embeddings[0].token
            == "<illustriousphoto>"
        )
    first, second = commands
    expected_checkpoint = {
        "epsilon": "ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1",
        "v_prediction": "edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d",
    }
    assert sources["checkpoint"]["sha256"] == expected_checkpoint[first.prediction_type]
    assert first.prediction_type == second.prediction_type
    trained, zero = first.negative_embeddings[0], first.positive_embeddings[0]
    for key, entry in (("embeddingTrained", trained), ("embeddingControl", zero)):
        assert sources[key] == {
            "path": str(entry.path),
            "sha256": entry.sha256,
            "byteSize": entry.byte_size,
        }
    assert second.positive_embeddings == (trained,) and second.negative_embeddings == (zero,)
    assert first.positive_prompt == second.positive_prompt
    assert first.negative_prompt == second.negative_prompt
    left = replace(
        first,
        request_id="matched",
        target_path=second.target_path,
        staging_root=second.staging_root,
        output_path=second.output_path,
        positive_embeddings=second.positive_embeddings,
        negative_embeddings=second.negative_embeddings,
    )
    right = replace(second, request_id="matched")
    assert left == right, (
        "The actual frozen commands must differ only in the embedding permutation "
        "and output ownership."
    )
    config = importlib.import_module("imagegen_worker.inference_config").verify_pinned_config(
        value["configDir"]
    )
    assert config == Path(sys.prefix) / "resources" / "sdxl-config"
    runtime = subject.qualify_ml_runtime()
    torch = runtime.torch
    torch.set_num_threads(1)
    vae_loader = importlib.import_module("imagegen_worker.inference_external_vae")
    lora_loader = importlib.import_module("imagegen_worker.inference_lora")
    vae = vae_loader.load_generation_vae(first.vae, config, runtime.diffusers, torch)
    pipeline = runtime.diffusers.StableDiffusionXLPipeline.from_single_file(
        str(first.checkpoint_path),
        config=str(config),
        local_files_only=True,
        torch_dtype=torch.float16,
        vae=vae,
    )
    lora_loader.load_generation_loras(pipeline, first.loras, torch)
    subject.configure_vae_precision(pipeline, first.vae_precision, torch)
    pipeline = pipeline.to("cuda")
    pipeline.set_progress_bar_config(disable=True)
    states = (expected_embedding_state(trained, torch), expected_embedding_state(zero, torch))
    for key in ("clip_l", "clip_g"):
        assert (
            states[0][key].shape == states[1][key].shape == (12, 768 if key == "clip_l" else 1280)
        )
        assert states[0][key].dtype == states[1][key].dtype
        assert bool(torch.count_nonzero(states[0][key]))
        assert not bool(torch.count_nonzero(states[1][key]))
    variants = (
        replace(
            first,
            request_id="derived-trained",
            positive_embeddings=(trained,),
            negative_embeddings=(trained,),
        ),
        second,
        first,
        replace(
            first,
            request_id="derived-zero",
            positive_embeddings=(zero,),
            negative_embeddings=(zero,),
        ),
    )
    choices = ("derived-trained", "negative-zero", "positive-zero", "derived-zero")
    observed, conditioning = [], {}
    for index, (assignment, command, choice) in enumerate(
        zip(ASSIGNMENTS, variants, choices, strict=True)
    ):
        evidence, actual = inspect_assignment(
            command, pipeline, runtime, namespace=f"igs_reference_assignment_{index}"
        )
        conditioning[assignment] = actual
        observed.append(
            {
                "assignment": assignment,
                "derived": index in (0, 3),
                "requestId": command.request_id,
                "choice": choice,
                "positiveSha256": command.positive_embeddings[0].sha256,
                "negativeSha256": command.negative_embeddings[0].sha256,
                **evidence,
            }
        )
    isolation = assert_branch_isolation(conditioning, torch)
    for key, source in sources.items():
        assert verify_descriptor(source) == before_files[key]
    verify_worker_sources(worker_root, value["workerSourceFiles"])
    return {
        "schemaVersion": 1,
        "status": "passed",
        "observedCommands": 2,
        "nativeAssignments": 4,
        "workerRootPath": str(worker_root),
        "workerSourceFiles": value["workerSourceFiles"],
        "checkpoint": sources["checkpoint"],
        "configDir": str(config),
        "cases": observed,
        "branchIsolation": isolation,
        "scope": (
            "Native directional conditioning and observed handoff; "
            "zero extra denoising/completions."
        ),
    }


if __name__ == "__main__":
    raw = sys.stdin.buffer.read(256 * 1024 + 1)
    assert len(raw) <= 256 * 1024
    request = json.loads(raw)
    with contextlib.redirect_stdout(sys.stderr):
        result = main(request)
    print(json.dumps(result, separators=(",", ":")))
