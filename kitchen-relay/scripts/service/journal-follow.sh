#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Streams live logs for the service (equivalent to tail -f for journald).
# Press Ctrl+C to exit.
# Example: ./kitchen-relay/scripts/service/journal-follow.sh

SERVICE_NAME="ricos-kitchen-relay.service"

sudo journalctl -u "$SERVICE_NAME" -f
