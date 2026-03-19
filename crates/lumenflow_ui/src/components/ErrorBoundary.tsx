import { ErrorBoundary } from "solid-js";
import type { ParentComponent } from "solid-js";

const AppErrorBoundary: ParentComponent = (props) => {
  return (
    <ErrorBoundary
      fallback={(err, reset) => {
        console.error("[LumenFlow] Render error:", err);
        return (
          <div class="flex h-full items-center justify-center p-8">
            <div class="max-w-md rounded-lg border border-error/20 bg-surface p-6 text-center">
              <div class="mb-3 text-error">
                <svg
                  class="mx-auto h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <h3 class="mb-2 text-sm font-medium text-error">
                Something went wrong
              </h3>
              <p class="mb-4 font-mono text-xs text-muted break-all">
                {err instanceof Error ? err.message : String(err)}
              </p>
              <button
                onClick={reset}
                class="rounded-md border border-error/20 bg-error/10 px-4 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/20"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
};

export default AppErrorBoundary;
