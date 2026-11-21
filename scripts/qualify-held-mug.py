"""Compare source-backed ordinary IMG operators on one installed runtime."""

import argparse
import hashlib
import importlib.util
import json
import math
import os
import stat
import sys
from contextlib import ExitStack, contextmanager
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path

ARTIFACT_ROOT = Path.home() / ".codex/artifacts/imagegen-studio"
STAGES = ("scaled_input", "unet_input", "unet_output", "cfg", "euler")


def file_identity(metadata):
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def fingerprint(path, size):
    assert path == path.resolve(strict=True)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        assert stat.S_ISREG(before.st_mode) and before.st_size == size, path
        result = hashlib.file_digest(stream, "sha256").hexdigest()
        assert file_identity(os.fstat(stream.fileno())) == file_identity(before), path
        assert file_identity(path.stat()) == file_identity(before), path
    return result


def verified(descriptor):
    path = Path(descriptor["path"])
    count = (
        descriptor["byteSize"] if "byteSize" in descriptor else descriptor["sizeBytes"]
    )
    assert fingerprint(path, count) == descriptor["sha256"], path
    return path


def write(run, name, value):
    with (run / name).open("x") as stream:
        json.dump(value, stream, indent=2, default=str)
        stream.write("\n")


def load_lane(root, lane):
    path = root / f"qualify-held-mug-{lane}.py"
    spec = importlib.util.spec_from_file_location(f"held_mug_{lane}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resource_boundary(contract):
    hierarchy = Path("/proc/self/cgroup").read_text().strip()
    assert hierarchy.startswith("0::/user.slice/") and "\n" not in hierarchy
    group = Path("/sys/fs/cgroup") / hierarchy.removeprefix("0::/")
    assert group.name.startswith("igs-held-mug-") and group.name.endswith(".service")
    assert (
        int((group / "memory.max").read_text()) == contract["bounds"]["memoryMaxBytes"]
    )
    assert (group / "memory.swap.max").read_text().strip() == "0"
    return group


def described(value):
    import torch

    cpu = value.detach().to("cpu").contiguous()
    raw = cpu.view(torch.uint8).numpy().tobytes()
    return {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "shape": list(cpu.shape),
        "dtype": str(cpu.dtype),
    }


class OperatorTrace:
    def __init__(self, torch, schedule, held):
        self.torch = torch
        self.schedule = schedule
        self.held = held
        self.additions = []
        self.scales = []
        self.inputs = []
        self.outputs = []
        self.steps = []

    def hold(self, tensor):
        cpu = tensor.detach().to("cpu", copy=True).contiguous()
        assert self.torch.isfinite(cpu).all()
        return cpu

    def check_time(self, timestep, step):
        actual = self.hold(self.torch.as_tensor(timestep))
        assert 1 <= actual.numel() <= 2 and (actual == self.schedule[step]).all()
        return actual.tolist()

    @contextmanager
    def attach(self, unet, scheduler):
        original_add_noise = scheduler.add_noise
        original_scale = scheduler.scale_model_input
        original_step = scheduler.step

        @wraps(original_add_noise)
        def add_noise(source, noise, timesteps):
            assert not self.additions
            self.check_time(timesteps, 0)
            assert self.torch.equal(source, self.held["source"])
            assert self.torch.equal(noise, self.held["noise"])
            output = original_add_noise(source, noise, timesteps)
            self.additions.append(
                {
                    "source": self.hold(source),
                    "noise": self.hold(noise),
                    "result": self.hold(output),
                }
            )
            return output

        @wraps(original_scale)
        def scale(sample, timestep, *args, **kwargs):
            i = len(self.scales)
            self.check_time(timestep, i)
            output = original_scale(sample, timestep, *args, **kwargs)
            assert output.shape[0] in (1, 2)
            if output.shape[0] == 2:
                assert self.torch.equal(output[0], output[1])
            self.scales.append(
                {"batch": output.shape[0], "scaled_input": self.hold(output[:1])}
            )
            return output

        @wraps(original_step)
        def step(prediction, timestep, sample, *args, **kwargs):
            i = len(self.steps)
            self.check_time(timestep, i)
            assert len(self.outputs) == i + 1
            expected = self.steps[-1]["euler"] if i else self.additions[0]["result"]
            assert self.torch.equal(self.hold(sample), expected)
            output = original_step(prediction, timestep, sample, *args, **kwargs)
            next_latent = (
                output.prev_sample if hasattr(output, "prev_sample") else output[0]
            )
            self.steps.append(
                {"cfg": self.hold(prediction), "euler": self.hold(next_latent)}
            )
            return output

        def before(_model, args, kwargs):
            i = len(self.inputs)
            sample = args[0] if args else kwargs["sample"]
            timestep = args[1] if len(args) > 1 else kwargs["timestep"]
            context = args[2] if len(args) > 2 else kwargs["encoder_hidden_states"]
            conditioning = kwargs["added_cond_kwargs"]
            assert self.torch.equal(context, self.held["context"])
            assert set(conditioning) == {"text_embeds", "time_ids"}
            for name, value in conditioning.items():
                assert self.torch.equal(value, self.held[name]), name
            assert kwargs.get("encoder_attention_mask") is None
            assert kwargs.get("attention_mask") is None
            assert not kwargs.get("cross_attention_kwargs")
            scaled = self.scales[i]["scaled_input"]
            unet_input = self.hold(sample)
            assert self.torch.equal(unet_input, self.torch.cat((scaled, scaled)))
            self.inputs.append(
                {
                    "unet_input": unet_input,
                    "timestep": self.check_time(timestep, i),
                    "conditioning": {
                        name: described(self.held[name])
                        for name in ("context", "text_embeds", "time_ids")
                    },
                }
            )

        def after(_model, _args, output):
            self.outputs.append(
                self.hold(output.sample if hasattr(output, "sample") else output[0])
            )

        with ExitStack() as stack:
            for name, wrapper in (
                ("add_noise", add_noise),
                ("scale_model_input", scale),
                ("step", step),
            ):
                assert name not in vars(scheduler)
                setattr(scheduler, name, wrapper)
                stack.callback(delattr, scheduler, name)
            stack.callback(
                unet.register_forward_pre_hook(before, with_kwargs=True).remove
            )
            stack.callback(unet.register_forward_hook(after).remove)
            yield

    def complete(self, terminal):
        assert len(self.additions) == 1
        assert (
            len(self.schedule)
            == len(self.scales)
            == len(self.inputs)
            == len(self.outputs)
            == len(self.steps)
        )
        assert self.torch.equal(self.hold(terminal), self.steps[-1]["euler"])
        rows = []
        for scale, entered, output, step in zip(
            self.scales, self.inputs, self.outputs, self.steps, strict=True
        ):
            rows.append(
                {
                    **scale,
                    **entered,
                    "unet_output": output,
                    **step,
                }
            )
        return rows


def signature(unet):
    return (
        [
            (key, id(value), value.data_ptr(), value._version)
            for key, value in unet.named_parameters()
        ],
        [
            (key, id(value), value.data_ptr(), value._version)
            for key, value in unet.named_buffers()
        ],
        [(key, id(value)) for key, value in unet.attn_processors.items()],
        [(key, value.training) for key, value in unet.named_modules()],
        tuple(unet._forward_pre_hooks),
        tuple(unet._forward_hooks),
    )


def compare(left, right, torch):
    assert left.shape == right.shape and left.dtype == right.dtype
    equal = torch.equal(left.view(torch.int16), right.view(torch.int16))
    summary = {"exact": equal, "invoke": described(left), "studio": described(right)}
    if not equal:
        difference = (left.float() - right.float()).abs()
        summary.update(
            maxAbsolute=float(difference.max()),
            meanAbsolute=float(difference.mean()),
            countDifferentBits=int(
                (left.view(torch.int16) != right.view(torch.int16)).sum()
            ),
        )
    return summary


def load_held(pins, torch):
    tensors = {}
    for role, pin in pins.items():
        assert pin["dtype"] == "torch.float16" and pin["byteSize"] == 2 * math.prod(
            pin["shape"]
        )
        data = verified(pin).read_bytes()
        tensor = torch.frombuffer(bytearray(data), dtype=torch.float16).reshape(
            pin["shape"]
        )
        assert (
            torch.isfinite(tensor).all()
            and described(tensor)["sha256"] == pin["sha256"]
        )
        tensors[role] = tensor.to("cuda")
    return tensors


def main(run):
    assert __debug__ and sys.byteorder == "little"
    assert run.resolve(strict=True) == run and run.stat().st_uid == os.getuid()
    assert run.parent == ARTIFACT_ROOT / "runs/ordinary-img-mug-held-replay"
    contract_path = run / "reference-contract.json"
    contract_pin = json.loads((run / "preregistration.json").read_bytes())["contract"]
    assert verified(contract_pin) == contract_path
    contract = json.loads(contract_path.read_bytes())
    assert contract["schema"] == "ordinary-img-mug-held-operator-comparison-v1"
    assert contract["schedule"]["timesteps"] == list(range(595, 0, -33))
    assert contract["nativeCeiling"] == {
        "modelLoads": 1,
        "unetForwardsPerLane": 19,
        "lanes": ["Invoke", "Studio"],
        "newImagePublications": 0,
    }
    assert sys.executable == contract["pythonExecutable"]
    group = resource_boundary(contract)
    temp = Path(contract["tempRoot"])
    assert temp.parent == ARTIFACT_ROOT and temp.resolve(strict=True) == temp
    assert temp.name.startswith("t-igs-hr") and temp.stat().st_uid == os.getuid()
    assert os.environ.get("HF_HUB_OFFLINE") == "1"
    execution = json.loads((run / "executable-pins.json").read_bytes())
    for pin in execution.values():
        assert verified(pin).parent == run

    native_start = json.loads(verified(contract["studioNativeStart"]).read_bytes())
    installed = native_start["installation"]
    assert installed["runtimeId"] == contract["runtimeId"]
    assert installed["pythonExecutable"] == sys.executable
    assert Path(sys.executable).resolve(strict=True) == Path(installed["exactPython"])
    pins = installed["pinned"] + installed["configs"]
    for records in ("invokeSources", "currentInvokeSources", "commonSources", "held"):
        pins.extend(contract[records].values())
    for role in (
        "studioRequest",
        "referenceContract",
        "referenceObservation",
        "trajectoryManifest",
        "sourceImage",
        "checkpoint",
    ):
        pins.append(contract[role])
    for pin in pins:
        verified(pin)

    from imagegen_worker import inference, protocol

    assert Path(inference.__file__) == Path(
        contract["commonSources"]["installedWorker"]["path"]
    )
    runtime = inference.qualify_ml_runtime()
    torch, diffusers = runtime.torch, runtime.diffusers
    assert diffusers.__version__ == "0.40.0"
    command = json.loads(verified(contract["studioRequest"]).read_bytes())["request"]
    staging = temp / "tmp-input"
    assert staging.is_dir() and staging.resolve(strict=True) == staging
    target = staging / "target.png"
    source = verified(contract["sourceImage"])
    with target.open("xb") as stream:
        stream.write(source.read_bytes())
    request_target = command["job"]["target"]
    assert fingerprint(target, request_target["byteSize"]) == request_target["sha256"]
    request_target["path"] = str(target)
    command["job"]["output"] = {
        "stagingRoot": str(staging),
        "pngPath": str(staging / "unused.png"),
    }
    parsed = protocol.parse_request(command)
    assert isinstance(parsed, protocol.GenerateIllustriousImg2ImgCommand)
    assert parsed.denoising_strength == contract["schedule"]["strength"]
    assert (parsed.seed, parsed.steps, parsed.cfg_scale, parsed.cfg_rescale) == (
        123,
        30,
        5,
        0,
    )
    assert parsed.scheduler == "euler"
    pipeline, _embeddings = inference.load_illustrious_pipeline(
        parsed, config_dir=Path(installed["configDir"]), runtime=runtime, mode="img2img"
    )
    unet = pipeline.unet
    initial_signature = signature(unet)
    held = load_held(contract["held"], torch)
    schedule = contract["schedule"]["timesteps"]
    original = json.loads(verified(contract["referenceObservation"]).read_bytes())[
        "cases"
    ][0]
    invoke_scheduler = diffusers.EulerDiscreteScheduler.from_config(
        original["scheduler"]["config"]
    )
    studio_scheduler = pipeline.scheduler
    assert invoke_scheduler is not studio_scheduler
    write(
        run,
        "native-start.json",
        {
            "timeUTC": datetime.now(UTC).isoformat(),
            "pid": os.getpid(),
            "group": str(group),
            "runtimeId": installed["runtimeId"],
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "diffusers": diffusers.__version__,
        },
    )

    invoke = OperatorTrace(torch, schedule, held)
    invoke_lane = load_lane(run, "invoke")
    with torch.inference_mode(), invoke.attach(unet, invoke_scheduler):
        ref = invoke_lane.run_invoke_lane(
            torch=torch,
            diffusers=diffusers,
            invoke_root=Path(contract["installedInvokeRoot"]),
            source_pins=contract["invokeSources"],
            unet=unet,
            scheduler=invoke_scheduler,
            source=held["source"].clone(),
            noise=held["noise"].clone(),
            context=held["context"],
            text_embeds=held["text_embeds"],
            time_ids=held["time_ids"],
        )
    assert signature(unet) == initial_signature
    ref_rows = invoke.complete(ref.pop("latents"))
    assert ref["timesteps"].tolist() == schedule
    assert ref["init_timestep"].tolist() == [schedule[0]]
    ref["timesteps"] = ref["timesteps"].tolist()
    ref["init_timestep"] = ref["init_timestep"].tolist()
    studio = OperatorTrace(torch, schedule, held)
    studio_lane = load_lane(run, "studio")
    with torch.inference_mode(), studio.attach(unet, studio_scheduler):
        value, progress = studio_lane.run_studio_lane(runtime, pipeline, held)
    assert signature(unet) == initial_signature
    studio_rows = studio.complete(value)

    added = compare(invoke.additions[0]["result"], studio.additions[0]["result"], torch)
    sigmas = described(invoke_scheduler.sigmas)
    assert sigmas == described(studio_scheduler.sigmas)
    assert torch.equal(invoke_scheduler.timesteps, studio_scheduler.timesteps)
    comparisons = []
    first_difference = None if added["exact"] else {"stage": "add_noise"}
    for index, (left, right) in enumerate(
        zip(ref_rows, studio_rows, strict=True), start=1
    ):
        assert left["conditioning"] == right["conditioning"]
        stage_results = {
            role: compare(left[role], right[role], torch) for role in STAGES
        }
        comparisons.append(
            {
                "transition": index,
                "stages": stage_results,
                "conditioning": left["conditioning"],
                "invokeScaleBatch": left["batch"],
                "studioScaleBatch": right["batch"],
                "invokeUnetTimestep": left["timestep"],
                "studioUnetTimestep": right["timestep"],
            }
        )
        if first_difference is None:
            unequal = next(
                (name for name, stage in stage_results.items() if not stage["exact"]),
                None,
            )
            if unequal:
                first_difference = {"stage": unequal, "transition": index}
    for pin in pins:
        verified(pin)
    assert not (staging / "unused.png").exists()
    memory = {
        name: (group / name).read_text().strip()
        for name in ("memory.peak", "memory.swap.peak", "memory.events")
    }
    assert memory["memory.swap.peak"] == "0"
    assert "oom_kill 0" in memory["memory.events"].splitlines()
    write(
        run,
        "comparison.json",
        {
            "outcome": "PASS",
            "addNoise": added,
            "firstDifference": first_difference,
            "sigmaGrid": sigmas,
            "steps": comparisons,
            "invoke": ref,
            "studioProgress": progress,
            "referenceMatches": {
                "invokeNoised": described(invoke.additions[0]["result"])["sha256"]
                == contract["held"]["noised"]["sha256"],
                "invokeFirst": described(ref_rows[0]["euler"])["sha256"]
                == contract["held"]["step-01"]["sha256"],
                "invokeTerminal": described(ref_rows[-1]["euler"])["sha256"]
                == contract["held"]["step-19"]["sha256"],
                "studioTerminal": described(studio_rows[-1]["euler"])["sha256"]
                == contract["held"]["step-19"]["sha256"],
            },
            "sameUnetIdentityAndParameterVersions": True,
            "memory": memory,
        },
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    main(parser.parse_args().run)
