Hier spricht dein Lead Architect. Wenn wir dieses Projekt – intern nennen wir es ab sofort **"Project LumenFlow"** – angehen, bauen wir kein weiteres Bastel-Tool. Wir bauen Industriestandard. Das Ziel ist eine Latenz unter 15ms von der Netzwerkkarte bis zum gerenderten Pixel, absolute Speichersicherheit und eine UX, die kognitive Last eliminiert.

Dieses Dokument ist das **Architectural Blueprint**. Behandle es als die absolute Wahrheit für die Implementierung. Jede KI (Cursor/Copilot) und jeder menschliche Entwickler im Team hat sich an diese Paradigmen zu halten.

---

# Projektbeschreibung

Dieses Projekt ist die Entwicklung einer plattformübergreifenden (Windows, macOS, Linux), hochperformanten Netzwerk-Monitoring- und Steuerungssoftware für das DMX/Art-Net-Protokoll in der professionellen Veranstaltungstechnik.
Das Ziel ist es, die technische Tiefe und Mächtigkeit von Branchen-Standards (wie DMX Workshop) mit der intuitiven, modernen User Experience eines Dante Controllers und der Designsprache von Apple-Software zu kombinieren. Es soll die "eierlegende Wollmilchsau" für System-Engineers am Front of House (FOH) werden.

# 🏗️ ARCHITECTURAL BLUEPRINT: Project "LumenFlow"

## 1. Executive Summary & Core Requirements

Wir entwickeln einen plattformübergreifenden Art-Net 4 Monitor und Controller.

- **Mission:** Ablösung von Legacy-Tools (wie DMX Workshop) durch moderne, reaktive Datenvisualisierung gekoppelt mit Dante-ähnlichem Routing-Komfort.
- **Performance-Baseline:** Verarbeitung von mindestens 500 DMX-Universen bei 44 Hz ($\approx 22.000$ Pakete/Sekunde).
- **Zero-Allocation in the Hot Path:** Im Netzwerk-Thread (Rust) dürfen pro eingehendem DMX-Paket **keine** neuen Speicherallokationen (`Heap Allocations`) stattfinden. Wir arbeiten ausschließlich mit Pre-Allocated Ring-Buffern.
- **Fail-Safe UI:** Die UI darf bei einem Broadcast-Storm niemals einfrieren.

## 2. Open Source & Zukunftsstrategie

- **Lizenzierung:** GPLv3 oder MIT (Dual-License evaluiert für spätere Pro-Features).
- **Modularität (Plugin-Ready):** Das Rust-Backend wird als Core-Crate `lumenflow_core` entkoppelt, sodass die CLI-Tools oder externe Daemons unsere Art-Net-Engine nutzen können, ohne das Tauri-Frontend laden zu müssen.
- **Mobile Readiness:** Das SolidJS-Frontend wird strikt responsiv via Tailwind entwickelt. Zukünftiger Meilenstein: Kompilierung des Frontends als PWA, das über WebSockets mit einem laufenden FOH-PC kommuniziert.

---

## 3. UI / UX Engineering (Frontend Domain)

_Verantwortlich: Lead UX/UI Designer & Frontend Architect_

Wir folgen den Paradigmen der **Informationsvisualisierung nach Edward Tufte** (Maximierung der Data-Ink-Ratio) und Ben Shneidermans Mantra: _"Overview first, zoom and filter, then details-on-demand"_.

### 3.1 Globale Ansicht: Universe Map (Macro-Level)

- **Konzept:** Eine dichte Heatmap für 32.768 Universen.
- **Visualisierung:** Wir nutzen **Horizon Charts** für die Netzwerkauslastung. Horizon Charts überlagern abgeschnittene Amplituden farblich kodiert, was die Erkennung von Spitzen auf minimalem vertikalem Raum ermöglicht (referenziere Heer, J., et al. "Sizing the horizon...", CHI 2009).
- **Interaktion:** Semantic Zooming. Bei Scroll-In wandeln sich die abstrakten Farbblöcke stufenlos in detaillierte Kanalraster um.

### 3.2 Routing Ansicht: The Node Matrix

- **Konzept:** Node-Link Diagramm in Matrix-Form.
- **UI-Komponenten:** Ein 2D-Grid (Canvas-basiert für Performance). Spalten sind physische Ports (Node A, Port 1), Zeilen sind logische Universen.
- **Visual Feedback:** _Animated Flow Lines_. Aktive Verbindungen nutzen SVG-Stroke-Dasharray-Animationen. Die Geschwindigkeit der Animation korreliert linear mit der Framerate des Universums.

