# 🚀 Quick Start Guide

## First Time Setup (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/lumenflow/lumenflow.git
cd lumenflow

# 2. Run setup script (installs everything)
bash scripts/setup.sh

# 3. Start development
pnpm run dev
```

That's it! The Tauri window should launch with hot-reload enabled.

---

## Common Commands

### Development

```bash
pnpm run dev              # Start Tauri dev server (hot reload)
pnpm run test             # Run JS tests (Vitest)
pnpm run type-check       # Type check TypeScript
pnpm run lint             # Fix linting issues (ESLint + Clippy)
```

### Rust

```bash
cargo test -p lumenflow_core       # Test core library
cargo bench --all                   # Performance benchmarks
cargo clippy --all-targets          # Lint check
cargo fmt --all                     # Auto-format code
```

### Building

```bash
pnpm run build            # Build distributable app
scripts/release.sh        # Full optimized build
docker build -f Dockerfile -t lumenflow .  # Docker image
```

---

## Project Structure Quick Ref

| Path                     | Purpose                          |
| ------------------------ | -------------------------------- |
| `crates/lumenflow_core/` | Art-Net engine (Rust)            |
| `crates/lumenflow_ui/`   | Tauri app (TypeScript + SolidJS) |
| `crates/lumenflow_cli/`  | CLI tools (Rust)                 |
| `docs/`                  | Full documentation               |
| `scripts/`               | Development utilities            |
| `.github/workflows/`     | CI/CD automation                 |

---

## Documentation Map

**I'm a...**

- **Developer:** Start with [docs/development/GUIDE.md](docs/development/GUIDE.md)
- **DevOps Engineer:** See [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)
- **End User:** Read [docs/development/SETUP.md](docs/development/SETUP.md)
- **Architect:** Check [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
- **Contributor:** Review [CONTRIBUTING.md](CONTRIBUTING.md)
- **Performance Tuner:** Study [docs/deployment/PERFORMANCE.md](docs/deployment/PERFORMANCE.md)

---

## Debugging Quick Tips

**Rust panics:** `RUST_BACKTRACE=full pnpm run dev`

**TypeScript errors:** `pnpm run type-check`

**Network issues:** Check port 6454 → `lsof -i :6454`

**Performance slowdown:** Run `scripts/profile.sh` for flamegraph

---

## Need Help?

- 📖 See [BUILD_REPORT.md](docs/archive/reports/BUILD_REPORT.md) - Complete overview
- 🐛 GitHub Issues: Report bugs with system info
- 💬 GitHub Discussions: Ask questions
- 📚 Docs folder: Comprehensive guides

---

**Ready to code?** → `pnpm run dev`
