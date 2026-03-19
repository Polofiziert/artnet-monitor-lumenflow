import type { Component } from "solid-js";
import { Show } from "solid-js";

/**
 * Non-layout-occupying overlay for details and tooltips.
 * Renders content in a fixed/absolute layer so it does not affect flex layout
 * (avoids grid reflow and hover flicker when used for channel detail).
 */
interface FloatingPopoverProps {
  show: boolean;
  /** Inline position: "right" anchors to the right of the container. */
  position?: "right" | "left";
  /** Optional class for the overlay panel (e.g. width, padding). */
  class?: string;
  children: unknown;
}

const FloatingPopover: Component<FloatingPopoverProps> = (props) => {
  return (
    <Show when={props.show}>
      <div
        class={`absolute top-0 z-20 rounded-lg border border-edge bg-surface shadow-xl ${props.position === "left" ? "left-0" : "right-0"} ${props.class ?? "w-64 p-4"}`}
        style={{ bottom: 0 }}
        data-testid="floating-popover"
      >
        {props.children as never}
      </div>
    </Show>
  );
};

export default FloatingPopover;
