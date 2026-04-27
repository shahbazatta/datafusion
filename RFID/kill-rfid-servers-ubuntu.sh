#!/usr/bin/env bash
echo "Stopping all Node.js servers..."

# Kill all node processes (SIGTERM first, then SIGKILL for stragglers)
if pgrep -x node > /dev/null; then
    pkill -TERM -x node
    sleep 2
    if pgrep -x node > /dev/null; then
        pkill -KILL -x node
    fi
    echo "All servers stopped."
else
    echo "No Node.js servers running."
fi

read -n 1 -s -r -p "Press any key to continue..."
echo
