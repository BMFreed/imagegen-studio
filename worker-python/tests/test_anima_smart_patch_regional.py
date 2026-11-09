"""Private Smart INP signed regions through original native Anima and world output.

Literal complete-input fixtures below explicitly do not attest genuine Main or
trained loading. Their prompts/sampling use the actual TypeScript compilers.
Original small CPU/CUDA Anima, source VAE, KEEP loop, processors/SDPA, decode,
exclusive Smart RGB publisher and existing CPU world-output owner stay real.
ROOT separately owns genuine Main/ModelService/trained acceptance.

InvokeAI4875d965 sources: backend/anima/regional_prompting.py normalizes then
NEAREST-samples directly to the processing token grid; anima_transformer_patch.py
masks even blocks only; app/invocations/anima/anima_denoise.py keeps negative global
columns image-wide and its KEEP restoration independent of regional permissions.
No all-seed/visual-quality, public Generate, Retry or variant claim follows.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest
from PIL import Image

from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_smart_patch_regional as smart_regional
from imagegen_worker import anima_worker, smart_patch_execution, smart_patch_output
from imagegen_worker.anima_conditioning import encode_anima_conditioning_pair, encode_anima_prompt
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.smart_patch_denoising import SmartPatchDenoisingInput, run_smart_patch_anima
from imagegen_worker.smart_patch_preparation import PreparationImage
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _Observation,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_outpaint import (
    _Execution,  # pyright: ignore[reportPrivateUsage]
    _execution,  # pyright: ignore[reportPrivateUsage]
)
from test_smart_patch_execution import (
    _wire,  # pyright: ignore[reportPrivateUsage]
    _write_ref,  # pyright: ignore[reportPrivateUsage]
)

_PROFILE = "invoke-anima-smart-regional-inpaint-v1"
_LAYER = "10000000-0000-4000-8000-000000000001"
_SMART_MASK = "10000000-0000-4000-8000-000000000002"
_REGION_IDS = (
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002",
)
_MASK_IDS = (
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
)
_CANVAS_NEGATIVE = "canvas haze"


@dataclass
class _Case:
    value: dict[str, Any]
    captured: Any
    inputs: SmartPatchDenoisingInput
    source_bytes: bytes
    keep_bytes: bytes

    @property
    def command(self) -> Any:
        return self.captured.command

    @property
    def recipe(self) -> dict[str, Any]:
        return cast(dict[str, Any], self.value["recipe"])

    @property
    def policy(self) -> Any:
        return self.command.inference


@dataclass
class _Run:
    result: Any
    done: dict[str, object]
    pixels: bytes
    observed: _Observation
    execution: _Execution
    extras: list[Any]


def _digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _tensor_digest(value: Any, torch: Any) -> str:
    return _digest(value.detach().cpu().contiguous().view(torch.uint8).numpy().tobytes())


def _prompt(text: str) -> dict[str, Any]:
    return {"text": text, "embeddingRefs": []}


def _compiled(text: str) -> dict[str, Any]:
    # Reuse the real TS compiler, not a Python imitation of its weight syntax.
    return cast(dict[str, Any], _flow_inputs(positive=text)["positive"])


def _records(recipe: dict[str, Any]) -> list[dict[str, Any]]:
    values = [
        (recipe["layerId"], sign, recipe["globalPrompts"][sign]["text"])
        for sign in ("positive", "negative")
    ]
    for region in recipe["regions"]:
        if region["positive"] is not None:
            values.append((region["regionId"], "positive", region["positive"]["text"]))
        if region["negative"]["prompt"]["text"] != "":
            values.append((region["regionId"], "negative", region["negative"]["prompt"]["text"]))
    return [
        {"sourceId": source, "polarity": sign, "text": text, "prompt": _compiled(text)}
        for source, sign, text in values
    ]


def _refresh_records(value: dict[str, Any]) -> None:
    value["compiledPrompts"] = _records(value["recipe"])
    value["execution"]["inference"]["prompts"] = {
        sign: copy.deepcopy(value["compiledPrompts"][index]["prompt"])
        for index, sign in enumerate(("positive", "negative"))
    }


def _alpha(width: int, height: int, index: int) -> list[int]:
    # Non-identical overlapping owners leave some image queries background-only.
    # Raw127/128 borders distinguish normalization from alpha>0/bicubic policies.
    result: list[int] = []
    for y in range(height):
        for x in range(width):
            covered = (
                x < 3 * width // 5 and y < 3 * height // 4
                if index == 0
                else x >= width // 3 and y >= height // 4
            )
            result.append((127 if (x + 3 * y + index) % 7 == 0 else 128) if covered else 0)
    return result


def _case(
    directory: Path,
    *,
    world: tuple[int, int] = (107, 73),
    processing: tuple[int, int] = (72, 64),
    scheduler: str = "euler",
    guidance: float = 3,
    strength: float = 0.75,
    steps: int = 4,
    regions: bool = True,
    same_negative: bool = False,
    keep: int | None = None,
) -> _Case:
    directory.parent.mkdir(parents=True, exist_ok=True)
    wire = _wire(directory, "anima", "inpaint", seed=123)
    wire["requestId"] = str(uuid4())
    width, height = processing
    stage = Path(wire["output"]["stagingRoot"])
    source = Image.frombytes(
        "RGB",
        processing,
        bytes(
            (17 * x + 31 * y + 53 * c) % 256
            for y in range(height)
            for x in range(width)
            for c in range(3)
        ),
    )
    wire["modelSource"] = _write_ref(stage / "source.png", source, srgb=True)
    mask = Image.frombytes(
        "L",
        (width // 8, height // 8),
        bytes(
            keep if keep is not None else (255, 254, 192, 128, 64, 1, 0)[(x + 2 * y) % 7]
            for y in range(height // 8)
            for x in range(width // 8)
        ),
    )
    numeric = Image.new("RGBA", mask.size, "white")
    numeric.putalpha(mask)
    wire["latentKeepMask"] = _write_ref(stage / "keep.png", numeric, srgb=False)
    negative = _CANVAS_NEGATIVE if same_negative else "blur, bad details"
    positive = "two white cats on one bench"
    plan = _flow_inputs(
        positive=positive,
        negative=negative,
        scheduler=scheduler,
        mode="img2img",
        width=width,
        height=height,
        seed=123,
        steps=steps,
        guidanceScale=guidance,
        strength=strength,
    )
    wire["internalResolution"] = {"width": width, "height": height}
    wire["inference"]["sampling"] = plan["plan"]
    wire["inference"]["prompts"] = {"positive": plan["positive"], "negative": plan["negative"]}
    bbox = {"x": -13, "y": 5, "width": world[0], "height": world[1]}
    recipe: dict[str, Any] = {
        "kind": "smart-patch-regional-recipe",
        "family": "anima",
        "documentId": "40000000-0000-4000-8000-000000000001",
        "documentRevision": "40000000-0000-4000-8000-000000000002",
        "layerId": _LAYER,
        "bbox": bbox,
        "internalResolution": copy.deepcopy(wire["internalResolution"]),
        "smartMask": {"maskId": _SMART_MASK, "maskRevision": 2},
        "modelSha256": wire["inference"]["model"]["checkpoint"]["sha256"],
        "sampling": {
            "animaMethod": scheduler,
            "steps": steps,
            "cfgScale": guidance,
            "denoisingStrength": strength,
        },
        "item": {
            "iteration": 0,
            "promptPairIndex": 0,
            "prompts": {"positive": positive, "negative": negative},
            "seed": 123,
        },
        "globalPrompts": {"positive": _prompt(positive), "negative": _prompt(negative)},
        "regions": [],
    }
    if regions:
        for index, text in enumerate(("one white cat in red scarf", "one white cat in blue scarf")):
            local = "bad anatomy" if index == 0 else negative
            recipe["regions"].append(
                {
                    "regionId": _REGION_IDS[index],
                    "maskId": _MASK_IDS[index],
                    "maskRevision": index + 3,
                    "positive": _prompt(text),
                    "negative": {
                        "source": "regional" if index == 0 else "smart-patch",
                        "prompt": _prompt(local),
                    },
                    "authoredPrompts": {
                        "positive": _prompt(text),
                        "negative": _prompt(local if index == 0 else "{dormant local template}"),
                        "useGlobalNegativePrompt": index != 0,
                    },
                    "coverage": {
                        "bounds": copy.deepcopy(bbox),
                        "alpha": _alpha(*world, index),
                        "kind": "covered",
                        "intersection": copy.deepcopy(bbox),
                    },
                }
            )
    value: dict[str, Any] = {
        "schemaVersion": 1,
        "profile": _PROFILE,
        "recipe": recipe,
        "compiledPrompts": [],
        "execution": wire,
    }
    _refresh_records(value)
    captured = smart_regional.capture_anima_smart_patch_regional_input(value)
    inputs = smart_patch_execution.capture_smart_patch_execution(captured.command)
    return _Case(
        value,
        captured,
        inputs,
        (stage / "source.png").read_bytes(),
        (stage / "keep.png").read_bytes(),
    )


def _recapture(case: _Case) -> None:
    case.captured = smart_regional.capture_anima_smart_patch_regional_input(case.value)
    case.inputs = smart_patch_execution.capture_smart_patch_execution(case.command)


def _streams(case: _Case, sign: str) -> list[dict[str, Any]]:
    return [
        region
        for region in case.recipe["regions"]
        if (
            region["positive"] is not None and region["positive"]["text"] != ""
            if sign == "positive"
            else region["negative"]["prompt"]["text"] != ""
        )
    ]


def _contexts(case: _Case, native: _Native) -> tuple[Any, Any]:
    records = case.value["compiledPrompts"]
    pair = encode_anima_conditioning_pair(
        records[0]["prompt"],
        records[1]["prompt"],
        native.models,
        tokenizers=native.oracle_tokenizers,
    )
    banks: list[Any] = []
    active_cfg = not math.isclose(case.policy.sampling.guidance_scale, 1.0)
    for sign, global_context in (("positive", pair.positive), ("negative", pair.negative)):
        chunks = [global_context.embeddings]
        active = {region["regionId"] for region in _streams(case, sign)}
        if sign == "positive" or active_cfg:
            chunks.extend(
                encode_anima_prompt(
                    record["prompt"], native.models, tokenizers=native.oracle_tokenizers
                ).embeddings
                for record in records[2:]
                if record["polarity"] == sign and record["sourceId"] in active
            )
        assert all(
            tuple(chunk.shape) == (1, 512, native.models.transformer.config.text_embed_dim)
            for chunk in chunks
        )
        banks.append(native.torch.cat(chunks, dim=1).detach().cpu())
    return banks[0], banks[1]


def _mask(case: _Case, native: _Native, sign: str) -> Any:
    selected = _streams(case, sign)
    if not selected or (
        sign == "negative" and math.isclose(case.policy.sampling.guidance_scale, 1)
    ):
        return None
    world = case.recipe["bbox"]
    processing = case.recipe["internalResolution"]
    grid_h = math.ceil((processing["height"] // 8) / 2)
    grid_w = math.ceil((processing["width"] // 8) / 2)
    permissions: list[list[bool]] = []
    for y in range(grid_h):
        for x in range(grid_w):
            offset = (y * world["height"] // grid_h) * world["width"] + x * world["width"] // grid_w
            active = [region["coverage"]["alpha"][offset] >= 128 for region in selected]
            row = [sign == "negative" or not any(active)] * 512
            for permitted in active:
                row.extend([permitted] * 512)
            permissions.append(row)
    return native.torch.tensor(permissions, dtype=native.torch.bool).unsqueeze(0).unsqueeze(0)


def _assert_inputs(case: _Case) -> None:
    assert case.command.model_source.path.read_bytes() == case.source_bytes
    assert case.command.latent_keep_mask.path.read_bytes() == case.keep_bytes


def _published(
    case: _Case, native: _Native, result: Any, observed: _Observation
) -> tuple[dict[str, object], bytes]:
    done = cast(
        dict[str, object],
        cast(Any, smart_patch_execution)._publish(
            case.command, result.image, case.policy.sampling.seed
        ),
    )
    assert done["type"] == "smart-patch-executed" and done["protocolVersion"] == "1"
    assert (
        done["requestId"] == case.command.request_id
        and done["actualSeed"] == case.policy.sampling.seed
    )
    assert len(observed.decoded) == 1
    raw = observed.decoded[0]
    expected = (127.5 * (raw[0, :, 0].clamp(-1, 1) + 1)).to(native.torch.uint8)
    expected_bytes = expected.permute(1, 2, 0).contiguous().numpy().tobytes()
    with Image.open(case.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB"
        assert image.size == (case.command.width, case.command.height)
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        pixels = image.tobytes()
    assert pixels == expected_bytes == result.image.tobytes(), (
        "Smart processing PNG differs from original native decode"
    )
    metadata = cast(dict[str, Any], done["output"])
    assert metadata["sha256"] == _digest(case.command.output_path.read_bytes())
    assert (metadata["width"], metadata["height"], metadata["byteSize"]) == (
        case.command.width,
        case.command.height,
        case.command.output_path.stat().st_size,
    )
    _assert_inputs(case)
    return done, pixels


def _run(case: _Case, native: _Native, patch: pytest.MonkeyPatch) -> _Run:
    extras: list[Any] = []
    progress: list[tuple[int, int]] = []
    original = regional.encode_anima_prompt

    @wraps(original)
    def encode(value: Any, *args: Any, **kwargs: Any) -> Any:
        extras.append(copy.deepcopy(value))
        return original(value, *args, **kwargs)

    with patch.context() as scope:
        scope.setattr(regional, "encode_anima_prompt", encode)
        with _execution(native, scope) as execution, _observed(native, scope) as observed:
            result = smart_regional.run_prepared_anima_smart_patch_regional(
                case.captured,
                native.models,
                case.inputs,
                runtime=native.runtime,
                profile=native.profile,
                tokenizers=native.tokenizers,
                progress=lambda step, total: progress.append((step, total)),
            )
        done, pixels = _published(case, native, result, observed)
    assert progress == [
        (step, case.policy.sampling.total_steps)
        for step in range(1, case.policy.sampling.total_steps + 1)
    ]
    assert result.total_steps == case.policy.sampling.total_steps
    return _Run(result, done, pixels, observed, execution, extras)


def _association(case: _Case, native: _Native, run: _Run, contexts: tuple[Any, Any]) -> None:
    """Assert only after the genuine Smart PNG has been exclusively published."""
    torch, observed = native.torch, run.observed
    active_cfg = not math.isclose(case.policy.sampling.guidance_scale, 1)
    signs = 2 if active_cfg else 1
    expected_masks = (_mask(case, native, "positive"), _mask(case, native, "negative"))
    positives = _streams(case, "positive")
    negatives = _streams(case, "negative") if active_cfg else []
    encodes = 2 + len(positives) + len(negatives) if case.policy.sampling.total_steps else 0
    expected_extra = (
        [
            record["prompt"]
            for sign, streams in (("positive", positives), ("negative", negatives))
            for record in case.value["compiledPrompts"][2:]
            if record["polarity"] == sign and record["sourceId"] in {x["regionId"] for x in streams}
        ]
        if case.policy.sampling.total_steps
        else []
    )
    assert observed.qwen == observed.conditioner == encodes
    assert run.extras == expected_extra, (
        "Smart encoders merged or retargeted signed source ownership"
    )
    assert len(observed.passes) == signs * case.policy.sampling.total_steps
    assert len(observed.decoded) == len(run.execution.encodes) == len(run.execution.results) == 1
    for index, item in enumerate(observed.passes):
        assert torch.equal(item["context"], contexts[index % signs]), (
            "Smart job-global/signed conditioning ownership"
        )
    count = len(observed.passes) * 2 * len(native.models.transformer.transformer_blocks)
    assert len(observed.processors) == len(observed.dispatch) == len(observed.sdpa) == count
    for collection in (observed.processors, observed.dispatch, observed.sdpa):
        for item in collection:
            expected = (
                expected_masks[item["pass"] % signs]
                if item["kind"] == "cross" and item["block"] % 2 == 0
                else None
            )
            if expected is None:
                assert item["mask"] is None, "Odd/self/inactive Smart call received a regional mask"
            else:
                assert item["mask"] is not None and torch.equal(item["mask"], expected), (
                    "Smart regional WORLD/PROCESSING attention association"
                )
    for item in observed.dispatch:
        epsilon = float(torch.finfo(native.dtype).eps)
        assert item["maxError"] <= 4 * epsilon * (1 + item["maxMagnitude"])
    assert all(
        not item["borrowedWrapper"] and not item["borrowedBackend"] for item in observed.tokenizers
    )
    preflight = sum(
        index < 2 or record["text"] != ""
        for index, record in enumerate(case.value["compiledPrompts"])
    )
    assert len(observed.tokenizers) == 2 * (preflight + encodes)


def _keep_oracle(case: _Case, native: _Native, run: _Run) -> None:
    torch, seen = native.torch, run.execution
    assert len(seen.encodes) == 1 and len(seen.merges) == case.policy.sampling.total_steps
    source = case.inputs.model_source
    assert source is not None
    expected_pixels = torch.frombuffer(bytearray(source.tobytes()), dtype=torch.uint8)
    expected_pixels = expected_pixels.reshape(case.command.height, case.command.width, 3).permute(
        2, 0, 1
    )
    expected_pixels = (expected_pixels.float().unsqueeze(0).unsqueeze(2) / 127.5 - 1).to(
        native.device, native.dtype
    )
    assert torch.equal(seen.encodes[0], expected_pixels.cpu()), (
        "Smart source pixels were retargeted before VAE"
    )
    keep = torch.tensor(list(case.inputs.latent_keep_mask.tobytes()), dtype=torch.float32)
    keep = keep.reshape(1, 1, 1, case.command.height // 8, case.command.width // 8)
    generate = (1 - keep / 255).to(native.device, native.dtype)
    for item in seen.merges:
        assert torch.equal(item["generate"], generate.cpu()), (
            "Regional attention mask replaced Smart KEEP"
        )
        before = item["before"].to(native.device)
        if not item["completes"]:
            expected = before
        else:
            following = item["following"]
            linear = following / (3 - 2 * following)
            selected = (generate >= linear + 1e-4).to(native.dtype)
            original = item["original"].to(native.device)
            noise = item["noise"].to(native.device)
            expected = before * selected + (noise * following + (1 - following) * original) * (
                1 - selected
            )
        assert torch.equal(item["after"], expected.cpu()), (
            "Smart KEEP source trajectory differs from native Invoke algebra"
        )
    if seen.merges:
        assert torch.equal(run.result.latents.detach().cpu(), seen.merges[-1]["after"])
        first = seen.merges[0]
        expected_noise = torch.randn(
            first["noise"].shape,
            dtype=torch.float32,
            device="cpu",
            generator=torch.Generator(device="cpu").manual_seed(case.policy.sampling.seed),
        ).to(native.device, native.dtype)
        assert torch.equal(first["noise"], expected_noise.cpu())


def _prediction_oracle(case: _Case, native: _Native, run: _Run, context: Any, sign: str) -> None:
    """Independent original transformer replay, with no production mask/predictor call."""
    torch = native.torch
    ordinal = 0 if sign == "positive" else 1
    observed = run.observed.passes[ordinal]
    mask = _mask(case, native, sign)

    class ReferenceProcessor:
        def __init__(self, original: Any) -> None:
            self.original = original

        def __call__(
            self,
            attn: Any,
            hidden_states: Any,
            encoder_hidden_states: Any = None,
            attention_mask: Any = None,
            image_rotary_emb: Any = None,
        ) -> Any:
            assert attention_mask is None
            return self.original(
                attn,
                hidden_states,
                encoder_hidden_states=encoder_hidden_states,
                attention_mask=mask.to(native.device),
                image_rotary_emb=image_rotary_emb,
            )

    restored: list[tuple[Any, Any]] = []
    try:
        if mask is not None:
            for index, block in enumerate(native.models.transformer.transformer_blocks):
                if index % 2 == 0:
                    restored.append((block.attn2, block.attn2.processor))
                    block.attn2.set_processor(ReferenceProcessor(block.attn2.processor))
        latents = observed["latents"].to(native.device)
        padding = torch.zeros((1, 1, *latents.shape[-2:]), dtype=native.dtype, device=native.device)
        with torch.inference_mode():
            expected = (
                native.models.transformer(
                    hidden_states=latents,
                    timestep=observed["timestep"].to(native.device),
                    encoder_hidden_states=context.to(native.device),
                    padding_mask=padding,
                )
                .sample.detach()
                .cpu()
            )
    finally:
        for attn, original in reversed(restored):
            attn.processor = original
    record = {
        "schema": "anima-smart-regional-independent-native-v1",
        "sign": sign,
        "pngSha256": _digest(case.command.output_path.read_bytes()),
        "actualPredictionSha256": _tensor_digest(observed["prediction"], torch),
        "expectedPredictionSha256": _tensor_digest(expected, torch),
        "contextSha256": _tensor_digest(context, torch),
        "maskSha256": None if mask is None else _tensor_digest(mask, torch),
        "world": case.recipe["bbox"],
        "processing": case.recipe["internalResolution"],
        "nativeSites": len(run.observed.processors),
    }
    (case.command.staging_root / f"smart-{sign}-prediction-oracle.json").write_text(
        json.dumps(record, indent=2) + "\n"
    )
    assert torch.equal(observed["prediction"], expected), (
        "Smart regional prediction used wrong world/processing permissions or job context"
    )


def _world_output(
    case: _Case, run: _Run
) -> tuple[smart_patch_output.SmartPatchOutputRequest, bytes]:
    width, height = case.recipe["bbox"]["width"], case.recipe["bbox"]["height"]
    stage = case.command.staging_root
    alpha = bytes(
        0 if x < 3 or y < 4 else (128 if (x + y) % 5 == 0 else 255)
        for y in range(height)
        for x in range(width)
    )
    mask = Image.new("RGBA", (width, height), "white")
    mask.putalpha(Image.frombytes("L", (width, height), alpha))
    path = stage / "world-contribution-mask.png"
    descriptor = _write_ref(path, mask, srgb=False)
    image = PreparationImage(
        case.command.output_path,
        _digest(case.command.output_path.read_bytes()),
        case.command.output_path.stat().st_size,
        case.command.width,
        case.command.height,
    )
    contribution = PreparationImage(
        path, descriptor["sha256"], descriptor["byteSize"], width, height
    )
    request = smart_patch_output.SmartPatchOutputRequest(
        image, contribution, stage, stage / "world-result.png"
    )
    response = smart_patch_output.compose_smart_patch_output(request)
    with Image.open(request.output_png_path) as output:
        output.load()
        assert output.mode == "RGBA" and output.size == (width, height)
        assert output.info.get("icc_profile") == SRGB_ICC_PROFILE
        raw = output.tobytes()
    assert raw[3::4] == alpha
    expected = run.result.image.resize((width, height), resample=Image.Resampling.BICUBIC).convert(
        "RGBA"
    )
    expected.putalpha(Image.frombytes("L", (width, height), alpha))
    assert raw == expected.tobytes(), (
        "World contribution resized attention/KEEP alpha or pasted source into native RGB"
    )
    assert response["output"]["sha256"] == _digest(request.output_png_path.read_bytes())
    return request, raw


@pytest.mark.parametrize("scheduler", ("euler", "heun"))
def test_smart_regions_consume_signed_processing_geometry_and_independent_keep(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scheduler: str
) -> None:
    case = _case(tmp_path / scheduler, scheduler=scheduler)
    expected = _contexts(case, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _association(case, native, run, expected)
        _keep_oracle(case, native, run)
        _prediction_oracle(case, native, run, expected[0], "positive")
        _prediction_oracle(case, native, run, expected[1], "negative")
        _world_output(case, run)
    assert _mask(case, native, "positive").shape == (1, 1, 20, 1536)
    assert _mask(case, native, "negative").shape == (1, 1, 20, 1536)
    assert case.inputs.latent_keep_mask.size == (9, 8)


def test_smart_world_processing_mask_mapping_red(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "mapping-red")
    contexts = _contexts(case, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        # Must see the wrong native prediction after a real, finite RGB PNG.
        _prediction_oracle(case, native, run, contexts[0], "positive")
        _association(case, native, run, contexts)
        _keep_oracle(case, native, run)


def test_smart_identity_resolution_control_green(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "identity-green", world=(72, 64))
    contexts = _contexts(case, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _prediction_oracle(case, native, run, contexts[0], "positive")
        _association(case, native, run, contexts)
        _keep_oracle(case, native, run)


def test_smart_inherited_negative_job_context_red(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "inheritance-red")
    contexts = _contexts(case, native)
    assert case.recipe["globalPrompts"]["negative"]["text"] != _CANVAS_NEGATIVE
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _prediction_oracle(case, native, run, contexts[1], "negative")
        _association(case, native, run, contexts)


def test_smart_identical_job_canvas_negative_control_green(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "inheritance-control", same_negative=True)
    contexts = _contexts(case, native)
    assert case.recipe["globalPrompts"]["negative"]["text"] == _CANVAS_NEGATIVE
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _prediction_oracle(case, native, run, contexts[1], "negative")
        _association(case, native, run, contexts)


def test_zero_regions_preserve_original_smart_inp_exactly(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "zero", regions=False)
    with _preserved(native):
        # The ordinary control owns no borrowed-cache restoration scope.
        # Isolate that native Wan side effect before testing the regional owner.
        with regional._vae_cache_scope(native.models.vae):  # pyright: ignore[reportPrivateUsage]
            control = run_smart_patch_anima(
                anima_sampling_payload(case.policy.sampling),
                anima_prompt_payload(case.policy.positive_prompt),
                anima_prompt_payload(case.policy.negative_prompt),
                native.models,
                case.inputs,
                tokenizers=native.oracle_tokenizers,
            )
        actual = _run(case, native, monkeypatch)
        assert native.torch.equal(actual.result.latents, control.latents)
        assert actual.pixels == control.image.tobytes()
        assert actual.extras == []
        _association(case, native, actual, _contexts(case, native))
        assert all(item["mask"] is None for item in actual.observed.processors)


def test_cfg_one_preflights_all_signed_inputs_but_skips_negative_consumption(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    results: list[_Run] = []
    for ordinal, text in enumerate(("bad anatomy", "different negative only")):
        case = _case(tmp_path / f"cfg-one-{ordinal}", guidance=1)
        case.recipe["regions"][0]["negative"]["prompt"] = _prompt(text)
        case.recipe["regions"][0]["authoredPrompts"]["negative"] = _prompt(text)
        _refresh_records(case.value)
        _recapture(case)
        with _preserved(native):
            expected = _contexts(case, native)
            actual = _run(case, native, monkeypatch)
            _association(case, native, actual, expected)
            assert all(
                item["polarity"] != "negative"
                for item in [
                    x for x in case.value["compiledPrompts"][2:] if x["prompt"] in actual.extras
                ]
            )
            results.append(actual)
    assert results[0].pixels == results[1].pixels
    assert native.torch.equal(results[0].result.latents, results[1].result.latents)


@pytest.mark.parametrize("kind", ("absent", "empty", "negative-only", "zero-negative"))
def test_sparse_signed_sources_keep_ownership_without_mask_fallback(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    case = _case(tmp_path / kind)
    if kind in ("absent", "negative-only", "zero-negative"):
        for region in case.recipe["regions"]:
            region["positive"] = region["authoredPrompts"]["positive"] = None
    elif kind == "empty":
        for region in case.recipe["regions"]:
            region["positive"] = _prompt("")
            region["authoredPrompts"]["positive"] = _prompt("")
    if kind == "absent":
        for region in case.recipe["regions"]:
            region["negative"] = {"source": "regional", "prompt": _prompt("")}
            region["authoredPrompts"].update(negative=_prompt(""), useGlobalNegativePrompt=False)
    if kind == "zero-negative":
        for region in case.recipe["regions"]:
            region["coverage"].update(alpha=[0] * (107 * 73), kind="intersecting-empty")
    _refresh_records(case.value)
    _recapture(case)
    expected = _contexts(case, cpu_native)
    with _preserved(cpu_native):
        actual = _run(case, cpu_native, monkeypatch)
        _association(case, cpu_native, actual, expected)
    if kind == "zero-negative":
        assert not bool(_mask(case, cpu_native, "negative")[..., 512:].any().item())
        assert any(
            item["pass"] % 2 == 1
            and item["kind"] == "cross"
            and item["block"] % 2 == 1
            and item["keys"] == 1536
            and item["mask"] is None
            for item in actual.observed.processors
        )


def test_full_positive_support_closes_global_background_and_keeps_duplicate_sources(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "full-support-duplicates")
    inherited = case.recipe["globalPrompts"]["negative"]
    for region in case.recipe["regions"]:
        region["positive"] = _prompt("one white cat")
        region["authoredPrompts"]["positive"] = _prompt("one white cat")
        region["negative"] = {"source": "smart-patch", "prompt": copy.deepcopy(inherited)}
        region["authoredPrompts"]["useGlobalNegativePrompt"] = True
        region["coverage"]["alpha"] = [128] * (107 * 73)
    _refresh_records(case.value)
    _recapture(case)
    contexts = _contexts(case, cpu_native)
    with _preserved(cpu_native):
        actual = _run(case, cpu_native, monkeypatch)
        _association(case, cpu_native, actual, contexts)
        _prediction_oracle(case, cpu_native, actual, contexts[0], "positive")
    mask = _mask(case, cpu_native, "positive")
    assert not bool(mask[..., :512].any().item())
    assert bool(mask[..., 512:].all().item())
    assert contexts[0].shape[1] == contexts[1].shape[1] == 1536
    assert cpu_native.torch.equal(contexts[0][:, 512:1024], contexts[0][:, 1024:1536])
    assert cpu_native.torch.equal(contexts[1][:, :512], contexts[1][:, 512:1024])
    assert cpu_native.torch.equal(contexts[1][:, :512], contexts[1][:, 1024:1536])


@pytest.mark.parametrize("keep", (0, 255))
def test_keep_extremes_do_not_change_smart_mode_or_bypass_native_work(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, keep: int
) -> None:
    case = _case(tmp_path / str(keep), keep=keep)
    with _preserved(cpu_native):
        actual = _run(case, cpu_native, monkeypatch)
        _keep_oracle(case, cpu_native, actual)
        assert actual.observed.passes and len(actual.observed.decoded) == 1
    assert case.inputs.mode == "inpaint"


@pytest.mark.parametrize(
    "defect",
    (
        "owner",
        "smart-mask-alias",
        "global-id",
        "inherited-text",
        "inherited-source",
        "compiled-order",
        "compiled-sign",
        "compiled-text",
        "seed",
        "model",
        "processing",
        "plan",
        "extra-field",
    ),
)
def test_whole_smart_input_disagreement_refuses_before_any_borrowed_forward(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, defect: str
) -> None:
    case = _case(tmp_path / defect)
    value = copy.deepcopy(case.value)
    recipe = value["recipe"]
    if defect == "owner":
        recipe["regions"][1]["regionId"] = recipe["regions"][0]["regionId"]
    elif defect == "smart-mask-alias":
        recipe["regions"][0]["maskId"] = recipe["smartMask"]["maskId"]
    elif defect == "global-id":
        value["compiledPrompts"][0]["sourceId"] = "current-canvas"
    elif defect == "inherited-text":
        recipe["regions"][1]["negative"]["prompt"]["text"] = _CANVAS_NEGATIVE
    elif defect == "inherited-source":
        recipe["regions"][1]["negative"]["source"] = "current-canvas"
    elif defect == "compiled-order":
        value["compiledPrompts"][2], value["compiledPrompts"][3] = (
            value["compiledPrompts"][3],
            value["compiledPrompts"][2],
        )
    elif defect == "compiled-sign":
        value["compiledPrompts"][3]["polarity"] = "positive"
    elif defect == "compiled-text":
        value["compiledPrompts"][3]["text"] += " changed"
    elif defect == "seed":
        recipe["item"]["seed"] += 1
    elif defect == "model":
        recipe["modelSha256"] = "0" * 64
    elif defect == "processing":
        recipe["internalResolution"]["width"] = 80
    elif defect == "plan":
        recipe["sampling"]["steps"] += 1
    else:
        recipe["unexpected"] = True
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        with pytest.raises(DerivativeError) as caught:
            smart_regional.capture_anima_smart_patch_regional_input(value)
        assert caught.value.code == "INVALID_REQUEST"
        assert (
            not observed.passes
            and observed.qwen == observed.conditioner == len(observed.decoded) == 0
        )
    assert not case.command.output_path.exists()
    _assert_inputs(case)


@pytest.mark.parametrize("unsupported", ("mode", "family", "method", "lora", "ti", "references"))
def test_unsupported_smart_regional_scope_refuses_before_resource_or_model_work(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, unsupported: str
) -> None:
    case = _case(tmp_path / unsupported)
    value = copy.deepcopy(case.value)
    if unsupported == "mode":
        value["execution"]["mode"] = "outpaint"
    elif unsupported == "family":
        value["recipe"]["family"] = "illustrious"
    elif unsupported == "method":
        value["recipe"]["sampling"]["animaMethod"] = "lcm"
    elif unsupported == "lora":
        value["execution"]["inference"]["loras"] = [
            {
                "path": str(tmp_path / "not-read.safetensors"),
                "sha256": "1" * 64,
                "byteSize": 8,
                "weight": 0,
            }
        ]
    elif unsupported == "ti":
        value["recipe"]["globalPrompts"]["negative"]["embeddingRefs"] = [
            {"token": "forbidden", "resource": {}}
        ]
    else:
        value["recipe"]["regions"][0]["referenceImages"] = [{}]

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Unsupported Smart regional input reached files or model construction")

    with _preserved(cpu_native), monkeypatch.context() as patch:
        patch.setattr(smart_patch_execution, "_verify_resources", forbidden)
        patch.setattr(smart_patch_execution, "capture_smart_patch_execution", forbidden)
        patch.setattr(anima_worker, "load_anima_models", forbidden)
        with _observed(cpu_native, patch) as observed:
            with pytest.raises(DerivativeError) as caught:
                smart_regional.execute_anima_smart_patch_regional(
                    value, config_dir=tmp_path, runtime=cpu_native.runtime
                )
            expected = (
                "GENERATION_PROMPT_UNSUPPORTED"
                if unsupported in {"lora", "ti", "references"}
                else "INVALID_REQUEST"
            )
            assert caught.value.code == expected
            assert (
                not observed.passes
                and observed.qwen == observed.conditioner == len(observed.decoded) == 0
            )
    assert not case.command.output_path.exists()


def test_late_negative_overflow_is_preflighted_at_cfg_one(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "overflow", guidance=1)
    text = "(bad)1000000000000000000000000000000000000000"
    case.recipe["regions"][1]["negative"] = {"source": "regional", "prompt": _prompt(text)}
    case.recipe["regions"][1]["authoredPrompts"].update(
        negative=_prompt(text), useGlobalNegativePrompt=False
    )
    _refresh_records(case.value)
    _recapture(case)
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        with pytest.raises(DerivativeError) as caught:
            smart_regional.run_prepared_anima_smart_patch_regional(
                case.captured,
                cpu_native.models,
                case.inputs,
                runtime=cpu_native.runtime,
                profile=cpu_native.profile,
                tokenizers=cpu_native.tokenizers,
            )
        assert caught.value.code == "GENERATION_PROMPT_UNSUPPORTED"
        assert (
            observed.qwen
            == observed.conditioner
            == len(observed.passes)
            == len(observed.decoded)
            == 0
        )
    assert not case.command.output_path.exists()


def test_late_negative_mask_budget_refuses_before_first_encoder_or_source_vae(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # At the bounded Smart maximum, Q=32*32. This original, still small
    # 32-head Cosmos graph gives negative K=1536 and 50,331,648 expanded
    # elements. The production ceiling stays exactly 33,554,432. No positive
    # stream/mask, tokenizer call, VAE encode or transformer forward may run.
    torch = cpu_native.torch
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(82031)
        transformer = cpu_native.diffusers.CosmosTransformer3DModel(
            in_channels=16,
            out_channels=16,
            num_attention_heads=32,
            attention_head_dim=16,
            num_layers=1,
            text_embed_dim=32,
            adaln_lora_dim=8,
            max_size=(1, 256, 256),
            patch_size=(1, 2, 2),
            concat_padding_mask=True,
            extra_pos_embed_type=None,
            use_crossattn_projection=False,
        ).eval()
    borrowed = _Native(
        torch,
        cpu_native.diffusers,
        LoadedAnimaModels(
            transformer,
            cpu_native.models.text_conditioner,
            cpu_native.models.qwen3_encoder,
            cpu_native.models.vae,
        ),
        cpu_native.tokenizers,
        cpu_native.oracle_tokenizers,
        cpu_native.profile,
        cpu_native.device,
        cpu_native.dtype,
    )
    case = _case(tmp_path / "late-mask-budget", processing=(512, 512))
    for region in case.recipe["regions"]:
        region["positive"] = region["authoredPrompts"]["positive"] = None
    _refresh_records(case.value)
    _recapture(case)
    with (
        _preserved(borrowed),
        _execution(borrowed, monkeypatch) as execution,
        _observed(borrowed, monkeypatch) as observed,
    ):
        with pytest.raises(DerivativeError) as caught:
            smart_regional.run_prepared_anima_smart_patch_regional(
                case.captured,
                borrowed.models,
                case.inputs,
                runtime=borrowed.runtime,
                profile=borrowed.profile,
                tokenizers=borrowed.tokenizers,
            )
        assert caught.value.code == "LIMIT"
        assert "mask" in str(caught.value).lower()
        assert observed.qwen == observed.conditioner == 0
        assert not observed.passes and not observed.decoded and not observed.tokenizers
        assert not execution.encodes and not execution.merges and not execution.results
    assert not case.command.output_path.exists()
    _assert_inputs(case)


@pytest.mark.parametrize("failure", ("encode", "native", "decode", "publication"))
def test_late_failures_restore_borrowed_state_and_allow_fresh_smart_call(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    case = _case(tmp_path / failure)
    sentinel = (
        RuntimeError("declared late Smart regional failure")
        if failure != "publication"
        else OSError("declared Smart publication failure")
    )
    calls = 0
    with _preserved(cpu_native), monkeypatch.context() as patch:
        if failure == "encode":
            original = regional.encode_anima_prompt

            @wraps(original)
            def encoded(*args: Any, **kwargs: Any) -> Any:
                nonlocal calls
                calls += 1
                if calls == 4:
                    raise sentinel
                return original(*args, **kwargs)

            patch.setattr(regional, "encode_anima_prompt", encoded)
        elif failure in ("native", "decode"):
            owner = cpu_native.models.transformer if failure == "native" else cpu_native.models.vae
            attribute = "forward" if failure == "native" else "decode"
            cls = cast(Any, type(owner))
            original_method = getattr(cls, attribute)

            @wraps(original_method)
            def broken(self: Any, *args: Any, **kwargs: Any) -> Any:
                nonlocal calls
                result = original_method(self, *args, **kwargs)
                if self is owner:
                    calls += 1
                    if calls == (3 if failure == "native" else 1):
                        raise sentinel
                return result

            patch.setattr(cls, attribute, broken)
        else:

            def link(*_args: Any, **_kwargs: Any) -> None:
                nonlocal calls
                calls += 1
                raise sentinel

            patch.setattr(smart_patch_execution.os, "link", link)
        with pytest.raises((RuntimeError, DerivativeError)) as caught:
            _run(case, cpu_native, patch)
        assert _contains_cause(caught.value, sentinel)
        assert calls >= 1
        assert not case.command.output_path.exists()
        assert not list(case.command.staging_root.glob("*.tmp"))
        _assert_inputs(case)
    with _preserved(cpu_native):
        recovered = _run(case, cpu_native, monkeypatch)
        _association(case, cpu_native, recovered, _contexts(case, cpu_native))
    assert recovered.done["actualSeed"] == 123


def test_world_publication_failure_preserves_native_result_and_recovers(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "world-failure")
    with _preserved(cpu_native):
        run = _run(case, cpu_native, monkeypatch)
        pixels = case.command.output_path.read_bytes()
        sentinel = OSError("declared world exclusive-link failure")
        original = smart_patch_output.os.link
        calls = 0

        def failed_link(*_args: Any, **_kwargs: Any) -> None:
            nonlocal calls
            calls += 1
            raise sentinel

        with monkeypatch.context() as patch:
            patch.setattr(smart_patch_output.os, "link", failed_link)
            with pytest.raises(DerivativeError) as caught:
                _world_output(case, run)
            assert caught.value.code == "DERIVATIVE_FAILED"
            assert caught.value.__cause__ is sentinel
        assert calls == 1 and smart_patch_output.os.link is original
        assert case.command.output_path.read_bytes() == pixels
        assert not (case.command.staging_root / "world-result.png").exists()
        _, actual = _world_output(case, run)
        assert len(actual) == 107 * 73 * 4
        _assert_inputs(case)


def test_captured_smart_input_detaches_mutable_recipe_and_pixel_buffers(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "detached")
    original = copy.deepcopy(case.value)
    contexts = _contexts(case, cpu_native)
    source = case.inputs.model_source
    assert source is not None
    source_before, keep_before = source.copy(), case.inputs.latent_keep_mask.copy()
    case.value["recipe"]["regions"][0]["coverage"]["alpha"][:] = [0] * (107 * 73)
    case.value["compiledPrompts"][2]["text"] = "late caller text"
    preflight = cast(Any, regional)._preflight_prompt_weights
    callbacks = 0

    @wraps(preflight)
    def mutate_after_capture(*args: Any, **kwargs: Any) -> Any:
        nonlocal callbacks
        result = preflight(*args, **kwargs)
        callbacks += 1
        source.paste((0, 0, 0), (0, 0, source.width, source.height))
        case.inputs.latent_keep_mask.paste(255, (0, 0, 9, 8))
        return result

    with _preserved(cpu_native), monkeypatch.context() as patch:
        patch.setattr(regional, "_preflight_prompt_weights", mutate_after_capture)
        # The private consumer imports the original helper by name.
        patch.setattr(smart_regional, "_preflight_prompt_weights", mutate_after_capture)
        actual = _run(case, cpu_native, patch)
        assert callbacks == 1
        assert source.tobytes() != source_before.tobytes()
        assert case.inputs.latent_keep_mask.getextrema() == (255, 255)
        case.value = original
        case.inputs = SmartPatchDenoisingInput(
            "inpaint", case.command.width, case.command.height, source_before, keep_before
        )
        _association(case, cpu_native, actual, contexts)
        _keep_oracle(case, cpu_native, actual)


@pytest.fixture(scope="module")
def cuda_native(native_factory: Any) -> _Native:
    return cast(_Native, native_factory("cuda-bfloat16"))


def test_complete_frontend_reuses_resource_snapshot_loader_and_exclusive_publisher(
    cuda_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "full-cuda")
    loaded: list[Any] = []

    def load(bundle: Any, *, device: str, dtype: Any) -> Any:
        assert bundle == case.policy.bundle and device == "cuda" and dtype == cuda_native.dtype
        loaded.append(bundle)
        return cuda_native.models

    with _preserved(cuda_native), monkeypatch.context() as patch:
        patch.setattr(anima_worker, "load_anima_models", load)
        with _observed(cuda_native, patch) as observed:
            done = smart_regional.execute_anima_smart_patch_regional(
                case.value, config_dir=tmp_path, runtime=cuda_native.runtime
            )
        assert done["type"] == "smart-patch-executed" and done["actualSeed"] == 123
        assert len(loaded) == 1 and observed.passes and len(observed.decoded) == 1
        with Image.open(case.command.output_path) as image:
            image.load()
            assert image.mode == "RGB" and image.size == (72, 64)
            assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        _assert_inputs(case)


def test_existing_destination_is_preserved_before_native_frontend_load(
    cuda_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "existing")
    case.command.output_path.write_bytes(b"preexisting unrelated output")

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Existing destination reached resource/model construction")

    with _preserved(cuda_native), monkeypatch.context() as patch:
        patch.setattr(anima_worker, "load_anima_models", forbidden)
        with _observed(cuda_native, patch) as observed:
            with pytest.raises(DerivativeError) as caught:
                smart_regional.execute_anima_smart_patch_regional(
                    case.value, config_dir=tmp_path, runtime=cuda_native.runtime
                )
            assert caught.value.code == "OUTPUT_UNAVAILABLE"
            assert not observed.passes and observed.qwen == observed.conditioner == 0
    assert case.command.output_path.read_bytes() == b"preexisting unrelated output"
