# Development Guide

## Environment Setup

### Quick Start

```bash
# Clone and setup
git clone https://github.com/lumenflow/lumenflow.git
cd lumenflow
bash scripts/setup.sh

# Start development
pnpm run dev
```

### Manual Setup (macOS)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup update
rustup component add rustfmt clippy

# Install Node.js (via Homebrew)
brew install node@20
npm install -g pnpm@8

# Install project dependencies
pnpm install
```

## Development Workflow

### Running the Application

```bash
# Development with hot reload
pnpm run dev

# Build for production
pnpm run build

# Run tests
pnpm run test

# Watch tests during development
pnpm run test:watch
```

### Code Quality

```bash
# Format code (Rust + TypeScript)
cargo fmt --all
pnpm run format

# Lint and fix issues
cargo clippy --all-targets -- -D warnings
pnpm run lint

# Type checking (TypeScript)
pnpm run type-check

# Full quality check (before commit)
pnpm run lint
```

### CI/CD Workflow

Use the standardized CI/CD flow documented in:

- [`docs/development/CI_CD_WORKFLOW.md`](./CI_CD_WORKFLOW.md)

Highlights:

- PR/push required checks run in light CI
- heavy checks run via PR label `ci:heavy`, schedule, or manual dispatch
- releases build on version tags (`v*`)

## Project Structure

### Backend (Rust)

```
crates/lumenflow_core/
├── src/
│   ├── lib.rs              # Library root
│   ├── artnet/             # Art-Net protocol implementation
│   │   ├── parser.rs       # Packet parsing (zero-copy)
│   │   ├── types.rs        # Data structures (OpCodes, etc)
│   │   └── constants.rs    # Protocol constants
│   ├── buffer/             # Memory management
│   │   ├── ring_buffer.rs  # Lock-free circular buffers
│   │   └── metrics.rs      # DMX metrics calculation
│   ├── device/             # Device registry & management
│   │   ├── registry.rs     # State machine for devices
│   │   └── commands.rs     # Art-Address generation
│   ├── network/            # Networking layer
│   │   ├── socket.rs       # UDP socket setup
│   │   ├── receiver.rs     # Packet reception thread
│   │   └── sender.rs       # Packet transmission
│   └── metrics/            # Telemetry & profiling
│       ├── engine.rs       # Metrics aggregation
│       └── exporters.rs    # Prometheus export
└── benches/
    └── dmx_throughput.rs   # Performance benchmarks
```

### Frontend (TypeScript + SolidJS)

```
crates/lumenflow_ui/src/
├── main.tsx                # Application entry
├── App.tsx                 # Root component
├── components/
│   ├── UniverseMap.tsx     # Heatmap visualization
│   ├── RoutingMatrix.tsx   # Node-link diagram
│   ├── ChannelInspector.tsx # Detailed channel view
│   └── ...
├── stores/                 # SolidJS stores (state)
│   ├── dmxStore.ts         # DMX universe data
│   ├── deviceStore.ts      # Device registry
│   └── settingsStore.ts    # User preferences
├── hooks/                  # Custom hooks (Solid)
│   ├── useDmxSubscription.ts
│   └── useArtNetEvents.ts
├── utils/
│   ├── artnet.ts           # Art-Net utilities
│   ├── metrics.ts          # Metric calculations
│   └── canvas.ts           # Canvas rendering helpers
└── styles/
    ├── index.css           # Global Tailwind
    └── components.css      # Component-specific
```

## Key Development Concepts

### Understanding Lock-Free Programming

The core's hot path uses lock-free data structures to avoid blocking:

```rust
// ❌ Bad: Mutex locks in hot path
let mut data = BUFFER.lock().unwrap();
data[0] = value;

// ✅ Good: Atomic (compare-and-swap)
BUFFER.compare_exchange_weak(old, new, Ordering::SeqCst, Ordering::Relaxed);
```

**When to use:**

- **Lock-free:** Network receive thread (must not block)
- **Parking lot:** Device registry updates (happens less frequently)
- **Tokio channels:** Inter-thread communication (composable, safe)

### Viewport Culling Pattern

The frontend only requests data it's displaying:

```typescript
// Store only visible universes
const [visibleUniverses, setVisibleUniverses] = createSignal([0, 1, 2, 3]);

// Use effect subscribes to changes
createEffect(() => {
  invoke_subscribe_universes(visibleUniverses());
});

