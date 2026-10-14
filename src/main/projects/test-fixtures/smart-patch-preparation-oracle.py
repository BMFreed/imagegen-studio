"""Run actual CPU protocol preparation and independently inspect published pixels.

Transport and deliberate post-publication corruption are the only test seams.
This helper does not implement clipping, resizing, mode selection or expected pixels.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image
from PIL import __version__ as pillow_version

source_root = Path(sys.argv[1]).resolve(strict=True)
sys.path.insert(0, str(source_root))

from imagegen_worker import (
    compositor,
    smart_patch_conditioning,
    smart_patch_fade,
    smart_patch_preparation,
)
from imagegen_worker.protocol import process_request

envelope = json.loads(sys.stdin.read())
request = envelope["request"]
response = process_request(request)
expected_type = {
    "compose-target": "target-done",
    "condition-smart-patch": "smart-patch-conditioned",
    "prepare-smart-patch": "smart-patch-prepared",
    "fade-smart-patch": "smart-patch-faded",
}[request["type"]]
if response.get("type") != expected_type:
    raise RuntimeError(f"Actual CPU protocol route failed: {response!r}")

for module in (compositor, smart_patch_preparation, smart_patch_fade, smart_patch_conditioning):
    if not Path(module.__file__).resolve(strict=True).is_relative_to(source_root):
        raise RuntimeError("The requested checkout's production CPU module was not loaded.")

if request["type"] == "compose-target":
    paths = {"source": request["output"]["targetPngPath"]}
elif request["type"] == "fade-smart-patch":
    paths = {"contributionMask": request["output"]["contributionMaskPngPath"]}
elif request["type"] == "condition-smart-patch":
    paths = {
        key: request["output"][key + "PngPath"]
        for key in (
            "worldKeepMask",
            "processingKeepMask",
            "latentKeepMask",
            "expandedProcessingKeepMask",
            "expandedWorldKeepMask",
            "finalContributionMask",
        )
    }
else:
    paths = {
        "effectiveMask": request["output"]["worldMaskPngPath"],
        "processingSource": request["output"]["processingSourcePngPath"],
        "processingMask": request["output"]["processingMaskPngPath"],
    }

if envelope.get("corrupt") in (
    "processing-mask-rgb",
    "contribution-mask-rgb",
    "conditioning-mask-rgb",
):
    # Mutate an actual output after the real algorithm has completed. Update the
    # response hash so integrity alone cannot hide missing numeric-RGB validation.
    plane = {
        "processing-mask-rgb": "processingMask",
        "contribution-mask-rgb": "contributionMask",
        "conditioning-mask-rgb": "finalContributionMask",
    }[envelope["corrupt"]]
    target = Path(paths[plane])
    with Image.open(target) as original:
        original.load()
        damaged = original.copy()
    _, green, blue, alpha = damaged.getpixel((0, 0))
    damaged.putpixel((0, 0), (254, green, blue, alpha))
    damaged.save(target, "PNG")
    damaged_bytes = target.read_bytes()
    response[plane]["byteSize"] = len(damaged_bytes)
    response[plane]["sha256"] = hashlib.sha256(damaged_bytes).hexdigest()

decoded = {}
for name, output_path in paths.items():
    with Image.open(output_path) as image:
        image.load()
        if image.format != "PNG" or image.mode != "RGBA":
            raise RuntimeError("The actual CPU operation did not publish RGBA PNG pixels.")
        profile = image.info.get("icc_profile")
        rgba = image.tobytes()
        decoded[name] = {
            "format": image.format,
            "mode": image.mode,
            "width": image.width,
            "height": image.height,
            "iccSha256": hashlib.sha256(profile).hexdigest() if profile else None,
            "rgbaBase64": base64.b64encode(rgba).decode("ascii"),
        }

loaded_ml = [
    name
    for name in sys.modules
    if name == "torch"
    or name.startswith("torch.")
    or name == "diffusers"
    or name.startswith("diffusers.")
    or name == "compel"
    or name.startswith("compel.")
]
if loaded_ml:
    raise RuntimeError(f"The CPU preparation probe loaded ML modules: {loaded_ml!r}")

print(
    json.dumps(
        {
            "response": response,
            "decoded": decoded,
            "compositorPath": str(Path(compositor.__file__).resolve(strict=True)),
            "conditioningPath": str(Path(smart_patch_conditioning.__file__).resolve(strict=True)),
            "preparationPath": str(Path(smart_patch_preparation.__file__).resolve(strict=True)),
            "fadePath": str(Path(smart_patch_fade.__file__).resolve(strict=True)),
            "pillowVersion": pillow_version,
            "loadedMlModules": loaded_ml,
        }
    )
)
