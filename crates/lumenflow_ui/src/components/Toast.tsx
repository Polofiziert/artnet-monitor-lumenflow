import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { toasts, dismissToast, type ToastType } from "../lib/toast";

const typeStyles: Record<
  ToastType,
  { bg: string; border: string; text: string; dot: string }
> = {
  info: {
    bg: "bg-surface",
    border: "border-edge",
    text: "text-secondary",
    dot: "bg-teal",
  },
  success: {
    bg: "bg-surface",
    border: "border-teal/20",
    text: "text-teal",
    dot: "bg-teal",
  },
  warning: {
    bg: "bg-surface",
    border: "border-amber/20",
    text: "text-amber",
    dot: "bg-amber",
  },
  error: {
    bg: "bg-surface",
    border: "border-error/20",
    text: "text-error",
    dot: "bg-error",
  },
};

const ToastContainer: Component = () => {
  return (
    <Show when={toasts().length > 0}>
      <div class="fixed bottom-10 right-4 z-50 flex flex-col gap-2">
        <For each={toasts()}>
          {(t) => {
            const s = typeStyles[t.type];
            return (
              <div
                class={`flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-lg ${s.bg} ${s.border} animate-[slideIn_0.2s_ease-out]`}
                onClick={() => dismissToast(t.id)}
              >
                <span
                  class={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.dot}`}
                />
                <span class={`text-xs ${s.text}`}>{t.message}</span>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export default ToastContainer;
