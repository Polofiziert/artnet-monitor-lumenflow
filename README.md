# Project LumenFlow

A professional-grade, high-performance Art-Net 4 network monitoring and control software for DMX/theatrical lighting.

**Status:** Version 0.1.0 (Active Development)

## 🎯 Mission

Replace legacy tools (DMX Workshop) with modern, reactive data visualization and Dante-controller-like routing comfort, targeting <15ms latency with support for 500+ DMX universes at 44Hz.

## 🏗️ Project Structure

```
lumenflow/
├── crates/
│   ├── lumenflow_core/          # Zero-alloc Art-Net protocol engine
│   ├── lumenflow_ui/src-tauri/  # Tauri desktop application
│   └── lumenflow_cli/           # CLI tools for debugging
├── docs/                         # Comprehensive architecture & dev docs
├── .github/workflows/            # CI/CD pipelines
├── scripts/                      # Development and build scripts
├── tests/                        # Integration tests
└── [config files]
```

## 🚀 Quick Start

See [docs/development/SETUP.md](docs/development/SETUP.md) for detailed setup instructions.

### Development

```bash
pnpm install
pnpm run dev
```

### Building

```bash
cargo build --release
pnpm run build
```

## 📋 Key Technologies

- **Backend:** Rust 2021 + Tokio (async runtime)
- **Frontend:** SolidJS + TypeScript + Tailwind CSS
- **Bridge:** Tauri v2 with binary IPC
- **Protocol:** Art-Net 4 (Artistic Licence)
- **Platforms:** Windows, macOS, Linux

## 📚 Documentation

- [Documentation Index](docs/INDEX.md)
- [Architecture Overview](docs/architecture/ARCHITECTURE.md)
- [Development Guide](docs/development/GUIDE.md)
- [Performance Tuning](docs/deployment/PERFORMANCE.md)
- [Deployment Guide](docs/deployment/DEPLOYMENT.md)
- [Contributing Guide](CONTRIBUTING.md)

## 🔒 License

Dual licensed under GPLv3 and MIT. See [LICENSE](LICENSE) for details.

## 🤝 Contributing

We welcome contributions from the open-source community. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
