#!/bin/bash

# ========================================
# DataFusion Simulator Stopper
# Stops CAM and RFID instances using saved PID files.
# Only kills simulator processes — leaves DataFusion server running.
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAM_PIDS="$SCRIPT_DIR/CAM/server_pids.txt"
RFID_PIDS="$SCRIPT_DIR/RFID/rfid_server_pids.txt"

stop_from_pidfile() {
  local label="$1"
  local pidfile="$2"

  if [ ! -f "$pidfile" ]; then
    echo "[$label] No PID file found — skipping."
    return
  fi

  local total=0
  local killed=0

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    total=$((total + 1))
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null
      killed=$((killed + 1))
    fi
  done < "$pidfile"

  # Give processes a moment to exit gracefully, then SIGKILL stragglers
  sleep 1
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null
    fi
  done < "$pidfile"

  rm -f "$pidfile"
  echo "[$label] Stopped $killed / $total processes."
}

echo "========================================"
echo " DataFusion Simulator Stopper"
echo "========================================"
echo ""

stop_from_pidfile "CAM"  "$CAM_PIDS"
stop_from_pidfile "RFID" "$RFID_PIDS"

echo ""
echo "========================================"
echo " All simulators stopped."
echo " DataFusion server is still running."
echo "========================================"
