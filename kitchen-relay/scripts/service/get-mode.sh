#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Prints the currently configured service mode by inspecting systemd ExecStart.
# Output is one of: production, preview, or unknown.
# Example: ./kitchen-relay/scripts/service/get-mode.sh

SERVICE_NAME="ricos-kitchen-relay.service"

exec_start="$(systemctl show -p ExecStart --value "$SERVICE_NAME" 2>/dev/null || true)"

if [[ -z "$exec_start" ]]; then
  echo "unknown"
  exit 1
fi

if [[ "$exec_start" == *"start:kitchen:production"* ]]; then
  echo "production"
elif [[ "$exec_start" == *"start:kitchen"* ]]; then
  echo "preview"
else
  echo "unknown"
  exit 1
fi
