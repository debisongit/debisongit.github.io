#!/usr/bin/env bash
# ============================================================
#  start.sh — hifi-api startup script for Render
#  Place in the ROOT of your hifi-api repository.
#
#  What this does:
#    1. Decodes the TOKEN_JSON environment variable
#       (base64-encoded token.json set in Render dashboard)
#       back into a real token.json file on the filesystem.
#    2. Starts uvicorn on the port Render assigns via $PORT.
#
#  Why this is needed:
#    Render's filesystem is ephemeral — you can't upload files.
#    Secrets must be passed as environment variables.
#    token.json contains your Tidal auth credentials and cannot
#    be committed to a public git repository.
# ============================================================

set -e  # exit immediately on any error

# ── Step 1: Validate the secret exists ──────────────────────
if [ -z "$TOKEN_JSON" ]; then
  echo "[start.sh] ERROR: TOKEN_JSON environment variable is not set."
  echo "           Go to: Render dashboard → your service → Environment"
  echo "           Add key: TOKEN_JSON"
  echo "           Value: base64 -i token.json | tr -d '\\n'"
  exit 1
fi

# ── Step 2: Decode base64 → token.json ──────────────────────
echo "[start.sh] Decoding TOKEN_JSON → token.json"
echo "$TOKEN_JSON" | base64 -d > token.json

# Sanity check: make sure the file is valid JSON
python3 -c "import json, sys; json.load(open('token.json'))" || {
  echo "[start.sh] ERROR: token.json is not valid JSON after decoding."
  echo "           Re-generate with: base64 -i token.json | tr -d '\\n'"
  exit 1
}

echo "[start.sh] token.json written successfully."

# ── Step 3: Launch the API server ───────────────────────────
# Render injects $PORT. We must bind to 0.0.0.0:$PORT.
PORT="${PORT:-8000}"
echo "[start.sh] Starting uvicorn on 0.0.0.0:${PORT}"
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
