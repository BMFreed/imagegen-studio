"""Execute the checkout's real CPU compose-target route and independently decode its output.

This helper supplies transport only. It neither fabricates target pixels nor loads
trained models, Torch, Diffusers or Compel. Expected source pixels live in the TS test.
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

from imagegen_worker import compositor
from imagegen_worker.protocol import process_request

request = json.loads(sys.stdin.read())
response = process_request(request)
if response.get("type") != "target-done":
    raise RuntimeError(f"Actual compose-target route failed: {response!r}")

module_path = Path(compositor.__file__).resolve(strict=True)
if not module_path.is_relative_to(source_root):
    raise RuntimeError("The actual checkout compositor was not loaded.")

with Image.open(request["output"]["targetPngPath"]) as image:
    image.load()
    if image.format != "PNG" or image.mode != "RGBA":
        raise RuntimeError("The actual compositor did not publish an RGBA PNG.")
    decoded = {
        "format": image.format,
        "mode": image.mode,
        "width": image.width,
        "height": image.height,
        "iccSha256": hashlib.sha256(image.info["icc_profile"]).hexdigest(),
        "rgbaBase64": base64.b64encode(image.tobytes()).decode("ascii"),
    }

loaded_ml = [
    name for name in sys.modules
    if name == "torch" or name.startswith("torch.")
    or name == "diffusers" or name.startswith("diffusers.")
    or name == "compel" or name.startswith("compel.")
]
if loaded_ml:
    raise RuntimeError(f"The CPU compositor probe loaded ML modules: {loaded_ml!r}")

print(json.dumps({
    "response": response,
    "decoded": decoded,
    "compositorPath": str(module_path),
    "pillowVersion": pillow_version,
    "loadedMlModules": loaded_ml,
}))
