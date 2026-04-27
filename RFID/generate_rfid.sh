#!/bin/bash

# ========================================
# Multi-Server RFID Simulator Launcher (Background)
# ========================================

# RFID ports start at 5000 (rfid_id = port, maps to camera_id = port - 2000 in camps.json)
# Camera simulator uses 3000-3606, so RFID uses 5000-5606 — no port conflicts.
echo "NOTE: RFID ports must be 5000-5606 (rfid_id = port, camera_id = port - 2000)."
echo "      Camera simulator uses 3000-3606. Do NOT overlap."
echo ""
read -p "Enter number of instances (N): " N
read -p "Enter base port number (P, must start at 5000): " BASE_PORT

if [[ -z "$N" ]]; then
    echo "Error: Number of instances cannot be empty!"
    exit 1
fi
if [[ -z "$BASE_PORT" ]]; then
    echo "Error: Base port cannot be empty!"
    exit 1
fi

LAST_INDEX=$((N - 1))
MAX_PORT=$((BASE_PORT + LAST_INDEX))

echo ""
echo "Starting $N RFID simulator instances in background..."
echo "Ports (rfid_id): $BASE_PORT to $MAX_PORT"
echo ""

mkdir -p logs
rm -f rfid_server_ports.txt rfid_server_pids.txt

for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "Starting RFID simulator on port $PORT (rfid_id=$PORT)..."

    node server.js "$PORT" > "logs/rfid_server_$PORT.log" 2>&1 &

    echo $! >> rfid_server_pids.txt
    echo "$PORT" >> rfid_server_ports.txt
    echo "RFID simulator on port $PORT started (background)"
    echo ""
done

echo ""
echo "========================================"
echo "All $N RFID simulator instances started!"
echo ""
echo "Ports in use:"
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  Port $PORT"
done
echo ""
echo "Individual log files:"
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  logs/rfid_server_$PORT.log"
done
echo ""
echo "Access the streaming RFID data at:"
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  http://localhost:$PORT/cgi-bin/videoStatServer.cgi"
done
echo ""
echo "Download today's event log at:"
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  http://localhost:$PORT/cgi-bin/logs"
done
echo "========================================"
echo ""
echo "Tip: Use 'ps aux | grep node' to view running Node processes"
echo "Tip: Run kill-rfid-servers-ubuntu.sh to stop all instances"
echo ""

read -n 1 -s -r -p "Press any key to continue..."
echo ""
