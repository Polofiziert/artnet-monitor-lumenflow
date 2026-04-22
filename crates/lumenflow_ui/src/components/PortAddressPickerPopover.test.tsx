import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { PortAddressPickerPopover } from "./PortAddressPickerPopover";

describe("PortAddressPickerPopover", () => {
  it("disables Net/Sub when 8-bit addressing (allowNetSubEdit false)", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <PortAddressPickerPopover
        baselineAddr15={0x123}
        initialAddr15={0x123}
        allowNetSubEdit={false}
        compatibilityNotes={["8-bit note"]}
        onApply={onApply}
        onClose={onClose}
      />
    ));
    expect((screen.getByTestId("port-addr-picker-net") as HTMLInputElement).disabled).toBe(
      true
    );
    expect((screen.getByTestId("port-addr-picker-sub") as HTMLInputElement).disabled).toBe(
      true
    );
    expect((screen.getByTestId("port-addr-picker-uni") as HTMLInputElement).disabled).toBe(
      false
    );
    expect(screen.getByText(/8-bit note/)).toBeTruthy();
  });

  it("applies on Enter from universe field", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(() => (
      <PortAddressPickerPopover
        baselineAddr15={0x0105}
        initialAddr15={0x0105}
        allowNetSubEdit
        onApply={onApply}
        onClose={onClose}
      />
    ));
    const uni = screen.getByTestId("port-addr-picker-uni15");
    fireEvent.input(uni, { target: { value: "261" } });
    fireEvent.keyDown(uni, { key: "Enter", preventDefault: vi.fn() });
    expect(onApply).toHaveBeenCalledWith(261);
    expect(onClose).toHaveBeenCalled();
  });
});
