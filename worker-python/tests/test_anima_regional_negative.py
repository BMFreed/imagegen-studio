"""Independent signed Anima regional consumption through original native owners.

InvokeAI 4875d965: anima_denoise.py builds independent signed contexts and
regional_prompting.py keeps the negative global columns image-wide. These
small CPU/CUDA cases retain genuine Main recipe/compiler fixtures, original
processors/SDPA, native samplers, Wan/source protection and exclusive PNG output.
They do not qualify trained loading, visual semantics or installed application IO.
Only focused geometry/tampering cases derive deliberately changed unit inputs.
"""

from __future__ import annotations

import copy
import hashlib
import io
import json
import math
from collections.abc import Callable
from contextlib import nullcontext
from dataclasses import dataclass, replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image, ImageOps

from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.anima_conditioning import encode_anima_conditioning_pair, encode_anima_prompt
from imagegen_worker.anima_flow_sampling import validate_anima_flow_sampling_plan
from imagegen_worker.anima_lora import scoped_anima_generation_loras
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _Call,  # pyright: ignore[reportPrivateUsage]
    _command,  # pyright: ignore[reportPrivateUsage]
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _Observation,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import main_inputs as main_inputs
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_img2img import (
    _call as _image_call,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_img2img import (
    _solver_oracle as _image_history,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_img2img import (
    _source_oracle as _image_source,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_img2img import (
    _wire as _image_wire,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_lora import (
    _resource,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _call as _outpaint_call,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _execution,  # pyright: ignore[reportPrivateUsage]
    _lama,  # pyright: ignore[reportPrivateUsage]
    _mask_reference,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _history_oracle as _outpaint_history,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _source_oracle as _outpaint_source,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _wire as _outpaint_wire,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_sampling import (
    _solver_oracle as _txt_history,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _runtime,  # pyright: ignore[reportPrivateUsage]
)

_NEGATIVE = "invoke-anima-regional-negative-v1"
_COMPOSITION = "invoke-krea2-global-support-v1"
_FLOW = "invoke-anima-flow-sampling-v1"
_LORA = "invoke-anima-global-lora-v1"
_METHODS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
_MODES = ("txt2img", "img2img", "outpaint")
_Producer = Callable[..., dict[str, Any]]


@dataclass
class _Run:
    pixels: bytes
    observed: _Observation
    extras: list[dict[str, Any]]
    result: Any
    source: Any


def _call(
    root: Path,
    produce: _Producer,
    mode: str = "txt2img",
    method: str = "euler",
    *,
    variant: str = "negative",
    guidance: float = 3,
    steps: int = 3,
    strength: float = 0.5,
    **fixture_options: Any,
) -> _Call:
    handoff = produce(variant, **fixture_options)
    if mode == "txt2img":
        call = _command(root, handoff)
    else:
        constructor = _image_call if mode == "img2img" else _outpaint_call

        def supplied(_variant: str) -> dict[str, Any]:
            return handoff

        call = constructor(root, supplied, method, strength=strength, steps=steps, variant=variant)
    bbox = handoff["recipe"]["bbox"]
    options: dict[str, Any] = {
        "scheduler": method,
        "width": bbox["width"],
        "height": bbox["height"],
        "seed": handoff["recipe"]["item"]["seed"],
        "steps": steps,
        "guidanceScale": guidance,
    }
    if mode != "txt2img":
        options.update(mode="img2img", strength=strength)
    plan = _flow_inputs(**options)["plan"]
    handoff["sampling"] = plan
    call.command = replace(call.command, sampling=validate_anima_flow_sampling_plan(plan))
    return call


def _frontend(mode: str) -> Any:
    return {
        "txt2img": regional.generate_current_canvas_regional_anima_txt2img,
        "img2img": regional.generate_current_canvas_regional_anima_img2img,
        "outpaint": regional.generate_current_canvas_regional_anima_outpaint,
    }[mode]


def _arguments(call: _Call, native: _Native, **changes: Any) -> dict[str, Any]:
    return {
        "command": call.command,
        "compiled_prompts": call.handoff["compiledPrompts"],
        "models": native.models,
        "runtime": native.runtime,
        "profile": native.profile,
        "tokenizers": native.tokenizers,
        "composition_profile": _COMPOSITION,
        "sampling_profile": _FLOW,
        "negative_profile": _NEGATIVE,
        **changes,
    }


def _streams(handoff: dict[str, Any], sign: str) -> list[dict[str, Any]]:
    return [
        region
        for region in handoff["recipe"]["regions"]
        if (
            region["positive"] is not None and region["positive"]["text"] != ""
            if sign == "positive"
            else region["negative"]["prompt"]["text"] != ""
        )
    ]


def _record_order(handoff: dict[str, Any]) -> list[tuple[str, str, str]]:
    recipe = handoff["recipe"]
    expected = [
        ("current-canvas", sign, recipe["globalPrompts"][sign]["text"])
        for sign in ("positive", "negative")
    ]
    for region in recipe["regions"]:
        if region["positive"] is not None:
            expected.append((region["regionId"], "positive", region["positive"]["text"]))
        text = region["negative"]["prompt"]["text"]
        if text != "":
            expected.append((region["regionId"], "negative", text))
    return expected


def _contexts(call: _Call, native: _Native) -> tuple[Any, Any]:
    records = call.handoff["compiledPrompts"]
    assert [(r["sourceId"], r["polarity"], r["text"]) for r in records] == _record_order(
        call.handoff
    )
    pair = encode_anima_conditioning_pair(
        records[0]["prompt"],
        records[1]["prompt"],
        native.models,
        tokenizers=native.oracle_tokenizers,
    )
    banks: list[Any] = []
    for sign, global_context in (("positive", pair.positive), ("negative", pair.negative)):
        chunks = [global_context.embeddings]
        cfg = not math.isclose(call.command.sampling.guidance_scale, 1.0)
        active = {r["regionId"] for r in _streams(call.handoff, sign)}
        if sign == "positive" or cfg:
            for record in records[2:]:
                if record["polarity"] == sign and record["sourceId"] in active:
                    chunks.append(
                        encode_anima_prompt(
                            record["prompt"], native.models, tokenizers=native.oracle_tokenizers
                        ).embeddings
                    )
        assert all(
            chunk.shape == (1, 512, native.models.transformer.config.text_embed_dim)
            for chunk in chunks
        )
        banks.append(native.torch.cat(chunks, dim=1).detach().cpu())
    return banks[0], banks[1]


def _mask(call: _Call, native: _Native, sign: str) -> Any:
    streams = _streams(call.handoff, sign)
    if not streams or (
        sign == "negative" and math.isclose(call.command.sampling.guidance_scale, 1)
    ):
        return None
    width, height = call.command.width, call.command.height
    grid_h, grid_w = math.ceil((height // 8) / 2), math.ceil((width // 8) / 2)
    eligibility: list[list[bool]] = []
    for y in range(grid_h):
        for x in range(grid_w):
            offset = (y * height // grid_h) * width + x * width // grid_w
            eligibility.append([region["coverage"]["alpha"][offset] >= 128 for region in streams])
    background = [not any(row) for row in eligibility]
    no_background = not any(background)
    rows: list[list[bool]] = []
    for index, selected in enumerate(eligibility):
        global_allowed = sign == "negative" or background[index] or no_background
        row = [global_allowed] * 512
        for allowed in selected:
            row.extend([allowed] * 512)
        rows.append(row)
    return native.torch.tensor(rows, dtype=native.torch.bool).unsqueeze(0).unsqueeze(0)


def _published(
    call: _Call,
    native: _Native,
    done: dict[str, object],
    observed: _Observation,
    output_keep: Image.Image | None,
) -> bytes:
    assert done["type"] == "generation-done" and done["protocolVersion"] == "1"
    assert (done["requestId"], done["outputPath"], done["seed"]) == (
        call.command.request_id,
        str(call.command.output_path),
        call.command.sampling.seed,
    )
    assert call.command.target_path.read_bytes() == call.target_bytes
    assert len(observed.decoded) == 1
    raw = observed.decoded[0]
    rgb = (127.5 * (raw[0, :, 0].clamp(-1, 1) + 1)).to(native.torch.uint8)
    expected = rgb.permute(1, 2, 0).contiguous().numpy().tobytes()
    mode = "RGB"
    if output_keep is not None:
        mode = "RGBA"
        alpha = ImageOps.invert(output_keep).tobytes()
        expected = bytes(c for i, a in enumerate(alpha) for c in (*expected[3 * i : 3 * i + 3], a))
    with Image.open(call.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == mode
        assert image.size == (call.command.width, call.command.height)
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        actual = image.tobytes()
    assert actual == expected, (
        "Signed regional output differs from its original native decode/alpha"
    )
    return actual


def _run(
    call: _Call, native: _Native, patch: pytest.MonkeyPatch, mode: str = "txt2img", **changes: Any
) -> _Run:
    events: list[tuple[int, int]] = []
    extras: list[dict[str, Any]] = []
    output_keep = None
    if mode == "outpaint":
        with Image.open(io.BytesIO(call.target_bytes)) as image:
            _, output_keep = _mask_reference(image, native.torch)
    original = regional.encode_anima_prompt

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    @wraps(original)
    def encode(value: Any, *args: Any, **kwargs: Any) -> Any:
        extras.append(copy.deepcopy(value))
        return original(value, *args, **kwargs)

    with patch.context() as scope:
        scope.setattr(regional, "encode_anima_prompt", encode)
        infill = _lama(call, scope) if mode == "outpaint" else nullcontext()
        with infill, _execution(native, scope) as seen, _observed(native, scope) as observed:
            done = _frontend(mode)(
                call.handoff["recipe"],
                **_arguments(
                    call,
                    native,
                    on_progress=progress,
                    **changes,
                ),
            )
        pixels = _published(call, native, done, observed, output_keep)
    assert events == [
        (i, call.command.sampling.total_steps)
        for i in range(1, call.command.sampling.total_steps + 1)
    ]
    assert len(seen.results) == 1
    return _Run(pixels, observed, extras, seen.results[0], seen)


def _association(call: _Call, native: _Native, run: _Run, contexts: tuple[Any, Any]) -> None:
    """All semantic assertions follow genuine publication and preserve RED observations."""
    torch, observed = native.torch, run.observed
    do_cfg = not math.isclose(call.command.sampling.guidance_scale, 1.0)
    signs = 2 if do_cfg else 1
    masks = (_mask(call, native, "positive"), _mask(call, native, "negative"))
    positive = _streams(call.handoff, "positive")
    negative = _streams(call.handoff, "negative") if do_cfg else []
    encodes = 2 + len(positive) + len(negative) if call.command.sampling.total_steps else 0
    expected_extras = (
        [
            record["prompt"]
            for sign, streams in (("positive", positive), ("negative", negative))
            for record in call.handoff["compiledPrompts"][2:]
            if record["polarity"] == sign and record["sourceId"] in {r["regionId"] for r in streams}
        ]
        if call.command.sampling.total_steps
        else []
    )
    summary: dict[str, Any] = {
        "schema": "anima-regional-signed-native-v1",
        "contextRanges": {
            sign: [
                {"sourceId": "current-canvas", "start": 0, "end": 512},
                *[
                    {"sourceId": region["regionId"], "start": 512 * (i + 1), "end": 512 * (i + 2)}
                    for i, region in enumerate(_streams(call.handoff, sign))
                ],
            ]
            for sign in ("positive", "negative")
        },
        "qwen": observed.qwen,
        "conditioner": observed.conditioner,
        "pixelsSha256": hashlib.sha256(run.pixels).hexdigest(),
        "passes": len(observed.passes),
        "sites": [],
        "visualStatus": "not-evaluated",
    }
    # Persist every mask sample/hash before an intentional semantic RED assertion.
    for item in observed.processors:
        value = item["mask"]
        summary["sites"].append(
            {
                "pass": item["pass"],
                "block": item["block"],
                "kind": item["kind"],
                "keys": item["keys"],
                "maskSha256": None
                if value is None
                else hashlib.sha256(value.numpy().tobytes()).hexdigest(),
            }
        )
    (call.command.staging_root / "signed-observation.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    assert observed.qwen == observed.conditioner == encodes
    assert run.extras == expected_extras, (
        "Regional encoders lost signed source order or duplicate inheritance"
    )
    preflight = 2 + sum(record["text"] != "" for record in call.handoff["compiledPrompts"][2:])
    assert len(observed.tokenizers) == 2 * (preflight + encodes)
    assert all(
        not item["borrowedWrapper"] and not item["borrowedBackend"] for item in observed.tokenizers
    )
    assert len({item["backendId"] for item in observed.tokenizers}) == 2
    assert len(observed.passes) == signs * call.command.sampling.total_steps
    for index, item in enumerate(observed.passes):
        assert torch.equal(item["context"], contexts[index % signs]), (
            "Native signed context/range association"
        )
    count = len(observed.passes) * 2 * len(native.models.transformer.transformer_blocks)
    assert len(observed.processors) == len(observed.dispatch) == len(observed.sdpa) == count
    for collection in (observed.processors, observed.dispatch, observed.sdpa):
        for item in collection:
            role = item["pass"] % signs
            expected = masks[role] if item["kind"] == "cross" and item["block"] % 2 == 0 else None
            actual = item["mask"]
            if expected is None:
                assert actual is None, "Odd/self/inactive-sign call consumed regional permissions"
            else:
                assert actual is not None and torch.equal(actual, expected), (
                    "Native signed regional negative mask/range association"
                )
    for item in observed.dispatch:
        epsilon = float(torch.finfo(native.dtype).eps)
        assert item["maxError"] <= 4 * epsilon * (1 + item["maxMagnitude"])


def _prediction_check(call: _Call, native: _Native, run: _Run, context: Any, sign: str) -> None:
    """Replay one original transformer with independent permissions after real PNG.

    The transparent test delegate never calls the production mask builder or
    predictor. Restore every original processor before any assertion can fail.
    """
    torch = native.torch
    ordinal = 0 if sign == "positive" else 1
    captured = run.observed.passes[ordinal]
    expected_mask = _mask(call, native, sign)

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
                attention_mask=expected_mask.to(native.device),
                image_rotary_emb=image_rotary_emb,
            )

    restored: list[tuple[Any, Any]] = []
    try:
        if expected_mask is not None:
            for index, block in enumerate(native.models.transformer.transformer_blocks):
                if index % 2 == 0:
                    restored.append((block.attn2, block.attn2.processor))
                    block.attn2.set_processor(ReferenceProcessor(block.attn2.processor))
        latents = captured["latents"].to(native.device)
        padding = torch.zeros((1, 1, *latents.shape[-2:]), dtype=native.dtype, device=native.device)
        with torch.inference_mode():
            predicted = (
                native.models.transformer(
                    hidden_states=latents,
                    timestep=captured["timestep"].to(native.device),
                    encoder_hidden_states=context.to(native.device),
                    padding_mask=padding,
                )
                .sample.detach()
                .cpu()
            )
    finally:
        for attention, original in reversed(restored):
            attention.processor = original

    def digest(value: Any) -> str:
        return hashlib.sha256(value.contiguous().view(torch.uint8).numpy().tobytes()).hexdigest()

    data = {
        "schema": "anima-regional-independent-signed-prediction-v1",
        "sign": sign,
        "outputSha256": hashlib.sha256(call.command.output_path.read_bytes()).hexdigest(),
        "actualPredictionSha256": digest(captured["prediction"]),
        "expectedPredictionSha256": digest(predicted),
        "expectedContextSha256": digest(context),
        "expectedMaskSha256": None if expected_mask is None else digest(expected_mask),
        "sites": [
            {
                "pass": item["pass"],
                "kind": item["kind"],
                "block": item["block"],
                "maskSha256": None if item["mask"] is None else digest(item["mask"]),
            }
            for item in run.observed.processors
        ],
    }
    (call.command.staging_root / (sign + "-prediction-oracle.json")).write_text(
        json.dumps(data, indent=2) + "\n"
    )
    assert torch.equal(captured["prediction"], predicted), (
        "Native signed-negative prediction consumed wrong context or mask"
    )


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("method", _METHODS)
def test_all_existing_native_methods_consume_independent_signed_banks(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    method: str,
) -> None:
    call = _call(tmp_path / "request", main_inputs, mode, method)
    contexts = _contexts(call, native)
    original = None
    source_pixels = keep = None
    if mode != "txt2img":
        source_pixels, original = (_image_source if mode == "img2img" else _outpaint_source)(
            call, native
        )
        if mode == "outpaint":
            with Image.open(io.BytesIO(call.target_bytes)) as source:
                keep, _ = _mask_reference(source, native.torch)
    with _preserved(native):
        actual = _run(call, native, monkeypatch, mode)
        _association(call, native, actual, contexts)
        if mode == "txt2img":
            _txt_history(call, native, actual.observed, actual.result)
        else:
            assert len(actual.source.encodes) == 1
            assert native.torch.equal(actual.source.encodes[0], source_pixels)
            if mode == "img2img":
                _image_history(call, native, actual.observed, original, actual.result)
            else:
                _outpaint_history(
                    call, native, actual.observed, actual.source, original, cast(Image.Image, keep)
                )


def test_anima_negative_mask_routing_red(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mutation target: drop/misroute only the valid negative mask after preparation.

    Keep original models, encoders and native computation. The output must exist
    before this oracle rejects wrong negative even-block permissions; bypassing
    preparation with a malformed descriptor is not this semantic mutation.
    """
    call = _call(tmp_path / "signed", main_inputs, method="heun")
    contexts = _contexts(call, native)
    with _preserved(native):
        actual = _run(call, native, monkeypatch)
        assert call.command.output_path.is_file()
        _prediction_check(call, native, actual, contexts[1], "negative")
        _association(call, native, actual, contexts)


def test_anima_negative_cfg_one_control_green(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    results: list[_Run] = []
    for index, variant in enumerate(("negative", "negative-neighbor")):
        call = _call(tmp_path / f"cfg1-{index}", main_inputs, variant=variant, guidance=1)
        contexts = _contexts(call, native)
        with _preserved(native):
            actual = _run(call, native, monkeypatch)
            _prediction_check(call, native, actual, contexts[0], "positive")
            _association(call, native, actual, contexts)
        assert actual.observed.qwen == actual.observed.conditioner == 4
        assert all(item["context"].shape[1] == 1536 for item in actual.observed.passes)
        results.append(actual)
    assert results[0].pixels == results[1].pixels
    for first, second in zip(results[0].observed.passes, results[1].observed.passes, strict=True):
        assert native.torch.equal(first["context"], second["context"])
        assert native.torch.equal(first["prediction"], second["prediction"])


@pytest.mark.parametrize(
    "kind", ("local-empty", "whitespace", "all-inherited", "unequal", "negative-only")
)
def test_literal_inheritance_empty_and_absent_positive_semantics(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
) -> None:
    variant = "negative-only" if kind == "negative-only" else "negative"
    options: dict[str, Any] = {}
    if kind == "local-empty":
        options.update(regionalNegativeTexts=["", ""], inheritGlobalNegative=[False, False])
    elif kind == "whitespace":
        options.update(regionalNegativeTexts=[" ", ""], inheritGlobalNegative=[False, False])
    elif kind == "all-inherited":
        options.update(inheritGlobalNegative=[True, True])
    elif kind == "unequal":
        options.update(
            regionalNegativeTexts=["(red scarf)1.5", ""], inheritGlobalNegative=[False, False]
        )
    call = _call(tmp_path / kind, main_inputs, variant=variant, **options)
    expected = _contexts(call, cpu_native)
    with _preserved(cpu_native):
        actual = _run(call, cpu_native, monkeypatch)
        _association(call, cpu_native, actual, expected)
    if kind == "all-inherited":
        assert expected[1].shape[1] == 1536
        assert cpu_native.torch.equal(expected[1][:, :512], expected[1][:, 512:1024])
        assert cpu_native.torch.equal(expected[1][:, :512], expected[1][:, 1024:])
    if kind == "negative-only":
        assert expected[0].shape[1] == 512 and expected[1].shape[1] == 1536
        assert all(
            item["mask"] is None for item in actual.observed.processors if item["pass"] % 2 == 0
        )
    if kind in ("whitespace", "unequal"):
        assert expected[0].shape[1] == 1536 and expected[1].shape[1] == 1024


@pytest.mark.parametrize("geometry", ("zero-negative", "full", "overlap", "partial", "threshold"))
def test_signed_mask_geometry_matches_independent_nearest_permissions(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    geometry: str,
) -> None:
    # Only this targeted geometry unit changes transported bytes after Main capture.
    variant = "negative-only" if geometry == "zero-negative" else "negative"
    handoff = main_inputs(variant)
    bbox = handoff["recipe"]["bbox"]
    width, height = bbox["width"], bbox["height"]
    for index, region in enumerate(handoff["recipe"]["regions"]):
        alpha = region["coverage"]["alpha"]
        if geometry == "zero-negative":
            region["coverage"]["alpha"] = [0] * len(alpha)
            region["coverage"]["kind"] = "intersecting-empty"
        elif geometry == "overlap" or (geometry == "full" and index == 0):
            region["coverage"]["alpha"] = [255] * len(alpha)
            region["coverage"]["intersection"] = copy.deepcopy(bbox)
        elif geometry == "full":
            pass
        elif geometry == "partial":
            alpha[(height // 2) * width :] = [0] * (len(alpha) - (height // 2) * width)
        else:
            region["coverage"]["alpha"] = [
                127 + ((x // 8 + y // 8 + index) % 2) for y in range(height) for x in range(width)
            ]
            region["coverage"]["intersection"] = copy.deepcopy(bbox)

    def supplied(_variant: str) -> dict[str, Any]:
        return handoff

    call = _call(tmp_path / geometry, supplied)
    expected = _contexts(call, cpu_native)
    with _preserved(cpu_native):
        actual = _run(call, cpu_native, monkeypatch)
        _association(call, cpu_native, actual, expected)
    pos, neg = _mask(call, cpu_native, "positive"), _mask(call, cpu_native, "negative")
    assert neg is not None and bool(neg[..., :512].all().item())
    if geometry == "partial":
        assert pos.shape == neg.shape and not cpu_native.torch.equal(pos, neg)
    if geometry == "zero-negative":
        assert pos is None and not bool(neg[..., 512:].any().item())
        # Inactive even columns are still visible on odd negative blocks.
        assert any(
            item["pass"] % 2 == 1
            and item["block"] % 2 == 1
            and item["kind"] == "cross"
            and item["keys"] == 1536
            and item["mask"] is None
            for item in actual.observed.processors
        )


@pytest.mark.parametrize("dimensions", ((104, 72), (96, 72), (104, 80)))
def test_signed_masks_follow_actual_odd_latent_padding(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    dimensions: tuple[int, int],
) -> None:
    call = _call(tmp_path / "odd", main_inputs, width=dimensions[0], height=dimensions[1])
    expected = _contexts(call, cpu_native)
    with _preserved(cpu_native):
        actual = _run(call, cpu_native, monkeypatch)
        _association(call, cpu_native, actual, expected)
    assert _mask(call, cpu_native, "negative").shape[-2] == math.ceil(
        dimensions[1] / 16
    ) * math.ceil(dimensions[0] / 16)


def test_empty_negative_profile_preserves_the_existing_private_pixels(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runs: list[_Run] = []
    for index, profile in enumerate((None, _NEGATIVE)):
        call = _call(tmp_path / f"legacy-{index}", main_inputs, variant="base")
        expected = _contexts(call, native)
        with _preserved(native):
            actual = _run(call, native, monkeypatch, negative_profile=profile)
            _association(call, native, actual, expected)
        runs.append(actual)
    assert runs[0].pixels == runs[1].pixels
    for first, second in zip(runs[0].observed.passes, runs[1].observed.passes, strict=True):
        assert native.torch.equal(first["prediction"], second["prediction"])


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("profile", (None, "unsupported-negative-profile", True))
@pytest.mark.parametrize("guidance", (1, 3))
def test_default_or_invalid_negative_profile_refuses_before_any_original_forward(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    profile: Any,
    guidance: float,
) -> None:
    call = _call(tmp_path / "refuse", main_inputs, mode, guidance=guidance)
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        with pytest.raises(DerivativeError) as caught:
            _frontend(mode)(
                call.handoff["recipe"], **_arguments(call, cpu_native, negative_profile=profile)
            )
        assert caught.value.code == (
            "GENERATION_PROMPT_UNSUPPORTED" if profile is None else "INVALID_REQUEST"
        )
        diagnostic = (
            "Spatial Anima regional negative"
            if profile is None
            else "negative profile is unsupported"
        )
        assert diagnostic in str(caught.value)
        assert (
            observed.qwen
            == observed.conditioner
            == len(observed.passes)
            == len(observed.decoded)
            == 0
        )
    assert call.command.target_path.read_bytes() == call.target_bytes
    assert not call.command.output_path.exists()


@pytest.mark.parametrize(
    "change", ("missing", "extra", "source", "sign", "text", "inheritance", "order", "owner")
)
def test_signed_metadata_disagreement_refuses_before_borrowed_consumption(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _call(tmp_path / change, main_inputs)
    records = call.handoff["compiledPrompts"]
    index = next(
        i for i, record in enumerate(records) if record["polarity"] == "negative" and i > 1
    )
    if change == "missing":
        records.pop(index)
    elif change == "extra":
        records.append(copy.deepcopy(records[index]))
    elif change == "source":
        records[index]["sourceId"] = records[-1]["sourceId"]
    elif change == "sign":
        records[index]["polarity"] = "positive"
    elif change == "text":
        records[index]["text"] += " different"
    elif change == "inheritance":
        call.handoff["recipe"]["regions"][1]["negative"]["prompt"]["text"] += " different"
    elif change == "order":
        records[2], records[index] = records[index], records[2]
    else:
        call.handoff["recipe"]["regions"][1]["regionId"] = call.handoff["recipe"]["regions"][0][
            "regionId"
        ]
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        with pytest.raises(DerivativeError):
            _frontend("txt2img")(call.handoff["recipe"], **_arguments(call, cpu_native))
        assert observed.qwen == observed.conditioner == len(observed.passes) == 0
    assert not call.command.output_path.exists()


@pytest.mark.parametrize("guidance", (1, 3))
def test_later_negative_weight_overflow_is_preflighted_even_when_cfg_is_one(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    guidance: float,
) -> None:
    call = _call(
        tmp_path / "overflow",
        main_inputs,
        guidance=guidance,
        regionalNegativeTexts=["(red scarf)1.5", "(bad)1000000000000000000000000000000000000000"],
        inheritGlobalNegative=[False, False],
    )
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        with pytest.raises(DerivativeError) as caught:
            _frontend("txt2img")(call.handoff["recipe"], **_arguments(call, cpu_native))
        assert caught.value.code == "GENERATION_PROMPT_UNSUPPORTED"
        assert observed.qwen == observed.conditioner == len(observed.passes) == 0


def test_negative_bank_budget_is_independent_and_precedes_first_qwen(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    request: pytest.FixtureRequest,
) -> None:
    # Global-only positive K512 fits; two negative extras K1536 exceed32Mi expanded
    # elements for the original two heads at this genuine admitted recipe geometry.
    handoff = main_inputs("negative-only", width=2048, height=1920)
    native = cast(_Native, request.getfixturevalue("cpu_native"))
    call = _command(tmp_path / "budget", handoff)
    with _observed(native, monkeypatch) as observed, pytest.raises(DerivativeError) as caught:
        _frontend("txt2img")(call.handoff["recipe"], **_arguments(call, native))
    assert caught.value.code == "LIMIT"
    assert observed.qwen == observed.conditioner == len(observed.passes) == 0
    assert not call.command.output_path.exists()


@pytest.mark.parametrize("component", ("qwen3_encoder", "text_conditioner", "transformer"))
def test_global_lora_scope_reaches_every_signed_negative_context(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    component: str,
) -> None:
    call = _call(tmp_path / "lora", main_inputs)
    item, _state = _resource(tmp_path, cpu_native, (component,), weight=-0.35)
    baseline = _contexts(call, cpu_native)
    call.command = replace(call.command, loras=(item,))
    with (
        cpu_native.torch.no_grad(),
        scoped_anima_generation_loras(cpu_native.models, (item,), cpu_native.torch),
    ):
        expected = _contexts(call, cpu_native)
    with _preserved(cpu_native):
        actual = _run(call, cpu_native, monkeypatch, lora_profile=_LORA)
        _association(call, cpu_native, actual, expected)
    for start in range(0, expected[1].shape[1], 512):
        same = cpu_native.torch.equal(
            baseline[1][:, start : start + 512], expected[1][:, start : start + 512]
        )
        assert same is (component == "transformer")


@pytest.mark.parametrize(
    "mode,stage",
    (
        ("txt2img", "negative-encode"),
        ("txt2img", "negative-prediction"),
        ("img2img", "negative-prediction"),
        ("outpaint", "negative-prediction"),
        ("txt2img", "decode"),
        ("img2img", "publication"),
        ("outpaint", "decode"),
        ("outpaint", "publication"),
    ),
)
def test_negative_late_failures_restore_and_allow_an_exact_fresh_call(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    stage: str,
) -> None:
    native = cpu_native
    baseline = _call(tmp_path / "baseline", main_inputs, mode)
    with _preserved(native):
        expected = _run(baseline, native, monkeypatch, mode)
    failed = _call(tmp_path / "failed", main_inputs, mode)
    sentinel = RuntimeError("controlled signed-negative " + stage)
    with _preserved(native), monkeypatch.context() as patch:
        if stage == "negative-encode":
            original = regional.encode_anima_prompt
            count = 0

            @wraps(original)
            def encoded(*args: Any, **kwargs: Any) -> Any:
                nonlocal count
                value = original(*args, **kwargs)
                count += 1
                if count == 4:
                    raise sentinel
                return value

            patch.setattr(regional, "encode_anima_prompt", encoded)
        elif stage == "negative-prediction":
            model_type = cast(Any, type(native.models.transformer))
            original = model_type.forward
            count = 0

            @wraps(original)
            def forward(self: Any, *args: Any, **kwargs: Any) -> Any:
                nonlocal count
                if self is native.models.transformer:
                    count += 1
                    if count == 4:
                        raise sentinel
                return original(self, *args, **kwargs)

            patch.setattr(model_type, "forward", forward)
        elif stage == "decode":
            model_type = cast(Any, type(native.models.vae))
            original = model_type.decode

            @wraps(original)
            def decoded(self: Any, *args: Any, **kwargs: Any) -> Any:
                value = original(self, *args, **kwargs)
                if self is native.models.vae:
                    raise sentinel
                return value

            patch.setattr(model_type, "decode", decoded)
        else:

            def publish(*_args: Any, **_kwargs: Any) -> Any:
                raise sentinel

            patch.setattr(regional, "publish_generation_image", publish)
        with pytest.raises(Exception) as caught:
            _run(failed, native, patch, mode)
        assert _contains_cause(caught.value, sentinel)
        assert not failed.command.output_path.exists()
        assert failed.command.target_path.read_bytes() == failed.target_bytes
        assert not list(failed.command.staging_root.glob("*.tmp"))
    assert not cast(Any, regional)._MODEL_OWNERS and not cast(Any, regional)._ATTENTION_OWNERS
    recovery = _call(tmp_path / "recovered", main_inputs, mode)
    with _preserved(native):
        actual = _run(recovery, native, monkeypatch, mode)
    assert actual.pixels == expected.pixels
    for left, right in zip(expected.observed.passes, actual.observed.passes, strict=True):
        assert native.torch.equal(left["prediction"], right["prediction"])


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("variant", ("base", "negative"))
def test_worker_routes_the_negative_profile_from_frozen_effective_records(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    variant: str,
) -> None:
    call = _call(tmp_path / "source", main_inputs, mode, variant=variant)
    case = (
        _case(tmp_path / "wire", call.handoff)
        if mode == "txt2img"
        else (_image_wire if mode == "img2img" else _outpaint_wire)(tmp_path / "wire", call)
    )
    captured = worker.parse_anima_regional_request(case.wire)
    runtime = _runtime()
    models = SimpleNamespace(
        **{
            name: SimpleNamespace(eval=lambda: None)
            for name in ("transformer", "text_conditioner", "qwen3_encoder", "vae")
        }
    )
    order: list[str] = []
    prepared = cast(Any, (object(), object()))

    def load(bundle: Any, **kwargs: Any) -> Any:
        assert bundle == captured.command.bundle
        assert kwargs == {"device": "cuda", "dtype": cast(Any, runtime.torch).bfloat16}
        order.append("load")
        return models

    def prepare(command: Any) -> Any:
        assert command == captured.command
        order.append("prepare")
        return prepared

    def generate(recipe: Any, **kwargs: Any) -> dict[str, object]:
        assert recipe == captured.recipe and kwargs["command"] == captured.command
        assert kwargs["models"] is models
        assert kwargs.get("negative_profile") == (_NEGATIVE if variant == "negative" else None)
        assert ("negative_profile" in kwargs) is (variant == "negative")
        assert order == (["prepare", "load"] if mode == "outpaint" else ["load"])
        if mode == "outpaint":
            assert kwargs["_prepared_outpaint"] is prepared
        return {"type": "generation-done", "requestId": captured.command.request_id}

    monkeypatch.setattr(worker, "load_anima_models", load)
    monkeypatch.setattr(worker, "prepare_worker_outpaint", prepare)
    monkeypatch.setattr(worker, _frontend(mode).__name__, generate)
    result = worker.execute_anima_regional_request(case.wire, config_dir=tmp_path, runtime=runtime)
    assert result == {"type": "generation-done", "requestId": captured.command.request_id}


def test_negative_capability_requires_the_existing_complete_anima_runtime() -> None:
    assert worker.ANIMA_REGIONAL_NEGATIVE_CAPABILITY == "anima-regional-negative-v1"
    for runtime, expected in ((None, False), (_runtime(bf16=False), False), (_runtime(), True)):
        ready = inference_main.inference_ready_message(runtime)
        capabilities = cast(list[str], ready["capabilities"])
        assert ready["workerVersion"] == "0.14.0"
        assert (worker.ANIMA_REGIONAL_NEGATIVE_CAPABILITY in capabilities) is expected
        if expected:
            assert {"anima-txt2img", worker.ANIMA_REGIONAL_CAPABILITY} <= set(capabilities)