// Rust render thread now only emits data for these:
// Result: 4 × 512 bytes/44Hz instead of 32,768 × 512
```

### Binary IPC Format

Tauri events use base64-encoded binary data:

```typescript
// Frontend listener
listen("dmx-update", (event) => {
  const buffer = atob(event.payload);
  const view = new Uint8Array(buffer);
  // Parse: [u16 universe_id][u64 timestamp][512 bytes data]...
});
```

## Adding New Features

### Example: Adding RDM Control

**1. Extend Rust types** (`crates/lumenflow_core/src/rdm/types.rs`)

```rust
pub struct RdmParameter {
    pub device_uid: [u8; 6],
    pub pid: u16,
    pub value: Vec<u8>,
}
```

**2. Implement Tauri command** (`src-tauri/src/lib.rs`)

```rust
#[tauri::command]
async fn cmd_rdm_get(device_uid: String, pid: u16) -> Result<Vec<u8>> {
    let rdm_engine = /* get engine */;
    rdm_engine.get_parameter(&device_uid, pid).await
}
```

**3. Create SolidJS hook**

```typescript
export const useRdmParameter = (deviceId: string, pid: number) => {
  const [value, setValue] = createSignal<Uint8Array | null>(null);

  createEffect(() => {
    invoke("cmd_rdm_get", { deviceUid: deviceId, pid }).then(setValue);
  });

  return value;
};
```

**4. Add UI component**

```typescript
export const RdmControl: Component<{ deviceId: string }> = (props) => {
    const rdmValue = useRdmParameter(props.deviceId, RDM_INTENSITY_PID);
    return <div>RDM Value: {rdmValue()}</div>;
};
```

## Debugging

### Rust Debugging

```bash
# Print debug logs
RUST_LOG=lumenflow_core=debug,lumenflow_ui=debug pnpm run dev

# Full backtrace on panic
RUST_BACKTRACE=full pnpm run dev

# Use lldb (macOS)
lldb ./target/debug/lumenflow
(lldb) b UniverseBuffer::write  # Set breakpoint
(lldb) r                         # Run
```

### Frontend Debugging

```typescript
// In component:
createEffect(() => {
  console.log("DMX update:", dmxStore);
});

// In devtools:
// F12 → Inspect element → check component state
```

### Performance Profiling

```bash
# CPU flame graph (requires flamegraph tool)
cargo install flamegraph
cargo flamegraph --bin lumenflow

# Memory profiling
cargo instruments --template "Allocations"

# Tauri performance monitoring
pnpm run dev  # Check DevTools → Performance tab
```

## Git Workflow

```bash
# Feature branch
git checkout -b feature/add-rdm-support

# Make changes, test
pnpm run lint
pnpm run test

# Commit with conventional format
git commit -m "feat(rdm): add RDM parameter control"

# Push and create PR
git push origin feature/add-rdm-support
```

### Commit Message Format

```
feat(scope): add new feature            # New feature
fix(scope): resolve issue               # Bug fix
docs(scope): update documentation       # Documentation
refactor(scope): restructure code       # Code reorganization
perf(scope): optimize performance       # Performance
test(scope): add/update tests          # Tests
chore(scope): maintenance tasks        # Maintenance
```

## Testing

### Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_art_net_parser() {
        let packet = b"Art-Net\0\x00\x50...";
        let parsed = ArtNetPacket::parse(packet).unwrap();
        assert_eq!(parsed.universe_id, 0);
    }
}
```

Run: `cargo test -p lumenflow_core`

### Integration Tests

```bash
# All integration tests
cargo test --test '*'

# Specific test
cargo test --test art_net_integration
```

### Frontend Tests

```typescript
import { render, screen } from "@testing-library/solid";
import { UniverseMap } from "@/components/UniverseMap";

describe("UniverseMap", () => {
    it("renders universe grid", () => {
        render(() => <UniverseMap />);
        expect(screen.getByRole("grid")).toBeInTheDocument();
    });
});
```

Run: `pnpm run test`

## Common Issues & Solutions

| Issue                        | Solution                            |
| ---------------------------- | ----------------------------------- |
| Clippy errors on commit      | Run `cargo clippy --fix`            |
| TypeScript errors            | Run `pnpm run type-check`           |
| Tauri build fails            | Delete `src-tauri/target/`, rebuild |
| pnpm dependency conflicts    | Remove `pnpm-lock.yaml`, reinstall  |
| UDP port 6454 already in use | `lsof -i :6454` to find process     |

## Performance Optimization Tips

1. **Use `parking_lot` for mutexes** (faster than std::sync::Mutex)
2. **Pre-allocate vectors** (`Vec::with_capacity()`)
3. **Use `#[inline]` for small hot-path functions**
4. **Profile with `cargo bench`** before optimizing
5. **Keep network thread allocation-free**

---

**Next Steps:** See [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) for system design deep-dive.
