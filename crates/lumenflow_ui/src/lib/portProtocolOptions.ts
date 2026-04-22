import { portProtocolLabel } from "./portProtocolLabel";

/** PortTypes bits 5..0 (Art-Net 4 PollReply). Values 0..6 are named in the spec; others shown as hex. */
export const PORT_PROTOCOL_SELECT_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
}> = [
  { value: 0, label: portProtocolLabel(0) },
  { value: 1, label: portProtocolLabel(1) },
  { value: 2, label: portProtocolLabel(2) },
  { value: 3, label: portProtocolLabel(3) },
  { value: 4, label: portProtocolLabel(4) },
  { value: 5, label: portProtocolLabel(5) },
  { value: 6, label: portProtocolLabel(6) },
];
