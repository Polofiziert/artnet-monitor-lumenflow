/**
 * PortTypes bits 5..0 protocol code (Art-Net 4 PollReply).
 * Unknown codes fall back to a hex-style label for operator transparency.
 */
export function portProtocolLabel(protocolCode: number): string {
  const c = protocolCode & 0x3f;
  switch (c) {
    case 0:
      return "DMX512";
    case 1:
      return "MIDI";
    case 2:
      return "Avab";
    case 3:
      return "CMX";
    case 4:
      return "ADB";
    case 5:
      return "Art-Net";
    case 6:
      return "DALI";
    default:
      return `0x${c.toString(16).toUpperCase()}`;
  }
}
