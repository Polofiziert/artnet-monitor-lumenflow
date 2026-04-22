export const portFieldKey = (bindIndex: number, slot: number) =>
  `port:${bindIndex}:${slot}`;

export const outFieldKey = (bindIndex: number, slot: number) =>
  `out:${bindIndex}:${slot}`;

export const inFieldKey = (bindIndex: number, slot: number) =>
  `in:${bindIndex}:${slot}`;

/** Stable key for selection within one product's port list. */
export const portSelectionKey = (bindIndex: number, slot: number) =>
  `${bindIndex}:${slot}`;

/** Keys for `send_art_address` wire-state PollReply verification (see `pendingEdits.ts`). */
export const wrRdmKey = (bindIndex: number, slot: number) =>
  `wr_rdm:${bindIndex}:${slot}`;

export const wrMergeLtpKey = (bindIndex: number, slot: number) =>
  `wr_ltp:${bindIndex}:${slot}`;

export const wrSacnKey = (bindIndex: number, slot: number) =>
  `wr_sacn:${bindIndex}:${slot}`;

export const wrStyleContinuousKey = (bindIndex: number, slot: number) =>
  `wr_sty:${bindIndex}:${slot}`;

export const wrDirTxKey = (bindIndex: number, slot: number) =>
  `wr_dtx:${bindIndex}:${slot}`;

export const wrDirRxKey = (bindIndex: number, slot: number) =>
  `wr_drx:${bindIndex}:${slot}`;
