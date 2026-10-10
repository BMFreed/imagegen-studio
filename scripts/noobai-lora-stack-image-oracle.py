"""Independent trained two-LoRA algebra at the real prepared IMG/OUT handoff.

Raw safetensors and the unmodified native graph determine the numerical oracle.
Production loading, conditioning and IMG/OUT preparation remain the subjects.
The native image sentinel runs no denoising and publishes no additional job.
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

CHOICES = ("ab", "ba", "b-zero", "b-disabled")
FIRST_SHA = "c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9"
SECOND_SHA = "90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca"


@lru_cache(maxsize=3)
def reference_module(name: str) -> Any:
    path = Path(__file__).with_name(name + ".py")
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_") + "_image", path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def stack_reference() -> Any:
    return reference_module("noobai-lora-stack-oracle")


def conditioning_reference() -> Any:
    return reference_module("noobai-embedding-polarity-oracle")


def ordinary_conditioning(command: Any, pipeline: Any, runtime: Any) -> Any:
    """Native Compel configured independently of the production builder."""
    assert command.positive_embeddings == command.negative_embeddings == ()
    compel, torch = runtime.compel, runtime.torch
    builders = [
        compel.Compel(
            tokenizer=tokenizer,
            text_encoder=encoder,
            returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
            truncate_long_prompts=False,
            split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
            requires_pooled=pooled,
        )
        for tokenizer, encoder, pooled in (
            (pipeline.tokenizer, pipeline.text_encoder, False),
            (pipeline.tokenizer_2, pipeline.text_encoder_2, True),
        )
    ]
    pairs = []
    with torch.inference_mode():
        for prompt in (command.positive_prompt, command.negative_prompt):
            hidden_l = builders[0](prompt)
            hidden_g, pooled = builders[1](prompt)
            pairs.append((torch.cat((hidden_l, hidden_g), dim=-1), pooled))
    return conditioning_reference().ReferenceConditioning(
        pairs[0][0], pairs[1][0], pairs[0][1], pairs[1][1], 77, 77
    )


class ImageHandoffObserved(Exception):
    """Reached only after the subject's native arguments and adapter algebra match."""


