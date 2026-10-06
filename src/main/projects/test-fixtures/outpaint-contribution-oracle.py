"""Regenerate exact contribution bytes from the pinned native numerical oracle.

Run from worker-python with its existing inference environment:
uv run --locked --extra inference python \
    ../src/main/projects/test-fixtures/outpaint-contribution-oracle.py
Then format the generated JSON with the repository's Prettier configuration.
Both IPP and scalar OpenCV paths must agree before any case is recorded.
This helper is not an inference worker or an application execution path.
"""

import base64
import hashlib
import importlib.util
import json
import zlib
from pathlib import Path

import cv2
import numpy as np
import PIL
import torch
from PIL import Image

from imagegen_worker.outpaint_conditioning import prepare_outpaint_conditioning

spec = importlib.util.spec_from_file_location(
    "invoke_oracle", Path("tests/test_outpaint_conditioning.py")
)
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
rng = np.random.default_rng(290413)
cases = []


def add(name, a):
    source = Image.new("RGBA", (a.shape[1], a.shape[0]), (23, 42, 66, 255))
    source.putalpha(Image.fromarray(a))
    got = []
    for ipp in (True, False):
        cv2.ipp.setUseIPP(ipp)
        result = prepare_outpaint_conditioning(
            source, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
        )
        expected = oracle._reference_masks(source, (np, cv2, torch), 16, 0, 16)
        for real, ref in zip(
            [result.latent_keep_mask, result.expanded_keep_mask, result.output_keep_mask],
            expected,
            strict=True,
        ):
            assert real.tobytes() == ref.tobytes(), name
        got.append(np.uint8(255 - np.array(expected[2])))
    assert np.array_equal(*got), name
    reduced = source.getchannel("A").resize(
        (a.shape[1] // 8, a.shape[0] // 8), Image.Resampling.BILINEAR
    )

    def packed(x):
        return base64.b64encode(zlib.compress(x, 9)).decode()

    cases.append(
        dict(
            name=name,
            width=a.shape[1],
            height=a.shape[0],
            sourceAlphaZlib=packed(a.tobytes()),
            contributionAlphaZlib=packed(got[0].tobytes()),
            reducedAlphaSha256=hashlib.sha256(reduced.tobytes()).hexdigest(),
        )
    )


for w, h in [(8, 8), (64, 64), (104, 88), (512, 256)]:
    for prob in [0.0001, 0.002, 0.1, 0.9]:
        for hole in [0, 1, 128, 254]:
            a = np.full((h, w), 255, np.uint8)
            a[rng.random((h, w)) < prob] = hole
            a[0, 0] = hole
            add(f"sparse-{w}-{h}-{prob}-{hole}", a)
for w, h in [(64, 64), (128, 64), (104, 88), (512, 256), (2048, 1952)]:
    yy, xx = np.indices((h, w))
    for name, a in [
        ("vertical", np.where(xx < w // 2, 255, 0).astype("uint8")),
        ("diagonal", np.where(xx < yy * w / h, 255, 0).astype("uint8")),
        ("checker", np.where((xx // 8 + yy // 8) % 2, 255, 0).astype("uint8")),
    ]:
        add(f"{name}-{w}-{h}", a)
    a = np.full((h, w), 255, np.uint8)
    a[h // 2, w // 2] = 254
    add(f"nearopaque-{w}-{h}", a)
for amplitude in range(1, 33):
    a = np.full((64, 64), 255, np.uint8)
    a[24:32, 24:32] = 255 - amplitude
    add(f"quantization-{amplitude}", a)
cv2.ipp.setUseIPP(True)
out = dict(
    schemaVersion=1,
    pythonPillow=PIL.__version__,
    numpy=np.__version__,
    opencv=cv2.__version__,
    ipp=cv2.ipp.getIppVersion(),
    invokeSources=oracle._SOURCE_HASHES,
    cases=cases,
)
Path("../src/main/projects/test-fixtures/outpaint-contribution-oracle.json").write_text(
    json.dumps(out, separators=(",", ":")) + "\n"
)
print(
    len(cases),
    "cases",
    Path("../src/main/projects/test-fixtures/outpaint-contribution-oracle.json").stat().st_size,
    "bytes",
)
