"""Verify the full decoded PNG using the literal portable Project fixture."""

from hashlib import sha256
import json
from pathlib import Path
import sys

from PIL import Image


ICC_SHA256 = "113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1"


def expected_rgba(region):
    patch = Image.new("RGBA", (7, 5))
    patch.putdata([(25, 47, 91, (0, 64, 128, 255)[index % 4]) for index in range(35)])
    # Pillow's public affine transform rounds premultiplied alpha at identity.
    patch = patch.transform(
        patch.size,
        Image.Transform.AFFINE,
        (1, 0, 0, 0, 1, 0),
        resample=Image.Resampling.BICUBIC,
    )
    if region == "canvas":
        result = Image.new("RGBA", (2075, 36))
        result.alpha_composite(Image.new("RGBA", (2056, 8), (180, 30, 60, 255)), (19, 0))
        result.alpha_composite(patch, (0, 31))
    else:
        assert region == "bbox"
        result = Image.new("RGBA", (64, 64))
        result.alpha_composite(patch, (1, 1))
    return result


filename, region = sys.argv[1:]
expected = expected_rgba(region)
with Image.open(Path(filename)) as image:
    assert image.format == "PNG"
    assert image.mode == "RGBA"
    assert image.size == expected.size, (image.size, expected.size)
    assert sha256(image.info["icc_profile"]).hexdigest() == ICC_SHA256
    assert not image.text, "Export must not contain the Project's text metadata"
    pixels = image.tobytes()
    assert pixels == expected.tobytes(), "Full decoded pixels differ from literal visible Raster and active Smart"
    print(
        json.dumps(
            {
                "width": image.width,
                "height": image.height,
                "rgbaSha256": sha256(pixels).hexdigest(),
                "iccSha256": ICC_SHA256,
            }
        )
    )
