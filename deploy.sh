#!/usr/bin/env bash
set -euo pipefail

if ! command -v wrangler >/dev/null 2>&1; then
  echo "Wrangler CLI is required: npm install -g wrangler"
  exit 1
fi

wrangler whoami >/dev/null

echo "Starting local Worker preview on http://localhost:8787"
wrangler dev --local --port 8787 &
dev_pid=$!
trap 'kill "$dev_pid" 2>/dev/null || true' EXIT

echo "Check /api/health and /api/outbound-check before deployment."
read -r -p "Press Enter to deploy, or Ctrl+C to stop: "

kill "$dev_pid" 2>/dev/null || true
wait "$dev_pid" 2>/dev/null || true
trap - EXIT

wrangler deploy
echo "Deployment complete."
