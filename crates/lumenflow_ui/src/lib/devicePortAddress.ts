export function formatPortAddress(p: number): string {
  const net = (p >> 8) & 0x7f;
  const sub = (p >> 4) & 0x0f;
  const uni = p & 0x0f;
  return `${net}:${sub}:${uni}`;
}

export function parsePortAddress(input: string): { value?: number; error?: string } {
  const s = input.trim();
  if (!s) return { error: "Empty port address." };
  if (/^\d+$/.test(s)) {
    const v = Number(s);
    if (!Number.isFinite(v) || v < 0 || v > 0x7fff) {
      return { error: "Port address must be 0..32767." };
    }
    return { value: v };
  }
  const parts = s.split(":").map((p) => p.trim());
  if (parts.length !== 3)
    return { error: "Expected Net:SubNet:Universe (e.g. 0:0:1)." };
  const [netS, subS, uniS] = parts;
  const net = Number(netS);
  const sub = Number(subS);
  const uni = Number(uniS);
  if (![net, sub, uni].every((n) => Number.isInteger(n))) {
    return { error: "Net/SubNet/Universe must be integers." };
  }
  if (net < 0 || net > 127) return { error: "Net must be 0..127." };
  if (sub < 0 || sub > 15) return { error: "SubNet must be 0..15." };
  if (uni < 0 || uni > 15) return { error: "Universe must be 0..15." };
  return { value: (net << 8) | (sub << 4) | uni };
}

/**
 * ArtAddress universe edits: when the node does **not** report 15-bit port addressing
 * (PollReply Status2 bit3 clear), only the universe nibble (last 4 bits) may change — Net/Sub
 * must match the port's current prefix. When Status2 bit3 is set (`node_supports_15bit_address`),
 * callers should skip this check and allow the full 15-bit value.
 */
export function netSubMismatchError(
  nextAddr: number,
  currentAddr: number
): string | null {
  if (((nextAddr >> 4) & 0x7ff) !== ((currentAddr >> 4) & 0x7ff)) {
    return "Net/SubNet must stay the same for this port: PollReply Status2 bit3 is clear (8-bit addressing). Only the universe nibble (0..15) can be changed here. For full 15-bit edits, the node must advertise Status2 bit3; the backend then programs NetSwitch/SubSwitch/SwOut together.";
  }
  return null;
}
