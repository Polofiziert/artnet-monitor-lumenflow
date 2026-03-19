#!/bin/bash
# LumenFlow Development Environment Setup
# MacBook Pro 16" 2019 | macOS 15.7.4 | Intel i7-9750H

set -euo pipefail

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                     🚀 LumenFlow Setup Script                                  ║"
echo "║                      MacBook Pro 16\" 2019 Edition                              ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REQUIRED_NODE_VERSION="18.0.0"
REQUIRED_PNPM_VERSION="8.0.0"
REQUIRED_RUST_VERSION="1.76.0"

# Helper functions
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
        return 0
    else
        echo -e "${RED}✗${NC} $1 is NOT installed"
        return 1
    fi
}

# Step 1: Check Prerequisites
print_header "STEP 1/4: Checking Prerequisites"
echo ""

echo "Checking required tools..."
HAS_GIT=0
HAS_BREW=0
HAS_NODE=0
HAS_RUST=0

check_command "git" && HAS_GIT=1 || true
check_command "brew" && HAS_BREW=1 || true
check_command "node" && HAS_NODE=1 || true
check_command "rustc" && HAS_RUST=1 || true

echo ""
echo "Installation Status:"
echo "  Git:        $([ $HAS_GIT -eq 1 ] && echo '✅ Already installed' || echo '⚠️ Will install')"
echo "  Homebrew:   $([ $HAS_BREW -eq 1 ] && echo '✅ Already installed' || echo '⚠️ Will install')"
echo "  Node.js:    $([ $HAS_NODE -eq 1 ] && echo '✅ Already installed' || echo '⚠️ Will install')"
echo "  Rust:       $([ $HAS_RUST -eq 1 ] && echo '✅ Already installed' || echo '⚠️ Will install')"

# Step 2: Install Homebrew if needed
if [ $HAS_BREW -eq 0 ]; then
    print_header "STEP 2/4: Installing Homebrew"
    echo "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo -e "${GREEN}✓ Homebrew installed${NC}"
else
    print_header "STEP 2/4: Homebrew Already Installed"
    echo "Skipping Homebrew installation"
fi

# Step 3: Install Rust if needed
if [ $HAS_RUST -eq 0 ]; then
    print_header "STEP 3/4: Installing Rust & Cargo"
    echo "Rust not found. Installing via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo -e "${GREEN}✓ Rust & Cargo installed${NC}"
else
    print_header "STEP 3/4: Rust Already Installed"
    echo "Skipping Rust installation"
fi

# Step 4: Install Node & npm if needed
if [ $HAS_NODE -eq 0 ]; then
    print_header "STEP 4/4: Installing Node.js via Homebrew"
    echo "Node.js not found. Installing via Homebrew..."
    brew install node@18
    brew link node@18
    echo -e "${GREEN}✓ Node.js installed${NC}"
else
    print_header "STEP 4/4: Node.js Already Installed"
    echo "Skipping Node.js installation"
fi

# Install pnpm globally
echo ""
echo "Installing pnpm package manager..."
npm install -g pnpm@8

# Update Rust toolchain
print_header "Installing Rust Components"
rustup update
rustup component add rustfmt
rustup component add clippy

echo ""
echo -e "${GREEN}✓ Rust components installed${NC}"

# Install project dependencies
print_header "Installing Project Dependencies"
echo ""
echo "Installing Node dependencies via pnpm..."
pnpm install

echo ""
echo "Building Rust workspace..."
cargo build

echo ""
echo "Building UI..."
pnpm run build:ui

# Create .env if doesn't exist
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
fi

# Setup git hooks
print_header "Setting Up Git Hooks"
mkdir -p .git/hooks

cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "🔍 Running pre-commit checks..."
cargo fmt --all -- --check || (echo "❌ Format check failed. Fix with: cargo fmt --all"; exit 1)
cargo clippy --all-targets -- -D warnings || exit 1
pnpm run type-check || exit 1
echo "✅ Pre-commit checks passed"
EOF

chmod +x .git/hooks/pre-commit
echo -e "${GREEN}✓ Git hooks configured${NC}"

print_header "🎉 Setup Complete!"
echo ""
echo "Your Development Environment is Ready!"
echo ""
echo "Next Steps:"
echo "  1. Start development:  ${BLUE}pnpm run dev${NC}"
echo "  2. Run tests:          ${BLUE}./test-executor.sh all${NC}"
echo "  3. Read docs:          ${BLUE}open docs/development/GUIDE.md${NC}"
echo ""
echo "Happy coding! 🚀"
echo ""
