"""Real PIL conditioning, with independently executed pinned Invoke mask methods."""

from __future__ import annotations

import ast
import hashlib
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.outpaint_conditioning import (
    capture_outpaint_source,
    create_outpaint_contribution,
    prepare_outpaint_conditioning,
)

_SOURCE_HASHES = {
    "invokeai/app/invocations/sd/create_gradient_mask.py": (
        "8d841f7bc6ab7678232baa3d42fb87d2fd50534b48b128a52ca4c6ac24557e7c"
    ),
    "invokeai/app/invocations/image.py": (
        "354f952ebfcb35872bd38cd8668984de19cad2e879df6eccc91f418dc488a20e"
    ),
}


def _source(kind: str = "binary") -> Image.Image:
    image = Image.new("RGBA", (128, 64), (32, 64, 96, 255))
    alpha = Image.new("L", image.size, 255)
    alpha.paste(0, (64, 0, 128, 64))
    if kind == "soft":
        alpha.paste(128, (40, 16, 56, 48))
        alpha.putpixel((20, 32), 254)
    elif kind == "diagonal":
        for row in range(64):
            alpha.paste(0, (32 + row, row, 128, row + 1))
    elif kind == "uniform":
        alpha.paste(128, (0, 0, 128, 64))
    image.putalpha(alpha)
    image.info["icc_profile"] = SRGB_ICC_PROFILE
    return image


class _StripAnnotations(ast.NodeTransformer):
    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        node.returns = None
        node.decorator_list = []
        self.generic_visit(node)
        return node

    def visit_arg(self, node: ast.arg) -> ast.arg:
        node.annotation = None
        return node


def _upstream_class(path: str, name: str, namespace: dict[str, Any]) -> Any:
    """Execute upstream numerical method bodies; replace only graph storage/types."""
    root = Path(
        os.environ.get(
            "IGS_INVOKE_SOURCE_ROOT", str(Path(__file__).resolve().parents[3] / "sources/InvokeAI")
        )
    )
    source = root / path
    if not source.is_file():
        pytest.skip("Independent outpaint oracle requires pinned external Invoke source.")
    encoded = source.read_bytes()
    assert hashlib.sha256(encoded).hexdigest() == _SOURCE_HASHES[path]
    tree = ast.parse(encoded, filename=str(source))
    original = next(
        node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == name
    )
    methods: list[ast.stmt] = [node for node in original.body if isinstance(node, ast.FunctionDef)]
    isolated = ast.ClassDef(
        name=name, bases=[], keywords=[], body=methods, decorator_list=[], type_params=[]
    )
    module = ast.Module(body=[isolated], type_ignores=[])
    _StripAnnotations().visit(module)
    ast.fix_missing_locations(module)
    exec(compile(module, str(source), "exec"), namespace)
    return namespace[name]


class _ImageStore:
    def __init__(self, image: Image.Image) -> None:
        self.image = image
        self.saved: list[Image.Image] = []

    def get_pil(self, _name: str, *, mode: str = "L") -> Image.Image:
        return self.image.convert(mode)

    def save(self, image: Image.Image, **_kwargs: Any) -> SimpleNamespace:
        self.saved.append(image.copy())
        return SimpleNamespace(image_name="saved")


@pytest.fixture(scope="module")
def upstream() -> tuple[Any, Any, Any]:
    np = pytest.importorskip("numpy")
    cv2 = pytest.importorskip("cv2")
    torch = pytest.importorskip("torch")
    return np, cv2, torch


