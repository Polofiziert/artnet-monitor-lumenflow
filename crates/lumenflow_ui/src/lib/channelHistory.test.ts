import { describe, it, expect, beforeEach } from "vitest";
import { ChannelHistoryStore } from "./channelHistory";

describe("ChannelHistoryStore", () => {
  let store: ChannelHistoryStore;

  beforeEach(() => {
    store = new ChannelHistoryStore();
  });

  it("creates a universe lazily with 512 fixed-length histories", () => {
    const u = store.getOrCreateUniverse(1);
    expect(u).toHaveLength(512);
    expect(u[0]).toBeInstanceOf(Float32Array);
    expect(u[0]!.length).toBe(store.historyLength);
  });

  it("push shifts history and writes latest samples", () => {
    store.push(1, [10, 20, 30]);
    const h0 = store.getHistory(1, 0)!;
    const h1 = store.getHistory(1, 1)!;
    expect(h0[h0.length - 1]).toBe(10);
    expect(h1[h1.length - 1]).toBe(20);

    store.push(1, [11, 22]);
    expect(h0[h0.length - 2]).toBe(10);
    expect(h0[h0.length - 1]).toBe(11);
    expect(h1[h1.length - 2]).toBe(20);
    expect(h1[h1.length - 1]).toBe(22);
  });

  it("getHistory returns null for unknown universe and out-of-range channels", () => {
    expect(store.getHistory(123, 0)).toBeNull();
    store.getOrCreateUniverse(1);
    expect(store.getHistory(1, -1)).toBeNull();
    expect(store.getHistory(1, 512)).toBeNull();
  });

  it("clear removes all histories", () => {
    store.getOrCreateUniverse(1);
    store.clear();
    expect(store.getHistory(1, 0)).toBeNull();
  });
});
