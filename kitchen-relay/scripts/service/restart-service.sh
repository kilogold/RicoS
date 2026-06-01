#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Restarts the kitchen relay service and then prints status.
# Use this after env updates or code deploys.
# Example: ./kitchen-relay/scripts/service/restart-service.sh

SERVICE_NAME="ricos-kitchen-relay.service"

sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