def _reference_masks(
    source: Image.Image, upstream: tuple[Any, Any, Any], edge: int, minimum: float, fade: int
) -> tuple[Image.Image, Image.Image, Image.Image]:
    np, cv2, torch = upstream
    gradient_images: list[Image.Image] = []

    def tensor_sink(image: Image.Image, *, normalize: bool) -> Any:
        assert normalize is False
        gradient_images.append(image.copy())
        return torch.from_numpy(np.array(image, dtype=np.float32) / 255).unsqueeze(0)

    def output_dto(value: Any) -> Any:
        return value

    def tensor_reference(**_kwargs: Any) -> str:
        return "tensor"

    namespace = {
        "np": np,
        "numpy": np,
        "cv2": cv2,
        "torch": torch,
        "Image": Image,
        "LATENT_SCALE_FACTOR": 8,
        "GradientMaskOutput": SimpleNamespace,
        "DenoiseMaskField": SimpleNamespace,
        "ImageField": SimpleNamespace,
        "ImageOutput": SimpleNamespace(build=output_dto),
        "ImageCategory": SimpleNamespace(MASK="mask"),
        "image_resized_to_grid_as_tensor": tensor_sink,
    }
    gradient_class = _upstream_class(
        "invokeai/app/invocations/sd/create_gradient_mask.py",
        "CreateGradientMaskInvocation",
        namespace,
    )
    gradient = gradient_class()
    gradient.mask = SimpleNamespace(image_name="source")
    gradient.edge_radius = edge
    gradient.coherence_mode = "Gaussian Blur"
    gradient.minimum_denoise = minimum
    gradient.unet = None
    gradient.vae = None
    gradient.image = None
    store = _ImageStore(source.getchannel("A"))
    context = SimpleNamespace(images=store, tensors=SimpleNamespace(save=tensor_reference))
    gradient.invoke(context)
    assert len(gradient_images) == 1 and len(store.saved) == 1
    expanded = store.saved[0]
    fade_class = _upstream_class(
        "invokeai/app/invocations/image.py", "ExpandMaskWithFadeInvocation", namespace
    )
    fade_invocation = fade_class()
    fade_invocation.mask = SimpleNamespace(image_name="expanded")
    fade_invocation.threshold = 0
    fade_invocation.fade_size_px = fade
    fade_store = _ImageStore(expanded)
    fade_invocation.invoke(SimpleNamespace(images=fade_store))
    latent = gradient_images[0].resize(
        (source.width // 8, source.height // 8), Image.Resampling.NEAREST
    )
    return latent, expanded, fade_store.saved[0]


@pytest.mark.parametrize("kind", ["binary", "soft", "diagonal", "uniform"])
@pytest.mark.parametrize("policy", [(16, 0.0, 16), (0, 0.0, 0), (24, 0.25, 16)])
def test_real_conditioning_matches_external_invoke_bytes(
    kind: str, policy: tuple[int, float, int], upstream: tuple[Any, Any, Any]
) -> None:
    source = _source(kind)
    before = source.tobytes(), dict(source.info)
    edge, minimum, fade = policy
    actual = prepare_outpaint_conditioning(
        source,
        coherence_edge_radius=edge,
        minimum_denoise=minimum,
        output_fade_radius=fade,
    )
    expected = _reference_masks(source, upstream, edge, minimum, fade)
    for observed, reference in zip(
        (actual.latent_keep_mask, actual.expanded_keep_mask, actual.output_keep_mask),
        expected,
        strict=True,
    ):
        assert observed.mode == reference.mode == "L"
        assert observed.size == reference.size
        assert observed.tobytes() == reference.tobytes()
    assert (source.tobytes(), source.info) == before
    assert actual.source is not source
    assert actual.source.tobytes() == before[0]


def test_rgba_contribution_has_seam_fade_and_exact_protected_transparency(
    upstream: tuple[Any, Any, Any],
) -> None:
    del upstream
    source = _source()
    before = source.tobytes()
    conditioning = prepare_outpaint_conditioning(
        source, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
    )
    generated = Image.new("RGBA", source.size, (120, 180, 240, 7))
    result = create_outpaint_contribution(generated, conditioning)
    alpha = result.getchannel("A")
    assert result.mode == "RGBA" and result.info["icc_profile"] == SRGB_ICC_PROFILE
    assert alpha.getpixel((0, 32)) == 0
    assert alpha.getpixel((100, 32)) == 255
    assert any(0 < value < 255 for value in alpha.tobytes())
    assert alpha.tobytes() == bytes(
        255 - value for value in conditioning.output_keep_mask.tobytes()
    )
    # Originally opaque pixels may be changed near the seam; original assets are untouched.
    source_pixel = source.getpixel((55, 32))
    seam_alpha = alpha.getpixel((55, 32))
    assert isinstance(source_pixel, tuple) and source_pixel[3] == 255
    assert isinstance(seam_alpha, int) and seam_alpha > 0
    assert result.getpixel((100, 32)) == (120, 180, 240, 255)
    assert generated.getpixel((100, 32)) == (120, 180, 240, 7)
    assert source.tobytes() == before


@pytest.mark.parametrize(
    "source",
    [
        Image.new("RGB", (64, 64)),
        Image.new("RGBA", (64, 64), (1, 2, 3, 0)),
        Image.new("RGBA", (64, 64), (1, 2, 3, 255)),
        Image.new("RGBA", (65, 64), (1, 2, 3, 128)),
        Image.new("RGBA", (2056, 8), (1, 2, 3, 128)),
        Image.new("RGBA", (2048, 2048), (1, 2, 3, 128)),
    ],
)
def test_neighboring_non_outpaint_targets_refuse(source: Image.Image) -> None:
    with pytest.raises(DerivativeError) as raised:
        capture_outpaint_source(source)
    assert raised.value.code == "GENERATION_TARGET_UNSUPPORTED"


def test_capture_accepts_uniform_soft_alpha_and_copies_pixels_and_metadata() -> None:
    source = _source("uniform")
    captured = capture_outpaint_source(source)
    source.putpixel((0, 0), (1, 2, 3, 0))
    source.info["icc_profile"] = b"changed"
    assert captured.getpixel((0, 0)) == (32, 64, 96, 128)
    assert captured.info["icc_profile"] == SRGB_ICC_PROFILE
    with pytest.raises(DerivativeError) as raised:
        capture_outpaint_source(source)
    assert raised.value.code == "GENERATION_INPUT_CHANGED"


@pytest.mark.parametrize(
    "changes",
    [
        {"coherence_edge_radius": True},
        {"coherence_edge_radius": -1},
        {"output_fade_radius": 1.5},
        {"minimum_denoise": True},
        {"minimum_denoise": float("nan")},
        {"minimum_denoise": 1.1},
    ],
)
def test_invalid_policy_refuses_without_numeric_coercion(changes: dict[str, Any]) -> None:
    values = {"coherence_edge_radius": 16, "minimum_denoise": 0, "output_fade_radius": 16}
    values.update(changes)
    with pytest.raises(DerivativeError) as raised:
        prepare_outpaint_conditioning(_source(), **values)
    assert raised.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize("generated", [Image.new("RGB", (64, 64)), Image.new("L", (128, 64))])
def test_contribution_refuses_wrong_generated_topology(
    generated: Image.Image, upstream: tuple[Any, Any, Any]
) -> None:
    del upstream
    conditioning = prepare_outpaint_conditioning(
        _source(), coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
    )
    with pytest.raises(DerivativeError) as raised:
        create_outpaint_contribution(generated, conditioning)
    assert raised.value.code == "GENERATION_WORKER_FAILED"
