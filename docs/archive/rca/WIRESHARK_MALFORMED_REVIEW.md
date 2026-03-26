# Wireshark Malformed Packet Review — ArtCommand & ArtTrigger

**Date:** March 18, 2026  
**Source:** Art-Net 4 Specification (Revision DP 23/10/2025), Wireshark dissector `packet-artnet.c`

---

## Executive Summary

Wireshark correctly flags **ArtCommand** and **ArtTrigger** packets as malformed because our builders omit required fields and use the wrong byte layout. The Art-Net 4 spec and Wireshark dissector agree; our implementation diverges.

---

## 1. ArtCommand (OpCode 0x2400)

### Wireshark Error

```
ESTA Code: SWISSON AG (0x5377)
Length: 28533
[Malformed Packet: ARTNET]
```

### Root Cause

Our `build_art_command()` sends: **Header (12) + Data** directly.

The Art-Net 4 spec (Section ArtCommand packet definition) requires:

| Field | Size | Description                                       |
| ----- | ---- | ------------------------------------------------- |
| 1–4   | 12   | ID, OpCode, ProtVerHi, ProtVerLo                  |
| 5–6   | 2    | **EstaManHi, EstaManLo** — ESTA manufacturer code |
| 7–8   | 2    | **LengthHi, LengthLo** — length of text array     |
| 9     | N    | Data[Length] — ASCII command, null-terminated     |

Standard commands (SwoutText, SwinText) **shall be transmitted with EstaMan = 0xFFFF**.

### What We Send

```
Offset 12-13: 0x53 0x77  ("Sw" — start of "SwoutText=Test&")
Offset 14-15: 0x6F 0x75  ("ou" — next chars)
```

Wireshark interprets bytes 12–13 as EstaMan (0x5377 = "Sw") and 14–15 as Length (0x6F75 = 28533), then fails when using that length.

### Fix

1. Insert **EstaMan** = 0xFFFF (2 bytes, big-endian) after header.
2. Insert **Length** (2 bytes, big-endian) = command length including null terminator.
3. Append null terminator to Data if not present.

---

## 2. ArtTrigger (OpCode 0x9900)

### Wireshark Error

```
filler: ffff
OEM: Artistic Licence Engineering Ltd: Dmx Hub (0x0000)
[Malformed Packet: ARTNET]
```

### Root Cause

Our `build_art_trigger()` sends: **Header (12) + OEM (2 LE) + Key (1) + SubKey (1)** = 16 bytes total.

The Art-Net 4 spec (Section ArtTrigger packet definition) requires:

| Field | Size | Description                                   |
| ----- | ---- | --------------------------------------------- |
| 1–4   | 12   | ID, OpCode, ProtVerHi, ProtVerLo              |
| 5     | 1    | **Filler1** — set to zero                     |
| 6     | 1    | **Filler2** — set to zero                     |
| 7–8   | 2    | **OemHi, OemLo** — OEM code (high byte first) |
| 9     | 1    | Key                                           |
| 10    | 1    | SubKey                                        |
| 11    | 512  | **Data[512]** — fixed 512-byte payload        |

Revision DD: "Missing filler fields in ArtTrigger corrected."

### What We Send

```
Offset 12-13: 0xFF 0xFF  (our OEM in LE — we omit filler)
Offset 14-15: 0x00 0x00  (our Key=0, SubKey=0)
```

Wireshark expects:

- 12–13: Filler (0x0000) — we send OEM
- 14–15: OEM (BE) — we send Key+SubKey
- 16: Key
- 17: SubKey
- 18–529: Data (512 bytes) — we send nothing

So Wireshark reads our OEM as filler ("ffff"), our Key+SubKey as OEM (0x0000), and then tries to read 512 bytes of Data that are not there → malformed.

### Additional Issues

1. **OEM endianness:** Spec uses OemHi, OemLo (high byte first) → **big-endian**. We use little-endian.
2. **Missing payload:** Spec requires a fixed 512-byte Data array. We send none.

### Fix

1. Insert **Filler1, Filler2** (2 bytes, zero) after header.
2. Send **OEM** in **big-endian**.
3. Append **512-byte Data** payload (zero-padded when Key 0–3, payload "not used").

---

## 3. Spec vs Implementation Summary

| Packet     | Our Layout                        | Spec Layout                                               |
| ---------- | --------------------------------- | --------------------------------------------------------- |
| ArtCommand | Header + Data                     | Header + EstaMan(2) + Length(2) + Data                    |
| ArtTrigger | Header + OEM(2 LE) + Key + SubKey | Header + Filler(2) + OEM(2 BE) + Key + SubKey + Data(512) |

---

## 4. References

- Art-Net 4 Specification, Document Revision 1.4dp 23/10/2025
- Wireshark `packet-artnet.c`: `dissect_artnet_command`, `dissect_artnet_trigger`
- `.cursor/skills/spec-compliance/reference.md` — update with correct layouts
