#!/usr/bin/env bash
set -euo pipefail

# FTUE:
# Switches service mode by writing a systemd drop-in that overrides ExecStart.
# preview -> bun run start:kitchen
# production -> bun run start:kitchen:production
# Example: ./kitchen-relay/scripts/service/set-mode.sh preview

SERVICE_NAME="ricos-kitchen-relay.service"
DROPIN_DIR="/etc/systemd/system/${SERVICE_NAME}.d"
DROPIN_FILE="${DROPIN_DIR}/mode.conf"

MODE="${1:-}"

if [[ "$MODE" != "preview" && "$MODE" != "production" ]]; then
  echo "Usage: $0 <preview|production>" >&2
  exit 1
fi

if [[ "$MODE" == "preview" ]]; then
  EXEC_START="/home/ricos/.bun/bin/bun run start:kitchen"
else
  EXEC_START="/home/ricos/.bun/bin/bun run start:kitchen:production"
fi

sudo mkdir -p "$DROPIN_DIR"
sudo tee "$DROPIN_FILE" >/dev/null <<EOF
[Service]
ExecStart=
ExecStart=${EXEC_START}
EOF

sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
