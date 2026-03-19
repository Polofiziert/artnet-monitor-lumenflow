#!/bin/bash
# Manual test script for LumenFlow real mode without hardware.
#
# Usage:
#   Terminal 1: ./scripts/test-real-mode.sh [legacy]
#   Terminal 2: Start LumenFlow (cargo tauri dev), switch to real mode in Settings
#   Press Enter in Terminal 1 when done to stop (or Ctrl+C).
#
# Default: Uses virtual-console (sends ArtDmx + ArtPollReply).
# With "legacy": Uses send + mock-node (original behavior).
#
# Note: After stopping, DMX values may still appear briefly. The backend caches
# the last frame; universes go Stale/Disconnected after ~4s without packets.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PIDS=()

cleanup() {
    for pid in "${PIDS[@]}"; do
        # Kill children first (e.g. if cargo spawns a child)
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
    done
    echo "Stopped."
}
trap cleanup EXIT INT TERM

if [[ "${1:-}" == "legacy" ]]; then
    echo "Starting Art-Net sender (8 universes, 44 Hz, loopback)..."
    cargo run -p lumenflow_cli -- send --universes 8 --target 127.0.0.1 --rate 44 &
    PIDS+=($!)
    echo "Starting mock node (ArtPollReply for Devices discovery)..."
    cargo run -p lumenflow_cli -- mock-node --target 127.0.0.1 &
    PIDS+=($!)
    echo ""
    echo "Legacy mode: sender + mock-node running."
else
    echo "Starting virtual console (8 universes, 44 Hz, ArtDmx + ArtPollReply)..."
    cargo run -p lumenflow_cli -- virtual-console \
        --name "Virtual Console" --ip 192.168.1.10 --universes 8 \
        --rate 44 --pattern sine --target 127.0.0.1 &
    PIDS+=($!)
    echo ""
    echo "Virtual console running (sends DMX and responds to discovery)."
fi

sleep 2

echo "Start LumenFlow, disable mock mode in Settings."
echo "  - Universes 0-7: DMX data"
echo "  - Devices: discovered node(s)"
echo ""
read -p "Press Enter when done to stop..."
