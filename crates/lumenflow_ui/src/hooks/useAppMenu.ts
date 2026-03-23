/**
 * Native OS menu bar (Tauri): View, Help, and related actions.
 * Call once on app load (e.g. from App onMount).
 *
 * We **append** to the existing View/Help submenus from `Menu.default()` (platform entries stay;
 * this matches typical macOS/Windows behavior). We only create a new submenu if the default menu
 * does not include that title (unusual).
 */
import { onMount } from "solid-js";
import { emit } from "@tauri-apps/api/event";
import {
  Menu,
  Submenu,
  MenuItem,
  PredefinedMenuItem,
} from "@tauri-apps/api/menu";
import {
  LUMENFLOW_MENU_EVENT,
  primaryMenuModifier,
  type MenuPayload,
} from "../lib/menuEvents";

function send(payload: MenuPayload) {
  void emit(LUMENFLOW_MENU_EVENT, payload);
}

async function findSubmenuByTitle(
  menu: Menu,
  title: string
): Promise<Submenu | null> {
  for (const item of await menu.items()) {
    if (item.kind !== "Submenu") continue;
    const sub = item as Submenu;
    if ((await sub.text()) === title) return sub;
  }
  return null;
}

async function indexOfSubmenuTitle(menu: Menu, title: string): Promise<number> {
  const items = await menu.items();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "Submenu") continue;
    const sub = item as Submenu;
    if ((await sub.text()) === title) return i;
  }
  return -1;
}

/** Keep existing items (e.g. OS “Enter Full Screen”); add a separator if needed, then our items. */
async function appendIntoSubmenu(
  sub: Submenu,
  newItems: Array<MenuItem | PredefinedMenuItem>
): Promise<void> {
  const existing = await sub.items();
  if (existing.length > 0) {
    await sub.append(await PredefinedMenuItem.new({ item: "Separator" }));
  }
  await sub.append(newItems);
}

export function useAppMenu() {
  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = primaryMenuModifier();
        const menu = await Menu.default();

        const viewItems = await Promise.all([
          MenuItem.new({
            id: "view-dashboard",
            text: "Dashboard",
            accelerator: `${mod}+1`,
            action: () => send({ kind: "view", view: "dashboard" }),
          }),
          MenuItem.new({
            id: "view-inspector",
            text: "Inspector",
            accelerator: `${mod}+2`,
            action: () => send({ kind: "view", view: "inspector" }),
          }),
          MenuItem.new({
            id: "view-routing",
            text: "Routing Matrix",
            accelerator: `${mod}+3`,
            action: () => send({ kind: "view", view: "routing" }),
          }),
          MenuItem.new({
            id: "view-devices",
            text: "Devices",
            accelerator: `${mod}+4`,
            action: () => send({ kind: "view", view: "devices" }),
          }),
          PredefinedMenuItem.new({ item: "Separator" }),
          MenuItem.new({
            id: "view-settings",
            text: "Settings…",
            accelerator: `${mod}+,`,
            action: () => send({ kind: "settings" }),
          }),
        ]);

        const helpItems = await Promise.all([
          MenuItem.new({
            id: "lumenflow-help",
            text: "LumenFlow Help",
            action: () => send({ kind: "help", section: "overview" }),
          }),
          MenuItem.new({
            id: "help-search",
            text: "Search",
            accelerator: `${mod}+K`,
            action: () => send({ kind: "focus-search" }),
          }),
          MenuItem.new({
            id: "manual",
            text: "User Manual…",
            action: () => send({ kind: "help", section: "manual" }),
          }),
          MenuItem.new({
            id: "artnet-spec",
            text: "Art-Net 4 Specification…",
            action: () => send({ kind: "open-artnet-spec" }),
          }),
          PredefinedMenuItem.new({ item: "Separator" }),
          MenuItem.new({
            id: "about",
            text: "About LumenFlow",
            action: () => send({ kind: "help", section: "about" }),
          }),
        ]);

        if (cancelled) return;

        let viewSub = await findSubmenuByTitle(menu, "View");
        if (viewSub) {
          await appendIntoSubmenu(viewSub, viewItems);
        } else {
          viewSub = await Submenu.new({ text: "View", items: viewItems });
          const windowIdx = await indexOfSubmenuTitle(menu, "Window");
          if (windowIdx >= 0) await menu.insert(viewSub, windowIdx);
          else await menu.append(viewSub);
        }

        let helpSub = await findSubmenuByTitle(menu, "Help");
        if (helpSub) {
          await appendIntoSubmenu(helpSub, helpItems);
        } else {
          helpSub = await Submenu.new({ text: "Help", items: helpItems });
          await menu.append(helpSub);
        }

        try {
          await helpSub.setAsHelpMenuForNSApp();
        } catch {
          /* Windows / Linux */
        }

        await menu.setAsAppMenu();
      } catch (e) {
        console.warn("Failed to set up app menu:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  });
}

export { LUMENFLOW_MENU_EVENT } from "../lib/menuEvents";
