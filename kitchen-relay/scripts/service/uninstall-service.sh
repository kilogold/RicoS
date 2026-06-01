#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Fully removes the installed systemd unit and mode override drop-in.
# Stops/disables service first, then deletes unit files and reloads systemd.
# Example: ./kitchen-relay/scripts/service/uninstall-service.sh

SERVICE_NAME="ricos-kitchen-relay.service"
TARGET_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
DROPIN_DIR="/etc/systemd/system/${SERVICE_NAME}.d"

sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
sudo rm -f "$TARGET_SERVICE_FILE"
sudo rm -rf "$DROPIN_DIR"
sudo systemctl daemon-reload
sudo systemctl reset-failed

echo "Uninstalled ${SERVICE_NAME}"
