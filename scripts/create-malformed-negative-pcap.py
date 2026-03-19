#!/usr/bin/env python3
"""Create wireshark/artnet_malformed_negative.pcap for Wireshark compliance negative test.

Contains a malformed ArtCommand packet (Header + Data only, no EstaMan/Length).
Used to verify that wireshark-compliance-test.sh correctly detects malformed packets.
"""
import struct
import time

SCRIPT_DIR = __import__("pathlib").Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
PCAP_PATH = PROJECT_ROOT / "wireshark" / "artnet_malformed_negative.pcap"

# PCAP global header (libpcap format)
MAGIC = 0xA1B2C3D4
GLOBAL_HDR = struct.pack("<IHHiIII", MAGIC, 2, 4, 0, 0, 65535, 0)

# Malformed Art-Net ArtCommand: Header (12) + Data only — spec requires EstaMan + Length
PAYLOAD = bytes([
    0x41, 0x72, 0x74, 0x2D, 0x4E, 0x65, 0x74, 0x00,  # Art-Net\0
    0x00, 0x24, 0x00, 0x0E,  # OpCode 0x2400, ProtVer 14
    0x53, 0x77, 0x6F, 0x75, 0x74, 0x54, 0x65, 0x78,  # SwoutText
    0x74, 0x3D, 0x54, 0x65, 0x73, 0x74, 0x26, 0x00,  # =Test&\0
])

# DLT_NULL (loopback): 4-byte family + IP packet
IP_HDR = struct.pack(
    "!BBHHHBBHII",
    0x45, 0, 20 + 8 + len(PAYLOAD), 0, 0, 64, 17, 0,
    0x7F000001, 0x7F000001,  # 127.0.0.1
)
UDP_HDR = struct.pack("!HHHH", 61757, 6454, 8 + len(PAYLOAD), 0)
PKT_DATA = struct.pack("!I", 2) + IP_HDR + UDP_HDR + PAYLOAD

PKT_HDR = struct.pack("<IIII", int(time.time()), 0, len(PKT_DATA), len(PKT_DATA))

def main() -> None:
    PCAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PCAP_PATH, "wb") as f:
        f.write(GLOBAL_HDR)
        f.write(PKT_HDR)
        f.write(PKT_DATA)
    print(f"Created {PCAP_PATH}")

if __name__ == "__main__":
    main()
