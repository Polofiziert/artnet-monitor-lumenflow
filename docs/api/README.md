# LumenFlow API documentation

This folder holds **reference documentation** for programmatic surfaces of the project:

| Document | What it describes | Typical audience |
|----------|-------------------|------------------|
| [CORE_API.md](./CORE_API.md) | **`lumenflow_core`** Rust crate: public types, parsers, builders, engines, and how they map to Art-Net 4 | Rust integrators, backend contributors |
| [CLI_API.md](./CLI_API.md) | **`lumenflow_cli`** binary: subcommands, flags, and how they use the core | Operators, testers, CI |

**Naming:** “API” here means *application programming interface* in the usual sense: the stable-ish contract of a library crate or a CLI, not the Tauri IPC bridge (that is documented separately under `docs/IPC_API_CONTRACT.md`).

Alternative labels you might use elsewhere: *crate reference*, *Rust API reference*, *CLI reference*, *command-line reference*.
