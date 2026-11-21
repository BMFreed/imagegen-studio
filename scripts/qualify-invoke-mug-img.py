"""Run the fixed mug IMG comparison through the installed InvokeAI application."""

import argparse
import hashlib
import http.client
import io
import json
import math
import os
import re
import signal
import socket
import subprocess
import time
import traceback
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urlencode

from PIL import Image

ARTIFACT_ROOT = Path.home() / ".codex/artifacts/imagegen-studio"
QUEUE_PATH = "/api/v1/queue/igs-invoke-mug"
PNG_LIMIT = 8 * 1024**2
JSON_LIMIT = 8 * 1024**2
LABELS = ("neutral", "red", "blue")
VAE_CONTROL_SCHEMA = "installed-invoke-ordinary-img-mug-vae-reference-v1"
TRAJECTORY_SCHEMA = "installed-invoke-ordinary-img-mug-trajectory-reference-v1"
SNAPSHOT_STEPS = [1, 2, 4, 8, 19]
POSITIVE = (
    "studio product photo of one {color} glazed ceramic mug, single handle on the right,"
    " empty open top, plain ivory tabletop and background, soft diffuse light"
)


def write_json(run, name, value):
    with (run / name).open("x") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def save_bytes(run, name, data):
    with (run / name).open("xb") as stream:
        stream.write(data)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(UTC).isoformat()


def pin_file(path, size, digest):
    assert path.resolve(strict=True) == path and path.is_file(), path
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        assert before.st_size == size, path
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
        after = os.fstat(stream.fileno())
        assert (before.st_size, before.st_mtime_ns) == (
            after.st_size,
            after.st_mtime_ns,
        ), path
        assert (
            path.stat().st_ino == before.st_ino and path.stat().st_dev == before.st_dev
        ), path
    assert actual == digest, path


def png_description(body, width, height):
    with Image.open(io.BytesIO(body)) as image:
        assert image.format == "PNG" and image.size == (width, height)
        image.load()
        rgba = image.convert("RGBA")
        assert rgba.getchannel("A").getextrema() == (255, 255)
        icc = image.info.get("icc_profile")
        return {
            "sha256": sha256(body),
            "byteSize": len(body),
            "width": width,
            "height": height,
            "pngMode": image.mode,
            "rgbSha256": sha256(rgba.convert("RGB").tobytes()),
            "rgbaSha256": sha256(rgba.tobytes()),
            "iccSha256": sha256(icc) if icc else None,
        }


def proc_identity(pid):
    stat = (Path("/proc") / str(pid) / "stat").read_text()
    after_comm = stat[stat.rindex(")") + 2 :].split()
    return {"pid": pid, "startTicks": int(after_comm[19])}


def cgroup_path():
    mount = Path("/sys/fs/cgroup")
    raw = Path("/proc/self/cgroup").read_text().strip()
    assert raw.startswith("0::/") and "\n" not in raw
    group = mount / raw.removeprefix("0::/")
    assert group.name.startswith("igs-") and group.name.endswith(".service"), group
    assert int((group / "memory.max").read_text()) <= 12 * 1024**3
    assert (group / "memory.swap.max").read_text().strip() == "0"
    return group


def child_owns_listener(server, port):
    assert server.poll() is None, "Invoke exited"
    proc = Path("/proc") / str(server.pid)
    endpoint = f"0100007F:{port:04X}"
    inodes = set()
    for line in (proc / "net/tcp").read_text().splitlines()[1:]:
        fields = line.split()
        if fields[1] == endpoint and fields[3] == "0A":
            inodes.add(f"socket:[{fields[9]}]")
    for descriptor in (proc / "fd").iterdir():
        try:
            if os.readlink(descriptor) in inodes:
                return True
        except FileNotFoundError:
            continue
    return False


