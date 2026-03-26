import { afterEach, vi } from "vitest";
import { cleanup } from "@solidjs/testing-library";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
