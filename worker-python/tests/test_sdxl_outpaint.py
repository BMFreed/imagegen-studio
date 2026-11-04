"""Real pinned masked SDXL execution, with the external default Invoke oracle."""

from __future__ import annotations

import ast
import hashlib
import importlib.metadata
import os
from collections.abc import Generator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from imagegen_worker import sdxl_outpaint
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import SdxlConditioning, img2img_pipeline_class, run_sdxl_pipeline
from imagegen_worker.sdxl_outpaint import (
    outpaint_pipeline_class,
    run_sdxl_outpaint_pipeline,
)

SCHEDULERS = ("dpmpp_2m", "dpmpp_2m_k", "euler", "euler_a", "dpmpp_sde", "dpmpp_sde_k")


@pytest.fixture
def native() -> Generator[Any]:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    assert importlib.metadata.version("diffusers") == "0.40.0"
    previous = torch.get_num_threads()
    torch.set_num_threads(1)
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(47)
        unet = diffusers.UNet2DConditionModel(
            sample_size=8,
            in_channels=4,
            out_channels=4,
            layers_per_block=1,
            block_out_channels=(8, 16),
            down_block_types=("DownBlock2D", "CrossAttnDownBlock2D"),
            up_block_types=("CrossAttnUpBlock2D", "UpBlock2D"),
            cross_attention_dim=32,
            attention_head_dim=(2, 4),
            addition_embed_type="text_time",
            addition_time_embed_dim=4,
            projection_class_embeddings_input_dim=40,
            norm_num_groups=4,
        )
        vae = diffusers.AutoencoderKL(
            in_channels=3,
            out_channels=3,
            down_block_types=("DownEncoderBlock2D",) * 4,
            up_block_types=("UpDecoderBlock2D",) * 4,
            block_out_channels=(8, 8, 16, 16),
            layers_per_block=1,
            latent_channels=4,
            norm_num_groups=4,
            sample_size=64,
        )
        pipeline = outpaint_pipeline_class(diffusers, torch)(
            vae=vae,
            text_encoder=None,
            text_encoder_2=None,
            tokenizer=None,
            tokenizer_2=None,
            unet=unet,
            scheduler=diffusers.DPMSolverMultistepScheduler(),
            force_zeros_for_empty_prompt=False,
            add_watermarker=False,
        )
        pipeline.set_progress_bar_config(disable=True)
        negative = torch.randn(1, 4, 32)
        negative[:, 2:] = 0
        conditioning = SdxlConditioning(
            positive=torch.randn(1, 4, 32),
            negative=negative,
            positive_pooled=torch.randn(1, 16),
            negative_pooled=torch.randn(1, 16),
            positive_length=4,
            negative_length=2,
        )
        yield SimpleNamespace(
            torch=torch,
            diffusers=diffusers,
            pipeline=pipeline,
            conditioning=conditioning,
            source=Image.new("RGB", (64, 64), (32, 100, 180)),
        )
    torch.set_num_threads(previous)


def _scheduler(native: Any, name: str, *, prediction: str = "epsilon", seed: int = 42) -> None:
    options = {
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "prediction_type": prediction,
    }
    if name == "euler":
        scheduler = native.diffusers.EulerDiscreteScheduler(**options)
    elif name == "euler_a":
        scheduler = native.diffusers.EulerAncestralDiscreteScheduler(**options)
    elif name.startswith("dpmpp_sde"):
        scheduler = native.diffusers.DPMSolverSDEScheduler(
            **options,
            use_karras_sigmas=name.endswith("_k"),
            noise_sampler_seed=seed,
        )
    else:
        scheduler = native.diffusers.DPMSolverMultistepScheduler(
            **options,
            use_karras_sigmas=name.endswith("_k"),
        )
    native.pipeline.scheduler = scheduler


def _mask() -> Image.Image:
    image = Image.new("L", (8, 8), 0)
    image.paste(255, (0, 0, 2, 8))
    image.paste(128, (2, 0, 4, 8))
    return image