class InvokeApi:
    def __init__(self, port, server):
        self.port = port
        self.server = server

    def request(
        self, path, method="GET", body=None, content_type=None, limit=JSON_LIMIT
    ):
        assert child_owns_listener(self.server, self.port), (
            "Invoke does not own the loopback listener"
        )
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        try:
            headers = {"Content-Type": content_type} if content_type else {}
            connection.request(method, path, body=body, headers=headers)
            with connection.getresponse() as response:
                response_body = response.read(limit + 1)
                if not 200 <= response.status < 300:
                    error = response_body[:12_000].decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"{method} {path} HTTP {response.status}: {error}"
                    )
                assert len(response_body) <= limit, f"{path} exceeds response limit"
                return response_body
        finally:
            connection.close()

    def json(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        return json.loads(self.request(path, method, data, "application/json"))

    def full_png(self, name):
        return self.request(
            f"/api/v1/images/i/{quote(name, safe='')}/full", limit=PNG_LIMIT
        )


def wait_for_api(api, deadline):
    while not child_owns_listener(api.server, api.port):
        assert time.monotonic() < deadline, (
            "Invoke did not listen before startup deadline"
        )
        time.sleep(0.25)
    return api.json("/api/v1/app/version")


def register_checkpoint(api, run, contract, deadline):
    params = urlencode({"source": contract["checkpoint"], "inplace": "true"})
    registration = api.json(
        "/api/v2/models/install?" + params,
        "POST",
        {
            "name": "IGS exact Illustrious v0.1 mug reference",
            "prediction_type": "epsilon",
        },
    )
    write_json(run, "registration-initial.json", registration)
    job_id = registration["id"]
    while registration["status"] not in {"completed", "error", "cancelled"}:
        assert time.monotonic() < deadline, "Checkpoint registration deadline"
        time.sleep(0.5)
        registration = api.json(f"/api/v2/models/install/{job_id}")
    write_json(run, "registration-final.json", registration)
    assert registration["status"] == "completed", registration
    model = registration["config_out"]
    assert model["base"] == "sdxl" and model["type"] == "main"
    assert Path(model["path"]).resolve(strict=True) == Path(contract["checkpoint"])
    if model.get("prediction_type") is not None:
        assert model["prediction_type"] == "epsilon", model
    return {key: model[key] for key in ("key", "hash", "name", "base", "type")}


def upload_source(api, run, source_bytes, contract):
    boundary = b"IGSInvokeMugSource7b995ee28f"
    assert boundary not in source_bytes
    multipart = (
        b"--" + boundary + b"\r\n"
        b'Content-Disposition: form-data; name="file"; filename="mug-source.png"\r\n'
        b"Content-Type: image/png\r\n\r\n"
        + source_bytes
        + b"\r\n--"
        + boundary
        + b"--\r\n"
    )
    upload = json.loads(
        api.request(
            "/api/v1/images/upload?image_category=general&is_intermediate=true",
            "POST",
            multipart,
            f"multipart/form-data; boundary={boundary.decode()}",
        )
    )
    write_json(run, "source-upload.json", upload)
    assert (
        upload["width"] == contract["width"] and upload["height"] == contract["height"]
    )
    uploaded_png = api.full_png(upload["image_name"])
    description = png_description(uploaded_png, contract["width"], contract["height"])
    save_bytes(run, "invoke-source-roundtrip.png", uploaded_png)
    write_json(run, "source-roundtrip.json", description)
    for field in ("rgbSha256", "rgbaSha256"):
        assert description[field] == contract["source"][field], field
    return upload["image_name"]


def make_graph(contract, case, model, image_name):
    # Invoke buildSDGraph and its graftImageToImage caller. Literal prompts and
    # seed replace the graph's input-value nodes for this fixed qualification.
    nodes = {}
    edges = []

    def node(node_id, node_type, **fields):
        nodes[node_id] = {
            "id": node_id,
            "type": node_type,
            "use_cache": False,
            **fields,
        }

    def edge(source, source_field, destination, destination_field):
        edges.append(
            {
                "source": {"node_id": source, "field": source_field},
                "destination": {"node_id": destination, "field": destination_field},
            }
        )

    node("model", "sdxl_model_loader", model=model)
    source_fields = {
        "image": {"image_name": image_name},
        "tiled": False,
        "fp32": False,
        "color_compensation": "None",
    }
    if case["label"] == "vae":
        node("source", "i2l", **source_fields)
        node("output", "l2i", is_intermediate=False, tiled=False, fp32=False)
        edge("model", "vae", "source", "vae")
        edge("model", "vae", "output", "vae")
        edge("source", "latents", "output", "latents")
        return {"id": "igs-invoke-mug-vae", "nodes": nodes, "edges": edges}

    for sign, prompt in (("pos", case["positive"]), ("neg", contract["negative"])):
        node(
            sign,
            "sdxl_compel_prompt",
            prompt=prompt,
            style=prompt,
            original_width=1024,
            original_height=1024,
            target_width=1024,
            target_height=1024,
            crop_top=0,
            crop_left=0,
        )
        node(sign + "list", "collect")
        edge("model", "clip", sign, "clip")
        edge("model", "clip2", sign, "clip2")
        edge(sign, "conditioning", sign + "list", "item")
    edge("poslist", "collection", "denoise", "positive_conditioning")
    edge("neglist", "collection", "denoise", "negative_conditioning")
    node(
        "noise",
        "noise",
        noise_type="SD",
        seed=contract["seed"],
        width=contract["width"],
        height=contract["height"],
        use_cpu=True,
    )
    node("source", "i2l", **source_fields)
    node(
        "denoise",
        "denoise_latents",
        steps=contract["steps"],
        cfg_scale=contract["cfg"],
        scheduler=contract["scheduler"],
        cfg_rescale_multiplier=contract["cfgRescale"],
        denoising_start=contract["denoisingStart"],
        denoising_end=contract["denoisingEnd"],
        hidiffusion=False,
    )
    node("output", "l2i", is_intermediate=False, tiled=False, fp32=False)
    edge("model", "unet", "denoise", "unet")
    edge("model", "vae", "source", "vae")
    edge("source", "latents", "denoise", "latents")
    edge("noise", "noise", "denoise", "noise")
    edge("model", "vae", "output", "vae")
    edge("denoise", "latents", "output", "latents")
    return {"id": "igs-invoke-mug-" + case["label"], "nodes": nodes, "edges": edges}


def generate(api, run, case, graph, contract, deadline, report):
    label = case["label"]
    write_json(run, f"{label}.submitted-graph.json", graph)
    request = {
        "batch": {"graph": graph, "runs": 1, "data": None, "origin": "igs-invoke-mug"},
        "prepend": False,
    }
    write_json(run, f"{label}.submitted-request.json", request)
    assert report["enqueueAttempts"] < contract["freshNativeRequestsMax"]
    report["enqueueAttempts"] += 1
    receipt = api.json(f"{QUEUE_PATH}/enqueue_batch", "POST", request)
    write_json(run, f"{label}.enqueue-receipt.json", receipt)
    assert (
        receipt["enqueued"] == receipt["requested"] == 1
        and len(receipt["item_ids"]) == 1
    )
    item_id = receipt["item_ids"][0]
    assert item_id not in report["queueItemIds"]
    report["queueItemIds"].append(item_id)
    api.json(f"{QUEUE_PATH}/processor/resume", "PUT")
    statuses = []
    while True:
        assert time.monotonic() < deadline, "Invoke comparison generation deadline"
        item = api.json(f"{QUEUE_PATH}/i/{item_id}")
        status = item["status"]
        if not statuses or statuses[-1] != status:
            statuses.append(status)
        if status in {"completed", "failed", "canceled"}:
            break
        time.sleep(0.4)
    write_json(run, f"{label}.queue-statuses.json", statuses)
    write_json(run, f"{label}.queue-final-item.json", item)
    assert item["status"] == "completed", item.get("error_traceback")
    results = item["session"]["results"]
    if label == "vae":
        accepted = item["session"]["graph"]
        assert accepted["id"] == graph["id"]
        assert {key: node["type"] for key, node in accepted["nodes"].items()} == {
            "model": "sdxl_model_loader",
            "source": "i2l",
            "output": "l2i",
        }
        assert accepted["edges"] == graph["edges"]
        assert sorted(result["type"] for result in results.values()) == [
            "image_output",
            "latents_output",
            "sdxl_model_loader_output",
        ]
    outputs = [
        value["image"]["image_name"]
        for value in results.values()
        if value["type"] == "image_output"
    ]
    assert len(outputs) == 1
    body = api.full_png(outputs[0])
    output = png_description(body, contract["width"], contract["height"])
    save_bytes(run, f"invoke-{label}.png", body)
    write_json(run, f"{label}.output.json", output)
    return {"label": label, "imageName": outputs[0], "queueItemId": item_id, **output}


def verify_observation(run, result, contract):
    observation_path = run / "native-observations.json"
    assert observation_path.resolve(strict=True) == observation_path
    with observation_path.open("rb") as stream:
        data = stream.read(JSON_LIMIT + 1)
    assert len(data) <= JSON_LIMIT
    evidence = json.loads(data)
    assert evidence["schemaVersion"] == 1 and evidence["originalDelegation"] is True
    label = result["label"]
    matching = [case for case in evidence["cases"] if case["label"] == label]
    assert len(matching) == 1, f"Missing or duplicate native observation for {label}"
    case = matching[0]
    assert case["graphId"] == f"igs-invoke-mug-{label}"
    assert case["queueItemId"] == result["queueItemId"]
    assert case["invocations"]["decode"]["outputImageName"] == result["imageName"]
    if label == "vae":
        assert len(evidence["cases"]) == 1
        invocations = case["invocations"]
        assert set(invocations) == {"encode", "decode"}
        encode = invocations["encode"]
        decode = invocations["decode"]
        assert encode["sourceNodeId"] == "source" and decode["sourceNodeId"] == "output"
        assert encode["outputLatentName"] == decode["inputLatentName"]
        assert all(
            invocation["fp32"] is False
            and invocation["tiled"] is False
            and "errorType" not in invocation
            for invocation in invocations.values()
        )
        assert encode["colorCompensation"] == "None"
        for field in ("sha256", "dtype", "shape"):
            assert (
                case["encode"]["scaledLatents"][field]
                == case["decode"]["loadedScaledLatents"][field]
            )
        assert case["encode"]["scalingFactor"] == case["decode"]["scalingFactor"]
        assert case["decode"]["latents"]["shape"] == [1, 4, 64, 64]
        assert case["decode"]["tensor"]["shape"] == [1, 3, 512, 512]
        for stage in ("noise", "prepare", "scheduler"):
            assert case[stage] == {}, stage
        for stage in ("addNoise", "scaleModelInput", "unet", "cfg", "steps"):
            assert case[stage] == [], stage
        return

    scheduler = case["scheduler"]
    assert scheduler["class"] == "EulerDiscreteScheduler"
    assert scheduler["timesteps"] == contract["expectedTimesteps"]
    assert [step["timestep"] for step in case["steps"]] == [
        [timestep] for timestep in contract["expectedTimesteps"]
    ]
    assert len(case["unet"]) == len(case["steps"])
    if contract["schema"] == TRAJECTORY_SCHEMA:
        assert len(evidence["cases"]) == 1
        verify_trajectory(run, result, case, contract)


def verify_trajectory(run, result, case, contract):
    manifest_path = run / "trajectory/manifest.json"
    assert case["trajectoryManifest"] == "trajectory/manifest.json"
    assert manifest_path.resolve(strict=True) == manifest_path
    with manifest_path.open("rb") as stream:
        body = stream.read(JSON_LIMIT + 1)
    assert len(body) <= JSON_LIMIT
    manifest = json.loads(body)
    assert manifest["schemaVersion"] == 1
    for field in ("graphId", "queueItemId", "sessionId"):
        assert manifest[field] == case[field], field
    assert manifest["decodeAfterOriginal"] is True
    assert manifest["terminalMatchesNativeDecode"] is True
    assert manifest["terminalReusesNativeDecodeOutput"] is True

    (added,) = case["addNoise"]
    assert added["sample"]["sha256"] == case["encode"]["scaledLatents"]["sha256"]
    assert added["noise"]["sha256"] == case["noise"]["tensor"]["sha256"]
    assert added["timesteps"] == [contract["expectedTimesteps"][0]]
    previous = added["result"]["sha256"]
    for step in case["steps"]:
        assert step["sample"]["sha256"] == previous
        previous = step["output"]["sha256"]

    first_unet = case["unet"][0]
    for unet in case["unet"]:
        assert unet["context"] == first_unet["context"]
        assert unet["addedConditioning"] == first_unet["addedConditioning"]
    latents = {
        "source": added["sample"],
        "noised": added["result"],
        **{
            f"step-{step:02d}": case["steps"][step - 1]["output"]
            for step in contract["snapshotSteps"]
        },
    }
    tensors = {
        **latents,
        "noise": added["noise"],
        "context": first_unet["context"],
        "text_embeds": first_unet["addedConditioning"]["text_embeds"],
        "time_ids": first_unet["addedConditioning"]["time_ids"],
    }
    assert set(manifest["tensors"]) == set(tensors)
    directory = manifest_path.parent
    for role, observed in tensors.items():
        artifact = manifest["tensors"][role]
        assert artifact["path"] == f"{role}.raw"
        for field in ("shape", "dtype", "sha256"):
            assert artifact[field] == observed[field], (role, field)
        assert artifact["dtype"] == "torch.float16"
        assert artifact["byteSize"] == math.prod(artifact["shape"]) * 2
        pin_file(directory / artifact["path"], artifact["byteSize"], artifact["sha256"])

    frames = manifest["frames"]
    assert [frame["role"] for frame in frames] == list(latents)
    for frame in frames:
        assert frame["path"] == f"{frame['role']}.png"
        assert 0 < frame["byteSize"] <= PNG_LIMIT
        path = directory / frame["path"]
        pin_file(path, frame["byteSize"], frame["sha256"])
        descriptor = png_description(
            path.read_bytes(), contract["width"], contract["height"]
        )
        for field in ("byteSize", "width", "height", "rgbSha256", "sha256"):
            assert descriptor[field] == frame[field], (frame["role"], field)
        if frame["role"] == "step-19":
            assert frame["decodedTensorSha256"] == case["decode"]["tensor"]["sha256"]
            for field in ("rgbSha256", "rgbaSha256"):
                assert descriptor[field] == result[field], field


def shutdown(server, group, identity):
    delivery = "already-exited"
    if server.poll() is None:
        delivery = "SIGINT"
        server.send_signal(signal.SIGINT)
        try:
            server.wait(timeout=30)
        except subprocess.TimeoutExpired:
            delivery = "SIGKILL-after-SIGINT-timeout"
            server.kill()
            server.wait(timeout=10)
    deadline = time.monotonic() + 6
    while True:
        others = set(map(int, (group / "cgroup.procs").read_text().split())) - {
            os.getpid()
        }
        if not others or time.monotonic() >= deadline:
            break
        time.sleep(0.2)
    try:
        identity_gone = proc_identity(identity["pid"]) != identity
    except FileNotFoundError:
        identity_gone = True
    return {
        "delivery": delivery,
        "exitCode": server.returncode,
        "identityGone": identity_gone,
        "remainingPidsBeforeServiceStop": sorted(others),
        "clean": delivery == "SIGINT"
        and server.returncode == 0
        and identity_gone
        and not others,
    }


def check_contract(contract, run):
    vae_only = contract["schema"] == VAE_CONTROL_SCHEMA
    trajectory = contract["schema"] == TRAJECTORY_SCHEMA
    if vae_only:
        profile, temp_suffix = "invoke-ordinary-img-mug-vae", "iv"
    elif trajectory:
        profile, temp_suffix = "invoke-ordinary-img-mug-trajectory", "it"
    else:
        profile, temp_suffix = "invoke-ordinary-img-mug", "im"
    assert run.parent == ARTIFACT_ROOT / "runs" / profile, run
    assert re.fullmatch(r"[0-9]{8}-r[1-9][0-9]*", run.name)
    assert run.resolve(strict=True) == run and run.stat().st_uid == os.getuid()
    tmp = Path(contract["tempRoot"])
    root = Path(contract["appRoot"])
    tmp_pattern = rf"t-igs-{temp_suffix}[1-9][0-9]*"
    assert tmp.parent == ARTIFACT_ROOT and re.fullmatch(tmp_pattern, tmp.name)
    assert root == tmp / "app" and root.resolve(strict=True) == root and root.is_dir()
    assert tmp.stat().st_uid == root.stat().st_uid == os.getuid()
    assert contract["port"] == 9093
    assert contract["invokeVersion"] == "6.14.3"
    if vae_only:
        assert contract["cases"] == [{"label": "vae"}]
        assert (contract["width"], contract["height"]) == (512, 512)
        assert contract["freshNativeRequestsMax"] == 1
        assert contract["expectedTimesteps"] == []
        assert not contract.keys() & {
            "seed",
            "steps",
            "cfg",
            "cfgRescale",
            "scheduler",
            "denoisingStart",
            "denoisingEnd",
            "negative",
        }
        return

    cases = [
        {"label": label, "positive": POSITIVE.format(color=color)}
        for label, color in zip(LABELS, ("gray", "red", "blue"), strict=True)
    ]
    if trajectory:
        assert contract["snapshotSteps"] == SNAPSHOT_STEPS
    assert contract["cases"] == (cases[:1] if trajectory else cases)
    assert (contract["width"], contract["height"], contract["seed"]) == (512, 512, 123)
    assert (contract["steps"], contract["cfg"], contract["cfgRescale"]) == (30, 5, 0)
    assert (
        contract["scheduler"],
        contract["denoisingStart"],
        contract["denoisingEnd"],
        contract["negative"],
        contract["freshNativeRequestsMax"],
    ) == ("euler", 0.4, 1, "", 1 if trajectory else 3)
    assert contract["expectedTimesteps"] == list(range(595, 0, -33))


def environment(contract):
    temp = Path(contract["tempRoot"])
    inherited = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("INVOKEAI_", "HF_", "HUGGINGFACE_"))
        and key not in {"PYTHONHOME", "PYTHONPATH", "USE_MODULAR_DENOISE"}
    }
    for key, name in (
        ("HOME", "home"),
        ("XDG_CONFIG_HOME", "xdg-config"),
        ("XDG_DATA_HOME", "xdg-data"),
        ("XDG_CACHE_HOME", "xdg-cache"),
        ("XDG_STATE_HOME", "xdg-state"),
        ("TRITON_CACHE_DIR", "triton-cache"),
        ("TORCHINDUCTOR_CACHE_DIR", "torchinductor-cache"),
        ("CUDA_CACHE_PATH", "cuda-cache"),
        ("TMPDIR", "tmp"),
    ):
        location = temp / name
        location.mkdir(mode=0o700, exist_ok=True)
        assert location.resolve(strict=True) == location and location.is_dir()
        assert location.stat().st_uid == os.getuid()
        inherited[key] = str(location)
    inherited.update(
        INVOKEAI_ROOT=contract["appRoot"],
        INVOKEAI_HOST="127.0.0.1",
        INVOKEAI_PORT=str(contract["port"]),
        HF_HOME=str(temp / "hf"),
        HF_HUB_CACHE=str(temp / "hf/hub"),
        HF_HUB_OFFLINE="1",
        TRANSFORMERS_OFFLINE="1",
        HF_HUB_DISABLE_TELEMETRY="1",
        PYTHONDONTWRITEBYTECODE="1",
        OMP_NUM_THREADS="1",
        MKL_NUM_THREADS="1",
        OPENBLAS_NUM_THREADS="1",
    )
    return inherited