### 3.3 Detail Ansicht: Channel Inspector (Micro-Level)

- **Konzept:** Hochauflösende Diagnose.
- **Sparklines:** Jeder der 512 Kanäle enthält eine Sparkline. Implementierung nicht via DOM-Elementen (zu langsam), sondern über eine dedizierte `<canvas>`-Ebene (z.B. mit `uPlot` oder einem nativen WebGL-Shader), die hinter den Text-Nodes liegt.
- **Flicker-Detection Alerting:** Pre-attentive Verarbeitung. Wenn der Rust-Algorithmus einen hohen Varianz-Score berechnet, blinkt der Rahmen des Kanals in `#D97706` (Tailwind Amber-600) bei $2\text{ Hz}$.

---

## 4. Backend-Architektur & Tech-Stack (Rust Domain)

_Verantwortlich: Lead Systems Engineer_

Wir nutzen **Tauri v2** als Bridge. Das Backend wird in **Rust 2021 Edition** geschrieben.

### 4.1 Die Art-Net 4 API Implementierung (`lumenflow_core::artnet`)

Wir nutzen das Crate `nom` oder `zerocopy` für das Parsing der UDP-Payloads.

- **Sockets:** Konfiguration des UDP-Sockets mit `SO_REUSEADDR` und vergrößerten OS-Buffern (`SO_RCVBUF` auf min. 8MB setzen), um Paketverluste auf Kernel-Ebene bei Traffic-Spikes zu verhindern.
- **Feature Completeness:**
- `ArtPoll / ArtPollReply`: Eigener State-Machine-Actor (`tokio::task`), der periodisch (alle 2.5s) sendet und Antworten in der `DeviceRegistry` updatet.
- `ArtDmx`: Zero-Copy Deserialisierung. Die 512 Bytes werden direkt in den referenzierten Memory-Block des Ring-Buffers geschrieben (`std::ptr::copy_nonoverlapping`).
- `ArtSync`: Implementierung einer Pipeline-Barrier. Wenn Node X ArtSync abonniert hat, werden eingehende `ArtDmx` Pakete in einem `StagingBuffer` gehalten und erst beim Eintreffen des `ArtSync` OpCodes in den `RenderBuffer` (und damit an die UI) geswappt.
- `ArtAddress`: Ein dedizierter Mutation-Service, der Pakete generiert, um IPs oder Subnetze der Endgeräte zu konfigurieren.

### 4.2 Datenstrukturen (Concurrency Model)

Das System nutzt Lock-free Data Structures (z.B. `crossbeam::queue` oder `dashmap`), um Thread-Contention zu vermeiden.

1. **`UniverseBuffer`:**

```rust
struct UniverseBuffer {
    universe_id: u16,
    current_data: [u8; 512],
    history: RingBuffer<[u8; 512], 100>, // Lock-free Ringbuffer
    metrics: AtomicMetrics,
}

```

2. **`MetricsEngine` (Algorithmus):**
   Berechnung des Packet Jitter (Inter-Packet Arrival Time) via Exponential Moving Average (EMA), um Ausreißer zu glätten:

$$EMA_{t} = \alpha \cdot IPAT_{t} + (1 - \alpha) \cdot EMA_{t-1}$$

Wobei $\alpha$ (Smoothing Factor) in den UI-Settings zwischen 0.1 und 0.3 einstellbar ist.

### 4.3 PCAP / Wireshark Integration

- Wir implementieren einen Network-Tap im Hot-Path.
- Mittels des Crates `pcap-file` erzeugen wir einen Writer-Thread (verbunden über einen MPSC-Channel).
- Wenn das Flag `is_recording` true ist, wird der unmodifizierte Byte-Slice inkl. `SystemTime::now()` in das `.pcap` File gepumpt.

---

## 5. IPC Datenfluss (Die Tauri Bridge)

_Verantwortlich: Lead Integration Engineer_

**Das größte Bottleneck jeder Tauri/Electron App ist die Serialisierung über die IPC-Bridge.** Wenn wir 500 Universen à 512 Bytes bei 44 Hz als JSON über die Bridge schicken, stirbt die CPU an Serde-Overhead.

**Die Lösung: Viewport-Culling & Throttling**

