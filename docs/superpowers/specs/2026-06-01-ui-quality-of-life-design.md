# UI Quality-of-Life Features — Design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)

## Summary

Five quality-of-life improvements to the userscript's floating UI:

1. **Light/dark theming** that follows the system color scheme automatically, with an
   optional manual override (Auto / Light / Dark).
2. **Config panel as a focus modal** — a dimming backdrop behind it, dismissable by
   ESC, backdrop click, or the Close button.
3. **A settings (gear) button** to the right of the Artifacts button, opening the
   config panel. Hideable via a setting; shown by default.
4. **Draggable button stack** whose position is remembered across reloads, clamped so
   it never strands off-screen.
5. **Sectioned config panel** separating live-applied appearance settings from the
   save-committed export-action settings.

## Background

The current UI (see `src/ui.ts`, `src/ui.css`, `src/config.ts`) is dark-only with
hardcoded colors. The Artifacts button is pinned bottom-right; the popover is
hardcoded bottom-right; the config panel is centered with no backdrop and is only
dismissable via its Close button. There is no settings button — the config panel is
reachable only through the Tampermonkey "Config…" menu command.

## Detailed Design

### 1. Theming (auto + manual override)

**Mechanism: CSS custom properties (design tokens).** All hardcoded colors in the UI
CSS are replaced with `cae-`-prefixed CSS variables. Two token sets are defined:

```css
:root { /* light tokens */
  --cae-surface: #ffffff;
  --cae-text: #1a1a1a;
  /* ...borders, button bg, shadows, etc. */
}
@media (prefers-color-scheme: dark) {
  :root { /* dark tokens — current dark palette */ }
}
:root[data-cae-theme="light"] { /* force light tokens */ }
:root[data-cae-theme="dark"]  { /* force dark tokens */ }
```

- **Auto** (default): no `data-cae-theme` attribute on `<html>`; the
  `prefers-color-scheme` media query governs.
- **Manual**: a persisted `theme: 'auto' | 'light' | 'dark'` setting. `applyTheme()`
  sets `data-cae-theme="light|dark"` on `document.documentElement`, or removes the
  attribute for `'auto'`.
- Variable names and the attribute are `cae-`-prefixed, so defining tokens on `:root`
  cannot collide with Claude's own CSS.

Rejected alternatives: duplicate `.cae-dark` / `.cae-light` stylesheets (rule drift),
and JS-computed inline styles (defeats the externalized-CSS approach).

### 2. Config panel as a focus modal

- A `.cae-backdrop` element (semi-transparent, fixed, full-viewport) is rendered
  behind the panel and dims the page to focus attention on the panel.
- The panel renders on top, centered (as today).
- **Dismiss paths (all three):** ESC keypress, backdrop click, and the Close button.
- The ESC `keydown` listener is attached to `document` when the panel opens and
  removed when it closes — no dangling global listeners. Both backdrop and panel are
  removed together on any dismiss.
- ESC/backdrop close **only the config panel**, not the artifact popover (per scope).

### 3. Settings (gear) button

- A new `⚙` gear button is placed to the **right** of the Artifacts button, inside a
  shared horizontal container (`.cae-button-stack`). Clicking it opens the config
  panel.
- New setting `showSettingsButton: boolean`, **default `true`**.
- When off, the gear is hidden, but the Tampermonkey "Config…" menu command still
  opens the panel.
- Toggling the "Show settings button" checkbox re-renders the button stack live via
  the existing `subscribe()` mechanism (no reload).

### 4. Draggable, position-remembered button stack

- The Artifacts button + gear live in one container (`.cae-button-stack`). Dragging
  anywhere on the container moves the whole stack together, using Pointer Events.
- **Click vs. drag disambiguation:** a movement threshold (~4px). If the pointer moves
  less than the threshold between pointerdown and pointerup, it is treated as a click
  (toggle popover / open config); otherwise it is a drag and the button's own click
  handler is suppressed for that interaction.
- **Persistence:** `buttonPos: { x: number; y: number } | null` in settings.
  `null` = the default bottom-right anchor. After a drag completes, the new position
  is persisted.