def _generate(
    native: Any,
    mask: Image.Image | None,
    *,
    strength: float = 0.75,
    seed: int = 42,
    cfg: float = 5,
    rescale: float = 0,
    progress: Any = None,
    image: Image.Image | None = None,
) -> Any:
    kwargs: dict[str, Any] = {
        "width": 64,
        "height": 64,
        "steps": 4,
        "cfg_scale": cfg,
        "generator": native.torch.Generator(device="cpu").manual_seed(seed),
        "torch": native.torch,
        "image": image if image is not None else native.source,
        "denoising_strength": strength,
        "cfg_rescale": rescale,
        "on_progress": progress,
    }
    if mask is None:
        return run_sdxl_pipeline(native.pipeline, native.conditioning, **kwargs)
    return run_sdxl_outpaint_pipeline(
        native.pipeline, native.conditioning, keep_mask=mask, **kwargs
    )


class _StripAnnotations(ast.NodeTransformer):
    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        node.returns = None
        node.decorator_list = []
        self.generic_visit(node)
        return node

    def visit_arg(self, node: ast.arg) -> ast.arg:
        node.annotation = None
        return node


def _upstream_guidance(torch: Any) -> Any:
    root = Path(
        os.environ.get(
            "IGS_INVOKE_SOURCE_ROOT", str(Path(__file__).resolve().parents[3] / "sources/InvokeAI")
        )
    )
    path = root / "invokeai/backend/stable_diffusion/diffusers_pipeline.py"
    if not path.is_file():
        pytest.skip("External default Invoke guidance oracle requires the pinned source.")
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == (
        "23299704c36e969e0b39ac30c469f6c0587605df58ff62573d1c6d83b7784d24"
    )
    tree = ast.parse(data, filename=str(path))
    original = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "AddsMaskGuidance"
    )
    isolated = ast.ClassDef(
        name="AddsMaskGuidance",
        bases=[],
        keywords=[],
        body=[node for node in original.body if isinstance(node, ast.FunctionDef)],
        decorator_list=[],
        type_params=[],
    )
    module = ast.Module(body=[isolated], type_ignores=[])
    _StripAnnotations().visit(module)
    ast.fix_missing_locations(module)

    def repeat(value: Any, pattern: str, **sizes: int) -> Any:
        # Only framework batch-shape plumbing is substituted. The real external
        # guidance math, threshold, polarity and scheduler call stay untouched.
        if pattern == "b c h w -> (repeat b) c h w":
            return value.repeat(sizes["repeat"], 1, 1, 1)
        assert pattern == "-> batch"
        return value.reshape(1).repeat(sizes["batch"])

    namespace: dict[str, Any] = {"torch": torch, "einops": SimpleNamespace(repeat=repeat)}
    exec(compile(module, str(path), "exec"), namespace)
    return namespace["AddsMaskGuidance"]


