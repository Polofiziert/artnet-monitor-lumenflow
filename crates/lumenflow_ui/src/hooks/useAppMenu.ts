/**
 * Sets up the native app menu with Help section (H1).
 * Call once on app load (e.g. from App onMount).
 */
import { onMount } from "solid-js";
import { emit } from "@tauri-apps/api/event";
import { Menu, Submenu, MenuItem } from "@tauri-apps/api/menu";

const HELP_OPEN_EVENT = "lumenflow-open-help";

export function useAppMenu() {
  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const menu = await Menu.default();
        const helpItems = await Promise.all([
          MenuItem.new({
            id: "lumenflow-help",
            text: "LumenFlow Help",
            action: () => emit(HELP_OPEN_EVENT),
          }),
          MenuItem.new({
            id: "help-search",
            text: "Search",
            accelerator: "Cmd+K",
            action: () => emit(HELP_OPEN_EVENT),
          }),
          MenuItem.new({
            id: "manual",
            text: "Manual",
            action: () => emit(HELP_OPEN_EVENT),
          }),
          MenuItem.new({
            id: "about",
            text: "About LumenFlow",
            action: () => emit(HELP_OPEN_EVENT),
          }),
        ]);
        const helpSubmenu = await Submenu.new({
          text: "Help",
          items: helpItems,
        });
        if (cancelled) return;
        await menu.append(helpSubmenu);
        // macOS: set as Help menu so the OS can add search
        try {
          await helpSubmenu.setAsHelpMenuForNSApp();
        } catch {
          // Unsupported on Windows/Linux
        }
      } catch (e) {
        console.warn("Failed to set up Help menu:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  });
}

export { HELP_OPEN_EVENT };
