# LumenFlow Project Roadmap

## Vision

Build the professional standard for Art-Net monitoring and control, trusted by large-scale theatrical productions worldwide.

## Versioning Strategy

- **v0.x:** Alpha phase (architecture validation)
- **v1.0:** Public release (core features)
- **v2.0+:** Advanced features and platforms

## Phase 1: Alpha (v0.1 - v0.3)

### v0.1 - Foundation ✅ COMPLETE

- [x] Tauri + SolidJS scaffold
- [x] Cargo workspace setup
- [x] CI/CD pipelines
- [x] Documentation framework

**Timeline:** March 2025

### v0.2 - Core Features (Q2 2026) — Alpha shipped March 2026

- [x] Art-Net UDP parsing (zero-copy, zerocopy crate)
- [x] Device discovery (ArtPoll sender + ArtPollReply receiver)
- [x] Universe heatmap visualization
- [x] Channel inspector with sparklines
- [x] Routing matrix UI (sortable, filterable, source IP, pkt/s)
- [x] CLI tools for diagnostics (listen, poll, info)
- [x] OpAddress (0x6000) parser
- [x] Mock data mode for standalone UI development
- [x] Error boundaries, keyboard shortcuts, connection state tracking
- [x] 46 passing tests (unit + integration + property-based)

**Remaining for v0.2 stable:**

- [ ] 500+ universes @ 44Hz load test validation
- [ ] <15ms latency benchmark confirmation
- [ ] Canvas-based DMX grid for extreme scale
- [ ] Playwright E2E tests passing in CI

### v0.3 - Stability (Q3 2026)

- [ ] Performance optimization (benchmarking)
- [ ] Extended platform testing (Linux, Windows)
- [ ] User feedback integration
- [ ] Release candidate builds

**Target:** 20 beta testers

## Phase 2: Production Ready (v1.0+)

### v1.0 - Public Release (Q4 2026)

- [ ] Art-Address command support
- [ ] Device configuration UI
- [ ] Workspace persistence
- [ ] Auto-update mechanism
- [ ] Comprehensive user documentation
- [ ] Community support channels

**Release criteria:**

- All tests passing
- Performance targets met
- Security audit completed
- 3 months of beta testing

### v1.1 - Stability & Polish (Q1 2027)

- [ ] Bug fix releases
- [ ] User-requested features
- [ ] Mac/Windows/Linux parity
- [ ] Performance tuning for edge cases

### v1.2 - Extended Features

- [ ] PCAP recording & playback
- [ ] Metrics export (Prometheus)
- [ ] Theme customization
- [ ] Keyboard shortcuts customization

## Phase 3: Advanced (v2.0+)

### RDM Support (v1.5 - v2.0)

- [ ] RDM (Remote Device Management) library
- [ ] Parameter control UI
- [ ] Device discovery via RDM
- [ ] Fixture profile library

### Mobile & PWA (v2.1)

- [ ] Tauri Mobile app (iOS/Android via Tauri v2)
- [ ] Web-based PWA monitoring
- [ ] Remote control via WebSockets

### Enterprise Features (v2.2+)

- [ ] Multi-workstation synchronization
- [ ] Cloud backup and collaboration
- [ ] LDAP/OAuth authentication
- [ ] Advanced logging and audit trails

### Clustering & Scalability (v3.0)

- [ ] Kubernetes deployment
- [ ] Distributed universe management (1000+ universes)
- [ ] Multi-network monitoring
- [ ] Commercial licensing

## Platform Support Timeline

| Platform        | v1.0 | v1.5 | v2.0 |
| --------------- | ---- | ---- | ---- |
| macOS Intel     | ✓    | ✓    | ✓    |
| macOS ARM (M1+) | ✓    | ✓    | ✓    |
| Windows 10+     | ✓    | ✓    | ✓    |
| Linux (Ubuntu)  | ✓    | ✓    | ✓    |
| iOS             | —    | —    | ✓    |
| Android         | —    | —    | ✓    |
| Web (PWA)       | —    | ✓    | ✓    |

## Known Limitations (Future Fixes)

| Issue               | Workaround          | Target Version |
| ------------------- | ------------------- | -------------- |
| No RDM yet          | Manual Art-Address  | v1.5           |
| No PCAP recording   | Third-party tcpdump | v1.2           |
| Single machine only | N/A                 | v2.0           |
| No authentication   | Single-user FOH     | v2.2           |

## Community Contribution Opportunities

Areas where contributors can make immediate impact:

- [ ] **Documentation:** Polish setup guides, Add video tutorials
- [ ] **Testing:** Platform testing (Windows Arm64, different Linux distros)
- [ ] **Localization:** Translate UI to Portuguese, German, French
- [ ] **UI/UX:** Design system improvements, accessibility
- [ ] **Performance:** SIMD optimizations, WASM rendering
- [ ] **Integrations:** MA3 Show Files, Vixen, ETC plugins

## Funding & Sustainability

**Planned Revenue (Post v1.0):**

- Free tier: Core monitoring
- Pro tier: $29/year (RDM, PCAP, advanced metrics)
- Enterprise: Custom pricing (40+ devices, priority support)

**Sustaining:**

- GitHub Sponsors
- Open Collective
- Commercial licensing options

---

**Last Updated:** March 2026
**Next Roadmap Review:** June 2026
