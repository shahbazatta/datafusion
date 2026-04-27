#!/bin/bash

# ========================================
# Multi-Server RFID Simulator Launcher (Background)
# ========================================

echo "NOTE: Use a port range that does NOT overlap with the Camera simulator."
echo "      Camera simulator uses ports starting at 3000 by default."
echo "      Recommended RFID base port: 5000"
echo ""
read -p "Enter number of instances (N): " N
read -p "Enter base port number (P, recommended 5000): " BASE_PORT
read -p "Enter base camera_id (from camps.json, e.g. 3000): " BASE_CAMERA_ID

if [[ -z "$N" ]]; then
    echo "Error: Number of instances cannot be empty!"
    exit 1
fi
if [[ -z "$BASE_PORT" ]]; then
    echo "Error: Base port cannot be empty!"
    exit 1
fi
if [[ -z "$BASE_CAMERA_ID" ]]; then
    echo "Error: Base camera_id cannot be empty!"
    exit 1
fi

LAST_INDEX=$((N - 1))
MAX_PORT=$((BASE_PORT + LAST_INDEX))
MAX_CAM=$((BASE_CAMERA_ID + LAST_INDEX))

echo ""
echo "Starting $N RFID simulator instances in background..."
echo "Ports: $BASE_PORT to $MAX_PORT"
echo "Camera IDs: $BASE_CAMERA_ID to $MAX_CAM"
echo ""

mkdir -p logs
rm -f rfid_server_ports.txt rfid_server_pids.txt

for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    CAMERA_ID=$((BASE_CAMERA_ID + i))
    echo "Starting RFID simulator on port $PORT (camera_id=$CAMERA_ID)..."

    node server.js "$PORT" "$CAMERA_ID" > "logs/rfid_server_$PORT.log" 2>&1 &

    echo $! >> rfid_server_pids.txt
    echo "$PORT" >> rfid_server_ports.txt
    echo "RFID simulator on port $PORT (camera_id=$CAMERA_ID) started (background)"
    echo ""
done

echo ""
echo "========================================"
echo "All $N RFID simulator instances started!"
echo ""
echo "Ports in use:"
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    CAMERA_ID=$((BASE_CAMERA_ID + i))
    echo "  Port $PORT (camera_id=$CAMERA_ID)"
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
