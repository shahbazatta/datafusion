#!/bin/bash

# ========================================
# Multi-Server Instance Launcher (Background)
# ========================================

# Get inputs from user
echo "NOTE: Camera simulator must use ports 3000-3606 (port = camera_id)."
echo "      RFID simulator should use a different range e.g. starting at 5000."
echo ""
read -p "Enter number of instances (N): " N
read -p "Enter base port number (P, must start at 3000): " BASE_PORT

# Validate inputs
if [[ -z "$N" ]]; then
    echo "Error: Number of instances cannot be empty!"
    exit 1
fi

if [[ -z "$BASE_PORT" ]]; then
    echo "Error: Base port cannot be empty!"
    exit 1
fi

echo ""
echo "Starting $N server instances in background..."
LAST_INDEX=$((N - 1))
echo "Ports: $BASE_PORT to $((BASE_PORT + LAST_INDEX))"
echo ""

# Create logs directory if it doesn't exist 
mkdir -p logs

# Clear previous port and PID list files 
rm -f server_ports.txt
rm -f server_pids.txt

# Start each server instance in background 
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "Starting server on port $PORT..."
    
    # Run node server.js in background, redirect output to per-instance log 
    # Replaces 'start /B' with '&'
    node server.js "$PORT" > "logs/server_$PORT.log" 2>&1 &
    
    # Store the PID ($!) and the port number [cite: 4, 14]
    echo $! >> server_pids.txt
    echo "$PORT" >> server_ports.txt
    
    echo "Server on port $PORT started (background)"
    echo ""
done

echo ""
echo "========================================"
echo "All $N server instances started!" [cite: 5, 15]
echo ""
echo "Ports in use:"
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  Port $PORT"
done

echo ""
echo "Individual log files in 'logs/' folder:" [cite: 6, 16]
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  logs/server_$PORT.log"
done

echo ""
echo "Access the streaming data at:" [cite: 7, 17]
for i in $(seq 0 $LAST_INDEX); do
    PORT=$((BASE_PORT + i))
    echo "  http://localhost:$PORT/cgi-bin/videoStatServer.cgi"
done

echo ""
echo "========================================"
echo "Tip: Use 'ps aux | grep node' to view running processes" 
echo "Tip: Use 'kill \$(cat server_pids.txt)' to stop all instances"
echo ""

# Simulates Windows 'pause' [cite: 10]
read -n 1 -s -r -p "Press any key to continue..."
echo ""
