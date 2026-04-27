#!/bin/bash

# ========================================
# DataFusion Simulator Launcher
# Starts all CAM (3000-3606) and RFID (5000-5606) instances
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAM_DIR="$SCRIPT_DIR/CAM"
RFID_DIR="$SCRIPT_DIR/RFID"

CAM_BASE_PORT=3000
RFID_BASE_PORT=5000
N=607
LAST_INDEX=$((N - 1))

# ── Preflight checks ─────────────────────────────────────────
if [ ! -d "$CAM_DIR" ]; then
  echo "ERROR: CAM directory not found at $CAM_DIR"
  exit 1
fi
if [ ! -d "$RFID_DIR" ]; then
  echo "ERROR: RFID directory not found at $RFID_DIR"
  exit 1
fi
if ! command -v node &>/dev/null; then
  echo "ERROR: node is not installed or not in PATH"
  exit 1
fi

echo "========================================"
echo " DataFusion Simulator Launcher"
echo "========================================"
echo " CAM  ports : $CAM_BASE_PORT - $((CAM_BASE_PORT + LAST_INDEX))"
echo " RFID ports : $RFID_BASE_PORT - $((RFID_BASE_PORT + LAST_INDEX))"
echo " Instances  : $N each"
echo "========================================"
echo ""

# ── CAM simulator ────────────────────────────────────────────
echo "[CAM] Starting $N camera simulator instances..."
mkdir -p "$CAM_DIR/logs"
rm -f "$CAM_DIR/server_pids.txt" "$CAM_DIR/server_ports.txt"

for i in $(seq 0 $LAST_INDEX); do
  PORT=$((CAM_BASE_PORT + i))
  node "$CAM_DIR/server.js" "$PORT" > "$CAM_DIR/logs/server_$PORT.log" 2>&1 &
  echo $! >> "$CAM_DIR/server_pids.txt"
  echo "$PORT" >> "$CAM_DIR/server_ports.txt"
done

CAM_COUNT=$(wc -l < "$CAM_DIR/server_pids.txt")
echo "[CAM] $CAM_COUNT instances started. Logs: $CAM_DIR/logs/"
echo ""

# ── RFID simulator ───────────────────────────────────────────
echo "[RFID] Starting $N RFID simulator instances..."
mkdir -p "$RFID_DIR/logs"
rm -f "$RFID_DIR/rfid_server_pids.txt" "$RFID_DIR/rfid_server_ports.txt"

for i in $(seq 0 $LAST_INDEX); do
  PORT=$((RFID_BASE_PORT + i))
  node "$RFID_DIR/server.js" "$PORT" > "$RFID_DIR/logs/rfid_server_$PORT.log" 2>&1 &
  echo $! >> "$RFID_DIR/rfid_server_pids.txt"
  echo "$PORT" >> "$RFID_DIR/rfid_server_ports.txt"
done

RFID_COUNT=$(wc -l < "$RFID_DIR/rfid_server_pids.txt")
echo "[RFID] $RFID_COUNT instances started. Logs: $RFID_DIR/logs/"
echo ""

echo "========================================"
echo " All simulators running."
echo " Run ./stop.sh to stop them."
echo "========================================"
