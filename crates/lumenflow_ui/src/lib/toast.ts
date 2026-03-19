import { createSignal } from "solid-js";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

let nextId = 0;

const [toasts, setToasts] = createSignal<Toast[]>([]);

export { toasts };

function removeToast(id: number): void {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

export function toast(
  message: string,
  type: ToastType = "info",
  duration = 3000
): void {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, type, message, duration }]);
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

export function dismissToast(id: number): void {
  removeToast(id);
}