def observe_stack_image_handoff(
    command: Any,
    pipeline: Any,
    actual: Any,
    expected: Any,
    runtime: Any,
    references: dict[str, Any],
    baseline: dict[Any, Any],
    *,
    image: Any,
    keep_mask: Any = None,
) -> dict[str, Any]:
    subject = importlib.import_module("imagegen_worker.inference")
    masked = importlib.import_module("imagegen_worker.sdxl_outpaint")
    reference, torch = stack_reference(), runtime.torch
    assert image.mode == "RGB" and image.size == (command.width, command.height)
    assert getattr(pipeline, "_igs_outpaint_state", None) is None
    image_before = image.tobytes()
    mask_before = None if keep_mask is None else keep_mask.tobytes()
    original = type(pipeline).__call__
    generator = torch.Generator(device="cpu").manual_seed(command.seed)
    generator_before = generator.get_state().clone()
    observations, progress = [], []

    def observed(self: Any, **kwargs: Any) -> Any:
        assert self is pipeline and not observations
        observations.append(1)
        for argument, field in (
            ("prompt_embeds", "positive"),
            ("negative_prompt_embeds", "negative"),
            ("pooled_prompt_embeds", "positive_pooled"),
            ("negative_pooled_prompt_embeds", "negative_pooled"),
        ):
            value, wanted = kwargs[argument], getattr(expected, field)
            assert (
                value.shape == wanted.shape
                and value.dtype == wanted.dtype
                and value.device == wanted.device
                and torch.equal(value, wanted)
                and bool(torch.isfinite(value).all())
            ), "Multiple-LoRA native image conditioning: " + argument
        assert "width" not in kwargs and "height" not in kwargs
        supplied = kwargs["image"]
        assert (
            supplied.mode == image.mode
            and supplied.size == image.size
            and supplied.tobytes() == image_before
        )
        assert kwargs["strength"] == command.denoising_strength
        assert (
            kwargs["generator"] is generator
            and kwargs["guidance_scale"] == command.cfg_scale
            and kwargs["guidance_rescale"] == command.cfg_rescale
            and kwargs["num_inference_steps"] == command.steps
            and kwargs["num_images_per_prompt"] == 1
        )
        state = getattr(self, "_igs_outpaint_state", None)
        if keep_mask is not None:
            assert (
                state is not None
                and state.keep_mask is not keep_mask
                and state.keep_mask.tobytes() == mask_before
                and state.keep_mask.size == keep_mask.size
                and state.keep_mask.mode == "L"
                and state.original is None
                and state.timesteps is None
                and state.completed == 0
                and kwargs["callback_on_step_end_tensor_inputs"] == ["latents"]
            )
        else:
            assert state is None and kwargs["callback_on_step_end_tensor_inputs"] == []
        # The independently reconstructed per-resource algebra is evaluated while
        # the actual native call still owns the exact active stack. These are
        # module-level probes, not a full UNet or a denoising step.
        reference.inspect_loaded_stack(
            pipeline, command.loras, references, baseline, torch
        )
        raise ImageHandoffObserved()

    type(pipeline).__call__ = observed
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
            if keep_mask is None:
                subject.run_sdxl_pipeline(pipeline, actual, **arguments)
            else:
                masked.run_sdxl_outpaint_pipeline(
                    pipeline, actual, keep_mask=keep_mask, **arguments
                )
        except ImageHandoffObserved:
            assert len(observations) == 1
        else:
            raise AssertionError(
                "Checked multiple-LoRA image sentinel was not reached."
            )
    finally:
        type(pipeline).__call__ = original
    assert type(pipeline).__call__ is original
    assert getattr(pipeline, "_igs_outpaint_state", None) is None
    assert torch.equal(generator.get_state(), generator_before) and not progress
    assert image.tobytes() == image_before
    assert keep_mask is None or keep_mask.tobytes() == mask_before
    return {
        "observations": 1,
        "orderedOwnershipMatches": True,
        "finiteClosedFormMatches": True,
        "conditioningMatches": True,
        "imageMatches": True,
        "strengthMatches": True,
        "outpaint": keep_mask is not None,
        "maskMatches": keep_mask is not None,
        "outpaintStateCleared": True,
        "generatorStateUnchanged": True,
        "methodRestored": True,
        "extraDenoisingSteps": 0,
    }


def references_and_baseline(pipeline: Any, entries: tuple[Any, ...], torch: Any) -> Any:
    reference = stack_reference()
    safetensors = importlib.import_module("safetensors.torch")
    targets = {
        entry.sha256: reference.build_reference_targets(
            pipeline, safetensors.load(reference.exact_snapshot(entry)), torch
        )
        for entry in entries
    }
    identities = sorted(
        {target.identity for items in targets.values() for target in items}
    )
    return targets, reference.baseline_outputs(pipeline, identities, torch)


