from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

from imagegen_worker import PROTOCOL_VERSION, RUNTIME_PROFILE, WORKER_VERSION
from imagegen_worker.protocol import process_request


def test_rejects_wrong_version_and_unsupported_fields() -> None:
    incompatible = process_request({"type": "self-test", "protocolVersion": "2", "requestId": "r1"})
    assert incompatible == {
        "type": "error",
        "protocolVersion": PROTOCOL_VERSION,
        "requestId": "r1",
        "code": "PROTOCOL_MISMATCH",
        "message": "Worker protocol version is incompatible.",
    }
    extra = process_request(
        {"type": "self-test", "protocolVersion": "1", "requestId": "r2", "extra": 1}
    )
    assert extra["code"] == "INVALID_REQUEST"
    assert extra["requestId"] == "r2"


def test_real_json_lines_entrypoint_reports_ready_self_test_and_derivatives(tmp_path: Path) -> None:
    source = tmp_path / "composite.png"
    Image.new("RGBA", (32, 20), (180, 30, 80, 130)).save(source)
    tagged = tmp_path / "tagged.png"
    profile = (Path(__file__).parent / "fixtures" / "AdobeRGB1998.icc").read_bytes()
    Image.new("RGB", (8, 6), (180, 100, 50)).save(tagged, icc_profile=profile)
    staging = tmp_path / "stage"
    staging.mkdir()
    requests = [
        {"type": "self-test", "protocolVersion": "1", "requestId": "health-1"},
        {
            "type": "derive-image",
            "protocolVersion": "1",
            "requestId": "preview-1",
            "input": {
                "path": str(source),
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "colorSpace": "srgb",
            },
            "output": {
                "stagingRoot": str(staging),
                "mergedPngPath": str(staging / "merged.png"),
                "thumbnailWebpPath": str(staging / "thumbnail.webp"),
            },
            "thumbnailMaxSide": 64,
        },
        {
            "type": "normalize-import",
            "protocolVersion": "1",
            "requestId": "import-1",
            "input": {
                "path": str(tagged),
                "sha256": hashlib.sha256(tagged.read_bytes()).hexdigest(),
            },
            "output": {
                "stagingRoot": str(staging),
                "normalizedPngPath": str(staging / "imported.png"),
                "originalIccPath": str(staging / "original.icc"),
            },
        },
        {"type": "self-test", "protocolVersion": "99", "requestId": "bad-version"},
    ]
    result = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input="".join(json.dumps(request) + "\n" for request in requests),
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    assert result.stderr == ""
    messages = [json.loads(line) for line in result.stdout.splitlines()]
    assert [message["type"] for message in messages] == [
        "ready",
        "self-test-result",
        "derivative-done",
        "import-done",
        "error",
    ]
    assert messages[0]["workerVersion"] == WORKER_VERSION
    assert messages[0]["runtimeProfile"] == RUNTIME_PROFILE == "derivatives-only"
    assert messages[1]["checks"]["imageCodecs"] == ["PNG", "WEBP"]
    assert messages[2]["requestId"] == "preview-1"
    assert (
        messages[2]["merged"]["sha256"]
        == hashlib.sha256((staging / "merged.png").read_bytes()).hexdigest()
    )
    assert messages[3]["requestId"] == "import-1"
    assert messages[3]["originalIcc"]["sha256"] == hashlib.sha256(profile).hexdigest()
    assert (staging / "original.icc").read_bytes() == profile
    assert messages[4]["code"] == "PROTOCOL_MISMATCH"
