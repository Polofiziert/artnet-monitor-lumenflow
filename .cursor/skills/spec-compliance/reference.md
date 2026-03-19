# Art-Net 4 OpCode Field Layouts

Per-OpCode wire formats from the Art-Net 4 specification (Artistic Licence Ltd).
All offsets are from the start of the UDP payload.

---

## OpPoll (0x2000)

Sent to discover devices on the network.

| Offset | Size | Field                | Endian | Description                                                                                    |
| ------ | ---- | -------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| 0      | 8    | ID                   | —      | `"Art-Net\0"`                                                                                  |
| 8      | 2    | OpCode               | LE     | 0x2000                                                                                         |
| 10     | 1    | ProtVerHi            | —      | 0x00                                                                                           |
| 11     | 1    | ProtVerLo            | —      | 0x0e (14)                                                                                      |
| 12     | 1    | Flags                | —      | Bit 0: deprecated (was DiagPriority), Bit 1: send ArtPollReply on change, Bit 2: targeted mode |
| 13     | 1    | DiagPriority         | —      | 0x00 = DpAll, 0x10 = DpLow … 0x80 = DpCritical                                                 |
| 14     | 2    | TargetPortAddrTop    | LE     | Top of targeted port range (only if Flags bit 5 set)                                           |
| 16     | 2    | TargetPortAddrBottom | LE     | Bottom of targeted port range                                                                  |

**Total fixed size:** 18 bytes (min 14 bytes without targeted fields).

---

## OpPollReply (0x2100)

Sent in response to OpPoll. Contains node configuration.

| Offset | Size | Field          | Endian | Description                      |
| ------ | ---- | -------------- | ------ | -------------------------------- |
| 0      | 8    | ID             | —      | `"Art-Net\0"`                    |
| 8      | 2    | OpCode         | LE     | 0x2100                           |
| 10     | 4    | IpAddress      | —      | Node's IP (network byte order)   |
| 14     | 2    | Port           | LE     | 0x1936 (6454)                    |
| 16     | 2    | VersInfoH/L    | BE     | Firmware version                 |
| 18     | 1    | NetSwitch      | —      | Bits 14-8 of port-address        |
| 19     | 1    | SubSwitch      | —      | Bits 7-4 of port-address         |
| 20     | 2    | Oem            | BE     | OEM value                        |
| 22     | 1    | UbeaVersion    | —      | UBEA firmware version            |
| 23     | 1    | Status1        | —      | General status register          |
| 24     | 2    | EstaMan        | LE     | ESTA manufacturer code           |
| 26     | 18   | ShortName      | —      | Null-terminated, max 18 chars    |
| 44     | 64   | LongName       | —      | Null-terminated, max 64 chars    |
| 108    | 64   | NodeReport     | —      | Textual status report            |
| 172    | 2    | NumPortsH/L    | BE     | Number of input/output ports     |
| 174    | 4    | PortTypes      | —      | Port type per port (4 ports max) |
| 178    | 4    | GoodInput      | —      | Input status per port            |
| 182    | 4    | GoodOutput     | —      | Output status per port           |
| 186    | 4    | SwIn           | —      | Input universe address per port  |
| 190    | 4    | SwOut          | —      | Output universe address per port |
| 194    | 1    | AcnPriority    | —      | sACN priority (if supported)     |
| 195    | 1    | SwMacro        | —      | Macro key trigger values         |
| 196    | 1    | SwRemote       | —      | Remote trigger values            |
| 197    | 3    | Spare          | —      | Reserved (set to 0)              |
| 200    | 1    | Style          | —      | Equipment style code             |
| 201    | 6    | Mac            | —      | MAC address (Hi first)           |
| 207    | 4    | BindIp         | —      | IP of root device if bound       |
| 211    | 1    | BindIndex      | —      | Order of bound devices           |
| 212    | 1    | Status2        | —      | Extended status flags            |
| 213    | 4    | GoodOutputB    | —      | Additional output status         |
| 217    | 1    | Status3        | —      | Art-Net 4 status flags           |
| 218    | 6    | DefResp        | —      | Default responder UID            |
| 224    | 2    | UserH/L        | BE     | User-assigned value              |
| 226    | 2    | RefreshRateH/L | BE     | Refresh rate (Hz)                |
| 228    | 11   | Filler         | —      | Reserved, zero-pad to 239 bytes  |

**Total fixed size:** 239 bytes.

---

## OpDmx / OpOutput (0x5000)

Carries DMX512 channel data.

| Offset | Size | Field        | Endian | Description                                 |
| ------ | ---- | ------------ | ------ | ------------------------------------------- |
| 0      | 8    | ID           | —      | `"Art-Net\0"`                               |
| 8      | 2    | OpCode       | LE     | 0x5000                                      |
| 10     | 1    | ProtVerHi    | —      | 0x00                                        |
| 11     | 1    | ProtVerLo    | —      | 0x0e                                        |
| 12     | 1    | Sequence     | —      | 0x00 disables sequencing, 0x01–0xFF rolling |
| 13     | 1    | Physical     | —      | Physical input port (informational)         |
| 14     | 2    | SubUni + Net | LE     | 15-bit port-address: Net(14:8), SubUni(7:0) |
| 16     | 2    | LengthHi/Lo  | BE     | DMX data length (2–512, must be even)       |
| 18     | N    | Data         | —      | DMX512 channel data (N = Length)            |

