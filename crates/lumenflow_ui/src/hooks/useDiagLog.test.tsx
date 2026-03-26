import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { createMemo } from "solid-js";
import { useDiagLog, priorityColor, priorityLabel } from "./useDiagLog";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

type ListenCb = (event: { payload: any }) => void;
let diagListener: ListenCb | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_evt: string, cb: ListenCb) => {
    diagListener = cb;
    return () => {
      diagListener = null;
    };
  }),
}));

describe("useDiagLog", () => {
  beforeEach(() => {
    diagListener = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("priorityLabel/priorityColor map known priorities and default", () => {
    expect(priorityLabel(0x10)).toBe("LOW");
    expect(priorityLabel(0x40)).toBe("MED");
    expect(priorityLabel(0x80)).toBe("HIGH");
    expect(priorityLabel(0xe0)).toBe("CRIT");
    expect(priorityLabel(0xf0)).toBe("VOL");
    expect(priorityLabel(0x01)).toBe("???");

    expect(priorityColor(0x10)).toBe("text-muted");
    expect(priorityColor(0x80)).toBe("text-amber");
    expect(priorityColor(0xe0)).toBe("text-error");
    expect(priorityColor(0xf0)).toBe("text-teal");
    expect(priorityColor(0x01)).toBe("text-muted");
  });

  it("loads initial entries and appends events (capped at 512)", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        timestamp_nanos: 0,
        priority: 0x40,
        message: "Boot",
        source_ip: "10.0.0.1",
      },
    ]);

    render(() => {
      const state = useDiagLog();
      const count = createMemo(() => state.entries.length);
      return <div data-testid="count">{String(count())}</div>;
    });

    const countEl = await screen.findByTestId("count");
    await waitFor(() => {
      expect(countEl.textContent).toBe("1");
    });
    expect(diagListener).toBeTypeOf("function");

    diagListener?.({
      payload: { priority: 0x80, message: "Warn", sourceIp: null },
    });
    await waitFor(() => {
      expect(countEl.textContent).toBe("2");
    });

    for (let i = 0; i < 600; i++) {
      diagListener?.({
        payload: { priority: 0x10, message: `m${i}`, sourceIp: "x" },
      });
    }
    await waitFor(() => {
      expect(countEl.textContent).toBe("512");
    });
  });
});

