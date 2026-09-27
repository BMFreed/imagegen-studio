"""The derivatives worker recognizes, but cannot execute, the future txt2img job."""

from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import cast

from imagegen_worker.compositor import MAX_WORLD_COORDINATE
from imagegen_worker.derivatives import PINNED_SRGB_ICC_SHA256
from imagegen_worker.protocol import (
    MAX_GENERATION_CFG_SCALE,
    MAX_GENERATION_PROMPT_BYTES,
    MAX_GENERATION_STEPS,
    MAX_GENERATION_TARGET_BYTES,
    GenerateIllustriousTxt2ImgCommand,
    parse_request,
    process_request,
)

SHA256 = "a" * 64
ICC_SHA256 = PINNED_SRGB_ICC_SHA256


def generation_request(root: Path) -> dict[str, object]:
    staging = root / "staging"
    return {
        "type": "generate-illustrious-txt2img",
        "protocolVersion": "1",
        "requestId": "generation-1",
        "job": {
            "schemaVersion": 1,
            "checkpoint": {
                "path": str(root / "checkpoint.safetensors"),
                "sha256": SHA256,
                "predictionType": "epsilon",
            },
            "target": {
                "path": str(staging / "target.png"),
                "sha256": SHA256,
                "byteSize": 1024,
                "width": 64,
                "height": 64,
                "iccSha256": ICC_SHA256,
            },
            "bbox": {"x": -128, "y": 64, "width": 64, "height": 64},
            "prompts": {"positive": "portrait", "negative": "blur"},
            "sampling": {"steps": 24, "cfgScale": 5.5, "seed": 0, "scheduler": "dpmpp_2m_k"},
            "output": {
                "stagingRoot": str(staging),
                "pngPath": str(staging / "result.png"),
            },
        },
    }


def set_nested(request: dict[str, object], keys: tuple[str, ...], value: object) -> None:
    current = request
    for key in keys[:-1]:
        current = cast(dict[str, object], current[key])
    current[keys[-1]] = value


def delete_nested(request: dict[str, object], keys: tuple[str, ...]) -> None:
    current = request
    for key in keys[:-1]:
        current = cast(dict[str, object], current[key])
    del current[keys[-1]]


def test_valid_generation_shape_is_recognized_but_never_executed(tmp_path: Path) -> None:
    request = generation_request(tmp_path)
    command = parse_request(request)
    assert isinstance(command, GenerateIllustriousTxt2ImgCommand)
    assert command.request_id == "generation-1"
    assert process_request(request) == {
        "type": "error",
        "protocolVersion": "1",
        "requestId": "generation-1",
        "code": "INFERENCE_UNAVAILABLE",
        "message": "This worker does not support image generation.",
    }
    assert list(tmp_path.iterdir()) == []


