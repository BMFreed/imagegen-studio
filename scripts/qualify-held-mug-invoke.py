"""Run pinned legacy Invoke operators on Studio's common runtime for the mug trace."""

from __future__ import annotations

import ast
import hashlib
import inspect
import math
import os
import stat
import sys
from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType, SimpleNamespace

DENOISE = "app/invocations/denoise_latents.py"
SD = "backend/stable_diffusion/"
PIPELINE = SD + "diffusers_pipeline.py"
CONDITIONING = SD + "diffusion/conditioning_data.py"
DIFFUSER = SD + "diffusion/shared_invokeai_diffusion.py"
PREVIEW = SD + "extensions/preview.py"
SOURCE_PATHS = (DENOISE, PIPELINE, CONDITIONING, DIFFUSER, PREVIEW)
TIMESTEPS = tuple(range(595, 0, -33))


def _source(root, relative, pin):
    path = root / relative
    if path.resolve(strict=True) != path:
        raise ValueError(f"Noncanonical Invoke source: {relative}")
    with os.fdopen(
        os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC), "rb"
    ) as f:
        info = os.fstat(f.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= 2 * 1024**2:
            raise ValueError(f"Invalid Invoke source file: {relative}")
        raw = f.read(info.st_size + 1)
    sha256 = hashlib.sha256(raw).hexdigest()
    expected = pin if isinstance(pin, str) else pin["sha256"]
    if (
        len(raw) != info.st_size
        or sha256 != expected
        or (not isinstance(pin, str) and len(raw) != pin["byteSize"])
    ):
        raise ValueError(f"Invoke source pin mismatch: {relative}")
    return ast.parse(raw, filename=str(path)), sha256


def _definition(tree, qualified):
    node = tree
    for name in qualified.split("."):
        (node,) = [
            child
            for child in node.body
            if isinstance(child, (ast.ClassDef, ast.FunctionDef)) and child.name == name
        ]
    return node


def _execute(namespace, definitions, path):
    future = ast.ImportFrom(
        module="__future__", names=[ast.alias(name="annotations")], level=0
    )
    module = ast.Module(body=[future, *definitions], type_ignores=[])
    # Only exact definitions from the five checked installed source files reach compilation.
    exec(compile(ast.fix_missing_locations(module), str(path), "exec"), namespace)  # noqa: S102


def _refuse_attention_change(*args, **kwargs):
    raise RuntimeError(
        "Invoke attempted an attention change outside the admitted lane."
    )


def _ignore_preview(state):
    # No generated preview participates in the held-operator equality.
    return None


def run_invoke_lane(
    *,
    torch,
    diffusers,
    invoke_root,
    source_pins,
    unet,
    scheduler,
    source,
    noise,
    context,
    text_embeds,
    time_ids,
    max_steps=19,
    callback=None,
):
    """Execute original 6.14.3 Euler/SDXL legacy source against held CUDA inputs.

    The shell only supplies the existing UNet, model residency, app settings,
    callbacks and source-pinned operator definitions. Invoke's application,
    model loading, graph preparation and decoder are outside this lane.
    """
    if not __debug__:
        raise RuntimeError("Assertions must be enabled for the qualification.")
    root = Path(invoke_root)
    assert root.is_absolute() and root.resolve(strict=True) == root and root.is_dir()
    assert type(max_steps) is int and 1 <= max_steps <= len(TIMESTEPS)
    assert type(scheduler) is diffusers.EulerDiscreteScheduler
    assert scheduler.order == 1 and scheduler.begin_index is None
    assert scheduler.step_index is None
    config = scheduler.config
    for key, expected in (
        ("num_train_timesteps", 1000),
        ("beta_start", 0.00085),
        ("beta_end", 0.012),
        ("beta_schedule", "scaled_linear"),
        ("prediction_type", "epsilon"),
        ("steps_offset", 1),
        ("timestep_spacing", "leading"),
        ("interpolation_type", "linear"),
        ("final_sigmas_type", "zero"),
        ("rescale_betas_zero_snr", False),
        ("use_karras_sigmas", False),
        ("use_exponential_sigmas", False),
        ("use_beta_sigmas", False),
    ):
        assert config[key] == expected, key
    assert config.trained_betas is None and not config.get("cpu_only", False)

    assert (
        type(unet) is diffusers.UNet2DConditionModel and unet.conv_in.in_channels == 4
    )
    assert (
        not unet.training and unet.device.type == "cuda" and unet.dtype == torch.float16
    )
    assert torch.cuda.get_device_properties(unet.device).major >= 8
    assert not torch.backends.mps.is_available()
    processors = unet.attn_processors
    processor_type = diffusers.models.attention_processor.AttnProcessor2_0
    assert processors and all(
        type(value) is processor_type for value in processors.values()
    )
    for tensor, shape in (
        (source, (1, 4, 64, 64)),
        (noise, (1, 4, 64, 64)),
        (context, (2, 77, 2048)),
        (text_embeds, (2, 1280)),
        (time_ids, (2, 6)),
    ):
        assert tuple(tensor.shape) == shape
        assert tensor.device == unet.device and tensor.dtype == torch.float16
        assert tensor.is_contiguous() and bool(torch.isfinite(tensor).all())

    frozen = SimpleNamespace(attention_type="auto", sequential_guidance=False)
    trees = {}
    files = {}
    for relative in SOURCE_PATHS:
        trees[relative], files[relative] = _source(
            root, relative, source_pins[relative]
        )
    module = ModuleType(f"_igs_held_mug_invoke_{id(trees):x}")
    ns = vars(module)
    ns.update(
        torch=torch,
        math=math,
        inspect=inspect,
        nullcontext=nullcontext,
        dataclass=dataclass,
        ConfigMixin=diffusers.ConfigMixin,
        TCDScheduler=diffusers.TCDScheduler,
        get_config=lambda: frozen,
        is_xformers_available=diffusers.utils.is_xformers_available,
    )
    definitions = {}

    def exact(relative, qualified):
        node = _definition(trees[relative], qualified)
        definitions[f"{relative}:{qualified}"] = hashlib.sha256(
            ast.dump(node, include_attributes=False).encode()
        ).hexdigest()
        return node

    def methods(relative, class_name, names):
        return ast.ClassDef(
            name=class_name,
            bases=[],
            keywords=[],
            body=[exact(relative, f"{class_name}.{name}") for name in names],
            decorator_list=[],
        )

    assert module.__name__ not in sys.modules
    sys.modules[module.__name__] = module
    try:
        plan = (
            (PREVIEW, [exact(PREVIEW, "PipelineIntermediateState")]),
            (
                CONDITIONING,
                [
                    exact(CONDITIONING, "BasicConditioningInfo"),
                    exact(CONDITIONING, "SDXLConditioningInfo"),
                    methods(
                        CONDITIONING, "TextConditioningData", ("__init__", "is_sdxl")
                    ),
                ],
            ),
            (
                DIFFUSER,
                [
                    methods(
                        DIFFUSER,
                        "InvokeAIDiffuserComponent",
                        (
                            "__init__",
                            "do_unet_step",
                            "_concat_conditionings_for_batch",
                            "_apply_standard_conditioning",
                            "_combine",
                        ),
                    )
                ],
            ),
            (
                PIPELINE,
                [
                    exact(PIPELINE, "is_inpainting_model"),
                    methods(
                        PIPELINE,
                        "StableDiffusionGeneratorPipeline",
                        (
                            "_adjust_memory_efficient_attention",
                            "latents_from_embeddings",
                            "step",
                            "_unet_forward",
                        ),
                    ),
                ],
            ),
            (
                DENOISE,
                [methods(DENOISE, "DenoiseLatentsInvocation", ("init_scheduler",))],
            ),
        )
        for relative, selected in plan:
            _execute(ns, selected, root / relative)

        negative = ns["SDXLConditioningInfo"](
            context[:1], text_embeds[:1], time_ids[:1]
        )
        positive = ns["SDXLConditioningInfo"](
            context[1:], text_embeds[1:], time_ids[1:]
        )
        condition = ns["TextConditioningData"](negative, positive, None, None, 5.0, 0.0)
        pipeline = ns["StableDiffusionGeneratorPipeline"]()
        pipeline.scheduler = scheduler
        pipeline.unet = unet
        pipeline.invokeai_diffuser = ns["InvokeAIDiffuserComponent"](
            unet, pipeline._unet_forward
        )
        pipeline._progress_bar_config = {"disable": True}
        pipeline.progress_bar = diffusers.DiffusionPipeline.progress_bar.__get__(
            pipeline
        )
        for name in (
            "enable_xformers_memory_efficient_attention",
            "enable_attention_slicing",
            "disable_attention_slicing",
        ):
            setattr(pipeline, name, _refuse_attention_change)

        timesteps, init_timestep, kwargs = ns[
            "DenoiseLatentsInvocation"
        ].init_scheduler(scheduler, source.device, 30, 0.4, 1.0, 123)
        assert tuple(timesteps.tolist()) == TIMESTEPS and init_timestep.tolist() == [
            595
        ]
        assert set(kwargs) == {"generator"}
        assert kwargs["generator"].initial_seed() == (123 ^ 0xFFFFFFFF)
        assert scheduler.begin_index is None
        selected = timesteps[:max_steps]
        with torch.inference_mode():
            latents = pipeline.latents_from_embeddings(
                latents=source,
                scheduler_step_kwargs=kwargs,
                conditioning_data=condition,
                noise=noise,
                seed=123,
                timesteps=selected,
                init_timestep=init_timestep,
                callback=callback if callback is not None else _ignore_preview,
            )
        assert scheduler.step_index == 11 + max_steps
        assert all(
            unet.attn_processors[key] is value for key, value in processors.items()
        )
        return {
            "latents": latents,
            "timesteps": selected,
            "init_timestep": init_timestep,
            "sourceDefinitions": definitions,
            "sourceFiles": files,
            "attentionPolicy": "original installed Invoke auto policy, unchanged native SDPA on CUDA",
        }
    finally:
        del sys.modules[module.__name__]
