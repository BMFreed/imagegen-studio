"""Long-lived stdin/stdout JSON-lines worker process."""

from __future__ import annotations

import json
import sys

from imagegen_worker.protocol import (
    MAX_MESSAGE_BYTES,
    error_message,
    process_request,
    ready_message,
)


def _emit(message: dict[str, object]) -> None:
    encoded = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def main() -> None:
    _emit(ready_message())
    while line := sys.stdin.buffer.readline(MAX_MESSAGE_BYTES + 1):
        if len(line) > MAX_MESSAGE_BYTES:
            while line and not line.endswith(b"\n"):
                line = sys.stdin.buffer.readline(MAX_MESSAGE_BYTES + 1)
            _emit(
                error_message(None, "MESSAGE_TOO_LARGE", "Worker request exceeds the line limit.")
            )
            continue
        try:
            value: object = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            _emit(error_message(None, "INVALID_REQUEST", "Request is not valid UTF-8 JSON."))
            continue
        _emit(process_request(value))


if __name__ == "__main__":
    main()
