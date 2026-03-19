#!/bin/bash
set -euo pipefail

# Continuous local development with live reload

echo "🔄 Starting LumenFlow development environment..."

# Kill any existing processes on cleanup
cleanup() {
    echo "🛑 Shutting down development environment..."
    jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start the Tauri development server
echo "📦 Starting Tauri dev server..."
pnpm run dev &

# Start Cargo watch for hot reload (optional)
if command -v cargo-watch &> /dev/null; then
    echo "👀 Starting cargo watch..."
    cargo watch -x "build -p lumenflow_core" &
fi

# Wait for processes
wait