def main(value: dict[str, Any]) -> dict[str, Any]:
    assert not sys.flags.optimize
    assert set(value) == {
        "schemaVersion",
        "mode",
        "workerRootPath",
        "workerSourceFiles",
        "configDir",
        "sources",
        "cases",
    }
    assert value["schemaVersion"] == 1 and value["mode"] in ("img2img", "outpaint")
    reference = stack_reference()
    worker_root = Path(value["workerRootPath"])
    reference.verify_worker_sources(worker_root, value["workerSourceFiles"])
    sources = value["sources"]
    keys = {"checkpoint", "vae", "loraFirst", "loraSecond", "targets"}
    if value["mode"] == "outpaint":
        keys.add("lama")
    assert set(sources) == keys and len(sources["targets"]) == 4
    assert sources["loraFirst"]["sha256"] == FIRST_SHA
    assert sources["loraFirst"]["byteSize"] == 114437420
    assert sources["loraSecond"]["sha256"] == SECOND_SHA
    assert sources["loraSecond"]["byteSize"] == 171540060
    assert (
        sources["vae"]["sha256"]
        == "f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7"
    )
    assert sources["vae"]["byteSize"] == 167335542
    flat = {key: source for key, source in sources.items() if key != "targets"}
    flat.update(
        {f"target-{index}": source for index, source in enumerate(sources["targets"])}
    )
    before_files = {
        key: reference.verify_descriptor(source) for key, source in flat.items()
    }
    cases = value["cases"]
    assert len(cases) == 4 and tuple(case["choice"] for case in cases) == CHOICES
    assert len({case["requestId"] for case in cases}) == 4
    subject = importlib.import_module("imagegen_worker.inference")
    protocol = importlib.import_module("imagegen_worker.protocol")
    loader = importlib.import_module("imagegen_worker.inference_lora")
    assets = importlib.import_module("imagegen_worker.outpaint_worker_assets")
    config_module = importlib.import_module("imagegen_worker.inference_config")
    masked = importlib.import_module("imagegen_worker.sdxl_outpaint")
    for module in (subject, protocol, loader, assets, config_module, masked):
        assert Path(module.__file__).resolve().parent == worker_root
    assert subject.INFERENCE_WORKER_VERSION == "0.14.0"
    commands = []
    for case in cases:
        assert set(case) == {"choice", "requestId", "type", "job"}
        assert case["type"] == "generate-illustrious-" + value["mode"]
        commands.append(
            protocol.parse_request(
                {
                    "type": case["type"],
                    "protocolVersion": "1",
                    "requestId": case["requestId"],
                    "job": case["job"],
                }
            )
        )
    first, second = commands[0].loras
    assert first.weight == -0.5 and second.weight == 0.75
    expected_stacks = (
        (first, second),
        (second, first),
        (first, replace(second, weight=0)),
        (first,),
    )
    checkpoints = {
        "epsilon": "ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1",
        "v_prediction": "edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d",
    }
    objective = commands[0].prediction_type
    assert (
        objective in checkpoints
        and sources["checkpoint"]["sha256"] == checkpoints[objective]
    )
    expected_class = (
        protocol.GenerateIllustriousImg2ImgCommand
        if value["mode"] == "img2img"
        else protocol.GenerateIllustriousOutpaintCommand
    )
    for index, (command, stack) in enumerate(
        zip(commands, expected_stacks, strict=True)
    ):
        assert (
            type(command) is expected_class
            and command.loras == stack
            and command.prediction_type == objective
            and command.width == command.height == 256
            and command.steps == 3
            and command.seed == 0
            and command.cfg_scale == 5
            and command.cfg_rescale == 0
            and command.denoising_strength == 0.5
            and command.scheduler == ("euler_a" if objective == "epsilon" else "euler")
            and command.vae_precision == "FP32"
            and command.vae is not None
            and command.positive_embeddings == command.negative_embeddings == ()
            and command.noise_profile is not None
            and command.noise_profile.schema_version == 1
            and command.noise_profile.base_schedule == "sdxl-scaled-linear-v1"
            and command.noise_profile.timestep_spacing == "leading"
            and command.noise_profile.rescale_betas_zero_snr
            is (objective == "v_prediction")
        )
        for key, path, digest, size in (
            (
                "checkpoint",
                command.checkpoint_path,
                command.checkpoint_sha256,
                sources["checkpoint"]["byteSize"],
            ),
            ("vae", command.vae.path, command.vae.sha256, command.vae.byte_size),
        ):
            assert sources[key] == {
                "path": str(path),
                "sha256": digest,
                "byteSize": size,
            }
        assert sources["targets"][index] == {
            "path": str(command.target_path),
            "sha256": command.target_sha256,
            "byteSize": command.target_byte_size,
        }
        assert not os.path.lexists(command.output_path)
        if value["mode"] == "outpaint":
            assert sources["lama"] == {
                "path": str(command.infill_resource.path),
                "sha256": command.infill_resource.sha256,
                "byteSize": command.infill_resource.byte_size,
            }
        assert replace(
            command,
            request_id="matched",
            target_path=commands[0].target_path,
            staging_root=commands[0].staging_root,
            output_path=commands[0].output_path,
            loras=commands[0].loras,
        ) == replace(commands[0], request_id="matched")
    for key, entry in (("loraFirst", first), ("loraSecond", second)):
        assert sources[key] == {
            "path": str(entry.path),
            "sha256": entry.sha256,
            "byteSize": entry.byte_size,
        }
    inputs, masks, preparation = [], [], []
    for command in commands:
        if value["mode"] == "outpaint":
            alpha, image = assets.prepare_worker_outpaint(command)
            mask = alpha.latent_keep_mask
            detail = {
                "rawKeepMaskSha256": command.conditioning.keep_mask_sha256,
                "latentKeepMaskSha256": hashlib.sha256(mask.tobytes()).hexdigest(),
            }
        else:
            image, mask, detail = subject.validate_generation_assets(command), None, {}
        assert image is not None and image.mode == "RGB" and image.size == (256, 256)
        inputs.append(image)
        masks.append(mask)
        preparation.append(
            {
                "targetSha256": command.target_sha256,
                "preparedRgbSha256": hashlib.sha256(image.tobytes()).hexdigest(),
                **detail,
            }
        )
    assert all(image.tobytes() == inputs[0].tobytes() for image in inputs)
    assert all(mask is None or mask.tobytes() == masks[0].tobytes() for mask in masks)
    config = config_module.verify_pinned_config(value["configDir"])
    assert config == Path(sys.prefix) / "resources/sdxl-config"
    runtime = subject.qualify_ml_runtime()
    torch = runtime.torch
    torch.set_num_threads(1)
    vae_loader = importlib.import_module("imagegen_worker.inference_external_vae")
    cls = (
        subject.img2img_pipeline_class(runtime.diffusers, torch)
        if value["mode"] == "img2img"
        else masked.outpaint_pipeline_class(runtime.diffusers, torch)
    )
    pipeline = cls.from_single_file(
        str(commands[0].checkpoint_path),
        config=str(config),
        local_files_only=True,
        torch_dtype=torch.float16,
        vae=vae_loader.load_generation_vae(
            commands[0].vae, config, runtime.diffusers, torch
        ),
    )
    for component in (*reference.COMPONENTS, "vae"):
        getattr(pipeline, component).eval().requires_grad_(False)
    pipeline.set_progress_bar_config(disable=True)
    subject.configure_vae_precision(pipeline, commands[0].vae_precision, torch)
    pipeline.scheduler = subject.select_inference_scheduler(
        commands[0], pipeline, runtime
    )
    assert type(pipeline.scheduler) is (
        runtime.diffusers.EulerAncestralDiscreteScheduler
        if objective == "epsilon"
        else runtime.diffusers.EulerDiscreteScheduler
    )
    assert pipeline.scheduler.config.prediction_type == objective
    assert pipeline.scheduler.config.timestep_spacing == "leading"
    assert pipeline.scheduler.config.rescale_betas_zero_snr is (
        objective == "v_prediction"
    )
    pipeline.scheduler.set_timesteps(3, device="cpu")
    full_grid = pipeline.scheduler.timesteps.tolist()
    selected, effective_steps = pipeline.get_timesteps(3, 0.5, "cpu")
    assert (
        full_grid == [667.0, 334.0, 1.0]
        and selected.tolist() == [334.0, 1.0]
        and effective_steps == 2
    )
    loader_evidence = reference.qualify_stack_variants(
        pipeline, (first, second), torch, loader.load_generation_loras
    )
    targets, baseline = references_and_baseline(pipeline, (first, second), torch)
    graph, base = (
        reference.graph_identity(pipeline),
        reference.base_state_digest(pipeline, torch),
    )
    observed = []
    for case, command, image, mask in zip(cases, commands, inputs, masks, strict=True):
        rng = torch.get_rng_state().clone()
        try:
            with torch.random.fork_rng(devices=[]), torch.no_grad():
                loader.load_generation_loras(pipeline, command.loras, torch)
                reference.inspect_loaded_stack(
                    pipeline, command.loras, targets, baseline, torch
                )
                actual = subject.build_sdxl_conditioning(command, pipeline, runtime)
                expected = ordinary_conditioning(command, pipeline, runtime)
                matches = conditioning_reference().assert_conditioning_matches(
                    actual, expected, torch
                )
                handoff = observe_stack_image_handoff(
                    command,
                    pipeline,
                    actual,
                    expected,
                    runtime,
                    targets,
                    baseline,
                    image=image,
                    keep_mask=mask,
                )
        finally:
            pipeline.unload_lora_weights()
            assert (
                pipeline.get_active_adapters() == []
                and pipeline.get_list_adapters() == {}
            )
            assert reference.graph_identity(pipeline) == graph
            assert reference.base_state_digest(pipeline, torch) == base
            restored = reference.baseline_outputs(pipeline, sorted(baseline), torch)
            assert all(torch.equal(restored[key], baseline[key]) for key in baseline)
            assert torch.equal(torch.get_rng_state(), rng)
        observed.append(
            {
                "choice": case["choice"],
                "requestId": command.request_id,
                "orderedSources": [entry.sha256 for entry in command.loras],
                "weights": [entry.weight for entry in command.loras],
                **matches,
                "handoff": handoff,
                "unloadGraphBaseAndProbeRestored": True,
                "globalRngRestored": True,
            }
        )
    assert {
        key: reference.verify_descriptor(source) for key, source in flat.items()
    } == before_files
    config_module.verify_pinned_config(value["configDir"])
    reference.verify_worker_sources(worker_root, value["workerSourceFiles"])
    assert all(not os.path.lexists(command.output_path) for command in commands)
    return {
        "schemaVersion": 1,
        "status": "passed",
        "mode": value["mode"],
        "observedCommands": 4,
        "nativeAssignments": 4,
        "workerRootPath": str(worker_root),
        "workerSourceFiles": value["workerSourceFiles"],
        "configDir": str(config),
        "checkpoint": sources["checkpoint"],
        "loaderEvidence": loader_evidence,
        "cases": observed,
        "preparation": preparation,
        "sampling": {
            "objective": objective,
            "scheduler": commands[0].scheduler,
            "strength": 0.5,
            "timestepSpacing": "leading",
            "rescaleBetasZeroSnr": objective == "v_prediction",
            "fullTimesteps": full_grid,
            "selectedTimesteps": selected.tolist(),
            "observedSteps": effective_steps,
        },
        "originalGraphBaseRngRestored": True,
        "filesAndConfigUnchanged": True,
        "probeDevice": "cpu",
        "pipelineLoadDtype": "torch.float16",
        "extraDenoisingSteps": 0,
        "scope": "Captured image DTOs, actual IMG/LaMa-OUT preparation, independent raw-safetensors per-target algebra and native Compel/image handoff; no extra image job, denoising or publication.",
    }


if __name__ == "__main__":
    bounds = stack_reference().bounded_cli_environment()
    raw = sys.stdin.buffer.read(256 * 1024 + 1)
    assert len(raw) <= 256 * 1024
    with contextlib.redirect_stdout(sys.stderr):
        result = main(json.loads(raw))
    result["resourceBounds"] = bounds
    print(json.dumps(result, separators=(",", ":")))
