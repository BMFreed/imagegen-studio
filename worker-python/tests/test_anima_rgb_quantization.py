"""Native shared executor RGB against current pinned Invoke conversion statements.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
invokeai/app/invocations/vae/anima_latents_to_image.py and its graph.ts
anima_l2i caller. Controlled decode samples isolate the conversion boundary;
the original tiny native VAE still encodes/decodes on every request. These are
not trained-image, visual-quality or installed-worker qualification tests.
"""

from __future__ import annotations

import ast
import hashlib
import os
from collections.abc import Generator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.generation_artifacts import publish_generation_image
from test_anima_euler import inputs, run
from test_anima_euler import native as euler_native

native = euler_native
_SOURCE = "invokeai/app/invocations/vae/anima_latents_to_image.py"
_SOURCE_SHA = "e2c248839b9346c0a0cdf8397eb9d4a773ca98bb8c1657436a6c3be5b8af99c2"
_ABSENT = object()


@lru_cache(maxsize=1)
def _invoke_conversion() -> Any:
    root = Path(
        os.environ.get(
            "IGS_INVOKE_SOURCE_ROOT", str(Path(__file__).resolve().parents[3] / "sources/InvokeAI")
        )
    )
    path = root / _SOURCE
    if not path.is_file():
        pytest.skip("RGB oracle requires the pinned local Invoke source.")
    source = path.read_bytes()
    assert hashlib.sha256(source).hexdigest() == _SOURCE_SHA
    klass = next(
        node
        for node in ast.parse(source).body
        if isinstance(node, ast.ClassDef) and node.name == "AnimaLatentsToImageInvocation"
    )
    method = next(
        node for node in klass.body if isinstance(node, ast.FunctionDef) and node.name == "invoke"
    )
    statements: list[ast.stmt] = []
    for node in ast.walk(method):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        call = node.value
        if target.id == "img_pil" or (
            target.id == "img"
            and isinstance(call, ast.Call)
            and (
                isinstance(call.func, ast.Attribute)
                and call.func.attr == "clamp"
                or isinstance(call.func, ast.Name)
                and call.func.id == "rearrange"
            )
        ):
            statements.append(node)
    statements.sort(key=lambda node: node.lineno)
    assert len(statements) == 3
    return compile(ast.Module(body=statements, type_ignores=[]), str(path), "exec")


def _invoke_pixels(decoded: Any) -> Image.Image:
    def rearrange(value: Any, pattern: str) -> Any:
        # Only adapt the named layout primitive, never the source arithmetic.
        assert pattern == "c h w -> h w c"
        return value.permute(1, 2, 0)

    namespace: dict[str, Any] = {"Image": Image, "img": decoded.squeeze(2), "rearrange": rearrange}
    exec(_invoke_conversion(), namespace)
    image = namespace["img_pil"]
    assert isinstance(image, Image.Image) and image.mode == "RGB"
    return image


def _legacy_pixels(decoded: Any, torch: Any) -> bytes:
    value = (127.5 * (decoded[0, :, 0].float().clamp(-1, 1) + 1)).to(torch.uint8)
    return value.permute(1, 2, 0).contiguous().cpu().numpy().tobytes()


def _pattern(torch: Any, dtype: str) -> Any:
    ramp = torch.linspace(-1.1, 1.1, 64 * 64, dtype=torch.float32).reshape(64, 64)
    channels = torch.stack((ramp, torch.roll(ramp, 17, 1), -ramp))
    channels[:, 0, 0] = torch.tensor([-2.0, 0.0, 2.0])
    channels[:, 0, 1] = torch.tensor([1.0, -1.0, 0.0])
    return channels.unsqueeze(0).unsqueeze(2).to(dtype=getattr(torch, dtype))


