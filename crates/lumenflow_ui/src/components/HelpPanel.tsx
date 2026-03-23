import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import type { HelpSection } from "../lib/menuEvents";

export interface HelpPanelProps {
  section: () => HelpSection;
  onClose: () => void;
}

const HelpPanel: Component<HelpPanelProps> = (props) => {
  let overviewRef!: HTMLDivElement;
  let manualRef!: HTMLDivElement;
  let aboutRef!: HTMLDivElement;

  createEffect(() => {
    const s = props.section();
    const el =
      s === "overview"
        ? overviewRef
        : s === "manual"
          ? manualRef
          : aboutRef;
    queueMicrotask(() => el?.scrollIntoView({ block: "start", behavior: "smooth" }));
  });

  return (
    <>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm"
        onClick={() => props.onClose()}
      />
      <div
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[min(560px,85vh)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-edge bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="help-panel-title"
      >
        <div class="flex shrink-0 items-center justify-between border-b border-edge px-5 py-3">
          <h2
            id="help-panel-title"
            class="text-sm font-semibold tracking-wide text-primary"
          >
            LumenFlow Help
          </h2>
          <button
            type="button"
            onClick={() => props.onClose()}
            class="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-secondary"
          >
            <span class="sr-only">Close</span>
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-xs text-secondary">
          <div ref={overviewRef} class="mb-6 scroll-mt-2">
            <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
              Features
            </h3>
            <p class="mb-2 leading-relaxed">
              LumenFlow monitors Art-Net 4 traffic: live DMX universes, device
              discovery, routing insight, and diagnostics. Use the header tabs
              or{" "}
              <kbd class="rounded bg-obsidian px-1 font-mono text-[10px] text-teal">
                1
              </kbd>
              –
              <kbd class="rounded bg-obsidian px-1 font-mono text-[10px] text-teal">
                4
              </kbd>{" "}
              to switch views.
            </p>
            <ul class="list-inside list-disc space-y-1 text-[11px] text-muted">
              <li>
                <strong class="text-secondary">Dashboard</strong> — universe
                overview and network load.
              </li>
              <li>
                <strong class="text-secondary">Inspector</strong> — channel
                grid and detail for one universe.
              </li>
              <li>
                <strong class="text-secondary">Routing Matrix</strong> — who
                sends and receives Art-Net for each universe.
              </li>
              <li>
                <strong class="text-secondary">Devices</strong> — discovered
                nodes, diagnostics, and IP configuration where supported.
              </li>
            </ul>
          </div>

          <div ref={manualRef} class="mb-6 scroll-mt-2 border-t border-edge pt-5">
            <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
              User manual
            </h3>
            <p class="mb-2 leading-relaxed text-[11px] text-muted">
              The full guide covers views, universe notation (Net:SubNet:Universe),
              charts (network load and inter-packet arrival), routing matrix
              behavior, settings, and troubleshooting. Protocol details align
              with the Art-Net 4 specification (Artistic Licence); use{" "}
              <strong class="text-secondary">Help → Art-Net 4 Specification</strong>{" "}
              to open the official document.
            </p>
            <p class="text-[11px] text-muted">
              <strong class="text-secondary">Search:</strong> press{" "}
              <kbd class="rounded bg-obsidian px-1 font-mono text-[10px]">
                {/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "⌘" : "Ctrl"}+K
              </kbd>{" "}
              to focus the header search field.
            </p>
          </div>

          <div ref={aboutRef} class="scroll-mt-2 border-t border-edge pt-5">
            <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
              About
            </h3>
            <p class="text-[11px] text-muted">
              <span class="font-semibold text-secondary">LumenFlow</span> — Art-Net
              4 monitoring and control. See the window title bar for version
              information.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default HelpPanel;
