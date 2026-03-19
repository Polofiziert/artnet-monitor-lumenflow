Hier ist der Entwurf für die `TESTS.md`. Dieses Dokument ist so verfasst, dass es sowohl für menschliche Senior-Entwickler als auch für KI-Agenten (wie Cursor) als striktes Regelwerk dient. Es orientiert sich an der **SQLite-Philosophie**: Der Test-Code ist wertvoller als der Produktions-Code.

---

# 🧪 LumenFlow Test Strategy & Quality Gate

Dieses Dokument beschreibt die Test-Infrastruktur von LumenFlow. Wir streben eine Stabilität auf Industrie-Niveau an, indem wir formale Verifikation, deterministisches Netzwerk-Chaos und visuelle Regressionsprüfung kombinieren.

## 1. Die Test-Pyramide (LumenFlow Edition)

| Ebene                    | Fokus                     | Tooling                  | Ziel                                   |
| ------------------------ | ------------------------- | ------------------------ | -------------------------------------- |
| **Formale Verifikation** | Mathematische Korrektheit | `Kani`, `Miri`           | Ausschluss von Undefined Behavior (UB) |
| **Property-Based**       | Massive Input-Variationen | `proptest`, `cargo-fuzz` | Robustheit gegen malformierte Pakete   |
| **Chaos-Sim**            | Netzwerk-Instabilität     | `LumenFlow-Chaos-Proxy`  | Stabilität bei Paketverlust/Jitter     |
| **Visual Regression**    | UI-Konsistenz             | `Playwright`             | Pixel-perfekte Apple-Aesthetic         |

---

## 2. Backend: Rust Core Testing

### 2.1 Art-Net Parser (Fuzzing & Spec-Compliance)

Der Parser muss jedes Paket nach Art-Net 4 Spezifikation validieren.

- **Location:** `crates/lumenflow_core/src/`
- **Anforderung:** 100% Branch-Coverage.
- **Aktion:** Nutze `cargo fuzz`, um den `ArtDmx`-Parser mit zufälligen Byte-Arrays zu fluten. Ein Absturz (Panic) gilt als kritischer Bug.

### 2.2 Concurrency & Race Conditions

Da wir mit 500 Universen im Multithreading-Modus arbeiten:

- **Loom:** Alle Lock-free Datenstrukturen (Ring-Buffer) müssen unter `Loom` getestet werden, um Race-Conditions in der Speicherzugriffsfolge auszuschließen.
- **Miri:** Führe `cargo miri test` aus, um Memory-Leaks und Pointer-Fehler im Hot-Path zu finden.

---

## 3. Deterministische Netzwerk-Simulation

Wir simulieren kein "perfektes" Netzwerk. Wir simulieren den "Tour-Alltag".

### 3.1 Der Chaos-Proxy

Ein interner Test-Harness fängt UDP-Pakete ab und manipuliert sie:

- **Drop-Rate:** Simuliere 5% - 20% Paketverlust.
- **Out-of-Order:** Vertausche die Reihenfolge von ArtDmx-Paketen.
- **Jitter-Injection:** Verzögere Pakete variabel zwischen 1ms und 500ms.
- **Erwartung:** Die UI muss den Jitter-Wert korrekt berechnen und visuell (Amber-Warning) warnen, ohne abzustürzen.

---

## 4. Frontend: UI & UX Testing (SolidJS)

### 4.1 State-Synchronisation

Wir nutzen **Model-Based Testing**, um sicherzustellen, dass das Backend-Modell und der UI-View synchron sind.

- **Test:** Ein Script generiert 1000 zufällige DMX-Werte. Wir prüfen per Selektor, ob die entsprechenden DOM-Elemente (Kacheln) exakt diese Werte (oder deren hexadezimale Entsprechung) anzeigen.

### 4.2 Visual Regression (Pixel-Perfect)

Jede UI-Komponente (Matrix, Inspector, Sparklines) hat einen "Golden Screenshot".

- **Tool:** `Playwright`.
- **Prozess:** Bei jedem PR werden Screenshots auf Windows und macOS verglichen. Abweichungen > 0.5% führen zum Abbruch des Build-Prozesses.

---

## 5. Continuous Integration (CI) Pipeline

Jeder Commit muss folgendes Quality-Gate passieren:

1. **Static Analysis:** `cargo clippy -- -D warnings` (Keine Warnungen erlaubt).
2. **Security Audit:** `cargo audit` (Prüfung auf unsichere Crates).
3. **Core Tests:** `cargo test` (Unit & Integration).
4. **UI Build:** `pnpm build` (Prüfung auf Type-Safety in TypeScript).
5. **Documentation:** `cargo doc` (Prüfung auf korrekte API-Dokumentation).

---

## 6. Richtlinien für KI-Agenten (Cursor/Copilot)

Wenn du neuen Code für dieses Projekt generierst, halte dich an diese Regeln:

1. **No Unwraps:** Benutze niemals `.unwrap()`. Nutze stattdessen das `Result`-Handling.
2. **Test First:** Erstelle für jede neue Parser-Logik zuerst eine Test-Funktion in der entsprechenden `mod.rs`.
3. **Documentation:** Jede öffentliche Funktion muss ein `/// # Errors`-Abschnitt in der Dokumentation haben.
4. **Performance:** Vermeide Allokationen in Funktionen, die mit `handle_dmx` markiert sind.

---

### Lead Architect Note:

_„Wir bauen dieses System nicht für den Sonnenschein. Wir bauen es für den Moment, wenn der Switch am FOH brennt und das Netzwerk schreit. Nur eine Test-Suite auf SQLite-Niveau gibt uns die Sicherheit, dass LumenFlow dann immer noch steht.“_
