# LumenFlow Window Menu Specification

**Status:** Implemented (M1 menu surface)  
**Platform:** macOS, Windows, Linux (Tauri 2)

## Overview

The native OS menu provides **View**, **Help**, and related actions. On macOS it appears in the **system menu bar** (top of screen); on Windows/Linux it appears as the **window menu** attached to the window. Implementation: [`crates/lumenflow_ui/src/hooks/useAppMenu.ts`](../../crates/lumenflow_ui/src/hooks/useAppMenu.ts) builds on `Menu.default()` and **appends** LumenFlow items into the existing **View** and **Help** submenus (platform/Tauri entries stay; a separator is added when those menus already had items). If a submenu is missing, it is created and placed (View before **Window** when possible). Then `setAsAppMenu()`. Frontend bridge event: `lumenflow-menu` with typed payload ([`menuEvents.ts`](../../crates/lumenflow_ui/src/lib/menuEvents.ts)).

## View

| Item | ID | Action |
|------|-----|--------|
| **Dashboard** | `view-dashboard` | `setActiveView("dashboard")` — accelerator `Cmd/Ctrl+1` |
| **Inspector** | `view-inspector` | `setActiveView("inspector")` — `Cmd/Ctrl+2` |
| **Routing Matrix** | `view-routing` | `setActiveView("routing")` — `Cmd/Ctrl+3` |
| **Devices** | `view-devices` | `setActiveView("devices")` — `Cmd/Ctrl+4` |
| _(separator)_ | — | — |
| **Settings…** | `view-settings` | Opens Settings panel — `Cmd/Ctrl+,` |

## Help

| Item | ID | Action |
|------|-----|--------|
| **LumenFlow Help** | `lumenflow-help` | In-app help panel, **Features** section (`help` / `overview`) |
| **Search** | `help-search` | Focuses header search (`#lf-search`) — `Cmd/Ctrl+K` (same as in-app shortcut) |
| **User Manual…** | `manual` | Help panel, **User manual** section (`help` / `manual`) |
| **Art-Net 4 Specification…** | `artnet-spec` | Opens official spec URL in default browser (`shell` `open`) |
| _(separator)_ | — | — |
| **About LumenFlow** | `about` | Help panel, **About** section (`help` / `about`) |

On macOS, the Help submenu is set as the app Help menu (`setAsHelpMenuForNSApp`) so the OS can add its search field.

## Planned (later)

- **File → Export capture** — PCAP or diagnostic log (future).
- **App menu (macOS)** — Rich **About** (version, license, links) if not covered by Help panel.
- **View → Toggle Mock Mode** — Optional.

### Window / OS default

- Tauri default window commands (minimize, zoom, close; window list on macOS) remain as provided by the platform default menu.

## References

- `docs/development/SPRINT_PLAN_HUMAN_NOTES_0.2.md` §2.8 (M1)
- Tauri: [Window Menu](https://v2.tauri.app/learn/window-menu/), `core:menu:default`, `setAsHelpMenuForNSApp`