@contextmanager
def _decoded_sample(
    native: Any, monkeypatch: pytest.MonkeyPatch, sample: Any | None
) -> Generator[list[Any]]:
    vae = native[2].vae
    vae_class: Any = cast(Any, type(vae))
    original = vae_class.decode
    original_slot: Any = cast(dict[str, Any], vars(vae_class)).get("decode", _ABSENT)
    observations: list[Any] = []

    def decode(self: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(self, *args, **kwargs)
        if self is vae:
            observations.append(result.sample.detach().clone())
            if sample is not None:
                # Keep the original native output object. Only its controlled sample
                # crosses the boundary under test; no conversion helper is replaced.
                result.sample = sample
        return result

    try:
        with monkeypatch.context() as patch:
            patch.setattr(vae_class, "decode", decode)
            yield observations
    finally:
        assert cast(dict[str, Any], vars(vae_class)).get("decode", _ABSENT) is original_slot


def _publish(image: Image.Image, path: Path, *, request: str = "rgb-probe") -> dict[str, object]:
    return publish_generation_image(
        image,
        staging_root=path.parent,
        output_path=path,
        width=64,
        height=64,
        request_id=request,
        seed=0,
        output_mode="RGB",
    )


def _assert_png(path: Path, expected: Image.Image) -> None:
    with Image.open(path) as reopened:
        reopened.load()
        assert reopened.format == "PNG" and reopened.mode == "RGB"
        assert reopened.size == expected.size == (64, 64)
        assert reopened.tobytes() == expected.tobytes()
        assert reopened.info["icc_profile"] == SRGB_ICC_PROFILE


@pytest.mark.parametrize("dtype", ["bfloat16", "float16", "float32"])
def test_native_decode_precision_matches_pinned_invoke_rgb(
    native: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, dtype: str
) -> None:
    torch = native[0]
    data = inputs(mode="img2img", strength=0)
    source = Image.new("RGB", (64, 64), (13, 117, 241))
    source_bytes, rng = source.tobytes(), torch.random.get_rng_state().clone()
    baseline = run(data, native, source_image=source)
    sample = _pattern(torch, dtype)
    sample_before = sample.clone()
    expected = _invoke_pixels(sample)
    old = _legacy_pixels(sample, torch)
    assert (expected.tobytes() == old) == (dtype == "float32")
    assert expected.getpixel((0, 0)) == (0, 127, 255)
    assert expected.getpixel((1, 0)) == (255, 0, 127)
    with _decoded_sample(native, monkeypatch, sample) as decoded:
        actual = run(data, native, source_image=source)
    assert len(decoded) == 1
    assert torch.equal(sample, sample_before), "Conversion changed its decoded input"
    assert torch.equal(actual.latents, baseline.latents) and actual.total_steps == 0
    assert source.tobytes() == source_bytes and torch.equal(rng, torch.random.get_rng_state())
    assert actual.image.tobytes() == expected.tobytes()
    assert actual.image.info["icc_profile"] == SRGB_ICC_PROFILE
    path = tmp_path / "rgb.png"
    done = _publish(actual.image, path)
    assert done["type"] == "generation-done" and done["requestId"] == "rgb-probe"
    assert done["outputPath"] == str(path) and done["seed"] == 0
    _assert_png(path, expected)


def test_float32_original_decode_control_green(
    native: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    torch = native[0]
    data = inputs(steps=1, guidanceScale=1)
    with _decoded_sample(native, monkeypatch, None) as decoded:
        actual = run(data, native)
    assert len(decoded) == 1 and decoded[0].dtype == torch.float32
    expected = _invoke_pixels(decoded[0])
    assert actual.image.tobytes() == expected.tobytes() == _legacy_pixels(decoded[0], torch)
    repeated = run(data, native)
    assert torch.equal(repeated.latents, actual.latents)
    assert repeated.image.tobytes() == actual.image.tobytes()
    path = tmp_path / "float32.png"
    _publish(actual.image, path)
    _assert_png(path, expected)


@pytest.mark.parametrize("fault", ["nan", "inf", "negative-inf", "channels", "height", "temporal"])
def test_invalid_decoded_sample_refuses_before_png_and_recovers(
    native: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, fault: str
) -> None:
    torch = native[0]
    data = inputs(mode="img2img", strength=0)
    source = Image.new("RGB", (64, 64), (13, 117, 241))
    source_bytes = source.tobytes()
    sample = _pattern(torch, "bfloat16")
    if fault in ("nan", "inf", "negative-inf"):
        sample[0, 0, 0, 0, 0] = {
            "nan": float("nan"),
            "inf": float("inf"),
            "negative-inf": -float("inf"),
        }[fault]
    elif fault == "channels":
        sample = sample[:, :2]
    elif fault == "height":
        sample = sample[..., :63, :]
    else:
        sample = sample.expand(1, 3, 2, 64, 64).contiguous()
    hooks_before = tuple(len(module._forward_hooks) for module in native[2].vae.modules())
    tiled = native[2].vae.use_tiling
    path = tmp_path / "refused.png"
    with (
        _decoded_sample(native, monkeypatch, sample) as decoded,
        pytest.raises(DerivativeError) as error,
    ):
        result = run(data, native, source_image=source)
        _publish(result.image, path)
    assert error.value.code == "GENERATION_WORKER_FAILED"
    assert len(decoded) == 1 and not path.exists()
    assert tuple(len(module._forward_hooks) for module in native[2].vae.modules()) == hooks_before
    assert native[2].vae.use_tiling == tiled and source.tobytes() == source_bytes
    with _decoded_sample(native, monkeypatch, None) as healthy_decoded:
        healthy = run(data, native, source_image=source)
    assert len(healthy_decoded) == 1
    _publish(healthy.image, path)
    _assert_png(path, _invoke_pixels(healthy_decoded[0]))


def test_bf16_publication_preserves_existing_output_and_recovers(
    native: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    sample = _pattern(native[0], "bfloat16")
    source = Image.new("RGB", (64, 64), (13, 117, 241))
    with _decoded_sample(native, monkeypatch, sample):
        actual = run(inputs(mode="img2img", strength=0), native, source_image=source)
    expected = _invoke_pixels(sample)
    path = tmp_path / "occupied.png"
    original = b"pre-existing output must survive"
    path.write_bytes(original)
    with pytest.raises(DerivativeError) as error:
        _publish(actual.image, path)
    assert error.value.code == "OUTPUT_UNAVAILABLE"
    assert path.read_bytes() == original
    assert not list(tmp_path.glob(".occupied.png.*.tmp"))
    fresh = tmp_path / "fresh.png"
    _publish(actual.image, fresh)
    _assert_png(fresh, expected)
