#!/bin/bash
set -euo pipefail

echo "🚀 LumenFlow Development Environment Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 found${NC}"
}

echo -e "\n${YELLOW}Checking prerequisites...${NC}"
check_command "cargo" || exit 1
check_command "node" || exit 1
check_command "pnpm" || exit 1
check_command "git" || exit 1

# Install Rust components
echo -e "\n${YELLOW}Setting up Rust toolchain...${NC}"
rustup update
rustup component add rustfmt clippy

# Setup Rust analyzer
if [ ! -f ".cargo/config.toml" ]; then
    echo "[build]" > .cargo/config.toml
    echo 'rustflags = ["-D", "warnings"]' >> .cargo/config.toml
fi

# Install Node dependencies
echo -e "\n${YELLOW}Installing Node dependencies...${NC}"
pnpm install

# Create development .env file
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
fi

# Initialize git hooks
if [ -d ".git" ]; then
    echo -e "\n${YELLOW}Setting up git hooks...${NC}"
    mkdir -p .git/hooks
    
    # Pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "🔍 Running pre-commit checks..."
cargo fmt --all -- --check || (echo "Fix formatting with: cargo fmt --all"; exit 1)
cargo clippy --all-targets -- -D warnings || exit 1
pnpm run type-check || exit 1
echo "✓ Pre-commit checks passed"
EOF
    chmod +x .git/hooks/pre-commit
fi

# Build initial artifacts
echo -e "\n${YELLOW}Building project...${NC}"
cargo build
pnpm run build:ui

echo -e "\n${GREEN}✨ Setup complete!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Start development server: pnpm run dev"
echo "  2. View documentation: open docs/development/GUIDE.md"
echo "  3. See README.md for more info"
