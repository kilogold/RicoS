#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Installs/updates the systemd unit file from this repo into /etc/systemd/system.
# Use this after git pulls that changed the service definition.
# Example: ./kitchen-relay/scripts/service/install-service.sh

SERVICE_NAME="ricos-kitchen-relay.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SERVICE_FILE="${SCRIPT_DIR}/../deploy/${SERVICE_NAME}"
TARGET_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

if [[ ! -f "$SOURCE_SERVICE_FILE" ]]; then
  echo "Service file not found: $SOURCE_SERVICE_FILE" >&2
  exit 1
fi

sudo install -m 0644 "$SOURCE_SERVICE_FILE" "$TARGET_SERVICE_FILE"
sudo systemctl daemon-reload

echo "Installed ${TARGET_SERVICE_FILE}"
echo "Run ${SCRIPT_DIR}/restart-service.sh to apply immediately."
