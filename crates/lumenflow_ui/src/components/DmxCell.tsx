import type { Component } from "solid-js";

interface DmxCellProps {
  channel: number;
  value: () => number;
  isHovered?: () => boolean;
  isSelected?: () => boolean;
  onHover?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
}

const DmxCell: Component<DmxCellProps> = (props) => {
  return (
    <div
      data-testid={`dmx-cell-${props.channel}`}
      class="flex h-7 items-center justify-center bg-obsidian font-mono text-xs tabular-nums transition-colors duration-75 select-none cursor-pointer"
      classList={{
        "text-muted":
          props.value() === 0 && !props.isHovered?.() && !props.isSelected?.(),
        "text-teal shadow-[0_0_6px_#2DD4BF33]":
          props.value() > 0 &&
          props.value() < 255 &&
          !props.isHovered?.() &&
          !props.isSelected?.(),
        "text-white font-semibold shadow-[0_0_8px_#2DD4BF55]":
          props.value() === 255 &&
          !props.isHovered?.() &&
          !props.isSelected?.(),
        "ring-1 ring-teal/40 bg-teal/5 z-10": props.isHovered?.() ?? false,
        "ring-1 ring-teal/60 bg-teal/10 z-20": props.isSelected?.() ?? false,
      }}
      title={`Ch ${props.channel}: ${props.value()}`}
      onMouseEnter={props.onHover}
      onMouseLeave={props.onLeave}
      onClick={props.onClick}
    >
      {props.value()}
    </div>
  );
};

export default DmxCell;
