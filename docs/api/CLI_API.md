# `lumenflow` CLI — command reference

The `**lumenflow_cli**` binary (`lumenflow` on PATH after install) is a **diagnostic and testing** front-end for Art-Net 4. It depends on `**lumenflow_core`** for parsing, sockets, and packet builders.

It does **not** embed the full Tauri UI, IPC bridge, or viewport-culled DMX sync—that lives in `lumenflow_ui`.

---

## 1. Commands overview


| Command            | Purpose                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `listen`           | Bind `0.0.0.0:6454`, parse all supported packets, print human or JSON lines                              |
| `poll`             | Broadcast ArtPoll, collect ArtPollReply until timeout, print table                                       |
| `info`             | Crate version string, Art-Net port/protocol lines, non-loopback **IPv4** interfaces (via `nix::ifaddrs`) |
| `send`             | Stream **ArtDmx** at a chosen rate/pattern to a target                                                   |
| `mock-node`        | Periodically send **ArtPollReply** to a host (e.g. LumenFlow on loopback)                                |
| `virtual-console`  | **ArtDmx** stream + reply to **ArtPoll** with **ArtPollReply** (lab console)                             |
| `virtual-node`     | Receive **ArtDmx**, reply to **ArtPoll**, optional periodic **ArtPollReply**                             |
| `send-all-packets` | Send one of each **buildable** packet type for Wireshark capture                                         |


---

## 2. Targets and DNS

Several commands take `--target` (IP or broadcast). Resolution goes through `commands/resolve.rs` (`resolve_target`): hostnames (e.g. Docker service names) are supported where the OS can resolve them.

## 3. Flags (summary)

Run `lumenflow --help` and `lumenflow <cmd> --help` for the full list. Highlights:


| Command                    | Notable flags                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `listen`                   | `--universe <u16>` filter, `--json`                                                              |
| `send` / `virtual-console` | `--rate`, `--pattern` (sine, chase, strobe, static, gradient), `--target`, `--universes`         |
| `virtual-console`          | `--name`, `--ip` (advertised in PollReply), `--physical`, `--bind`, `--verbose`                  |
| `virtual-node`             | `--port` (6454 vs 6455 when colliding with another listener), `--target` for proactive PollReply |
| `poll`                     | `--timeout` seconds                                                                              |


---

## 4. Tables — concrete call/response (CLI)

Commands that perform **no** Art-Net I/O: `**info`** (OS interfaces only).


| CLI action         | Art-Net packets sent                                                                                            | Art-Net packets received / handled                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `poll`             | ArtPoll `0x2000` via `lumenflow_core::build_art_poll`                                                           | ArtPollReply `0x2100`                                                                                                                                                            |
| `listen`           | —                                                                                                               | Parsed types: human `[DMX]` / `[POLL]` / `[REPLY]` / `[SYNC]`; anything else → `[OTHER]` (or JSON `"Unknown"`). `--universe` filters **ArtDmx** only; other packets still print. |
| `send`             | ArtDmx                                                                                                          | —                                                                                                                                                                                |
| `mock-node`        | ArtPollReply every **2s** to `--target`                                                                         | —                                                                                                                                                                                |
| `virtual-console`  | ArtDmx; ArtPollReply on Poll (unicast to source) + **every 2.5s** to `--target`                                 | ArtPoll                                                                                                                                                                          |
| `virtual-node`     | ArtPollReply on Poll + **every 2.5s** to `--target`                                                             | ArtDmx, ArtPoll, ArtSync (logged if verbose)                                                                                                                                     |
| `send-all-packets` | ArtPoll, ArtPollReply, ArtDmx, ArtSync, ArtAddress, ArtCommand, ArtInput, ArtTrigger, ArtIpProg, ArtDataRequest | —                                                                                                                                                                                |


---

## 5. Tables — abstract patterns (CLI)


| Pattern                      | Where                                             |
| ---------------------------- | ------------------------------------------------- |
| **One-shot discovery**       | `poll`: broadcast → collect replies for N seconds |
| **Passive monitor**          | `listen`: long-running recv/parse                 |
| **Traffic generator**        | `send`, `virtual-console`                         |
| **Fake node for UI testing** | `mock-node`, `virtual-node`                       |
| **Capture / compliance**     | `send-all-packets`                                |


---

## 6. Table — `build_art_`* usage in CLI


| Function (from `lumenflow_core`) | Used in                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `build_art_dmx`                  | `send`, `virtual_console` (via wrapper that sets Physical) |
| `build_mock_poll_reply`          | `mock_node`, `virtual_console`, `send_all_packets`         |
| `build_our_poll_reply`           | *(not used by CLI; used by app/core discovery)*            |
| `build_art_poll`                 | `poll`, `send_all_packets`                                 |
| `build_art_sync`                 | `send_all_packets`                                         |
| `build_art_address`              | `send_all_packets`                                         |
| `build_art_command`              | `send_all_packets`                                         |
| `build_art_input`                | `send_all_packets`                                         |
| `build_art_trigger`              | `send_all_packets`                                         |
| `build_art_ip_prog`              | `send_all_packets`                                         |
| `build_art_data_request`         | `send_all_packets`                                         |


---

## 7. Differences vs `lumenflow_core` (library)


| Aspect           | Core                                                           | CLI                                           |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Role             | Library: parsers, stores, engines                              | Executable: user-facing tests and diagnostics |
| Discovery loop   | `spawn_discovery`* + full `DeviceRegistry` integration in apps | `poll` does a single timed listen             |
| DMX storage      | `UniverseStore` 32k universes                                  | No persistent store; `send` only transmits    |
| Metrics / jitter | `JitterCollector`, `UniverseMetrics`, etc.                     | Not wired                                     |
| ArtPoll          | `network::build_art_poll`                                      | `poll` imports the same helper                |


---

## Related docs

- [CORE_API.md](./CORE_API.md) — library API and opcode coverage  
- [README.md](./README.md) — index of this folder