@pytest.mark.parametrize("name", SCHEDULERS)
@pytest.mark.parametrize("prediction", ["epsilon", "v_prediction"])
@pytest.mark.parametrize("strength", [0.0, 0.2, 0.75, 1.0])
def test_actual_six_schedulers_both_predictions_match_default_invoke_prestep_oracle(
    native: Any,
    name: str,
    prediction: str,
    strength: float,
) -> None:
    """Production native loop -> actual UNet/scheduler/decoder; no fake denoiser."""
    torch = native.torch
    guidance_class = _upstream_guidance(torch)
    _scheduler(native, name, prediction=prediction)
    observed: dict[str, list[Any]] = {"unet": [], "decoder": [], "scheduler": []}
    handles: list[Any] = []
    original_step = native.pipeline.scheduler.step
    original_noise = native.pipeline.scheduler.add_noise
    previous_output: Any = None
    noise_draws: list[Any] = []

    def record_noise(original: Any, noise: Any, timestep: Any) -> Any:
        noise_draws.append(noise.detach().clone())
        return original_noise(original, noise, timestep)

    def record_step(model_output: Any, timestep: Any, latents: Any, **kwargs: Any) -> Any:
        nonlocal previous_output
        assert torch.equal(latents, observed["scheduler"][-1])
        result = original_step(model_output, timestep, latents, **kwargs)
        previous_output = result[0].detach().clone()
        return result

    def observe_unet(_module: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        state = native.pipeline._igs_outpaint_state
        timestep = args[1]
        guidance = guidance_class()
        # Independent source method consumes production-captured original/noise,
        # then scales through the actual solver, just as Invoke PRE_STEP does.
        keep = torch.frombuffer(bytearray(_mask().tobytes()), dtype=torch.uint8)
        guidance.mask = (1 - keep.reshape(1, 1, 8, 8).to(torch.float32) / 255).to(
            state.original.dtype
        )
        guidance.mask_latents = state.original
        guidance.noise = state.noise
        guidance.scheduler = native.pipeline.scheduler
        guidance.is_gradient_mask = True
        raw = (
            original_noise(state.original, state.noise, timestep.reshape(1))
            if previous_output is None
            else previous_output
        )
        expected = guidance.apply_mask(raw, timestep)
        observed["scheduler"].append(expected.detach().clone())
        expected = native.pipeline.scheduler.scale_model_input(expected, timestep)
        assert torch.equal(args[0], torch.cat((expected, expected)))
        assert kwargs["encoder_attention_mask"].shape == (2, 4)
        observed["unet"].append(args[0].detach().clone())

    def observe_decoder(_module: Any, args: tuple[Any, ...]) -> None:
        state = native.pipeline._igs_outpaint_state
        original = state.original / native.pipeline.vae.config.scaling_factor
        assert torch.equal(args[0][:, :, :, :2], original[:, :, :, :2])
        observed["decoder"].append(args[0].detach().clone())

    native.pipeline.scheduler.add_noise = record_noise
    native.pipeline.scheduler.step = record_step

    # A regular forward hook observes the final kwargs after production's
    # independent attention-padding pre-hook.
    def after_unet(
        module: Any, args: tuple[Any, ...], kwargs: dict[str, Any], _output: Any
    ) -> None:
        observe_unet(module, args, kwargs)

    handles.append(native.pipeline.unet.register_forward_hook(after_unet, with_kwargs=True))
    handles.append(native.pipeline.vae.post_quant_conv.register_forward_pre_hook(observe_decoder))
    progress: list[tuple[int, int]] = []

    def report(step: int, total: int) -> None:
        progress.append((step, total))

    try:
        result = _generate(
            native,
            _mask(),
            strength=strength,
            progress=report,
        )
    finally:
        for handle in handles:
            handle.remove()
    assert result.images[0].size == (64, 64)
    full = native.pipeline.scheduler.timesteps
    skipped = int((full[:: native.pipeline.scheduler.order] >= round(1000 * strength)).sum())
    expected_steps = len(full[skipped * native.pipeline.scheduler.order :])
    assert len(observed["unet"]) == expected_steps
    assert len(observed["decoder"]) == 1
    assert progress == [(index + 1, expected_steps) for index in range(expected_steps)]
    assert native.pipeline._igs_outpaint_state is None
    assert len(native.pipeline.unet._forward_pre_hooks) == 0
    if expected_steps:
        expected_noise = torch.randn(
            (1, 4, 8, 8),
            generator=torch.Generator(device="cpu").manual_seed(42),
        )
        assert noise_draws and all(torch.equal(value, expected_noise) for value in noise_draws)
    else:
        assert not noise_draws


@pytest.mark.parametrize("name", SCHEDULERS)
def test_black_neutral_white_restored_and_replay_without_progress(native: Any, name: str) -> None:
    _scheduler(native, name)
    ordinary = _generate(native, None).images[0].tobytes()
    _scheduler(native, name)
    black = _generate(native, Image.new("L", (8, 8), 0)).images[0].tobytes()
    assert ordinary == black
    _scheduler(native, name)
    zero = _generate(native, None, strength=0).images[0].tobytes()
    _scheduler(native, name)
    white = _generate(native, Image.new("L", (8, 8), 255)).images[0].tobytes()
    assert white == zero and white != black
    _scheduler(native, name)
    mixed = _generate(native, _mask()).images[0].tobytes()
    _scheduler(native, name)
    replay = _generate(native, _mask()).images[0].tobytes()
    assert mixed == replay and mixed != black and mixed != white


def test_cfg_rescale_seed_source_and_cfg_one_controls(native: Any) -> None:
    def result(*, cfg: float = 5, rescale: float = 0, seed: int = 42, image: Any = None) -> bytes:
        _scheduler(native, "dpmpp_2m_k", seed=seed)
        return (
            _generate(native, _mask(), cfg=cfg, rescale=rescale, seed=seed, image=image)
            .images[0]
            .tobytes()
        )

    baseline = result()
    assert baseline != result(rescale=0.7)
    assert baseline != result(seed=43)
    assert baseline != result(image=Image.new("RGB", (64, 64), (200, 30, 90)))
    assert result(cfg=1) == result(cfg=1, rescale=0.7)


def test_failure_cancellation_copied_inputs_and_reentrant_refusal_cleanup(native: Any) -> None:
    class Cancelled(RuntimeError):
        pass

    _scheduler(native, "dpmpp_2m")
    baseline = _generate(native, _mask()).images[0].tobytes()
    mask, source = _mask(), native.source.copy()

    def mutate_inputs(step: int, _total: int) -> None:
        if step == 1:
            mask.paste(0, (0, 0, 8, 8))
            source.paste((240, 10, 10), (0, 0, 64, 64))
            with pytest.raises(DerivativeError, match="already active"):
                _generate(native, _mask())

    _scheduler(native, "dpmpp_2m")
    copied = _generate(native, mask, image=source, progress=mutate_inputs).images[0].tobytes()
    assert copied == baseline

    def cancel(_step: int, _total: int) -> None:
        raise Cancelled("cancel native denoising")

    _scheduler(native, "dpmpp_2m")
    with pytest.raises(Cancelled):
        _generate(native, _mask(), progress=cancel)
    assert native.pipeline._igs_outpaint_state is None
    assert len(native.pipeline.unet._forward_pre_hooks) == 0
    _scheduler(native, "dpmpp_2m")
    assert _generate(native, _mask()).images[0].tobytes() == baseline


@pytest.mark.parametrize("bad", ["mode", "size", "image", "strength", "cfg", "steps", "factory"])
def test_invalid_internal_inputs_refuse_before_encoder(native: Any, bad: str) -> None:
    calls: list[bool] = []

    def observe_encoder(_module: Any, _args: Any) -> None:
        calls.append(True)

    handle = native.pipeline.vae.encoder.register_forward_pre_hook(observe_encoder)
    kwargs: dict[str, Any] = {
        "width": 64,
        "height": 64,
        "steps": 4,
        "cfg_scale": 5,
        "generator": native.torch.Generator(device="cpu").manual_seed(42),
        "torch": native.torch,
        "image": native.source,
        "denoising_strength": 0.75,
        "keep_mask": _mask(),
    }
    if bad == "mode":
        kwargs["keep_mask"] = Image.new("RGB", (8, 8))
    elif bad == "size":
        kwargs["keep_mask"] = Image.new("L", (64, 64))
    elif bad == "image":
        kwargs["image"] = native.source.convert("RGBA")
    elif bad == "strength":
        kwargs["denoising_strength"] = float("nan")
    elif bad == "cfg":
        kwargs["cfg_scale"] = True
    elif bad == "steps":
        kwargs["steps"] = 201
    else:
        native.pipeline._igs_supports_outpaint = False
    try:
        with pytest.raises(DerivativeError) as raised:
            run_sdxl_outpaint_pipeline(native.pipeline, native.conditioning, **kwargs)
        assert raised.value.code == "INVALID_REQUEST"
        assert not calls
        assert native.pipeline._igs_outpaint_state is None
    finally:
        handle.remove()


def test_native_img2img_factory_does_not_advertise_internal_mask_execution(native: Any) -> None:
    plain = img2img_pipeline_class(native.diffusers, native.torch)(**native.pipeline.components)
    assert not getattr(plain, "_igs_supports_outpaint", False)


def test_actual_capture_half_rounding_matches_old_generation_mask_and_strict_threshold(
    native: Any,
) -> None:
    """Actual VAE capture/helper; synthetic exact-t996 isolates a half threshold edge."""
    torch = native.torch
    pipeline = native.pipeline.to(dtype=torch.float16)
    mask = Image.frombytes("L", (8, 8), bytes([1, 16, 44, 80, 104, 128, 254, 255]) * 8)
    execution: Any = sdxl_outpaint
    state = execution._OutpaintState(torch, mask, 64, 64)
    pipeline._igs_outpaint_state = state
    try:
        encoded = pipeline.prepare_latents(
            pipeline.image_processor.preprocess(native.source),
            torch.empty((0,), dtype=torch.int64),
            1,
            1,
            torch.float16,
            "cpu",
            torch.Generator(device="cpu").manual_seed(42),
            True,
        )
        assert encoded.dtype == torch.float16
        keep_f32 = (
            torch.frombuffer(bytearray(mask.tobytes()), dtype=torch.uint8)
            .reshape(1, 1, 8, 8)
            .float()
            / 255
        )
        expected_generation = (1 - keep_f32).half()
        assert torch.equal(state.generate_mask, expected_generation)
        # Normalizing after conversion is observably different for alpha16/44/etc.
        assert not torch.equal(expected_generation, 1 - keep_f32.half())
        pipeline.scheduler.set_timesteps(timesteps=[999, 996], device="cpu")
        pipeline.scheduler.set_begin_index(0)
        state.timesteps = pipeline.scheduler.timesteps.clone()
        state.noise = torch.ones_like(encoded)
        initial = pipeline.scheduler.add_noise(encoded, state.noise, state.timesteps[:1])
        stepped = pipeline.scheduler.step(
            torch.zeros_like(encoded),
            state.timesteps[0],
            initial,
            return_dict=False,
        )[0]
        guidance = _upstream_guidance(torch)()
        guidance.mask = expected_generation
        guidance.mask_latents = encoded
        guidance.noise = state.noise
        guidance.scheduler = pipeline.scheduler
        guidance.is_gradient_mask = True
        expected = guidance.apply_mask(stepped, state.timesteps[1])
        observed = state.step(pipeline, 0, state.timesteps[0], {"latents": stepped})["latents"]
        assert torch.equal(observed, expected)
        protected = pipeline.scheduler.add_noise(encoded, state.noise, state.timesteps[1:])
        assert torch.equal(observed[:, :, :, 0], protected[:, :, :, 0])
        wrong_keep_formula = torch.where(keep_f32.half() < 1 - 996 / 1000, stepped, protected)
        assert not torch.equal(observed[:, :, :, 0], wrong_keep_formula[:, :, :, 0])
    finally:
        pipeline._igs_outpaint_state = None


def test_nonfinite_actual_solver_output_refuses_before_decode_and_clears_state(native: Any) -> None:
    _scheduler(native, "dpmpp_2m")
    decoded: list[bool] = []

    def spoil(_module: Any, _args: Any, output: Any) -> Any:
        return (native.torch.full_like(output[0], float("nan")),)

    def observe_decode(_module: Any, _args: Any) -> None:
        decoded.append(True)

    unet_handle = native.pipeline.unet.register_forward_hook(spoil)
    decode_handle = native.pipeline.vae.post_quant_conv.register_forward_pre_hook(observe_decode)
    try:
        with pytest.raises(DerivativeError) as raised:
            _generate(native, _mask())
        assert raised.value.code == "GENERATION_WORKER_FAILED"
        assert not decoded
        assert native.pipeline._igs_outpaint_state is None
        assert len(native.pipeline.unet._forward_pre_hooks) == 0
    finally:
        unet_handle.remove()
        decode_handle.remove()