1. **Frontend-Abo:** SolidJS meldet dem Rust-Backend über ein Tauri Command, was der User gerade sieht: `subscribe_universes([0, 1, 2, 3])`.
2. **Rust-Emitter:** Ein dedizierter `Render-Thread` in Rust liest die Buffer der abonnierten Universen _exakt_ mit der Bildwiederholrate des Monitors (z.B. 60Hz via `tokio::time::interval`) und emittiert die Daten gebatcht.
3. **Binary IPC:** Um JSON-Overhead zu vermeiden, nutzen wir base64-kodierte Uint8Arrays oder reine Tauri-Binary-Payloads für die DMX-Werte.

---

## 6. Frontend Architektur (SolidJS)

_Verantwortlich: Lead Frontend Engineer_

- **Tech-Stack:** SolidJS, TypeScript, Tailwind CSS, Vite.
- **State Management:** Wir verzichten auf Redux. Solid's native `createSignal` und `createStore` sind durch das Fine-Grained Reactivity Model perfekt.
- **Data Structure (Frontend):**

```typescript
interface DmxStore {
  [universe: number]: {
    data: Uint8Array;
    fps: number;
    jitterMs: number;
    isFlickering: boolean;
  };
}
```

- **Rendering-Optimierung:** 512 DOM-Nodes pro Universum sind teuer. Wir verwenden CSS Grid für das Layout, aber die Reaktivität ist an die einzelnen Kacheln (Cells) gebunden. Es wird **nur** die Text-Node der Kachel aktualisiert, deren Wert sich im Array geändert hat.

---

## 7. Entwicklungsumgebung & Tooling (DevOps)

Dieses Setup ist zwingend erforderlich, um einen sauberen Codebase zu garantieren:

### 7.1 VSCode / Cursor Workspace Settings (`.vscode/settings.json`)

- `"editor.formatOnSave": true`
- `"rust-analyzer.checkOnSave.command": "clippy"`
- `"tailwindCSS.experimental.classRegex": ["class:\\s*?[\"'`]([^"'`]_)._?"]`

### 7.2 NPM / Cargo Config

- **Package Manager:** `pnpm` (strictly enforced via `package.json` "engines").
- **Rust Toolchain:** `stable` (aktuell 1.76+).
- **Linter-Regeln (Rust):**
  `#![deny(clippy::unwrap_used)]` – Im Core-Network-Stack ist `unwrap()` streng verboten. Jeder Error (z.B. malformed Art-Net packet) muss über `Result` gehandhabt und geloggt werden. Die App darf unter keinen Umständen panicken.
- **Linter-Regeln (JS/TS):** Strict TypeScript Config. `any` Types sind verboten.

---

## 8. Projekt-Phasen & Initiale Tasks (Action Items)

**Phase 1: Das Core-Skelett (Woche 1)**

1. Initialisierung: `pnpm create tauri-app` (Template: Solid + TS).
2. Rust: Einrichten des Tokio Runtimes, Binden des UDP Sockets an Port 6454.
3. Rust: Schreiben des Art-Net Header Parsers (Validation von "Art-Net\0").
4. SolidJS: Bauen der 512-Grid-Component (noch statisch).

**Phase 2: Data Flow & Optimierung (Woche 2)**

1. Rust: Implementierung des Lock-free RingBuffers.
2. IPC: Aufbau des Viewport-Culling (Frontend meldet Sichtbarkeit an Backend).
3. SolidJS: Live-Bindung der Daten an das Grid. Performance-Test: 50 Universen einspeisen (mittels Art-Net Generator) und FPS der UI messen.

**Phase 3: The Dante-Experience (Woche 3)**

1. Rust: Implementierung des `ArtPoll` Daemons. Aufbau der `DeviceRegistry`.
2. SolidJS: Bau der Routing-Matrix. Implementierung von Drag & Drop.
3. Rust: Generierung und Versand von `ArtAddress` Paketen basierend auf UI-Interaktionen.

---

**Lead Architect Note:** _Dieses Blueprint definiert den Standard. Wir bauen ein System, das fehlerhafte Hardware auf der Bühne kompensiert und dem Operator absolute Sicherheit gibt. Lest euch in die Art-Net 4 Spezifikation (Artistic Licence) ein, insbesondere in das Port-Address-Routing (Net, Sub-Net, Universe). Bei Architekturfragen referenziert dieses Dokument. Startet die IDEs._