def main(run):
    assert __debug__, "Run the qualification without optimization"
    contract_path = run / "reference-contract.json"
    assert contract_path.resolve(strict=True) == contract_path
    contract = json.loads(contract_path.read_bytes())
    check_contract(contract, run)
    group = cgroup_path()
    launcher = run / "launch-installed.py"
    assert launcher.resolve(strict=True) == launcher and launcher.is_file()
    report = {
        "status": "incomplete",
        "enqueueAttempts": 0,
        "queueItemIds": [],
        "results": [],
        "cgroup": str(group),
        "controller": proc_identity(os.getpid()),
        "startedAt": now(),
    }
    server = None
    identity = None
    started = time.monotonic()
    with (run / "installed-app.log").open("xb") as log:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as reservation:
                reservation.bind(("127.0.0.1", contract["port"]))
            source = contract["source"]
            path = Path(source["path"])
            assert source["byteSize"] <= PNG_LIMIT
            pin_file(path, source["byteSize"], source["sha256"])
            source_bytes = path.read_bytes()
            source_info = png_description(
                source_bytes, contract["width"], contract["height"]
            )
            for field in ("sha256", "rgbSha256", "rgbaSha256"):
                assert source_info[field] == source[field], field
            pin_file(
                Path(contract["checkpoint"]),
                contract["checkpointBytes"],
                contract["checkpointSha256"],
            )
            report["checkpointSha256Verified"] = contract["checkpointSha256"]
            server = subprocess.Popen(
                [
                    contract["invokePython"],
                    "-I",
                    "-B",
                    str(launcher),
                    "--run",
                    str(run),
                    "--root",
                    contract["appRoot"],
                    "--port",
                    str(contract["port"]),
                ],
                cwd=run,
                env=environment(contract),
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            identity = proc_identity(server.pid)
            assert server.pid in set(
                map(int, (group / "cgroup.procs").read_text().split())
            )
            report["server"] = identity
            write_json(
                run,
                "process-start.json",
                {"cgroup": str(group), "server": identity, "at": now()},
            )
            api = InvokeApi(contract["port"], server)
            version = wait_for_api(api, time.monotonic() + 90)
            write_json(run, "api-version.json", version)
            assert version["version"] == contract["invokeVersion"]
            model = register_checkpoint(api, run, contract, time.monotonic() + 110)
            image = upload_source(api, run, source_bytes, contract)
            for case in contract["cases"]:
                graph = make_graph(contract, case, model, image)
                result = generate(
                    api, run, case, graph, contract, started + 515, report
                )
                report["results"].append(result)
                verify_observation(run, result, contract)
            assert (
                report["enqueueAttempts"]
                == len(report["results"])
                == contract["freshNativeRequestsMax"]
            )
            report["status"] = "completed"
        except BaseException as error:
            report.update(
                status="failed", error=repr(error), traceback=traceback.format_exc()
            )
            raise
        finally:
            try:
                if server is not None:
                    if identity is None:
                        identity = {"pid": server.pid, "startTicks": None}
                    report["serverShutdown"] = shutdown(server, group, identity)
                    if (
                        report["status"] == "completed"
                        and not report["serverShutdown"]["clean"]
                    ):
                        report["status"] = "outputs-completed-shutdown-unconfirmed"
                        raise RuntimeError(
                            "Invoke produced all outputs, but clean physical exit was not confirmed"
                        )
            finally:
                report["elapsedSeconds"] = time.monotonic() - started
                report["finishedAt"] = now()
                report["cgroupMemory"] = {
                    key: (group / key).read_text().strip()
                    for key in ("memory.peak", "memory.swap.peak", "memory.events")
                }
                write_json(run, "app-run.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    main(args.run)
