#!/bin/bash
set -euo pipefail

# Release build script with optimization verification

echo "🚀 Building LumenFlow for release..."

# Clean previous builds
cargo clean
pnpm run clean

# Lint and format
echo "🔍 Quality checks..."
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
pnpm run lint

# Build frontend
echo "📦 Building frontend..."
pnpm run build:ui

# Build Rust in release mode
echo "⚙️  Building Rust backend..."
cargo build --release -p lumenflow_core
cargo build --release -p lumenflow_cli

# Build Tauri application
echo "🎨 Building Tauri application..."
pnpm run build

echo "✅ Release build complete!"
echo "📍 Output: dist/ and target/release/"
