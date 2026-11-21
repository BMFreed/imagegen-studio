"""Observe the installed Invoke 6.14.3 IMG graph on its original app entrypoint.

Current donor `4875d96531ca6712b288f6e660fcbb34143408c1`: the opaque IMG
caller in frontend generation/core/canvas/compileCanvasGraph.ts, VAE encode
in app/invocations/vae/image_to_latents.py, schedule and tensor preparation in
app/invocations/sd/denoise_latents.py, and the legacy loop in
backend/stable_diffusion/{diffusers_pipeline,diffusion/shared_invokeai_diffusion}.py.
The installed release has its own flat invocation module paths. Each wrapper
below delegates to that release and reads tensor bytes for diagnostics.
"""

import argparse
import hashlib
import json
import os
import sys
from contextvars import ContextVar
from functools import wraps
from pathlib import Path


def launch_arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    if args.run != args.run.resolve(strict=True) or args.root != args.root.resolve(
        strict=True
    ):
        raise ValueError(
            "The evidence and isolated app root must be canonical directories."
        )
    if args.run == args.root or not all(
        path.is_dir() and path.stat().st_uid == os.getuid()
        for path in (args.run, args.root)
    ):
        raise ValueError("The launch requires distinct, owned roots.")
    with (args.run / "reference-contract.json").open() as receipt:
        contract = json.load(receipt)
    if (
        args.root != Path(contract["appRoot"])
        or args.root.parent != Path(contract["tempRoot"])
        or args.port != contract["port"]
        or contract["invokeVersion"] != "6.14.3"
    ):
        raise ValueError(
            "The app root, version, and port must match the frozen run contract."
        )
    expected_environment = {
        "INVOKEAI_ROOT": str(args.root),
        "INVOKEAI_HOST": "127.0.0.1",
        "INVOKEAI_PORT": str(args.port),
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    }
    if any(os.environ.get(key) != value for key, value in expected_environment.items()):
        raise ValueError("The isolated localhost and offline settings are required.")
    if os.environ.get("USE_MODULAR_DENOISE"):
        raise ValueError("This comparison uses the original installed legacy denoiser.")
    return args, contract


