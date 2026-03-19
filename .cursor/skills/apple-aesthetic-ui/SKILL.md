---
name: apple-aesthetic-ui
description: Refactor SolidJS components to match the LumenFlow Apple Pro-Lab dark aesthetic using Tailwind CSS. Use when styling UI components, building DMX grids, creating panels, or when the user mentions Pro-Lab, Apple aesthetic, dark mode UI, or visual polish.
---

# Apple Pro-Lab Aesthetic

Turn functional SolidJS components into polished, professional Pro-Lab interfaces using Tailwind CSS and fine-grained reactivity.

## Design Tokens

### Color Palette

| Token          | Hex         | Tailwind Custom              | Usage                              |
| -------------- | ----------- | ---------------------------- | ---------------------------------- |
| Deep Obsidian  | `#0B0B0B`   | `bg-obsidian`                | Primary background                 |
| Surface        | `#141414`   | `bg-surface`                 | Cards, panels, elevated containers |
| Surface Hover  | `#1A1A1A`   | `bg-surface-hover`           | Interactive surface hover state    |
| Border         | `#1F1F1F`   | `border-edge`                | Subtle 1px borders, grid lines     |
| Border Active  | `#2A2A2A`   | `border-edge-active`         | Focused/active borders             |
| Cyber Teal     | `#2DD4BF`   | `text-teal` / `shadow-teal`  | Active values, primary accent      |
| Cyber Teal Dim | `#14B8A6`   | `text-teal-dim`              | Secondary accent, hover            |
| Teal Glow      | `#2DD4BF33` | `shadow-[0_0_6px_#2DD4BF33]` | Soft glow on active cells          |
| Safety Amber   | `#F59E0B`   | `text-amber`                 | Warnings, flicker alerts           |
| Signal Red     | `#EF4444`   | `text-red`                   | Errors, critical alerts            |
| Text Primary   | `#E5E5E5`   | `text-primary`               | Headings, primary content          |
| Text Secondary | `#A3A3A3`   | `text-secondary`             | Labels, descriptions               |
| Text Muted     | `#525252`   | `text-muted`                 | Disabled, tertiary info            |

### Tailwind Config Additions

Add these to `tailwind.config.js` → `theme.extend.colors`:

```js
obsidian: "#0B0B0B",
surface: "#141414",
"surface-hover": "#1A1A1A",
edge: "#1F1F1F",
"edge-active": "#2A2A2A",
teal: { DEFAULT: "#2DD4BF", dim: "#14B8A6", glow: "#2DD4BF33" },
primary: "#E5E5E5",
secondary: "#A3A3A3",
muted: "#525252",
```

### Typography

- Font: `font-sans` (system-ui stack) for UI, `font-mono` for DMX values.
- Sizes: Use `clamp()` for fluid scaling.
  - Headings: `text-[clamp(0.875rem,1.5vw,1.125rem)]`
  - Body: `text-sm` (14px)
  - DMX values: `text-xs font-mono tabular-nums`
- Letter spacing: `tracking-tight` on headings, `tracking-wide` on labels.

## Component Patterns

### Panel / Card Container

```tsx
<div class="rounded-lg border border-edge bg-surface p-4">
  <h2 class="mb-3 text-sm font-medium tracking-wide text-secondary uppercase">
    Universe 1
  </h2>
  {/* content */}
</div>
```

### DMX Value Cell (Fine-Grained)

Each DMX value must be an **individual reactive leaf** — never re-render siblings.

```tsx
import { createSignal, For } from "solid-js";

function DmxCell(props: { value: () => number; channel: number }) {
  return (
    <div
      class="flex h-7 w-10 items-center justify-center border border-edge font-mono text-xs tabular-nums transition-colors duration-75"
      classList={{
        "text-muted": props.value() === 0,
        "text-teal shadow-[0_0_6px_#2DD4BF33]": props.value() > 0,
      }}
    >
      {props.value()}
    </div>
  );
}
```

Key points:

- `value` is a **getter / accessor**, not a raw number — enables SolidJS fine-grained tracking.
- `classList` toggles teal glow only when the value is non-zero.
- `tabular-nums` keeps digits aligned as values change.
- `transition-colors duration-75` adds a subtle fade without blocking the hot path.

### DMX Grid (512 Channels)

```tsx
function DmxGrid(props: { channels: () => number[] }) {
  return (
    <div class="grid grid-cols-16 gap-px rounded-md border border-edge bg-edge overflow-hidden">
      <For each={Array.from({ length: 512 }, (_, i) => i)}>
        {(i) => <DmxCell channel={i + 1} value={() => props.channels()[i]} />}
      </For>
    </div>
  );
}
```

Pattern: outer `bg-edge` + `gap-px` creates the 1px grid lines; inner cells use `bg-obsidian` or `bg-surface`.

### Active / Selected State

Use ring + teal glow for focus, never heavy box-shadows:

```
ring-1 ring-teal/40 shadow-[0_0_8px_#2DD4BF26]
```

### Buttons

```tsx
<button
  class="rounded-md bg-surface px-3 py-1.5 text-sm text-secondary border border-edge
  hover:bg-surface-hover hover:text-primary
  active:scale-[0.98] transition-all duration-100"
>
  Refresh
</button>
```

Primary action variant — add `bg-teal/10 text-teal border-teal/20 hover:bg-teal/20`.

### Status Indicators

```tsx
<span class="inline-flex items-center gap-1.5 text-xs">
  <span class="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
  Receiving
</span>
```

Swap `bg-teal` for `bg-amber` (warning) or `bg-red` (error).

## Reactivity Rules

1. **Never wrap a DMX grid in a single `createEffect`** that replaces the entire DOM.
2. **Pass accessors, not values.** `value: () => store.channels[i]`, not `value: store.channels[i]`.
3. **Use `createStore`** for DMX arrays — SolidJS tracks per-index mutations automatically.
4. **Use `<For>`** (keyed) for channel lists, never `.map()` — `.map()` recreates all nodes on any change.
5. **Batch high-frequency updates** with `batch(() => { ... })` when setting multiple channels at once from IPC.

## Refactoring Checklist

When converting an existing component:

- [ ] Replace `bg-gray-900` → `bg-obsidian`, `bg-gray-800` → `bg-surface`
- [ ] Replace `border-gray-700` → `border-edge`
- [ ] Replace `text-white` → `text-primary`, `text-gray-300/400` → `text-secondary`
- [ ] Replace `bg-blue-*` accents → `bg-teal` variants
- [ ] Add `font-mono tabular-nums` to all numeric displays
- [ ] Ensure DMX values use accessor pattern `() => value`, not raw values
- [ ] Replace `.map()` with `<For>` for any list rendering
- [ ] Add `gap-px` grid-line pattern for DMX grids
- [ ] Add teal glow `shadow-[0_0_6px_#2DD4BF33]` to active/non-zero cells
- [ ] Add subtle `transition-colors duration-75` for value changes
- [ ] Verify `tailwind.config.js` includes the design tokens above
