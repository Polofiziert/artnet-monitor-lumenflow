# LumenFlow Window Menu Specification

**Status:** Draft (Sprint 4 / M1)  
**Platform:** macOS, Windows, Linux (Tauri 2)

## Overview

The native OS window menu shall provide access to View, Settings, and Help. On macOS the menu appears in the menu bar; on Windows/Linux as the window menu.

## Implemented (Sprint 1)

### Help

- **LumenFlow Help** — Opens in-app help panel (search and manual placeholder).
- **Search** — Same as Help (⌘K also focuses header search).
- **Manual** — Opens help panel (full manual in H2).
- **About LumenFlow** — Opens help panel (dedicated About in future).

On macOS, the Help submenu is set as the app Help menu (`setAsHelpMenuForNSApp`) so the OS can add a search box.

## Planned (M1)

### View

- **Dashboard** — Switch to Dashboard view (shortcut 1).
- **Inspector** — Switch to Inspector view (shortcut 2).
- **Routing Matrix** — Switch to Routing view (shortcut 3).
- **Devices** — Switch to Devices view (shortcut 4).
- _Separator_
- **Settings** — Open Settings panel.
- _Optional:_ **Toggle Mock Mode** — Switch mock data on/off.

### File (optional)

- **Export capture** — Export PCAP or diagnostic log (future).

### App menu (macOS)

- **About LumenFlow** — Version, license, link to docs.
- **Quit** — Exit application.

### Window (OS default)

- Use Tauri default (minimize, zoom, close; window list on macOS).

## References

- `docs/development/SPRINT_PLAN_HUMAN_NOTES_0.2.md` §2.8 (M1)
- Tauri: [Window Menu](https://v2.tauri.app/learn/window-menu/), `core:menu:default`, `setAsHelpMenuForNSApp`
