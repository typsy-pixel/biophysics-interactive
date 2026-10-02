#!/bin/bash
set -e
cd "$(dirname "$0")"
PORT=8765
URL="http://127.0.0.1:${PORT}/"
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" >/tmp/biophysics-http-server.log 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  sleep 1
  open "$URL"
  wait "$SERVER_PID"
else
  open "index.html"
fi
