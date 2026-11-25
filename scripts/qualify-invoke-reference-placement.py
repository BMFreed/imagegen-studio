"""Replay the fixed Studio two-plinth scene through installed InvokeAI."""

import argparse
import importlib.metadata
import importlib.util
import io
import json
import os
import re
import socket
import subprocess
import sys
import time
import traceback
from functools import wraps
from pathlib import Path
from urllib.parse import urlencode

HERE = Path(__file__).resolve().parent
ROOT = Path.home() / ".codex/artifacts/imagegen-studio"
# The serve process runs with HOME isolated. Its parent supplies the same absolute
# run via the checked environment and --run.
SCHEMA = "installed-invoke-reference-placement-v1"
VERSION = "6.14.3"
VISION_NAME = "IP Adapter SD1.5 Image Encoder"
POSITIVE = (
    "a clean anime still life of two collectible objects on separate display plinths, "
    "oak divider in the center, teal trim above, cream gallery wall, gentle shadows"
)
ASSIGNMENTS = (("ordinary", []), ("assigned", ["A", "B"]), ("swapped", ["B", "A"]))
BOXES = {"left": (0, 64, 192, 384), "right": (320, 64, 512, 384)}
SOURCE_SHA = "8bcb4ffb29df973fd7faa563d68ca6e00270f8c8359113b6ab2d04bb49a6264f"
REFERENCE_SHAS = {
    "A": "9f1bfbbb898cb2835a624b5d75abe62e629eea7eefe352ee91ab388858be625e",
    "B": "87fdc62818ba1cecb580ca7da5e6ee23b238edfac0bf1e383b5a4ada2b7a3bdf",
}
CHECKPOINT_SHA = "3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9"
ADAPTER_SHA = "ebf05d918348aec7abb02a5e9ecef77e0aaea6914a5c4ea13f50d45eb1681831"
VISION_SHAS = {
    "config": "625d37b31afbf2f0792a87846b3654ee23f20568409e35b78a1f795b04e1a7a1",
    "model": "6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030",
}
PNG_LIMIT = 8 * 1024**2
MODEL_IDENTIFIER = ("key", "hash", "name", "base", "type")


