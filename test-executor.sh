#!/bin/bash
# Test executors for LumenFlow project
# Usage: ./test-executor.sh <target>
# Targets: all, rust, rust-advanced, ui, fuzz, bench, lint, coverage

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}➜${NC} $1\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

case "${1:-all}" in
    all)
        print_header "Running complete test suite (Rust + TypeScript + UI)"
        
        echo "1/4: Rust unit tests..."
        cargo test --lib --all --release || exit 1
        print_success "Rust unit tests passed"
        
        echo "2/4: TypeScript unit tests..."
        pnpm run test --run || exit 1
        print_success "TypeScript unit tests passed"
        
        echo "3/4: Advanced Rust tests (Loom + Chaos + Property-based)..."
        cargo test --test 'loom_tests' --release || exit 1
        cargo test --test 'network_simulation' --release || exit 1
        cargo test --test 'property_based_tests' -- --nocapture || exit 1
        print_success "Advanced tests passed"
        
        echo "4/4: Playwright UI regression tests..."
        pnpm run test:ui --retries=2 || exit 1
        print_success "UI tests passed"
        
        echo -e "\n${GREEN}All tests passed! ✓${NC}\n"
        ;;
        
    rust)
        print_header "Running Rust tests"
        cargo test --lib --all --release
        ;;
        
    rust-advanced)
        print_header "Running advanced Rust tests"
        echo "Running Loom concurrency tests..."
        cargo test --test 'loom_tests' --release
        
        echo "Running chaos simulation tests..."
        cargo test --test 'network_simulation' --release
        
        echo "Running property-based tests..."
        cargo test --test 'property_based_tests' -- --nocapture
        ;;
        
    ui)
        print_header "Running Playwright UI tests"
        pnpm run test:ui
        ;;
        
    ui-headed)
        print_header "Running UI tests in headed mode"
        pnpm run test:ui:headed
        ;;
        
    ui-debug)
        print_header "Running UI tests in debug mode"
        pnpm run test:ui:debug
        ;;
        
    ui-update)
        print_header "Updating UI snapshots"
        pnpm run test:ui:update
        print_success "Snapshots updated. Review changes before committing."
        ;;
        
    fuzz)
        print_header "Running fuzzing"
        if ! command -v cargo-fuzz &> /dev/null; then
            print_warning "cargo-fuzz not installed. Installing..."
            cargo install cargo-fuzz
        fi
        cargo fuzz run artnet_dmx_parser -- -max_len=1024 -timeout=5
        ;;
        
    bench)
        print_header "Running performance benchmarks"
        cargo bench --all --message-format=quiet
        ;;
        
    coverage)
        print_header "Generating test coverage reports"
        
        # Rust coverage (if tarpaulin installed)
        if command -v cargo-tarpaulin &> /dev/null; then
            echo "Rust coverage..."
            cargo tarpaulin --out Html --output-dir coverage --timeout 300 --all-features
            print_success "Rust coverage: coverage/index.html"
        else
            print_warning "Install cargo-tarpaulin for Rust coverage: cargo install cargo-tarpaulin"
        fi
        
        # TypeScript coverage
        echo "TypeScript coverage..."
        pnpm run coverage
        print_success "TypeScript coverage: coverage/index.html"
        ;;
        
    lint)
        print_header "Running linters"
        echo "Rust lint..."
        cargo clippy --all-targets --all-features -- -D warnings
        print_success "Rust lint passed"
        
        echo "TypeScript lint..."
        pnpm run lint
        print_success "TypeScript lint passed"
        ;;
        
    quick)
        print_header "Running quick smoke tests"
        cargo test --lib --release -- --test-threads=1 2>&1 | head -20
        pnpm run test --run -- --run 2>&1 | head -20
        print_success "Quick tests completed"
        ;;
        
    watch)
        print_header "Running tests in watch mode"
        cargo watch -x "test --lib --release"
        ;;
        
    *)
        echo "Usage: $0 <target>"
        echo ""
        echo "Targets:"
        echo "  all              - Run complete test suite (default)"
        echo "  rust             - Rust unit tests only"
        echo "  rust-advanced    - Loom + Chaos + Property-based tests"
        echo "  ui               - Playwright UI tests"
        echo "  ui-headed        - UI tests with visible browser"
        echo "  ui-debug         - UI tests in debug mode"
        echo "  ui-update        - Update visual regression snapshots"
        echo "  fuzz             - Run fuzzing (requires cargo-fuzz)"
        echo "  bench            - Run performance benchmarks"
        echo "  coverage         - Generate coverage reports"
        echo "  lint             - Run linters (clippy + eslint)"
        echo "  quick            - Run quick smoke tests"
        echo "  watch            - Watch mode for rapid iteration"
        echo ""
        echo "Examples:"
        echo "  ./test-executor.sh all           # Full test suite"
        echo "  ./test-executor.sh rust          # Just Rust tests"
        echo "  ./test-executor.sh ui-debug      # Debug UI tests"
        exit 1
        ;;
esac