**Total size:** 18 + Length bytes.

---

## OpAddress (0x6000)

Programs node settings (port-addresses, names, commands).

| Offset | Size | Field       | Endian | Description                                    |
| ------ | ---- | ----------- | ------ | ---------------------------------------------- |
| 0      | 8    | ID          | —      | `"Art-Net\0"`                                  |
| 8      | 2    | OpCode      | LE     | 0x6000                                         |
| 10     | 1    | ProtVerHi   | —      | 0x00                                           |
| 11     | 1    | ProtVerLo   | —      | 0x0e                                           |
| 12     | 1    | NetSwitch   | —      | Bits 14-8 of port-address. Bit 7 = write flag. |
| 13     | 1    | BindIndex   | —      | Bind index (0 = root)                          |
| 14     | 18   | ShortName   | —      | Null-terminated ASCII, max 18 chars            |
| 32     | 64   | LongName    | —      | Null-terminated ASCII, max 64 chars            |
| 96     | 4    | SwIn        | —      | Input port universe (bit 7 = write)            |
| 100    | 4    | SwOut       | —      | Output port universe (bit 7 = write)           |
| 104    | 1    | SubSwitch   | —      | Bits 7-4 of port-address. Bit 7 = write flag.  |
| 105    | 1    | AcnPriority | —      | sACN priority (1-200, 0 = no change)           |
| 106    | 1    | Command     | —      | Node configuration command (see spec table)    |

**Total fixed size:** 107 bytes.

### Command field values (common)

| Value | Name           | Description                    |
| ----- | -------------- | ------------------------------ |
| 0x00  | AcNone         | No action                      |
| 0x01  | AcCancelMerge  | Cancel merge for all ports     |
| 0x02  | AcLedNormal    | Normal LED operation           |
| 0x03  | AcLedMute      | Mute LEDs                      |
| 0x04  | AcLedLocate    | Blink LEDs for identification  |
| 0x05  | AcResetRxFlags | Reset all receive flags        |
| 0x10  | AcMergeLtp0    | Port 0 merge mode = LTP        |
| 0x50  | AcMergeHtp0    | Port 0 merge mode = HTP        |
| 0x90  | AcDirNormal0   | Set Port 0 direction to output |
| 0xC0  | AcDirInput0    | Set Port 0 direction to input  |

---

## OpSync (0x5200)

Forces synchronous output of previously received OpDmx data.

| Offset | Size | Field     | Endian | Description              |
| ------ | ---- | --------- | ------ | ------------------------ |
| 0      | 8    | ID        | —      | `"Art-Net\0"`            |
| 8      | 2    | OpCode    | LE     | 0x5200                   |
| 10     | 1    | ProtVerHi | —      | 0x00                     |
| 11     | 1    | ProtVerLo | —      | 0x0e                     |
| 12     | 2    | Aux1/Aux2 | —      | Reserved (transmit as 0) |

**Total fixed size:** 14 bytes.

---

## OpTimeCode (0x9700)

Transports timecode data over the Art-Net network.

| Offset | Size | Field     | Endian | Description                                                 |
| ------ | ---- | --------- | ------ | ----------------------------------------------------------- |
| 0      | 8    | ID        | —      | `"Art-Net\0"`                                               |
| 8      | 2    | OpCode    | LE     | 0x9700                                                      |
| 10     | 1    | ProtVerHi | —      | 0x00                                                        |
| 11     | 1    | ProtVerLo | —      | 0x0e                                                        |
| 12     | 2    | Filler    | —      | Reserved (transmit as 0)                                    |
| 14     | 1    | Frames    | —      | Frames (0–29)                                               |
| 15     | 1    | Seconds   | —      | Seconds (0–59)                                              |
| 16     | 1    | Minutes   | —      | Minutes (0–59)                                              |
| 17     | 1    | Hours     | —      | Hours (0–23)                                                |
| 18     | 1    | Type      | —      | 0=Film(24fps), 1=EBU(25fps), 2=DF(29.97fps), 3=SMPTE(30fps) |

**Total fixed size:** 19 bytes.

---

## 15-bit Port-Address Decoding

Art-Net uses a 15-bit address space for universes:

```
Bit:  14  13  12  11  10  9   8   7   6   5   4   3   2   1   0
      |---- Net (7 bits) ----|  |SubNet| |--- Universe (4 bits)--|
                                (4 bits)
```

- **Net:** 0–127 (bits 14:8)
- **Sub-Net:** 0–15 (bits 7:4)
- **Universe:** 0–15 (bits 3:0)

In OpDmx, the `SubUni` byte carries `SubNet:Universe` and the `Net` byte carries the Net value.

```rust
fn decode_port_address(sub_uni: u8, net: u8) -> u16 {
    ((net as u16 & 0x7F) << 8) | sub_uni as u16
}
```

---

## Hex Constants for Test Packets

Art-Net header as hex (use in all test packets):

```
0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00
```

Protocol version (big-endian 14):

```
0x00, 0x0e
```