def install_observers(run, labels, config):
    import torch
    from diffusers import AutoencoderKL, UNet2DConditionModel
    from invokeai.app.invocations import (
        denoise_latents,
        image_to_latents,
        latents_to_image,
        noise,
    )
    from invokeai.backend.stable_diffusion.diffusion.shared_invokeai_diffusion import (
        InvokeAIDiffuserComponent,
    )

    # The original isolated application qualification used the same allocator fraction.
    torch.cuda.set_per_process_memory_fraction(0.75, 0)
    observed = {
        "schemaVersion": 1,
        "originalDelegation": True,
        "app": {
            "root": str(config.root_path),
            "host": config.host,
            "port": config.port,
            "precision": config.precision,
            "sequentialGuidance": config.sequential_guidance,
            "forceTiledDecode": config.force_tiled_decode,
            "cudaAllocatorFraction": 0.75,
        },
        "cases": [],
    }
    report = run / "native-observations.json"
    temporary_report = run / ".native-observations.json.tmp"
    active = ContextVar("observed_invocation_case", default=None)
    cases = {}

    def save(*, first=False):
        target = report if first else temporary_report
        with target.open("x") as stream:
            json.dump(observed, stream, indent=2)
            stream.write("\n")
        if not first:
            temporary_report.replace(report)

    def digest(tensor):
        value = tensor.detach().contiguous()
        fingerprint = hashlib.sha256(
            value.to("cpu").view(torch.uint8).numpy().tobytes()
        )
        return {
            "shape": list(value.shape),
            "dtype": str(value.dtype),
            "device": str(tensor.device),
            "sha256": fingerprint.hexdigest(),
        }

    def timestep_values(value):
        if isinstance(value, torch.Tensor):
            return value.detach().to("cpu").reshape(-1).tolist()
        return [value]

    def invocation_row(context):
        item = context._data.queue_item
        graph_id = item.session.graph.id
        session_id = item.session_id
        if session_id not in cases:
            index = len(cases)
            if index == len(labels) or graph_id != f"igs-invoke-mug-{labels[index]}":
                raise RuntimeError(f"Unexpected graph order or submission: {graph_id}")
            row = {
                "label": labels[index],
                "graphId": graph_id,
                "queueItemId": item.item_id,
                "sessionId": session_id,
                "invocations": {},
                "encode": {},
                "noise": {},
                "prepare": {},
                "scheduler": {},
                "addNoise": [],
                "scaleModelInput": [],
                "unet": [],
                "cfg": [],
                "steps": [],
                "decode": {},
            }
            cases[session_id] = row
            observed["cases"].append(row)
        return cases[session_id]

    def wrap_invocation(owner, kind):
        original = owner.invoke

        @wraps(original)
        def observe(self, context):
            row = invocation_row(context)
            invocations = row["invocations"]
            if kind in invocations:
                raise RuntimeError(f"Repeated {kind} invocation in {row['graphId']}")
            record = {
                "sourceNodeId": context._data.source_invocation_id,
                "invocationId": self.id,
            }
            invocations[kind] = record
            if kind == "encode":
                record.update(
                    imageName=self.image.image_name,
                    fp32=self.fp32,
                    tiled=self.tiled,
                    colorCompensation=self.color_compensation,
                )
            save()
            token = active.set(row)
            try:
                result = original(self, context)
                if kind == "decode":
                    record["outputImageName"] = result.image.image_name
                return result
            except BaseException as error:
                record["errorType"] = type(error).__name__
                raise
            finally:
                active.reset(token)
                save()

        owner.invoke = observe

    original_vae_encode = image_to_latents.ImageToLatentsInvocation.vae_encode

    @wraps(original_vae_encode)
    def observe_vae_encode(cls, vae_info, upcast, tiled, image_tensor, tile_size=0):
        row = active.get()
        if row is not None:
            row["encode"]["normalizedImage"] = digest(image_tensor)
        result = original_vae_encode(vae_info, upcast, tiled, image_tensor, tile_size)
        if row is not None:
            row["encode"]["scaledLatents"] = digest(result)
        return result

    original_encode = AutoencoderKL.encode

    @wraps(original_encode)
    def observe_encode(self, x, *args, **kwargs):
        row = active.get()
        if row is not None:
            row["encode"]["autoencoderInput"] = digest(x)
        result = original_encode(self, x, *args, **kwargs)
        if row is not None:
            distribution = (
                result.latent_dist if hasattr(result, "latent_dist") else result[0]
            )
            row["encode"].update(
                scalingFactor=self.config.scaling_factor,
                posteriorMean=digest(distribution.mean),
                posteriorStd=digest(distribution.std),
            )
        return result

    original_noise = noise.generate_noise_tensor

    @wraps(original_noise)
    def observe_noise(*args, **kwargs):
        result = original_noise(*args, **kwargs)
        row = active.get()
        if row is not None:
            row["noise"] = {
                "seed": kwargs["seed"],
                "useCpu": kwargs["use_cpu"],
                "requestedDtype": str(kwargs["dtype"]),
                "tensor": digest(result),
            }
        return result

    original_prepare = (
        denoise_latents.DenoiseLatentsInvocation.prepare_noise_and_latents
    )

    @wraps(original_prepare)
    def observe_prepare(context, noise_field, latents_field):
        result = original_prepare(context, noise_field, latents_field)
        row = active.get()
        if row is not None:
            seed, noise_tensor, latents = result
            row["prepare"] = {
                "seed": seed,
                "sourceLatents": digest(latents),
                "noise": digest(noise_tensor) if noise_tensor is not None else None,
            }
        return result

    original_init = denoise_latents.DenoiseLatentsInvocation.init_scheduler

    @wraps(original_init)
    def observe_init(scheduler, device, steps, denoising_start, denoising_end, seed):
        result = original_init(
            scheduler, device, steps, denoising_start, denoising_end, seed
        )
        row = active.get()
        if row is not None:
            timesteps, init_timestep, step_kwargs = result
            generator = step_kwargs.get("generator")
            row["scheduler"] = {
                "class": type(scheduler).__name__,
                "config": dict(scheduler.config),
                "requestedSteps": steps,
                "denoisingStart": denoising_start,
                "denoisingEnd": denoising_end,
                "fullTimesteps": timestep_values(scheduler.timesteps),
                "timesteps": timestep_values(timesteps),
                "initialTimestep": timestep_values(init_timestep),
                "beginIndex": scheduler.begin_index,
                "generatorSeed": generator.initial_seed()
                if generator is not None
                else None,
            }
        return result

    original_scheduler = denoise_latents.get_scheduler

    @wraps(original_scheduler)
    def observe_scheduler(*args, **kwargs):
        scheduler = original_scheduler(*args, **kwargs)
        row = active.get()
        if row is None:
            return scheduler
        original_add_noise = scheduler.add_noise
        original_scale = scheduler.scale_model_input
        original_step = scheduler.step

        @wraps(original_add_noise)
        def observe_add_noise(original_samples, noise, timesteps, *args, **kwargs):
            sample = digest(original_samples)
            out = original_add_noise(
                original_samples, noise, timesteps, *args, **kwargs
            )
            row["addNoise"].append(
                {
                    "sample": sample,
                    "noise": digest(noise),
                    "timesteps": timestep_values(timesteps),
                    "result": digest(out),
                    "beginIndex": scheduler.begin_index,
                    "stepIndex": scheduler.step_index,
                }
            )
            return out

        @wraps(original_scale)
        def observe_scale(sample, timestep, *args, **kwargs):
            value = original_scale(sample, timestep, *args, **kwargs)
            row["scaleModelInput"].append(
                {
                    "input": digest(sample),
                    "timestep": timestep_values(timestep),
                    "output": digest(value),
                    "stepIndex": scheduler.step_index,
                }
            )
            return value

        @wraps(original_step)
        def observe_step(model_output, timestep, sample, *args, **kwargs):
            before = {
                "prediction": digest(model_output),
                "timestep": timestep_values(timestep),
                "sample": digest(sample),
                "stepIndex": scheduler.step_index,
            }
            value = original_step(model_output, timestep, sample, *args, **kwargs)
            before["output"] = digest(
                value.prev_sample if hasattr(value, "prev_sample") else value[0]
            )
            row["steps"].append(before)
            return value

        scheduler.add_noise = observe_add_noise
        scheduler.scale_model_input = observe_scale
        scheduler.step = observe_step
        return scheduler

    original_forward = UNet2DConditionModel.forward

    @wraps(original_forward)
    def observe_forward(self, *args, **kwargs):
        row = active.get()
        if row is None:
            return original_forward(self, *args, **kwargs)
        sample = args[0] if args else kwargs["sample"]
        timestep = args[1] if len(args) > 1 else kwargs["timestep"]
        context = args[2] if len(args) > 2 else kwargs["encoder_hidden_states"]
        extra = kwargs.get("added_cond_kwargs") or {}
        record = {
            "sample": digest(sample),
            "timestep": timestep_values(timestep),
            "context": digest(context),
            "addedConditioning": {
                key: digest(extra[key])
                for key in ("text_embeds", "time_ids")
                if key in extra
            },
        }
        result = original_forward(self, *args, **kwargs)
        record["output"] = digest(
            result.sample if hasattr(result, "sample") else result[0]
        )
        row["unet"].append(record)
        return result

    original_combine = InvokeAIDiffuserComponent._combine

    @wraps(original_combine)
    def observe_combine(self, unconditioned_next_x, conditioned_next_x, guidance_scale):
        result = original_combine(
            self, unconditioned_next_x, conditioned_next_x, guidance_scale
        )
        row = active.get()
        if row is not None:
            row["cfg"].append(
                {
                    "scale": float(guidance_scale),
                    "unconditioned": digest(unconditioned_next_x),
                    "conditioned": digest(conditioned_next_x),
                    "combined": digest(result),
                }
            )
        return result

    original_decode = AutoencoderKL.decode

    @wraps(original_decode)
    def observe_decode(self, z, *args, **kwargs):
        row = active.get()
        if row is not None:
            row["decode"].update(
                latents=digest(z), scalingFactor=self.config.scaling_factor
            )
        result = original_decode(self, z, *args, **kwargs)
        if row is not None:
            decoded = result.sample if hasattr(result, "sample") else result[0]
            row["decode"]["tensor"] = digest(decoded)
        return result

    wrap_invocation(image_to_latents.ImageToLatentsInvocation, "encode")
    wrap_invocation(noise.NoiseInvocation, "noise")
    wrap_invocation(denoise_latents.DenoiseLatentsInvocation, "denoise")
    wrap_invocation(latents_to_image.LatentsToImageInvocation, "decode")
    image_to_latents.ImageToLatentsInvocation.vae_encode = classmethod(
        observe_vae_encode
    )
    denoise_latents.DenoiseLatentsInvocation.init_scheduler = staticmethod(observe_init)
    denoise_latents.DenoiseLatentsInvocation.prepare_noise_and_latents = staticmethod(
        observe_prepare
    )
    noise.generate_noise_tensor = observe_noise
    denoise_latents.get_scheduler = observe_scheduler
    UNet2DConditionModel.forward = observe_forward
    AutoencoderKL.encode = observe_encode
    AutoencoderKL.decode = observe_decode
    InvokeAIDiffuserComponent._combine = observe_combine
    save(first=True)


def main():
    args, contract = launch_arguments()
    labels = tuple(case["label"] for case in contract["cases"])
    if labels != ("neutral", "red", "blue"):
        raise ValueError("Expected the three preregistered graph roles in order.")

    # Let Invoke parse its real CLI, load its own config and set up the allocator
    # before importing application modules that transitively import torch.
    sys.argv = [sys.argv[0], "--root", str(args.root)]
    import invokeai.app.run_app as installed
    from invokeai.version import __version__

    if __version__ != contract["invokeVersion"]:
        raise RuntimeError(f"Installed Invoke version changed: {__version__}")
    original_get_app = installed.get_app

    @wraps(original_get_app)
    def get_app_with_observers():
        from invokeai.app.services.config.config_default import get_config

        config = get_config()
        if (
            config.root_path != args.root
            or config.host != "127.0.0.1"
            or config.port != args.port
        ):
            raise RuntimeError("Invoke resolved a different app root or listener.")
        result = original_get_app()
        install_observers(args.run, labels, config)
        return result

    installed.get_app = get_app_with_observers
    installed.run_app()


if __name__ == "__main__":
    main()
