"""Independent signed IMG/normal-OUT conditioning and prepared native handoff.

Read-only bounded companion to completed installed UI jobs, never another image
job. The existing TXT oracle remains TXT-only. Its independent exact snapshots,
native TI loading/Compel reference and branch matrix are reused here; expected
tensors never come from the worker loader, aliases, observed handoff or pixels.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib
import importlib.util
import json
import os
import sys
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


@lru_cache(maxsize=1)
def reference_oracle() -> Any:
    path = Path(__file__).with_name("noobai-embedding-polarity-oracle.py")
    spec = importlib.util.spec_from_file_location("igs_embedding_image_reference", path)
    require(
        spec is not None and spec.loader is not None,
        "Independent reference module available",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ImageHandoffObserved(Exception):
    """Only checked production image handoff may stop this non-denoising probe."""


def observe_image_handoff(
    command: Any,
    pipeline: Any,
    actual: Any,
    expected: Any,
    runtime: Any,
    *,
    image: Any,
    keep_mask: Any = None,
) -> dict[str, Any]:
    """Enter actual IMG/OUT runner, inspect native arguments and clear state.

    The sentinel occurs before native VAE/scheduler/UNet execution. OUT's real
    validated runner still creates its owned copied-mask state before this boundary.
    Separate CPU tests execute actual tiny denoising; completed UI jobs provide the
    trained pixels and durable Add/Save evidence, which this probe does not replace.
    """
    subject = importlib.import_module("imagegen_worker.inference")
    masked = importlib.import_module("imagegen_worker.sdxl_outpaint")
    torch = runtime.torch
    require(
        image.mode == "RGB" and image.size == (command.width, command.height),
        "Prepared image has captured RGB dimensions",
    )
    outpaint = keep_mask is not None
    require(
        getattr(pipeline, "_igs_outpaint_state", None) is None,
        "No preexisting outpaint call",
    )
    image_before = image.tobytes()
    mask_before = keep_mask.tobytes() if outpaint else None
    pipeline_class = type(pipeline)
    original = pipeline_class.__call__
    generator = torch.Generator(device="cpu").manual_seed(command.seed)
    generator_before = generator.get_state().clone()
    observations = 0
    flags: dict[str, Any] = {}
    progress: list[tuple[int, int]] = []

    def observed(self: Any, **kwargs: Any) -> Any:
        nonlocal observations
        require(self is pipeline, "Exact original production pipeline")
        observations += 1
        require(observations == 1, "Only one native image handoff")
        for argument, field, flag in (
            ("prompt_embeds", "positive", "hiddenPositiveMatches"),
            ("negative_prompt_embeds", "negative", "hiddenNegativeMatches"),
            ("pooled_prompt_embeds", "positive_pooled", "pooledPositiveMatches"),
            (
                "negative_pooled_prompt_embeds",
                "negative_pooled",
                "pooledNegativeMatches",
            ),
        ):
            value, reference = kwargs[argument], getattr(expected, field)
            require(
                value.shape == reference.shape
                and value.dtype == reference.dtype
                and value.device == reference.device
                and bool(torch.isfinite(value).all())
                and bool(torch.isfinite(reference).all())
                and torch.equal(value, reference),
                f"Embedding image polarity handoff: {argument} is routed incorrectly.",
            )
            flags[flag] = True
        require(
            "width" not in kwargs and "height" not in kwargs,
            "Native image mode derives size from image, rather than TXT arguments",
        )
        supplied = kwargs["image"]
        require(
            supplied.mode == image.mode
            and supplied.size == image.size
            and supplied.tobytes() == image_before,
            "Exact prepared image reaches native call",
        )
        require(
            kwargs["strength"] == command.denoising_strength,
            "Exact captured denoising strength reaches native call",
        )
        require(
            kwargs["generator"] is generator
            and command.cfg_scale > 1
            and kwargs["guidance_scale"] == command.cfg_scale
            and kwargs["guidance_rescale"] == command.cfg_rescale
            and kwargs["num_inference_steps"] == command.steps
            and kwargs["num_images_per_prompt"] == 1,
            "Captured sampling and original frozen generator reach native call",
        )
        state = getattr(self, "_igs_outpaint_state", None)
        if outpaint:
            require(
                state is not None
                and state.keep_mask is not keep_mask
                and state.keep_mask.mode == "L"
                and state.keep_mask.size == keep_mask.size
                and state.keep_mask.tobytes() == mask_before
                and state.original is None
                and state.timesteps is None
                and state.completed == 0,
                "Actual OUT runner owns exact copied mask before native denoising",
            )
            require(
                kwargs["callback_on_step_end_tensor_inputs"] == ["latents"],
                "OUT native call requests actual latent callback",
            )
        else:
            require(
                state is None and kwargs["callback_on_step_end_tensor_inputs"] == [],
                "Opaque IMG handoff has no OUT state/latent callback",
            )
        raise ImageHandoffObserved()

    pipeline_class.__call__ = observed
    try:
        arguments = {
            "width": command.width,
            "height": command.height,
            "steps": command.steps,
            "cfg_scale": command.cfg_scale,
            "cfg_rescale": command.cfg_rescale,
            "generator": generator,
            "torch": torch,
            "image": image,
            "denoising_strength": command.denoising_strength,
            "on_progress": lambda step, total: progress.append((step, total)),
        }
        try:
            if outpaint:
                masked.run_sdxl_outpaint_pipeline(
                    pipeline, actual, keep_mask=keep_mask, **arguments
                )
            else:
                subject.run_sdxl_pipeline(pipeline, actual, **arguments)
        except ImageHandoffObserved:
            require(observations == 1, "Checked image sentinel reached")
        else:
            raise AssertionError(
                "Native image handoff did not reach its checked sentinel."
            )
    finally:
        pipeline_class.__call__ = original
    require(pipeline_class.__call__ is original, "Original native call restored")
    require(
        getattr(pipeline, "_igs_outpaint_state", None) is None,
        "OUT state cleared on sentinel",
    )
    require(
        torch.equal(generator.get_state(), generator_before) and not progress,
        "No noise draw, denoising progress or extra completion",
    )
    require(
        image.tobytes() == image_before
        and (not outpaint or keep_mask.tobytes() == mask_before),
        "Prepared RGB and source keep mask remain immutable",
    )
    return {
        **flags,
        "observations": observations,
        "generatorStateUnchanged": True,
        "methodRestored": True,
        "imageMatches": True,
        "strengthMatches": True,
        "outpaint": outpaint,
        "maskMatches": outpaint,
        "outpaintStateCleared": True,
        "extraDenoisingSteps": 0,
    }


def inspect_image_assignment(
    command: Any,
    pipeline: Any,
    runtime: Any,
    *,
    namespace: str,
    image: Any,
    keep_mask: Any = None,
) -> tuple[dict[str, Any], Any]:
    subject = importlib.import_module("imagegen_worker.inference")
    reference = reference_oracle()
    with runtime.torch.inference_mode():
        actual = subject.build_sdxl_conditioning(command, pipeline, runtime)
        expected = reference.build_reference_conditioning(
            command, pipeline, runtime, namespace=namespace
        )
    matches = reference.assert_conditioning_matches(actual, expected, runtime.torch)
    handoff = observe_image_handoff(
        command, pipeline, actual, expected, runtime, image=image, keep_mask=keep_mask
    )
    return {**matches, "handoff": handoff}, actual


def main(value: dict[str, Any]) -> dict[str, Any]:
    # The reused reference uses assertions: never silently disable its invariants.
    require(
        sys.flags.optimize == 0, "Independent reference requires assertions enabled"
    )
    require(
        set(value)
        == {
            "schemaVersion",
            "mode",
            "workerRootPath",
            "workerSourceFiles",
            "configDir",
            "sources",
            "cases",
        },
        "Exact image oracle DTO",
    )
    require(
        value["schemaVersion"] == 1 and value["mode"] in ("img2img", "outpaint"),
        "Versioned finite image mode",
    )
    reference = reference_oracle()
    worker_root = Path(value["workerRootPath"])
    reference.verify_worker_sources(worker_root, value["workerSourceFiles"])
    sources = value["sources"]
    expected_keys = {
        "checkpoint",
        "vae",
        "lora",
        "embeddingTrained",
        "embeddingControl",
        "targets",
    }
    if value["mode"] == "outpaint":
        expected_keys.add("lama")
    require(
        set(sources) == expected_keys and len(sources["targets"]) == 2,
        "Exact checkpoint/component/target and optional LaMa source pins",
    )
    require(
        sources["embeddingTrained"]["sha256"]
        == "91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36"
        and sources["embeddingControl"]["sha256"]
        == "b736cd9c1f9ee07795c5917825baa95ae14bac6383bdddff5530dfefa4bece0d"
        and sources["embeddingTrained"]["byteSize"] == 49736
        and sources["embeddingControl"]["byteSize"] == 49552,
        "Existing exact trained/zero dual-CLIP sources",
    )
    require(
        sources["vae"]["sha256"]
        == "f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7"
        and sources["lora"]["sha256"]
        == "c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9",
        "Existing trained external VAE and ordinary LoRA",
    )
    flat_sources = {key: source for key, source in sources.items() if key != "targets"}
    flat_sources.update(
        {f"target-{index}": source for index, source in enumerate(sources["targets"])}
    )
    before_files = {
        key: reference.verify_descriptor(source) for key, source in flat_sources.items()
    }
    cases = value["cases"]
    require(
        len(cases) == 2
        and [case["choice"] for case in cases] == ["positive-zero", "negative-zero"]
        and len({case["requestId"] for case in cases}) == 2,
        "Actual captured signed pair has two distinct queue correlation IDs",
    )
    native_type = "generate-illustrious-" + value["mode"]
    for case in cases:
        require(
            set(case) == {"choice", "requestId", "type", "job"}
            and case["type"] == native_type,
            "Captured exact IMG/OUT command type",
        )
    subject = importlib.import_module("imagegen_worker.inference")
    protocol = importlib.import_module("imagegen_worker.protocol")
    for name in (
        "inference",
        "inference_embeddings",
        "protocol",
        "sdxl_outpaint",
        "outpaint_worker_assets",
    ):
        module = importlib.import_module(f"imagegen_worker.{name}")
        require(
            Path(module.__file__).resolve().parent == worker_root,
            "Actual installed module: " + name,
        )
    require(subject.INFERENCE_WORKER_VERSION == "0.14.0", "Qualified worker version")
    commands = [
        protocol.parse_request(
            {
                "type": case["type"],
                "protocolVersion": "1",
                "requestId": case["requestId"],
                "job": case["job"],
            }
        )
        for case in cases
    ]
    expected_class = (
        protocol.GenerateIllustriousImg2ImgCommand
        if value["mode"] == "img2img"
        else protocol.GenerateIllustriousOutpaintCommand
    )
    for index, command in enumerate(commands):
        require(
            type(command) is expected_class
            and command.width == command.height == 256
            and command.steps == 3
            and command.seed == 0
            and command.cfg_scale == 5
            and command.cfg_rescale == 0
            and command.vae_precision == "FP32"
            and command.vae is not None
            and command.denoising_strength == 0.5
            and command.scheduler
            == ("euler_a" if command.prediction_type == "epsilon" else "euler")
            and command.prediction_type in ("epsilon", "v_prediction")
            and command.noise_profile is not None
            and command.noise_profile.schema_version == 1
            and command.noise_profile.base_schedule == "sdxl-scaled-linear-v1"
            and command.noise_profile.timestep_spacing == "leading"
            and command.noise_profile.rescale_betas_zero_snr
            is (command.prediction_type == "v_prediction")
            and len(command.loras) == 1
            and command.loras[0].weight == -0.5,
            "Captured finite objective/image recipe",
        )
        for key, path, digest, byte_size in (
            (
                "checkpoint",
                command.checkpoint_path,
                command.checkpoint_sha256,
                sources["checkpoint"]["byteSize"],
            ),
            ("vae", command.vae.path, command.vae.sha256, command.vae.byte_size),
            (
                "lora",
                command.loras[0].path,
                command.loras[0].sha256,
                command.loras[0].byte_size,
            ),
        ):
            require(
                sources[key]
                == {"path": str(path), "sha256": digest, "byteSize": byte_size},
                "Actual captured resource source: " + key,
            )
        require(
            sources["targets"][index]
            == {
                "path": str(command.target_path),
                "sha256": command.target_sha256,
                "byteSize": command.target_byte_size,
            },
            "Actual captured target content/rehydrated ownership pin",
        )
        require(
            len(command.positive_embeddings) == len(command.negative_embeddings) == 1
            and command.positive_embeddings[0].token
            == command.negative_embeddings[0].token
            == "<illustriousphoto>",
            "One exact literal per signed side",
        )
        if value["mode"] == "outpaint":
            resource = command.infill_resource
            require(
                sources["lama"]
                == {
                    "path": str(resource.path),
                    "sha256": resource.sha256,
                    "byteSize": resource.byte_size,
                },
                "Actual shared LaMa content pin",
            )
        require(
            not os.path.lexists(command.output_path),
            "Unused probe output; oracle never publishes",
        )
    first, second = commands
    checkpoints = {
        "epsilon": "ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1",
        "v_prediction": "edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d",
    }
    require(
        first.prediction_type in checkpoints
        and first.prediction_type == second.prediction_type
        and sources["checkpoint"]["sha256"] == checkpoints[first.prediction_type],
        "Exact existing EPS/V trained checkpoint",
    )
    trained, zero = first.negative_embeddings[0], first.positive_embeddings[0]
    for key, entry in (("embeddingTrained", trained), ("embeddingControl", zero)):
        require(
            sources[key]
            == {
                "path": str(entry.path),
                "sha256": entry.sha256,
                "byteSize": entry.byte_size,
            },
            "Captured actual signed embedding source: " + key,
        )
    require(
        second.positive_embeddings == (trained,)
        and second.negative_embeddings == (zero,),
        "Actual signed resource permutation",
    )
    left = replace(
        first,
        request_id="matched",
        target_path=second.target_path,
        staging_root=second.staging_root,
        output_path=second.output_path,
        positive_embeddings=second.positive_embeddings,
        negative_embeddings=second.negative_embeddings,
    )
    require(
        left == replace(second, request_id="matched"),
        "Captured commands differ only in exact signed permutation and local output ownership",
    )
    inputs, masks, preparation = [], [], []
    assets = importlib.import_module("imagegen_worker.outpaint_worker_assets")
    for command in commands:
        if value["mode"] == "outpaint":
            alpha, image = assets.prepare_worker_outpaint(command)
            masks.append(alpha.latent_keep_mask)
            preparation.append(
                {
                    "targetSha256": command.target_sha256,
                    "rawKeepMaskSha256": command.conditioning.keep_mask_sha256,
                    "latentKeepMaskSha256": hashlib.sha256(
                        alpha.latent_keep_mask.tobytes()
                    ).hexdigest(),
                }
            )
        else:
            image = subject.validate_generation_assets(command)
            masks.append(None)
            preparation.append({"targetSha256": command.target_sha256})
        require(
            image is not None and image.mode == "RGB" and image.size == (256, 256),
            "Actual production image preparation complete",
        )
        inputs.append(image)
        preparation[-1]["preparedRgbSha256"] = hashlib.sha256(
            image.tobytes()
        ).hexdigest()
    require(
        inputs[0].tobytes() == inputs[1].tobytes(),
        "Matched signed pair retains identical prepared RGB",
    )
    if value["mode"] == "outpaint":
        require(
            masks[0].tobytes() == masks[1].tobytes(),
            "Matched signed pair retains identical latent keep mask",
        )
    config = importlib.import_module(
        "imagegen_worker.inference_config"
    ).verify_pinned_config(value["configDir"])
    require(
        config == Path(sys.prefix) / "resources/sdxl-config",
        "Actual packaged pinned config",
    )
    runtime = subject.qualify_ml_runtime()
    torch = runtime.torch
    torch.set_num_threads(1)
    vae_loader = importlib.import_module("imagegen_worker.inference_external_vae")
    lora_loader = importlib.import_module("imagegen_worker.inference_lora")
    masked = importlib.import_module("imagegen_worker.sdxl_outpaint")
    pipeline_class = (
        subject.img2img_pipeline_class(runtime.diffusers, torch)
        if value["mode"] == "img2img"
        else masked.outpaint_pipeline_class(runtime.diffusers, torch)
    )
    vae = vae_loader.load_generation_vae(first.vae, config, runtime.diffusers, torch)
    pipeline = pipeline_class.from_single_file(
        str(first.checkpoint_path),
        config=str(config),
        local_files_only=True,
        torch_dtype=torch.float16,
        vae=vae,
    )
    pipeline.scheduler = subject.select_inference_scheduler(first, pipeline, runtime)
    require(
        type(pipeline.scheduler)
        is (
            runtime.diffusers.EulerAncestralDiscreteScheduler
            if first.prediction_type == "epsilon"
            else runtime.diffusers.EulerDiscreteScheduler
        )
        and pipeline.scheduler.config.prediction_type == first.prediction_type
        and pipeline.scheduler.config.timestep_spacing == "leading"
        and pipeline.scheduler.config.rescale_betas_zero_snr
        is (first.prediction_type == "v_prediction"),
        "Actual native Euler/objective/exact noise-profile handoff",
    )
    pipeline.scheduler.set_timesteps(3, device="cpu")
    full_grid = pipeline.scheduler.timesteps.tolist()
    selected_grid, effective_steps = pipeline.get_timesteps(3, 0.5, "cpu")
    require(
        full_grid == [667.0, 334.0, 1.0]
        and selected_grid.tolist() == [334.0, 1.0]
        and effective_steps == 2,
        "Frozen native leading three-step grid and exact strength0.5 image cutoff",
    )
    lora_loader.load_generation_loras(pipeline, first.loras, torch)
    subject.configure_vae_precision(pipeline, first.vae_precision, torch)
    pipeline = pipeline.to("cuda")
    pipeline.set_progress_bar_config(disable=True)
    states = (
        reference.expected_embedding_state(trained, torch),
        reference.expected_embedding_state(zero, torch),
    )
    for key in ("clip_l", "clip_g"):
        require(
            states[0][key].shape
            == states[1][key].shape
            == (12, 768 if key == "clip_l" else 1280)
            and states[0][key].dtype == states[1][key].dtype
            and bool(torch.count_nonzero(states[0][key]))
            and not bool(torch.count_nonzero(states[1][key])),
            "Independent exact trained/zero vector matrix",
        )
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
    observed, values = [], {}
    for index, (assignment, command, choice) in enumerate(
        zip(reference.ASSIGNMENTS, variants, choices, strict=True)
    ):
        prepared_index = 1 if choice == "negative-zero" else 0
        evidence, actual = inspect_image_assignment(
            command,
            pipeline,
            runtime,
            namespace=f"igs_reference_image_assignment_{index}",
            image=inputs[prepared_index],
            keep_mask=masks[prepared_index],
        )
        values[assignment] = actual
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
    isolation = reference.assert_branch_isolation(values, torch)
    for key, source in flat_sources.items():
        require(
            reference.verify_descriptor(source) == before_files[key],
            "Original source identity immutable: " + key,
        )
    for command in commands:
        require(
            not os.path.lexists(command.output_path),
            "No oracle output file or publication",
        )
    reference.verify_worker_sources(worker_root, value["workerSourceFiles"])
    return {
        "schemaVersion": 1,
        "status": "passed",
        "mode": value["mode"],
        "observedCommands": 2,
        "nativeAssignments": 4,
        "workerRootPath": str(worker_root),
        "workerSourceFiles": value["workerSourceFiles"],
        "checkpoint": sources["checkpoint"],
        "configDir": str(config),
        "cases": observed,
        "branchIsolation": isolation,
        "preparation": preparation,
        "sampling": {
            "objective": first.prediction_type,
            "scheduler": first.scheduler,
            "strength": 0.5,
            "timestepSpacing": "leading",
            "rescaleBetasZeroSnr": first.prediction_type == "v_prediction",
            "fullTimesteps": full_grid,
            "selectedTimesteps": selected_grid.tolist(),
            "observedSteps": effective_steps,
        },
        "extraDenoisingSteps": 0,
        "scope": "Captured signed frozen DTO/content with separately rehydrated local ownership; actual IMG/LaMa-OUT "
        "preparation and independent four-tensor native handoff, zero extra image jobs/completions/publication.",
    }


if __name__ == "__main__":
    raw = sys.stdin.buffer.read(256 * 1024 + 1)
    require(len(raw) <= 256 * 1024, "Bounded oracle DTO")
    with contextlib.redirect_stdout(sys.stderr):
        result = main(json.loads(raw))
    print(json.dumps(result, separators=(",", ":")))
