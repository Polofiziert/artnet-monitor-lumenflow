# Contributing to LumenFlow

Thank you for your interest in contributing to LumenFlow! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

**Summary:**

- Be respectful and inclusive
- No harassment, discrimination, or abuse
- Constructive feedback welcome; personal attacks not

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/lumenflow.git
cd lumenflow
git remote add upstream https://github.com/lumenflow/lumenflow.git
```

### 2. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Setup Development Environment

```bash
bash scripts/setup.sh
```

## Development Workflow

### Before Coding

1. **Check existing issues** on GitHub (avoid duplicates)
2. **Discuss major changes** in Discussions or open a GitHub issue first
3. **Review [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)** to understand design

### While Coding

#### Code Style & Standards

**Rust:**

```bash
# Format code
cargo fmt --all

# Run linter
cargo clippy --all-targets --all-features -- -D warnings

# Follow these rules:
# - Use meaningful variable names
# - Document public APIs with doc comments
# - No unwrap() or panic!() in hot paths
# - Prefer ? operator for error propagation
```

**TypeScript/JavaScript:**

```bash
# Format
pnpm run format

# Lint
pnpm run lint

# Type check
pnpm run type-check

# Rules:
# - No implicit `any` types
# - Prefer const over let
# - Use descriptive component names
```

#### Git Conventions

**Commit messages** follow Conventional Commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code reorganization
- `perf:` Performance improvement
- `test:` Tests added/updated
- `chore:` Build, dependencies, tooling

**Examples:**

```
feat(artnet): add RDM parameter control
fix(ui): correct universe map rendering at 4K
docs(arch): clarify IPC optimization strategy
perf(network): reduce parser allocations by 40%
```

### Pull Request Process

#### Before Submitting

1. **Sync with upstream:**

```bash
git fetch upstream
git rebase upstream/main
```

2. **Run full test suite:**

```bash
pnpm run lint
pnpm run type-check
pnpm run test
cargo test --all
cargo clippy --all-targets
```

3. **Update documentation:**
   - If adding feature, update relevant docs
   - Add inline code comments for complex logic

#### Submitting PR

1. **Push to your fork:**

```bash
git push origin feature/your-feature-name
```

2. **Create Pull Request** on GitHub:
   - Title: `feat(scope): description`
   - Description: Use template below
   - Link related issues: `Fixes #123`

**PR Template:**

```markdown
## Description

Brief summary of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing performed

## Checklist

- [ ] Code formatted (`cargo fmt`, `pnpm format`)
- [ ] Tests pass (`cargo test`, `pnpm test`)
- [ ] Clippy warnings resolved
- [ ] TypeScript types valid
- [ ] Documentation updated
- [ ] CHANGELOG entry added (major changes)
```

#### Review Process

- At least one maintainer approval required
- CI/CD checks must pass (GitHub Actions)
- Any requested changes must be addressed
- Maintainers may ask for test coverage improvements

## Testing Requirements

### Rust Unit Tests

Location: `crates/*/src/**/*_test.rs` or `#[cfg(test)] mod tests`

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_art_net_packet_parsing() {
        let packet = create_test_packet();
        let result = parse_artnet(&packet).unwrap();
        assert_eq!(result.universe_id, 0);
        assert_eq!(result.data.len(), 512);
    }

    #[test]
    #[should_panic]
    fn test_invalid_packet_panics() {
        let invalid = b"invalid";
        parse_artnet(invalid).unwrap();
    }
}
```

Run: `cargo test -p lumenflow_core`

### Integration Tests

Location: `tests/integration/`

```bash
cargo test --test '*'
```

### TypeScript Tests

Location: `src/**/*.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { UniverseMap } from "@/components/UniverseMap";

describe("UniverseMap", () => {
  it("renders 512 channels", () => {
    // Test implementation
  });
});
```

Run: `pnpm run test`

### Performance Tests

For performance-critical code, add benchmarks:

```bash
cargo bench --all
```

### Coverage Goals

- Target: 80% minimum
- Hot paths: 95%+
- UI components: 70%+

Check coverage: `pnpm run coverage`

## Documentation

### Code Documentation

**Rust:**

````rust
/// Parses an Art-Net packet from raw bytes.
///
/// # Arguments
///
/// * `bytes` - Raw UDP payload (543 bytes minimum)
///
/// # Returns
///
/// Returns `Ok(ArtNetPacket)` if valid, or `Err(ParseError)` if malformed.
///
/// # Examples
///
/// ```
/// let packet = parse_artnet(raw_bytes)?;
/// println!("Universe: {}", packet.universe_id);
/// ```
pub fn parse_artnet(bytes: &[u8]) -> Result<ArtNetPacket, ParseError> {
    // Implementation
}
````

**TypeScript:**

```typescript
/**
 * Formats DMX channel value for display.
 * @param value - DMX value (0-255)
 * @param format - Display format ("hex" | "percent" | "decimal")
 * @returns Formatted string
 */
export function formatDmxValue(
  value: number,
  format: "hex" | "percent" | "decimal" = "decimal"
): string {
  // Implementation
}
```

### User Documentation

For new features, add to appropriate docs file:

- `docs/development/GUIDE.md` - Usage guides
- `docs/architecture/ARCHITECTURE.md` - Design decisions
- `docs/deployment/PERFORMANCE.md` - Performance tips

Example:

```markdown
### New Feature: RDM Control

LumenFlow now supports RDM (Remote Device Management) for parameter control.

**Usage:**

1. Right-click device in Device Registry
2. Select "RDM Parameters"
3. Modify intensity, color, etc.

**Performance Note:** RDM queries block for ~100ms per device.
```

## Reporting Issues

### Bug Reports

Use GitHub Issues template:

```markdown
**Describe the bug:**
Clear description of what's wrong.

**To Reproduce:**

1. Opened application
2. Connected to network with 100 universes
3. Selected Universe 0
4. UI froze

**Expected Behavior:**
UI should update smoothly at 60 FPS

**Actual Behavior:**
UI froze for 5 seconds

**Screenshots:**
[If applicable]

**System Info:**

- OS: macOS 14.6.1
- LumenFlow Version: 0.1.3
- Network: Gigabit Ethernet

**Additional Context:**
CPU usage spiked to 95%
```

### Feature Requests

```markdown
**Is your feature request related to a problem?**
When monitoring large shows, I need to...

**Describe the solution you'd like:**
A new "Snapshot" feature to...

**Describe alternatives you've considered:**
Manual recording, but it's slow...

**Additional Context:**
Competitors have this feature...
```

## Project Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and priorities.

### Areas Needing Help

- [ ] RDM protocol implementation
- [ ] Mobile app (React Native)
- [ ] Language translations
- [ ] Platform-specific testing
- [ ] Documentation improvements
- [ ] Performance profiling

## Community

- **GitHub Discussions:** Q&A, ideas, announcements
- **Discord Server:** Real-time chat & support
- **GitHub Issues:** Bug reports & feature requests

## License

By contributing, you agree that your contributions will be licensed under the dual GPLv3/MIT license. See [LICENSE](LICENSE).

## Recognition

Contributors are recognized in:

- [AUTHORS.md](AUTHORS.md)
- GitHub "Contributors" badge
- Release notes (major contributors)

---

**Questions?** Open an issue with tag `question` or ask in Discussions.

**Thank you for contributing to LumenFlow!** 🚀
