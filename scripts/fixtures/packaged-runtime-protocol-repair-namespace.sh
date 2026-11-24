#!/usr/bin/env bash
set -euo pipefail

# The caller enters a private user/mount namespace before this script. Keep the
# historical absolute paths there while every new write lands in the owned profile.
run=$1
shift
(( $# > 0 ))
artifacts="$(getent passwd "$(id -u)" | cut -d: -f6)/.codex/artifacts/imagegen-studio"
[[ "$(dirname "$run")" == "$artifacts/runs/packaged-runtime-setup" ]]
[[ "$(basename "$run")" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]]
[[ "$(realpath -e "$run")" == "$run" && -O "$run" && "$(id -u)" != 0 ]]

inputs="$run/protocol-repair-inputs"
state="$run/protocol-repair-state"
profile="$inputs/profile.json"
[[ ! -e "$run/protocol-repair" && ! -L "$run/protocol-repair" ]]
[[ "$(realpath -e "$profile")" == "$profile" && -f "$profile" && -O "$profile" ]]
jq -e '.schemaVersion == 1' "$profile" >/dev/null
[[ "$(readlink /proc/self/ns/mnt)" != "$(jq -er .hostNamespace.mount "$profile")" ]]
[[ "$(readlink /proc/self/ns/user)" != "$(jq -er .hostNamespace.user "$profile")" ]]

engine="$artifacts/runs/packaged-installed-engine/20261118"
data="$engine/payloads/native-runtime-offline-VzNDka/data/imagegen-studio"
report="$engine/installed-engine.json"
slot="$(jq -er .runtimeId "$profile")"
[[ "$slot" =~ ^release-[0-9a-f-]{36}$ ]]
[[ "$(jq -er .roots.appDataDir "$report")" == "$data" ]]
[[ "$(jq -er .activatedPointer.runtimeId "$report")" == "$slot" ]]
[[ "$(jq -er .appData "$profile")" == "$data" ]]
python="$data/runtime/python/$slot"
environment="$data/runtime/environments/$slot"
worker="$environment/lib/python3.12/site-packages/imagegen_worker"
[[ "$(jq -er .workerRoot "$profile")" == "$worker" ]]
[[ "$(jq -er .installedInspection.workerRoot "$report")" == "$worker" ]]
[[ "$(jq -er .pythonExecutable "$profile")" == "$environment/bin/python" ]]

owned_directory() {
  [[ -d "$1" && -O "$1" && "$(realpath -e "$1")" == "$1" ]]
}

empty_owned_directory() {
  owned_directory "$1"
  [[ -z "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit)" ]]
}

read_only_bind() {
  local source=$1 target=$2 point
  if [[ -d "$source" ]]; then
    mount --rbind "$source" "$target"
  else
    mount --bind "$source" "$target"
  fi
  while IFS= read -r point; do
    mount -o remount,bind,ro "$point"
  done < <(findmnt -Rrn --mountpoint "$target" -o TARGET)
  findmnt -Rrn --mountpoint "$target" -o VFS-OPTIONS | awk -F, '
    $1 != "ro" {bad=1} END {exit bad || NR==0}
  '
}

verify_pin() {
  local field=$1 file=$2
  [[ -f "$file" && "$(realpath -e "$file")" == "$file" && -O "$file" ]]
  [[ "$(stat -c %s "$file")" == "$(jq -er --arg field "$field" '.[$field].sizeBytes' "$profile")" ]]
  [[ "$(sha256sum "$file" | cut -d' ' -f1)" == "$(jq -er --arg field "$field" '.[$field].sha256' "$profile")" ]]
}

owned_directory "$state"
owned_directory "$data"
owned_directory "$python"
owned_directory "$environment"
for directory in "$inputs/mounts/python" "$inputs/mounts/environment" \
  "$state/runtime/python/$slot" "$state/runtime/environments/$slot" "$state/inference-resources"; do
  empty_owned_directory "$directory"
done
for directory in "$state" "$data"; do
  [[ "$(findmnt -n -o PROPAGATION --target "$directory")" == private ]]
done
verify_pin sourceReport "$report"
verify_pin pointer "$data/runtime/current-runtime.json"
verify_pin pointer "$state/runtime/current-runtime.json"
verify_pin journal "$data/runtime/runtime-installation.json"
verify_pin journal "$state/runtime/runtime-installation.json"
verify_pin originalModule "$worker/__init__.py"
verify_pin originalModule "$inputs/original-protocol.py"
verify_pin alternateModule "$inputs/alternate-protocol.py"

read_only_bind "$python" "$inputs/mounts/python"
read_only_bind "$environment" "$inputs/mounts/environment"
mount --bind "$state" "$data"
[[ "$(stat -c %d:%i "$state")" == "$(stat -c %d:%i "$data")" ]]
read_only_bind "$inputs/mounts/python" "$python"
read_only_bind "$inputs/mounts/environment" "$environment"
read_only_bind "$inputs/alternate-protocol.py" "$worker/__init__.py"
verify_pin alternateModule "$worker/__init__.py"
verify_pin originalModule "$inputs/mounts/environment/lib/python3.12/site-packages/imagegen_worker/__init__.py"
[[ "$(stat -c %d:%i "$inputs/mounts/environment")" == "$(stat -c %d:%i "$environment")" ]]
[[ "$(stat -c %d:%i "$inputs/mounts/python")" == "$(stat -c %d:%i "$python")" ]]
for directory in "$data/runtime/python" "$data/runtime/environments" "$data/inference-resources"; do
  [[ "$(findmnt -n -o TARGET --target "$directory")" == "$data" ]]
  [[ "$(findmnt -n -o VFS-OPTIONS --target "$directory" | cut -d, -f1)" == rw ]]
done
findmnt -Rrn --mountpoint "$data" -o TARGET,VFS-OPTIONS
exec /usr/bin/setpriv --ambient-caps=-all --inh-caps=-all /bin/bash -c '
  set -e
  grep -Eq "^CapEff:[[:space:]]+0+$" /proc/self/status
  grep -Eq "^CapAmb:[[:space:]]+0+$" /proc/self/status
  unshare -Ur true
  exec "$@"
' protocol-repair "$@"
