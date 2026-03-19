import type { Component } from "solid-js";
import { Show } from "solid-js";
import {
  useTimeCode,
  formatTimeCode,
  timecodeTypeLabel,
} from "../hooks/useTimeCode";

interface TimeCodeClockProps {
  class?: string;
}

const TimeCodeClock: Component<TimeCodeClockProps> = (props) => {
  const tc = useTimeCode();

  return (
    <Show when={tc()}>
      {(t) => (
        <div
          class={`flex items-center gap-2 rounded-md border border-teal/20 bg-teal/5 px-2 py-1 ${props.class ?? ""}`}
          title={`Timecode: ${timecodeTypeLabel(t().timecodeType)} (${t().timecodeType})`}
        >
          <span class="text-[10px] font-medium text-teal uppercase tracking-wider">
            {timecodeTypeLabel(t().timecodeType)}
          </span>
          <span class="font-mono text-sm tabular-nums text-teal">
            {formatTimeCode(t())}
          </span>
        </div>
      )}
    </Show>
  );
};

export default TimeCodeClock;
