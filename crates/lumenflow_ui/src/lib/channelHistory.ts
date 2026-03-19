const HISTORY_LENGTH = 64;

export class ChannelHistoryStore {
  private histories: Map<number, Float32Array[]> = new Map();

  getOrCreateUniverse(universeId: number): Float32Array[] {
    let history = this.histories.get(universeId);
    if (!history) {
      history = Array.from(
        { length: 512 },
        () => new Float32Array(HISTORY_LENGTH)
      );
      this.histories.set(universeId, history);
    }
    return history;
  }

  push(universeId: number, channels: ArrayLike<number>): void {
    const history = this.getOrCreateUniverse(universeId);
    for (let ch = 0; ch < 512 && ch < channels.length; ch++) {
      const buf = history[ch]!;
      buf.copyWithin(0, 1);
      buf[HISTORY_LENGTH - 1] = channels[ch] ?? 0;
    }
  }

  getHistory(universeId: number, channel: number): Float32Array | null {
    const history = this.histories.get(universeId);
    if (!history || channel < 0 || channel >= 512) return null;
    return history[channel] ?? null;
  }

  get historyLength(): number {
    return HISTORY_LENGTH;
  }

  clear(): void {
    this.histories.clear();
  }
}

export const globalHistory = new ChannelHistoryStore();
