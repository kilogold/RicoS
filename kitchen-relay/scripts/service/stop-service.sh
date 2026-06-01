#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Stops the kitchen relay service and then prints status for confirmation.
# Example: ./kitchen-relay/scripts/service/stop-service.sh

SERVICE_NAME="ricos-kitchen-relay.service"

sudo systemctl stop "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
