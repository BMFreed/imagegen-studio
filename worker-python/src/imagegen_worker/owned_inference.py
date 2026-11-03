"""Operational Linux entrypoint; native inference remains in inference_main unchanged."""

from __future__ import annotations

import sys
from collections.abc import Sequence

from imagegen_worker.inference_lifetime import (
    InferenceLifetimeError,
    owned_inference_lifetime,
)


def _arguments(argv: Sequence[str]) -> tuple[int, str]:
    if len(argv) != 4:
        raise InferenceLifetimeError("Expected parent PID and canonical scratch arguments.")
    arguments: dict[str, str] = {}
    for index in (0, 2):
        key, value = argv[index], argv[index + 1]
        if key not in {"--parent-pid", "--scratch-base"} or key in arguments:
            raise InferenceLifetimeError("Invalid owned inference arguments.")
        arguments[key] = value
    parent = arguments["--parent-pid"]
    if not parent.isascii() or not parent.isdecimal() or parent.startswith("0"):
        raise InferenceLifetimeError("Invalid inference parent PID.")
    try:
        parent_pid = int(parent)
    except ValueError as error:
        raise InferenceLifetimeError("Invalid inference parent PID.") from error
    return parent_pid, arguments["--scratch-base"]


def main(argv: Sequence[str] | None = None) -> int:
    try:
        parent_pid, scratch_base = _arguments(sys.argv[1:] if argv is None else argv)
        with owned_inference_lifetime(parent_pid, scratch_base) as lifetime:
            for diagnostic in lifetime.recovery.diagnostics:
                print(diagnostic, file=sys.stderr)
            # No inference/Pillow/Torch import before parent protection, flock and recovery.
            from imagegen_worker.inference_main import main as inference_main

            return inference_main(owner_lifetime=True)
    except InferenceLifetimeError as error:
        print(f"Owned inference startup refused: {str(error)[:512]}", file=sys.stderr)
        return 78


if __name__ == "__main__":
    raise SystemExit(main())
