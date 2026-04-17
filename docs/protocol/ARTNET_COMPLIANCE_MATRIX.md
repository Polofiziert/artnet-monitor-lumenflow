# Art-Net Compliance Matrix

Status: Canonical  
Owner: Protocol Engineering  
Last validated: 2026-03-26  
Scope: Feature-level implementation status for Art-Net opcodes and behavior obligations.

## Purpose

Provide an auditable view of protocol support and testing evidence to prevent ambiguity between implemented, partial, and planned areas.

## Status Definitions

- `implemented`: parsed/built in production path with tests
- `partial`: some support exists, but gaps remain in dispatch/verification/UI exposure
- `planned`: not yet implemented

## Matrix

| Area                                     | Status          | Notes                                                                                                                                                                                                                                       | Evidence source                                                                                           |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ArtPoll / ArtPollReply discovery         | implemented     | Core discovery behavior and product identity are active                                                                                                                                                                                     | `docs/IPC_API_CONTRACT.md`, `docs/development/TESTING.md`                                                 |
| ArtDmx ingest (512 handling)             | implemented     | Hot path + viewport emission architecture in place                                                                                                                                                                                          | `docs/architecture/ARCHITECTURE.md`, `docs/IPC_API_CONTRACT.md`                                           |
| ArtSync handling                         | partial         | Supported in contract/events; verify source matching behavior per policy                                                                                                                                                                    | `docs/IPC_API_CONTRACT.md`, `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`                |
| ArtAddress config + verify-after-write   | partial         | Command path present; verification semantics must stay strict. Virtual-network `swisson-xnd8` simulation now applies Port Name / Long Name / LED commands and emits follow-up PollReply state (`Status1`, `NodeReport`) for lab validation. | `docs/IPC_API_CONTRACT.md`, `docs/development/TESTING.md`, `docs/diagnostics/DIAGNOSTIC_EVENT_CATALOG.md` |
| ArtIpProg command/reply                  | implemented     | Command + DTO path documented                                                                                                                                                                                                               | `docs/IPC_API_CONTRACT.md`                                                                                |
| ArtDiagData ingestion                    | implemented     | Snapshot + event flow documented                                                                                                                                                                                                            | `docs/IPC_API_CONTRACT.md`                                                                                |
| ArtCommand / ArtTrigger wire correctness | partial         | Historical malformed layout issue reviewed; enforce spec checks                                                                                                                                                                             | `docs/development/WIRESHARK_MALFORMED_REVIEW.md`                                                          |
| TOD/RDM advanced workflow                | planned/partial | Policy guidance exists; implementation depth varies                                                                                                                                                                                         | `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`                                            |
| TimeCode / TimeSync events               | implemented     | Event surface documented in IPC contract                                                                                                                                                                                                    | `docs/IPC_API_CONTRACT.md`                                                                                |

## Required Update Triggers

Update this matrix in the same change when:

- parser dispatch behavior changes,
- packet builder layouts change,
- opcode support transitions (`planned` -> `partial` -> `implemented`),
- test evidence location changes.

## Cross References

- Normative protocol source: `docs/art-net4.txt`
- Protocol patterns: `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`
- Testing policy: `TESTS.md`
