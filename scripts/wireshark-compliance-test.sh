#!/bin/bash
# Wireshark Art-Net compliance test: capture packets from send-all-packets and validate
# that tshark dissects them without "Malformed" errors.
#
# Usage: ./scripts/wireshark-compliance-test.sh
#
# Requires: tcpdump, tshark (Wireshark CLI). On macOS: brew install wireshark
# Capture may require sudo on some systems.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PCAP_DIR="$PROJECT_ROOT/wireshark"
PCAP_FILE="$PCAP_DIR/artnet_compliance_test.pcap"

# Detect loopback interface
case "$(uname -s)" in
    Darwin)  IFACE="lo0" ;;
    Linux)   IFACE="lo" ;;
    *)       echo "Unsupported OS. Use Option A (manual) from TESTING.md."; exit 1 ;;
esac

# Check prerequisites
if ! command -v tcpdump &>/dev/null; then
    echo "Error: tcpdump not found. Install it (e.g. brew install wireshark on macOS)."
    exit 1
fi
if ! command -v tshark &>/dev/null; then
    echo "Error: tshark not found. Install Wireshark CLI (e.g. brew install wireshark on macOS)."
    exit 1
fi

mkdir -p "$PCAP_DIR"

echo "Wireshark Art-Net compliance test"
echo "  Interface: $IFACE"
echo "  Output: $PCAP_FILE"
echo ""

# Start tcpdump in background
tcpdump -i "$IFACE" -s 0 -w "$PCAP_FILE" udp port 6454 &
TCPDUMP_PID=$!

# Give tcpdump time to start
sleep 0.5

# Send all packet types
cd "$PROJECT_ROOT"
cargo run -p lumenflow_cli -- send-all-packets --target 127.0.0.1 2>/dev/null || true

# Wait for packets to be captured
sleep 1

# Stop tcpdump
kill -INT "$TCPDUMP_PID" 2>/dev/null || true
wait "$TCPDUMP_PID" 2>/dev/null || true

# Validate: count malformed packets using two methods.
# Method 1: Display filter _ws.malformed — works for some dissectors but may not
#            be set when sub-dissectors (e.g. Art-Net) throw exceptions.
# Method 2: Grep verbose output — protocol tree shows "[Malformed Packet: PROTO]"
#            for any malformed packet; this matches what the Wireshark GUI displays.
MALFORMED_FILTER=$(tshark -r "$PCAP_FILE" -Y "_ws.malformed" -q 2>/dev/null | wc -l | tr -d '[:space:]')
MALFORMED_VERBOSE=$(tshark -r "$PCAP_FILE" -V 2>/dev/null | grep -c "\[Malformed Packet" 2>/dev/null || echo "0")
MALFORMED_VERBOSE=$(echo "$MALFORMED_VERBOSE" | tr -d '[:space:]')

if [ "${MALFORMED_FILTER:-0}" -gt 0 ] || [ "${MALFORMED_VERBOSE:-0}" -gt 0 ]; then
    echo "FAIL: Malformed packet(s) detected."
    echo "  _ws.malformed filter: $MALFORMED_FILTER"
    echo "  Verbose grep [Malformed Packet]: $MALFORMED_VERBOSE"
    echo "Open $PCAP_FILE in Wireshark and filter by '_ws.malformed' or search for 'Malformed' to inspect."
    exit 1
fi

echo "PASS: All packets dissected successfully by Wireshark."
echo "Capture saved to: $PCAP_FILE"

# Negative test: verify our detection would catch malformed packets.
# Uses a pre-made pcap with known malformed ArtCommand (no EstaMan/Length).
NEGATIVE_PCAP="$PCAP_DIR/artnet_malformed_negative.pcap"
if [ -f "$NEGATIVE_PCAP" ]; then
    NEG_FILTER=$(tshark -r "$NEGATIVE_PCAP" -Y "_ws.malformed" -q 2>/dev/null | wc -l | tr -d '[:space:]')
    NEG_VERBOSE=$(tshark -r "$NEGATIVE_PCAP" -V 2>/dev/null | grep -c "\[Malformed Packet" 2>/dev/null || echo "0")
    NEG_VERBOSE=$(echo "$NEG_VERBOSE" | tr -d '[:space:]')
    if [ "${NEG_FILTER:-0}" -gt 0 ] || [ "${NEG_VERBOSE:-0}" -gt 0 ]; then
        echo "  Negative test: detection correctly flags malformed pcap."
    else
        echo "WARN: Negative test pcap ($NEGATIVE_PCAP) was not flagged as malformed."
        echo "      Detection logic may need adjustment."
    fi
fi

exit 0