def load_mug_driver():
    spec = importlib.util.spec_from_file_location(
        "invoke_mug_driver", HERE / "qualify-invoke-mug-img.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_contract(run, *, server):
    assert run.resolve(strict=True) == run and run.stat().st_uid == os.getuid()
    assert re.fullmatch(r"[0-9]{8}-r[1-9][0-9]*", run.name)
    assert not server or run.parent.name == "invoke-regional-reference-placement"
    if not server:
        assert run.parent == ROOT / "runs/invoke-regional-reference-placement"
    source = run / "reference-contract.json"
    assert source.resolve(strict=True) == source and source.is_file()
    assert 0 < source.stat().st_size < 64 * 1024
    contract = json.loads(source.read_bytes())
    assert contract["schema"] == SCHEMA and contract["invokeVersion"] == VERSION
    temp, app = Path(contract["tempRoot"]), Path(contract["appRoot"])
    assert (
        temp.parent == run.parents[2]
        and temp.name.startswith("t-")
        and app == temp / "app"
    )
    for directory in (temp, app):
        assert (
            directory.resolve(strict=True) == directory
            and directory.stat().st_uid == os.getuid()
        )
        assert directory.is_dir()
    assert temp != run
    assert type(contract["port"]) is int and 1024 <= contract["port"] <= 65535
    assert Path(contract["invokePython"]) == Path(sys.executable)
    assert (
        contract["width"],
        contract["height"],
        contract["seed"],
        contract["steps"],
    ) == (512, 512, 123, 30)
    assert (contract["cfg"], contract["cfgRescale"], contract["scheduler"]) == (
        5,
        0,
        "euler",
    )
    assert (
        contract["denoisingStart"],
        contract["denoisingEnd"],
        contract["negative"],
    ) == (0.4, 1, "")
    assert contract["freshNativeRequestsMax"] == 3
    assert contract["cases"] == [
        {"label": label, "positive": POSITIVE, "images": images}
        for label, images in ASSIGNMENTS
    ]
    assert set(contract["referenceImages"]) == set(REFERENCE_SHAS)
    assert set(contract["maskImages"]) == set(BOXES)
    assert contract["vision"]["name"] == VISION_NAME
    return contract


def pin_size(pin):
    return pin["byteSize"] if "byteSize" in pin else pin["size"]


def png_data(driver, pin, expected_sha=None, *, mask=None):
    from PIL import Image, ImageChops

    path = Path(pin["path"])
    size = pin_size(pin)
    assert 0 < size <= PNG_LIMIT
    assert path.is_file() and path.resolve(strict=True) == path
    with path.open("rb") as file:
        body = file.read(PNG_LIMIT + 1)
    assert len(body) == size
    assert driver.sha256(body) == pin["sha256"]
    if expected_sha:
        assert pin["sha256"] == expected_sha
    if mask:
        with Image.open(io.BytesIO(body)) as image:
            assert (
                image.format == "PNG"
                and image.size == (512, 512)
                and image.mode == "RGBA"
            )
            rgba = image.copy()
        expected = Image.new("L", (512, 512), 0)
        expected.paste(255, BOXES[mask])
        assert ImageChops.difference(expected, rgba.getchannel("A")).getbbox() is None
        actual = {
            "rgbSha256": driver.sha256(rgba.convert("RGB").tobytes()),
            "rgbaSha256": driver.sha256(rgba.tobytes()),
            "alphaSha256": driver.sha256(expected.tobytes()),
        }
    else:
        actual = driver.png_description(body, 512, 512)
    for key in ("rgbSha256", "rgbaSha256"):
        assert actual[key] == pin[key]
    return body, actual


def upload(driver, api, run, name, pin, expected_sha=None, *, mask=None):
    body, original = png_data(driver, pin, expected_sha, mask=mask)
    boundary = b"IGSInvokeRegionalReference6b995ee28f"
    assert boundary not in body
    multipart = (
        b"--"
        + boundary
        + b"\r\n"
        + f'Content-Disposition: form-data; name="file"; filename="{name}.png"\r\n'.encode(
            "ascii"
        )
        + b"Content-Type: image/png\r\n\r\n"
        + body
        + b"\r\n--"
        + boundary
        + b"--\r\n"
    )
    uploaded = json.loads(
        api.request(
            "/api/v1/images/upload?image_category=general&is_intermediate=true",
            "POST",
            multipart,
            f"multipart/form-data; boundary={boundary.decode('ascii')}",
        )
    )
    assert (uploaded["width"], uploaded["height"]) == (512, 512)
    returned = api.full_png(uploaded["image_name"])
    driver.save_bytes(run, f"{name}.roundtrip.png", returned)
    _, roundtrip = png_data(
        driver,
        {
            **pin,
            "path": str(run / f"{name}.roundtrip.png"),
            "byteSize": len(returned),
            "sha256": driver.sha256(returned),
        },
        mask=mask,
    )
    for channel in ("rgbSha256", "rgbaSha256", *(("alphaSha256",) if mask else ())):
        assert roundtrip[channel] == original[channel]
    driver.write_json(
        run,
        f"{name}.upload.json",
        {
            "original": original,
            "imageDTO": uploaded,
            "roundtrip": roundtrip,
        },
    )
    return uploaded["image_name"]


def model_pins(contract):
    vision = contract["vision"]
    vision_directory = Path(vision["directory"])
    assert (
        vision_directory.resolve(strict=True) == vision_directory
        and vision_directory.is_dir()
    )
    assert {path.name for path in vision_directory.iterdir()} == {
        "config.json",
        "model.safetensors",
    }
    assert Path(vision["config"]["path"]) == vision_directory / "config.json"
    assert Path(vision["model"]["path"]) == vision_directory / "model.safetensors"
    checkpoint = {
        "path": contract["checkpoint"],
        "byteSize": contract["checkpointBytes"],
        "sha256": contract["checkpointSha256"],
    }
    return [
        (checkpoint, CHECKPOINT_SHA, 6_938_040_760),
        (contract["adapter"], ADAPTER_SHA, 698_391_064),
        (vision["config"], VISION_SHAS["config"], 560),
        (vision["model"], VISION_SHAS["model"], 2_528_373_448),
    ]


def file_identity(path):
    stat = path.stat()
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


def register_model(driver, api, run, role, model_path, name, base, model_type, fmt):
    params = urlencode({"source": model_path, "inplace": "true"})
    config = {"name": name, "type": model_type}
    if model_type == "main":
        config["prediction_type"] = "epsilon"
    deadline = time.monotonic() + 75
    job = api.json("/api/v2/models/install?" + params, "POST", config)
    driver.write_json(run, f"{role}.registration-initial.json", job)
    while job["status"] not in {"completed", "error", "cancelled"}:
        assert time.monotonic() < deadline, f"{role} registration deadline"
        time.sleep(0.4)
        job = api.json(f"/api/v2/models/install/{job['id']}")
    driver.write_json(run, f"{role}.registration-final.json", job)
    assert job["status"] == "completed", job
    model = job["config_out"]
    assert (model["name"], model["base"], model["type"], model["format"]) == (
        name,
        base,
        model_type,
        fmt,
    )
    assert Path(model["path"]).resolve(strict=True) == Path(model_path)
    if model_type == "main":
        assert model["prediction_type"] == "epsilon"
    return {key: model[key] for key in MODEL_IDENTIFIER}


def make_graph(driver, contract, case, model, source, adapter, references, masks):
    graph = driver.make_graph(contract, case, model, source)
    graph["id"] = "igs-invoke-two-plinth-" + case["label"]
    if not case["images"]:
        return graph

    nodes, edges = graph["nodes"], graph["edges"]

    def add_node(node_id, node_type, **fields):
        assert node_id not in nodes
        nodes[node_id] = {
            "id": node_id,
            "type": node_type,
            "use_cache": False,
            **fields,
        }

    def add_edge(source_id, output, target_id, input_field):
        edges.append(
            {
                "source": {"node_id": source_id, "field": output},
                "destination": {"node_id": target_id, "field": input_field},
            }
        )

    # Current Invoke Canvas addRegionalGuidance creates one native mask-reader
    # and one IP-Adapter field per owning region, then joins the fields with collect.
    add_node("reference-list", "collect")
    for side, reference in zip(BOXES, case["images"], strict=True):
        mask_node, adapter_node = f"mask-{side}", f"adapter-{side}"
        add_node(mask_node, "alpha_mask_to_tensor", image={"image_name": masks[side]})
        add_node(
            adapter_node,
            "ip_adapter",
            image={"image_name": references[reference]},
            ip_adapter_model=adapter,
            clip_vision_model="ViT-H",
            weight=1.0,
            method="full",
            begin_step_percent=0.0,
            end_step_percent=1.0,
        )
        add_edge(mask_node, "mask", adapter_node, "mask")
        add_edge(adapter_node, "ip_adapter", "reference-list", "item")
    add_edge("reference-list", "collection", "denoise", "ip_adapter")
    return graph


def check_completed_graph(driver, run, case, graph, adapter, vision):
    item = json.loads((run / f"{case['label']}.queue-final-item.json").read_bytes())
    state = item["session"]
    received = state["graph"]
    assert received["id"] == graph["id"] and received["edges"] == graph["edges"]
    assert received["nodes"].keys() == graph["nodes"].keys()
    for name, expected in graph["nodes"].items():
        assert {key: received["nodes"][name][key] for key in expected} == expected, name
    assert not state["errors"]

    def result(node_id):
        (prepared,) = state["source_prepared_mapping"][node_id]
        return state["results"][prepared]

    assert result("output")["type"] == "image_output"
    assert result("noise")["noise"]["seed"] == 123
    assert result("denoise")["type"] in {"latents_output", "latents_meta_output"}
    if not case["images"]:
        assert not any(
            value["type"] == "ip_adapter_output" for value in state["results"].values()
        )
        return

    expected_fields = []
    for side in BOXES:
        mask = result(f"mask-{side}")
        field = result(f"adapter-{side}")["ip_adapter"]
        node = graph["nodes"][f"adapter-{side}"]
        assert (mask["width"], mask["height"]) == (512, 512)
        assert field["mask"] == mask["mask"]
        assert field["image"] == node["image"]
        assert {
            key: field["ip_adapter_model"][key] for key in MODEL_IDENTIFIER
        } == adapter
        assert {
            key: field["image_encoder_model"][key] for key in MODEL_IDENTIFIER
        } == vision
        assert (field["weight"], field["method"], field["target_blocks"]) == (
            1.0,
            "full",
            ["block"],
        )
        assert (field["begin_step_percent"], field["end_step_percent"]) == (0, 1)
        expected_fields.append(field)
    collection = result("reference-list")["collection"]
    # The installed collector orders by prepared node identity. Pair identity
    # comes from each field's mask, and the receipt preserves its actual order.
    assert collection in (expected_fields, expected_fields[::-1])
    driver.write_json(
        run, f"{case['label']}.executed-reference-fields.json", collection
    )


def serve(run, contract):
    expected = {
        "INVOKEAI_ROOT": contract["appRoot"],
        "INVOKEAI_HOST": "127.0.0.1",
        "INVOKEAI_PORT": str(contract["port"]),
        "INVOKEAI_PATCHMATCH": "false",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    }
    assert all(os.environ.get(key) == value for key, value in expected.items())
    assert not os.environ.get("USE_MODULAR_DENOISE")
    sys.argv = [sys.argv[0], "--root", contract["appRoot"]]
    import invokeai.app.run_app as installed
    from invokeai.version import __version__

    assert __version__ == VERSION
    get_app = installed.get_app

    @wraps(get_app)
    def checked_get_app():
        import torch
        from invokeai.app.invocations.ip_adapter import CLIP_VISION_MODEL_MAP
        from invokeai.app.services.config.config_default import get_config

        config = get_config()
        assert str(config.root_path) == contract["appRoot"]
        assert (config.host, config.port) == ("127.0.0.1", contract["port"])
        assert config.patchmatch is False
        assert CLIP_VISION_MODEL_MAP["ViT-H"].name == VISION_NAME
        result = get_app()
        torch.cuda.set_per_process_memory_fraction(0.75, 0)
        with (run / "installed-server-settings.json").open("x") as output:
            json.dump(
                {
                    "root": str(config.root_path),
                    "host": config.host,
                    "port": config.port,
                    "precision": config.precision,
                    "sequentialGuidance": config.sequential_guidance,
                    "forceTiledDecode": config.force_tiled_decode,
                    "cudaAllocatorFraction": 0.75,
                },
                output,
                indent=2,
            )
            output.write("\n")
        return result

    installed.get_app = checked_get_app
    installed.run_app()


def main(run, contract):
    driver = load_mug_driver()
    assert importlib.metadata.version("InvokeAI") == VERSION
    group = driver.cgroup_path()
    assert not (Path(contract["appRoot"]) / "databases" / "invokeai.db").exists()
    started = time.monotonic()
    report = {
        "status": "incomplete",
        "enqueueAttempts": 0,
        "queueItemIds": [],
        "results": [],
        "cgroup": str(group),
        "controller": driver.proc_identity(os.getpid()),
        "startedAt": driver.now(),
        "packages": {
            name: importlib.metadata.version(name)
            for name in (
                "InvokeAI",
                "torch",
                "diffusers",
                "transformers",
                "compel",
                "safetensors",
            )
        },
    }
    server = None
    identity = None
    borrowed = {}
    with (run / "installed-app.log").open("xb") as log:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as reservation:
                reservation.bind(("127.0.0.1", contract["port"]))

            for pin, required_sha, required_size in model_pins(contract):
                path = Path(pin["path"])
                assert pin["sha256"] == required_sha and pin_size(pin) == required_size
                before = file_identity(path)
                driver.pin_file(path, required_size, required_sha)
                assert file_identity(path) == before
                borrowed[path] = before

            env = driver.environment(contract)
            # The optional infill package attempts to compile in the installed
            # dependency directory when enabled. This graph has no infill node.
            env["INVOKEAI_PATCHMATCH"] = "false"
            server = subprocess.Popen(
                [
                    contract["invokePython"],
                    "-IB",
                    str(Path(__file__).resolve()),
                    "--run",
                    str(run),
                    "--serve",
                ],
                cwd=run,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            identity = driver.proc_identity(server.pid)
            assert server.pid in set(
                map(int, (group / "cgroup.procs").read_text().split())
            )
            report["server"] = identity
            api = driver.InvokeApi(contract["port"], server)
            version = driver.wait_for_api(api, time.monotonic() + 90)
            driver.write_json(run, "api-version.json", version)
            assert version["version"] == VERSION
            model = register_model(
                driver,
                api,
                run,
                "checkpoint",
                contract["checkpoint"],
                "IGS exact Illustrious v0.1 two-plinth reference",
                "sdxl",
                "main",
                "checkpoint",
            )
            adapter = register_model(
                driver,
                api,
                run,
                "adapter",
                contract["adapter"]["path"],
                "IGS exact SDXL ViT-H reference adapter",
                "sdxl",
                "ip_adapter",
                "checkpoint",
            )
            vision = register_model(
                driver,
                api,
                run,
                "vision",
                contract["vision"]["directory"],
                VISION_NAME,
                "any",
                "clip_vision",
                "diffusers",
            )
            source = upload(driver, api, run, "source", contract["source"], SOURCE_SHA)
            references = {
                key: upload(
                    driver, api, run, f"reference-{key}", pin, REFERENCE_SHAS[key]
                )
                for key, pin in contract["referenceImages"].items()
            }
            masks = {
                side: upload(driver, api, run, f"mask-{side}", pin, mask=side)
                for side, pin in contract["maskImages"].items()
            }
            assert len({source, *references.values(), *masks.values()}) == 5
            for case in contract["cases"]:
                graph = make_graph(
                    driver, contract, case, model, source, adapter, references, masks
                )
                output = driver.generate(
                    api, run, case, graph, contract, started + 515, report
                )
                check_completed_graph(driver, run, case, graph, adapter, vision)
                report["results"].append(output)
            assert (
                report["enqueueAttempts"] == len(report["results"]) == len(ASSIGNMENTS)
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
                    report["serverShutdown"] = driver.shutdown(server, group, identity)
                    if report["status"] == "completed":
                        assert report["serverShutdown"]["clean"]
                assert all(
                    file_identity(path) == record for path, record in borrowed.items()
                )
            except BaseException as error:
                report.update(
                    status="shutdown-or-preservation-unconfirmed",
                    closeError=repr(error),
                )
                raise
            finally:
                report["elapsedSeconds"] = time.monotonic() - started
                report["finishedAt"] = driver.now()
                report["cgroupMemory"] = {
                    key: (group / key).read_text().strip()
                    for key in ("memory.peak", "memory.swap.peak", "memory.events")
                }
                driver.write_json(run, "app-run.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--serve", action="store_true")
    options = parser.parse_args()
    assert __debug__
    frozen = read_contract(options.run, server=options.serve)
    if options.serve:
        serve(options.run, frozen)
    else:
        main(options.run, frozen)
