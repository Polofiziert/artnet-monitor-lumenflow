# LumenFlow User Manual

**Version:** 0.2  
**Audience:** System engineers, FOH operators

---

## 1. What LumenFlow Does

LumenFlow is an Art-Net 4 monitoring and control application. It lets you:

- **Monitor** DMX universes and network traffic in real time.
- **Discover** Art-Net devices on the network.
- **Inspect** channel-level data, history, and diagnostics.
- **Route** and understand which sources feed which receivers (routing matrix).
- **Configure** device IP settings (Art-Net IP programming).

---

## 2. Views

- **Dashboard** — Universe heatmap, channel grid preview, and network diagnostics (load, packet arrival).
- **Inspector** — Full channel grid for one universe with sparklines, channel detail overlay, and source/sync info.
- **Routing Matrix** — TX (senders) vs RX (receivers); see which devices send Art-Net and which ports receive.
- **Devices** — List of discovered devices; expand for diagnostics, URLs, and IP configuration.

---

## 3. Universe Notation (0:0:1)

Universes are identified by **Net : SubNet : Universe** (Art-Net 15-bit port address). For example, **0:0:1** means Net 0, SubNet 0, Universe 1. Hover over the notation in the UI for a tooltip.

---

## 4. Charts and Diagnostics

- **Network Load (Mbps)** — Horizon chart of Art-Net traffic over time. Shows **No data** when there is no traffic.
- **Inter-Packet Arrival Time (ms)** — Jitter histogram. Shows **No data** when there are no samples.

---

## 5. Routing Matrix

- **TX (rows)** — Devices/sources that send Art-Net (ArtDmx).
- **RX (columns)** — Devices that receive (have port addresses). Cells show which universe is routed from which source.

---

## 6. Settings

- **Appearance → Theme** — **Dark** (default Pro-Lab), **Light** (higher contrast for bright environments such as outdoor festivals), or **System** (follow the OS light/dark setting). The window chrome follows this choice where the platform supports it.
- **Mock Data Mode** — Simulate Art-Net for UI development.
- **Grid Columns** — 16 or 32 columns in channel grids.
- **Emit Rate** — IPC update frequency (Hz).
- **Channel value format** — How channel values appear in the detail panel: Decimal, Hex, Binary, or Percent.
- **Network** — NIC selection, spec-compliant discovery targets, subnet broadcast.

---

## 7. Help

Use the **native menu** (on macOS: **Help** in the menu bar at the top of the screen; on Windows/Linux: **Help** on the window menu):

- **LumenFlow Help** — Opens the in-app help panel (overview of features).
- **Search** — Focuses the header search field (same as **⌘K** on macOS / **Ctrl+K** on Windows/Linux).
- **User Manual…** — Opens the help panel scrolled to the manual section.
- **Art-Net 4 Specification…** — Opens the official Art-Net specification page in your browser (see [Art-Net](https://art-net.org.uk/resources/art-net-specification/) for the normative document). For protocol details in this guide, cross-check section numbers and page references in the PDF edition you use.

This document is the canonical user manual; keep it aligned with the in-app help text.

---

## 8. Troubleshooting

- **No devices discovered** — Ensure Art-Net discovery targets match your network (e.g. subnet broadcast for 192.168.x.x). See Settings → Network.
- **Configure IP / Read current** — Requires the device to support ArtIpProg/ArtIpProgReply. Use **params** when calling from the UI (see IPC contract).
- **No data in diagnostics** — When no traffic is received, charts show **No data**. Start sources or use Mock Data Mode to see activity.

---

_For development and API details, see `docs/development/` and `docs/IPC_API_CONTRACT.md`._
