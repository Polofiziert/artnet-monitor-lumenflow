#!/bin/bash
set -euo pipefail

# Performance profiling script

echo "⚡ Running performance profiling..."

# Profile Rust code
echo "🔍 Profiling Rust hot-path..."
cargo build --release -p lumenflow_core

# Optional: Generate flamegraph (if installed)
if command -v flamegraph &> /dev/null; then
    echo "🔥 Generating flamegraph..."
    flamegraph --bin lumenflow -- --test-artnet-load
fi

# Run benchmarks
echo "📊 Running benchmarks..."
cargo bench --all

echo "✅ Profiling complete"