def test_generation_parser_rejects_bad_fields_before_unavailable_response(tmp_path: Path) -> None:
    staging = tmp_path / "staging"
    invalid_fields: list[tuple[tuple[str, ...], object]] = [
        (("job", "schemaVersion"), True),
        (("job", "schemaVersion"), 2),
        (("job", "checkpoint", "path"), "relative.safetensors"),
        (("job", "checkpoint", "path"), str(tmp_path / "other" / ".." / "model")),
        (("job", "checkpoint", "sha256"), "A" * 64),
        (("job", "checkpoint", "predictionType"), "unknown"),
        (("job", "target", "path"), "target.png"),
        (("job", "target", "path"), str(tmp_path / "outside-target.png")),
        (("job", "target", "path"), str(staging / "nested" / "target.png")),
        (("job", "target", "path"), str(staging / "target.webp")),
        (("job", "target", "sha256"), "missing"),
        (("job", "target", "iccSha256"), "missing"),
        (("job", "target", "iccSha256"), "b" * 64),
        (("job", "target", "byteSize"), 0),
        (("job", "target", "byteSize"), MAX_GENERATION_TARGET_BYTES + 1),
        (("job", "target", "width"), 63),
        (("job", "target", "width"), 2056),
        (("job", "target", "height"), 72),
        (("job", "bbox", "x"), True),
        (("job", "bbox", "x"), MAX_WORLD_COORDINATE + 1),
        (("job", "bbox", "width"), 0),
        (("job", "prompts", "positive"), []),
        (("job", "prompts", "positive"), "é" * (MAX_GENERATION_PROMPT_BYTES // 2 + 1)),
        (("job", "prompts", "negative"), "\ud800"),
        (("job", "sampling", "steps"), 0),
        (("job", "sampling", "steps"), MAX_GENERATION_STEPS + 1),
        (("job", "sampling", "cfgScale"), 0.5),
        (("job", "sampling", "cfgScale"), MAX_GENERATION_CFG_SCALE + 0.1),
        (("job", "sampling", "cfgScale"), float("nan")),
        (("job", "sampling", "seed"), True),
        (("job", "sampling", "seed"), -1),
        (("job", "sampling", "seed"), 0x100000000),
        (("job", "sampling", "scheduler"), "not-qualified"),
        (("job", "output", "stagingRoot"), "relative/staging"),
        (("job", "output", "pngPath"), str(staging / "nested" / "result.png")),
        (("job", "output", "pngPath"), str(staging / "result.webp")),
        (("job", "output", "pngPath"), str(staging / ".." / "result.png")),
        (("job", "output", "pngPath"), str(staging / "target.png")),
    ]
    for keys, value in invalid_fields:
        request = generation_request(tmp_path)
        set_nested(request, keys, value)
        result = process_request(request)
        assert result["code"] == "INVALID_REQUEST", (keys, value, result)
        assert result["requestId"] == "generation-1"

    for keys in (
        ("job", "checkpoint", "sha256"),
        ("job", "target", "byteSize"),
        ("job", "prompts", "negative"),
        ("job", "sampling", "seed"),
        ("job", "output", "pngPath"),
    ):
        request = generation_request(tmp_path)
        delete_nested(request, keys)
        assert process_request(request)["code"] == "INVALID_REQUEST", keys

    for keys in (("extra",), ("job", "extra"), ("job", "checkpoint", "extra")):
        request = generation_request(tmp_path)
        set_nested(request, keys, 1)
        assert process_request(request)["code"] == "INVALID_REQUEST", keys
    assert list(tmp_path.iterdir()) == []


def test_supported_enums_and_seed_limits_remain_valid_input(tmp_path: Path) -> None:
    for scheduler in ("dpmpp_2m_k", "dpmpp_2m", "euler_a", "dpmpp_sde_k", "dpmpp_sde"):
        for prediction_type in ("epsilon", "v_prediction", "sample"):
            request = generation_request(tmp_path)
            set_nested(request, ("job", "sampling", "scheduler"), scheduler)
            set_nested(request, ("job", "checkpoint", "predictionType"), prediction_type)
            set_nested(request, ("job", "sampling", "seed"), 0xFFFFFFFF)
            assert process_request(request)["code"] == "INFERENCE_UNAVAILABLE"
    assert list(tmp_path.iterdir()) == []


def test_generation_dimensions_require_alignment_and_target_pixel_ceiling(tmp_path: Path) -> None:
    for side in (63, 2048):
        request = generation_request(tmp_path)
        for section in ("target", "bbox"):
            set_nested(request, ("job", section, "width"), side)
            set_nested(request, ("job", section, "height"), side)
        assert process_request(request)["code"] == "INVALID_REQUEST", side

    aligned = generation_request(tmp_path)
    for section in ("target", "bbox"):
        set_nested(aligned, ("job", section, "width"), 8)
        set_nested(aligned, ("job", section, "height"), 8)
    assert process_request(aligned)["code"] == "INFERENCE_UNAVAILABLE"
    assert list(tmp_path.iterdir()) == []


def test_prompt_and_target_byte_ceiling_boundaries_are_accepted(tmp_path: Path) -> None:
    request = generation_request(tmp_path)
    set_nested(request, ("job", "target", "byteSize"), MAX_GENERATION_TARGET_BYTES)
    set_nested(request, ("job", "prompts", "positive"), "é" * (MAX_GENERATION_PROMPT_BYTES // 2))
    set_nested(request, ("job", "prompts", "negative"), "a" * MAX_GENERATION_PROMPT_BYTES)
    assert process_request(request)["code"] == "INFERENCE_UNAVAILABLE"
    assert list(tmp_path.iterdir()) == []


def test_sampling_operational_boundaries_are_accepted(tmp_path: Path) -> None:
    for steps, cfg_scale in ((1, 1), (MAX_GENERATION_STEPS, MAX_GENERATION_CFG_SCALE)):
        request = generation_request(tmp_path)
        set_nested(request, ("job", "sampling", "steps"), steps)
        set_nested(request, ("job", "sampling", "cfgScale"), cfg_scale)
        assert process_request(request)["code"] == "INFERENCE_UNAVAILABLE"
    assert list(tmp_path.iterdir()) == []


def test_json_lines_worker_refuses_valid_generation_without_io(tmp_path: Path) -> None:
    request = generation_request(tmp_path)
    invalid = deepcopy(request)
    set_nested(invalid, ("job", "sampling", "seed"), -1)
    result = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input="".join(json.dumps(item) + "\n" for item in (request, invalid)),
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    assert result.stderr == ""
    ready, refused, malformed = [json.loads(line) for line in result.stdout.splitlines()]
    assert ready["runtimeProfile"] == "derivatives-only"
    assert not any("generat" in capability for capability in ready["capabilities"])
    assert refused["code"] == "INFERENCE_UNAVAILABLE"
    assert refused["requestId"] == "generation-1"
    assert malformed["code"] == "INVALID_REQUEST"
    assert list(tmp_path.iterdir()) == []