- **Clamp into viewport:** `clampToViewport(pos, size, viewport)` is a pure function
  that clamps `{x, y}` so the stack stays fully visible. Applied on load (before
  positioning) and after each drag, guarding against off-screen positions caused by
  window resize.
- **`buttonPos` is never surfaced in the config panel** — it is written silently by
  dragging only.
- **Popover anchoring:** the popover anchors to the stack's current bounding rect
  (opens above the stack, right-aligned to it) instead of the hardcoded bottom-right.

### 5. Sectioned config panel

The panel is organized into visually separated sections (each with a small
heading/divider):

**Appearance** — *applies live, independent of the Save button*
- Theme: `<select>` dropdown — Auto / Light / Dark
- ☑ Show settings button

**Export actions** — *committed by the Save button (current behavior)*
- ☑ Show "Copy"
- ☑ Show "Download"
- ☑ Show "Save to Obsidian"
- Obsidian vault name
- Folder path

**Debug** — *Save button*
- ☑ Enable debug capture

Then **Save** and **Close** buttons.

**Behavioral split:** the Appearance controls are *not* save-related. Changing the
theme dropdown or the show-settings-button checkbox **applies and persists
immediately** (theme switches instantly; gear shows/hides instantly). The Save button
continues to commit only the export-action + debug settings. To avoid clobbering, the
`next` object built on Save reads the current value of every control (including the
live-applied appearance values), so a Save writes a consistent full settings object.

## Settings shape (`src/settings.ts`)

Three fields are added to `Settings` and `DEFAULTS`, using the existing
tolerant-parsing pattern (each field validated against its type, falling back to the
default on missing/corrupt data):

```ts
theme: 'auto' | 'light' | 'dark';              // default 'auto'
showSettingsButton: boolean;                   // default true
buttonPos: { x: number; y: number } | null;    // default null
```

`buttonPos` parsing validates that the stored value is either `null` or an object with
finite numeric `x` and `y`; anything else falls back to `null`.

## Files

### New
- `src/theme.ts` — `applyTheme(theme: Settings['theme'])`: sets/removes
  `data-cae-theme` on `document.documentElement`. Called at startup and whenever
  settings change.
- `src/theme.css` — the design-token definitions (light defaults, dark via media
  query, forced light/dark via `data-cae-theme`).
- `src/config.css` — backdrop + config-panel + section styles.
- `src/draggable.ts` — `makeDraggable(...)` (Pointer Events, click/drag threshold,
  drop callback) and the pure `clampToViewport(...)` helper.

### Changed
- `src/ui.css` — tokenize all colors (use `var(--cae-*)`); add `.cae-button-stack`
  and gear-button styles.
- `src/ui.ts` — render the button stack (Artifacts button + gear), wire dragging and
  click/drag disambiguation, anchor the popover to the stack.
- `src/config.ts` — backdrop + ESC handling, sectioned layout, theme `<select>`,
  show-settings-button checkbox, live-apply for the Appearance section.
- `src/settings.ts` — three new fields with tolerant parsing.
- `src/main.ts` — inject the additional CSS strings (tokens first); call
  `applyTheme()` at startup; subscribe to settings changes for theme + button
  visibility.
- `CLAUDE.md` — update the Styling section to note CSS may now span multiple
  `?inline`-imported files (the single-file rule is relaxed).

## Testing

Pure logic gets vitest coverage (consistent with the project's existing split — pure
modules unit-tested, UI/capture/persistence verified manually):

- `clampToViewport` — off-screen positions clamp into the viewport; in-bounds
  positions pass through unchanged; edge cases at each border.
- `settings.ts` round-trip for the three new fields — defaults applied when absent;
  partial/corrupt stored data falls back per-field; valid values round-trip; the
  `buttonPos` shape validation (null vs. `{x,y}` vs. garbage).

Manual verification (build → install in Tampermonkey → live Claude conversation):
theme switching (auto-follows OS, manual override), backdrop + ESC + backdrop-click
dismissal, gear button show/hide, dragging the stack and persistence across reload,
off-screen clamp after window resize, popover anchoring to the moved stack.

## Out of scope

- ESC/backdrop dismissal for the artifact popover (config panel only).
- Editing `buttonPos` directly in the config UI.
- Per-element theme overrides (theme is global to the UI).
