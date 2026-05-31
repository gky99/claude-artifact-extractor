# UI Quality-of-Life Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add system-following light/dark theming (with manual override), a focus-modal config panel (ESC + backdrop dismiss), a hideable gear button, and a draggable position-remembered button stack to the userscript UI.

**Architecture:** Themeable colors become `cae-`-prefixed CSS custom properties split into `theme.css`; `prefers-color-scheme` drives Auto, a `data-cae-theme` attribute on `<html>` forces Light/Dark. The floating button + gear become one draggable `.cae-button-stack` whose top-left position is clamped into the viewport and persisted. The config panel renders behind a dimming backdrop with ESC/backdrop dismissal, split into a live-applied Appearance section and a Save-committed Export-actions section. `ui.ts`/`config.ts` are renamed to `artifact-popover.ts`/`settings-panel.ts`.

**Tech Stack:** TypeScript, Vite + vite-plugin-monkey (Tampermonkey userscript), Vitest, GM_getValue/GM_setValue, GM_addStyle, Pointer Events, CSS custom properties.

---

## File Structure

**Renamed (git mv, before any edits):**
- `src/ui.ts` → `src/artifact-popover.ts` — button stack (Artifacts + gear) and artifact-list popover.
- `src/ui.css` → `src/artifact-popover.css` — styles for the above.
- `src/config.ts` → `src/settings-panel.ts` — the settings/config modal.

**New:**
- `src/settings.ts` gains 3 fields (modified, not new).
- `src/draggable.ts` — `clampToViewport()` (pure, tested) + `makeDraggable()` (Pointer Events).
- `src/theme.ts` — `applyTheme()`.
- `src/theme.css` — design-token definitions (light/dark/forced).
- `src/settings-panel.css` — backdrop + panel + section styles.
- `test/draggable.test.ts` — `clampToViewport` unit tests.

**Modified:**
- `src/artifact-popover.css` — tokenize colors; add stack + gear styles.
- `src/artifact-popover.ts` — build stack, wire dragging, anchor popover, honor `showSettingsButton`.
- `src/settings-panel.ts` — backdrop, ESC, sections, theme select, live-apply.
- `src/settings.ts` — `theme`, `showSettingsButton`, `buttonPos` with tolerant parsing.
- `src/main.ts` — renamed imports, inject 3 CSS files, `applyTheme` at startup, subscribe.
- `test/settings.test.ts` — extend default/round-trip expectations for new fields.
- `CLAUDE.md` — file-list renames + relaxed single-CSS-file note.

---

## Task 1: Rename modules and fix imports

**Files:**
- Rename: `src/ui.ts` → `src/artifact-popover.ts`
- Rename: `src/ui.css` → `src/artifact-popover.css`
- Rename: `src/config.ts` → `src/settings-panel.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Rename the three files with git mv**

```bash
git mv src/ui.ts src/artifact-popover.ts
git mv src/ui.css src/artifact-popover.css
git mv src/config.ts src/settings-panel.ts
```

- [ ] **Step 2: Update imports in main.ts**

In `src/main.ts`, change these three import lines:

```ts
import { mountUI } from './artifact-popover';
import { openConfigPanel } from './settings-panel';
import css from './artifact-popover.css?inline';
```

(The `mountUI` and `openConfigPanel` export names are unchanged in this task — only the module paths move. They get refactored in later tasks.)

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS, no errors (no remaining references to `./ui` or `./config`).

- [ ] **Step 4: Verify build succeeds**

Run: `pnpm build`
Expected: Builds `dist/claude-artifact-extractor.user.js` with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename ui->artifact-popover, config->settings-panel"
```

---

## Task 2: Extend settings with theme, gear visibility, and button position

**Files:**
- Modify: `src/settings.ts`
- Test: `test/settings.test.ts`

- [ ] **Step 1: Update existing default/round-trip expectations to fail**

In `test/settings.test.ts`, update the two `toEqual({...})` objects (the "returns defaults" test and the "round-trips saved settings" test) to include the new fields. For "returns defaults", add:

```ts
      theme: 'auto',
      showSettingsButton: true,
      buttonPos: null,
```

For "round-trips saved settings", pass and expect these added fields in BOTH the `saveSettings({...})` argument and the `toEqual({...})`:

```ts
      theme: 'dark',
      showSettingsButton: false,
      buttonPos: { x: 100, y: 200 },
```

- [ ] **Step 2: Add new focused tests for the new fields**

Append inside the `describe('settings', ...)` block in `test/settings.test.ts`:

```ts
  it('defaults theme to auto and ignores an invalid stored value', () => {
    expect(getSettings().theme).toBe('auto');
    store['cae-settings'] = JSON.stringify({ theme: 'rainbow' });
    expect(getSettings().theme).toBe('auto');
  });

  it('accepts each valid theme value', () => {
    for (const t of ['auto', 'light', 'dark'] as const) {
      store['cae-settings'] = JSON.stringify({ theme: t });
      expect(getSettings().theme).toBe(t);
    }
  });

  it('defaults showSettingsButton to true and ignores non-boolean', () => {
    expect(getSettings().showSettingsButton).toBe(true);
    store['cae-settings'] = JSON.stringify({ showSettingsButton: 'no' });
    expect(getSettings().showSettingsButton).toBe(true);
  });

  it('defaults buttonPos to null and round-trips a valid point', () => {
    expect(getSettings().buttonPos).toBeNull();
    store['cae-settings'] = JSON.stringify({ buttonPos: { x: 12, y: 34 } });
    expect(getSettings().buttonPos).toEqual({ x: 12, y: 34 });
  });

  it('rejects a malformed buttonPos (non-finite or wrong shape)', () => {
    store['cae-settings'] = JSON.stringify({ buttonPos: { x: 'a', y: 1 } });
    expect(getSettings().buttonPos).toBeNull();
    store['cae-settings'] = JSON.stringify({ buttonPos: 5 });
    expect(getSettings().buttonPos).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — settings.ts does not yet define `theme`, `showSettingsButton`, or `buttonPos`.

- [ ] **Step 4: Implement the new fields in settings.ts**

In `src/settings.ts`, add the exported types above the `Settings` interface:

```ts
export type Theme = 'auto' | 'light' | 'dark';

export interface ButtonPos {
  x: number;
  y: number;
}
```

Add these members to the `Settings` interface (after `debug`):

```ts
  /** UI color theme. 'auto' follows the OS via prefers-color-scheme. */
  theme: Theme;
  /** Show the floating gear (settings) button. */
  showSettingsButton: boolean;
  /** Persisted top-left of the draggable button stack; null = default corner. */
  buttonPos: ButtonPos | null;
```

Add to `DEFAULTS` (after `debug: false,`):

```ts
  theme: 'auto',
  showSettingsButton: true,
  buttonPos: null,
```

Add a private validator helper above `getSettings`:

```ts
function parseButtonPos(value: unknown): ButtonPos | null {
  if (
    typeof value === 'object' && value !== null &&
    Number.isFinite((value as ButtonPos).x) &&
    Number.isFinite((value as ButtonPos).y)
  ) {
    return { x: (value as ButtonPos).x, y: (value as ButtonPos).y };
  }
  return null;
}
```

In the object returned by `getSettings()`, add the three fields:

```ts
    theme:
      parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'auto'
        ? parsed.theme
        : DEFAULTS.theme,
    showSettingsButton:
      typeof parsed.showSettingsButton === 'boolean'
        ? parsed.showSettingsButton
        : DEFAULTS.showSettingsButton,
    buttonPos: 'buttonPos' in parsed ? parseButtonPos(parsed.buttonPos) : DEFAULTS.buttonPos,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all settings tests green.

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts test/settings.test.ts
git commit -m "feat: add theme, showSettingsButton, buttonPos settings"
```

---

## Task 3: Draggable helper — clampToViewport (tested) + makeDraggable

**Files:**
- Create: `src/draggable.ts`
- Test: `test/draggable.test.ts`

- [ ] **Step 1: Write failing tests for clampToViewport**

Create `test/draggable.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clampToViewport } from '../src/draggable';

const size = { width: 100, height: 40 };
const viewport = { width: 1000, height: 800 };

describe('clampToViewport', () => {
  it('leaves an in-bounds position unchanged', () => {
    expect(clampToViewport({ x: 200, y: 300 }, size, viewport)).toEqual({ x: 200, y: 300 });
  });

  it('clamps a negative position to the top-left edge', () => {
    expect(clampToViewport({ x: -50, y: -20 }, size, viewport)).toEqual({ x: 0, y: 0 });
  });

  it('clamps an over-far position to the bottom-right edge', () => {
    expect(clampToViewport({ x: 5000, y: 5000 }, size, viewport)).toEqual({ x: 900, y: 760 });
  });

  it('clamps to 0 when the element is larger than the viewport', () => {
    expect(clampToViewport({ x: 10, y: 10 }, { width: 1200, height: 900 }, viewport)).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `clampToViewport` is not defined / module missing.

- [ ] **Step 3: Implement draggable.ts**

Create `src/draggable.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Clamps a top-left point so an element of `size` stays fully inside `viewport`.
 *  If the element is larger than the viewport on an axis, that axis pins to 0. */
export function clampToViewport(pos: Point, size: Size, viewport: Size): Point {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  };
}

export interface DraggableOptions {
  /** Pixels of movement before a press is treated as a drag (not a click). */
  threshold?: number;
  /** Called once on pointerup after a real drag, with the element's new top-left. */
  onDrop: (pos: Point) => void;
}

/** Makes `el` draggable by pointer. While dragging it switches `el` to
 *  left/top positioning. A press that moves less than `threshold` is left to
 *  behave as a normal click; a real drag suppresses the trailing click so inner
 *  buttons don't fire. */
export function makeDraggable(el: HTMLElement, { threshold = 4, onDrop }: DraggableOptions): void {
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let dragging = false;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < threshold) return;
    moved = true;
    el.style.left = `${originLeft + dx}px`;
    el.style.top = `${originTop + dy}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });

  el.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture(e.pointerId);
    if (moved) {
      const rect = el.getBoundingClientRect();
      onDrop({ x: rect.left, y: rect.top });
    }
  });

  // Capture-phase: cancel the click that the browser fires after a drag,
  // so the Artifacts/gear button underneath doesn't activate.
  el.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    },
    true,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — clampToViewport tests green.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/draggable.ts test/draggable.test.ts
git commit -m "feat: add draggable helper with viewport clamping"
```

---

## Task 4: Theme tokens (theme.css) and applyTheme (theme.ts)

**Files:**
- Create: `src/theme.css`
- Create: `src/theme.ts`

- [ ] **Step 1: Create the design tokens in theme.css**

Create `src/theme.css`. Light is the default on `:root`; dark applies when the OS prefers dark (unless Light is forced) and when Dark is explicitly forced:

```css
/* Design tokens for the Artifact Extractor UI. All cae-prefixed so defining
   them on :root cannot collide with Claude's own custom properties.
   Light is the default; dark applies via prefers-color-scheme or an explicit
   data-cae-theme override on <html>. */

:root {
  --cae-surface: #ffffff;
  --cae-surface-button: #f4f4f5;
  --cae-text: #1a1a1a;
  --cae-border: rgba(0, 0, 0, 0.15);
  --cae-divider: rgba(0, 0, 0, 0.1);
  --cae-action-bg: #ececef;
  --cae-action-text: #1a1a1a;
  --cae-action-border: rgba(0, 0, 0, 0.2);
  --cae-input-bg: #ffffff;
  --cae-shadow: rgba(0, 0, 0, 0.18);
  --cae-backdrop: rgba(0, 0, 0, 0.45);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-cae-theme='light']) {
    --cae-surface: #1e1e1e;
    --cae-surface-button: #2d2d2d;
    --cae-text: #eeeeee;
    --cae-border: rgba(255, 255, 255, 0.2);
    --cae-divider: rgba(255, 255, 255, 0.1);
    --cae-action-bg: #3a3a3a;
    --cae-action-text: #ffffff;
    --cae-action-border: rgba(255, 255, 255, 0.25);
    --cae-input-bg: #2a2a2a;
    --cae-shadow: rgba(0, 0, 0, 0.35);
    --cae-backdrop: rgba(0, 0, 0, 0.55);
  }
}

:root[data-cae-theme='dark'] {
  --cae-surface: #1e1e1e;
  --cae-surface-button: #2d2d2d;
  --cae-text: #eeeeee;
  --cae-border: rgba(255, 255, 255, 0.2);
  --cae-divider: rgba(255, 255, 255, 0.1);
  --cae-action-bg: #3a3a3a;
  --cae-action-text: #ffffff;
  --cae-action-border: rgba(255, 255, 255, 0.25);
  --cae-input-bg: #2a2a2a;
  --cae-shadow: rgba(0, 0, 0, 0.35);
  --cae-backdrop: rgba(0, 0, 0, 0.55);
}
```

- [ ] **Step 2: Create applyTheme in theme.ts**

Create `src/theme.ts`:

```ts
import type { Theme } from './settings';

/** Reflects the chosen theme onto <html>. 'auto' removes the attribute so the
 *  prefers-color-scheme media query governs; 'light'/'dark' force the palette. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-cae-theme');
  } else {
    root.setAttribute('data-cae-theme', theme);
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/theme.css src/theme.ts
git commit -m "feat: add theme tokens and applyTheme"
```

---

## Task 5: Tokenize artifact-popover.css + add stack and gear styles

**Files:**
- Modify: `src/artifact-popover.css`

- [ ] **Step 1: Replace the popover/button/row/action color literals with tokens**

In `src/artifact-popover.css`, rewrite the existing rules to use the tokens. Replace the bodies of `.cae-button`, `.cae-popover`, `.cae-row + .cae-row`, and the shared action-button rule. Note: the config-panel/input rules currently in this file move to `settings-panel.css` in Task 7 — leave them for now but tokenize them too so the file stays valid in the meantime.

Set `.cae-button`:

```css
.cae-button {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--cae-border);
  background: var(--cae-surface-button);
  color: var(--cae-text);
  font: 13px system-ui, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px var(--cae-shadow);
}
```

(The `position/bottom/right/z-index` move to `.cae-button-stack` in Step 3.)

Set `.cae-popover` background/color/border/shadow to tokens:

```css
.cae-popover {
  position: fixed;
  z-index: 2147483647;
  width: 320px;
  max-height: 50vh;
  overflow-y: auto;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--cae-border);
  background: var(--cae-surface);
  color: var(--cae-text);
  font: 13px system-ui, sans-serif;
  box-shadow: 0 4px 16px var(--cae-shadow);
}
```

(The `bottom: 60px; right: 20px;` are removed — the popover is positioned dynamically in Task 6.)

Set the row divider:

```css
.cae-row + .cae-row {
  border-top: 1px solid var(--cae-divider);
}
```

Update the shared action-button rule (keep only the selectors that remain in this file — `.cae-copy, .cae-download, .cae-obsidian`; the `.cae-config-*` selectors move to settings-panel.css in Task 7):

```css
.cae-copy,
.cae-download,
.cae-obsidian {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--cae-action-border);
  background: var(--cae-action-bg);
  color: var(--cae-action-text);
  cursor: pointer;
}
```

- [ ] **Step 2: Remove the config-panel rules from this file (moved in Task 7)**

Delete `.cae-config-panel`, `.cae-config-heading`, `.cae-config-input`, `.cae-config-check`, `.cae-config-field`, `.cae-config-label` blocks from `src/artifact-popover.css`. (They are re-created, tokenized, in `settings-panel.css` in Task 7.) Keep `.cae-row`, `.cae-row-title`, `.cae-row-meta`, `.cae-row-actions`.

- [ ] **Step 3: Add the button-stack and gear styles**

Append to `src/artifact-popover.css`:

```css
.cae-button-stack {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 6px;
  touch-action: none; /* let pointer drag work without the page scrolling */
}

.cae-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--cae-border);
  background: var(--cae-surface-button);
  color: var(--cae-text);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 8px var(--cae-shadow);
}
```

- [ ] **Step 4: Verify build (CSS compiles into the bundle)**

Run: `pnpm build`
Expected: Builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/artifact-popover.css
git commit -m "feat: tokenize popover styles, add button-stack and gear"
```

---

## Task 6: Build the draggable button stack and anchor the popover

**Files:**
- Modify: `src/artifact-popover.ts`

- [ ] **Step 1: Update imports and IDs**

At the top of `src/artifact-popover.ts`, add imports and a new stack/gear id:

```ts
import { getSettings, saveSettings, type Settings } from './settings';
import { clampToViewport, makeDraggable } from './draggable';
import { openSettingsPanel } from './settings-panel';
```

(Keep existing imports for `getLatestConversation`, `findArtifacts`, `renderArtifactMarkdown`, `copyArtifact`, `downloadArtifact`, `saveToObsidian`, and `RawArtifactInput`. The `openSettingsPanel` name is the renamed export from Task 7 — until Task 7 lands, `settings-panel.ts` still exports `openConfigPanel`; this import is finalized once Task 7 renames it. If implementing strictly in order, temporarily import `openConfigPanel as openSettingsPanel`.)

Add ids near the existing ones:

```ts
const STACK_ID = 'cae-button-stack';
const GEAR_ID = 'cae-settings-button';
```

- [ ] **Step 2: Replace mountUI with stack rendering**

Replace the existing `mountUI` function body so it builds (or rebuilds) a `.cae-button-stack` containing the Artifacts button and, when enabled, the gear. Export a `renderButtonStack` used both at mount and on settings changes:

```ts
/** Mounts the floating button stack once the DOM is ready. */
export function mountUI(): void {
  renderButtonStack();
}

/** (Re)builds the button stack from current settings. Removes any existing
 *  stack and open popover first, so it is safe to call on every settings change. */
export function renderButtonStack(): void {
  document.getElementById(STACK_ID)?.remove();
  document.getElementById(POPOVER_ID)?.remove();

  const settings = getSettings();

  const stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.className = 'cae-button-stack';

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.className = 'cae-button';
  button.textContent = '⬇ Artifacts';
  button.addEventListener('click', togglePopover);
  stack.appendChild(button);

  if (settings.showSettingsButton) {
    const gear = document.createElement('button');
    gear.id = GEAR_ID;
    gear.type = 'button';
    gear.className = 'cae-gear';
    gear.textContent = '⚙';
    gear.title = 'Settings';
    gear.addEventListener('click', openSettingsPanel);
    stack.appendChild(gear);
  }

  document.body.appendChild(stack);
  applyStoredPosition(stack);

  makeDraggable(stack, {
    onDrop: (pos) => {
      const rect = stack.getBoundingClientRect();
      const clamped = clampToViewport(
        pos,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      stack.style.left = `${clamped.x}px`;
      stack.style.top = `${clamped.y}px`;
      saveSettings({ ...getSettings(), buttonPos: clamped });
    },
  });
}

/** Applies the persisted position (clamped), or leaves the default corner. */
function applyStoredPosition(stack: HTMLElement): void {
  const pos = getSettings().buttonPos;
  if (!pos) return;
  const rect = stack.getBoundingClientRect();
  const clamped = clampToViewport(
    pos,
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  stack.style.left = `${clamped.x}px`;
  stack.style.top = `${clamped.y}px`;
  stack.style.right = 'auto';
  stack.style.bottom = 'auto';
}
```

- [ ] **Step 3: Anchor the popover to the stack's current position**

In `renderPopover()`, after creating the popover element and before appending, position it relative to the stack (opens above the stack, right edges aligned). Replace the `document.body.appendChild(popover);` tail with:

```ts
  document.body.appendChild(popover);

  const stack = document.getElementById(STACK_ID);
  if (stack) {
    const rect = stack.getBoundingClientRect();
    popover.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
    popover.style.bottom = `${Math.max(0, window.innerHeight - rect.top + 8)}px`;
  } else {
    popover.style.right = '20px';
    popover.style.bottom = '60px';
  }
```

(`renderPopover` already sets `popover.className = 'cae-popover'`; the CSS no longer hardcodes bottom/right, so these inline geometry values position it. Only geometry is set inline — all colors/borders remain in CSS.)

- [ ] **Step 4: Verify typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS and a clean build. (If `openSettingsPanel` is not yet exported by `settings-panel.ts`, use the temporary alias from Step 1 until Task 7.)

- [ ] **Step 5: Commit**

```bash
git add src/artifact-popover.ts
git commit -m "feat: draggable button stack with gear and anchored popover"
```

---

## Task 7: Settings panel — backdrop, ESC, sections, theme select, live-apply

**Files:**
- Modify: `src/settings-panel.ts`
- Create: `src/settings-panel.css`

- [ ] **Step 1: Create settings-panel.css**

Create `src/settings-panel.css` (the config rules removed from artifact-popover.css in Task 5, tokenized, plus backdrop and section styles):

```css
.cae-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: var(--cae-backdrop);
}

.cae-config-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--cae-border);
  background: var(--cae-surface);
  color: var(--cae-text);
  font: 13px system-ui, sans-serif;
  box-shadow: 0 4px 16px var(--cae-shadow);
}

.cae-config-heading {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.cae-config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--cae-divider);
}

.cae-config-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}

.cae-config-input,
.cae-config-select {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--cae-action-border);
  background: var(--cae-input-bg);
  color: var(--cae-text);
  font: 13px system-ui, sans-serif;
}

.cae-config-save,
.cae-config-close {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--cae-action-border);
  background: var(--cae-action-bg);
  color: var(--cae-action-text);
  cursor: pointer;
}

.cae-config-check {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cae-config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cae-config-label {
  font-size: 12px;
  opacity: 0.85;
}
```

- [ ] **Step 2: Rewrite settings-panel.ts with sections, backdrop, ESC, and live-apply**

Replace the contents of `src/settings-panel.ts` with:

```ts
import { getSettings, saveSettings, type Settings, type Theme } from './settings';

const PANEL_ID = 'cae-config-panel';
const BACKDROP_ID = 'cae-backdrop';

/** Toggles the settings modal. Appearance controls (theme, gear visibility)
 *  apply live; export-action + debug settings commit on Save. Dismissable via
 *  ESC, backdrop click, or Close. */
export function openSettingsPanel(): void {
  if (document.getElementById(PANEL_ID)) {
    closePanel();
    return;
  }

  const settings = getSettings();

  const backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  backdrop.className = 'cae-backdrop';
  backdrop.addEventListener('click', closePanel);

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'cae-config-panel';

  const heading = document.createElement('h2');
  heading.className = 'cae-config-heading';
  heading.textContent = 'Artifact Extractor — Config';

  // --- Appearance (live-applied) ---
  const appearance = makeSection('Appearance');

  const themeField = document.createElement('label');
  themeField.className = 'cae-config-field';
  const themeLabel = document.createElement('span');
  themeLabel.className = 'cae-config-label';
  themeLabel.textContent = 'Theme';
  const themeSelect = document.createElement('select');
  themeSelect.className = 'cae-config-select';
  for (const [value, text] of [['auto', 'Auto (system)'], ['light', 'Light'], ['dark', 'Dark']] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    themeSelect.appendChild(opt);
  }
  themeSelect.value = settings.theme;
  themeSelect.addEventListener('change', () => {
    saveSettings({ ...getSettings(), theme: themeSelect.value as Theme });
  });
  themeField.append(themeLabel, themeSelect);

  const gearCheck = makeCheckbox('Show settings button', settings.showSettingsButton);
  gearCheck.input.addEventListener('change', () => {
    saveSettings({ ...getSettings(), showSettingsButton: gearCheck.input.checked });
  });

  appearance.append(themeField, gearCheck.wrap);

  // --- Export actions (Save-committed) ---
  const actions = makeSection('Export actions');
  const copyCheck = makeCheckbox('Show "Copy" button', settings.showCopy);
  const downloadCheck = makeCheckbox('Show "Download" button', settings.showDownload);
  const obsidianCheck = makeCheckbox('Show "Save to Obsidian" button', settings.showObsidian);
  const vaultField = makeField('Obsidian vault name', 'e.g. My Vault', settings.obsidianVault);
  const folderField = makeField('Folder path (blank = vault root)', 'e.g. Clippings', settings.obsidianFolder);
  actions.append(
    copyCheck.wrap,
    downloadCheck.wrap,
    obsidianCheck.wrap,
    vaultField.wrap,
    folderField.wrap,
  );

  // --- Debug (Save-committed) ---
  const debug = makeSection('Debug');
  const debugCheck = makeCheckbox('Enable debug capture (logs every API response)', settings.debug);
  debug.append(debugCheck.wrap);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'cae-config-save';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    const cur = getSettings(); // preserves live-applied theme/showSettingsButton/buttonPos
    const next: Settings = {
      ...cur,
      showCopy: copyCheck.input.checked,
      showDownload: downloadCheck.input.checked,
      showObsidian: obsidianCheck.input.checked,
      obsidianVault: vaultField.input.value,
      obsidianFolder: folderField.input.value,
      debug: debugCheck.input.checked,
    };
    saveSettings(next);
    save.textContent = 'Saved ✓';
    setTimeout(() => {
      save.textContent = 'Save';
    }, 1500);
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cae-config-close';
  close.textContent = 'Close';
  close.addEventListener('click', closePanel);

  panel.append(heading, appearance, actions, debug, save, close);
  document.body.append(backdrop, panel);
  document.addEventListener('keydown', onKeydown);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closePanel();
}

function closePanel(): void {
  document.removeEventListener('keydown', onKeydown);
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(BACKDROP_ID)?.remove();
}

function makeSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'cae-config-section';
  const heading = document.createElement('div');
  heading.className = 'cae-config-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function makeCheckbox(label: string, checked: boolean): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement('label');
  wrap.className = 'cae-config-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(input, span);
  return { wrap, input };
}

function makeField(label: string, placeholder: string, value: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement('label');
  wrap.className = 'cae-config-field';
  const span = document.createElement('span');
  span.className = 'cae-config-label';
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cae-config-input';
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(span, input);
  return { wrap, input };
}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS. (`openSettingsPanel` is now exported; the import in `artifact-popover.ts` from Task 6 resolves without the temporary alias — remove the alias if you used one.)

- [ ] **Step 4: Commit**

```bash
git add src/settings-panel.ts src/settings-panel.css
git commit -m "feat: modal settings panel with sections, theme select, ESC"
```

---

## Task 8: Wire main.ts — inject CSS, apply theme, subscribe

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update imports and inject all three stylesheets**

In `src/main.ts`, replace the CSS import and the single `GM_addStyle` call. Import order matters — inject `theme.css` (tokens) first:

```ts
import { getCaptured, installFetchInterceptor } from './fetch-interceptor';
import { mountUI, renderButtonStack } from './artifact-popover';
import { openSettingsPanel } from './settings-panel';
import { getSettings, subscribe } from './settings';
import { applyTheme } from './theme';
import themeCss from './theme.css?inline';
import popoverCss from './artifact-popover.css?inline';
import panelCss from './settings-panel.css?inline';
```

Replace the existing `GM_addStyle(css);` line with:

```ts
// Inject tokens first so component styles can reference the variables.
GM_addStyle(themeCss);
GM_addStyle(popoverCss);
GM_addStyle(panelCss);

// Reflect the saved theme onto <html> before the UI mounts.
applyTheme(getSettings().theme);
```

- [ ] **Step 2: Subscribe to settings changes for theme + stack, and fix the menu command**

The existing file calls `syncDebugMenu()` and `subscribe(syncDebugMenu)` and registers `'Config…'` with `openConfigPanel`. Add a combined live-update subscriber and update the menu command to the renamed export. After the existing `subscribe(syncDebugMenu);` line, add:

```ts
// Live-apply appearance changes: theme to <html>, and rebuild the button stack
// (e.g. when the gear is toggled or the position is persisted).
subscribe(() => {
  applyTheme(getSettings().theme);
  renderButtonStack();
});
```

Change the menu registration line to use the renamed function:

```ts
GM_registerMenuCommand('Config…', openSettingsPanel);
```

- [ ] **Step 3: Verify lint, typecheck, build**

Run: `pnpm lint && pnpm build`
Expected: PASS (eslint + tsc clean) and a successful bundle. No remaining references to `openConfigPanel` or `./ui`/`./config`.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: inject themed CSS, apply theme at startup, live-update UI"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Architecture file list for the renames and new files**

In `CLAUDE.md`, in the Architecture bullet list, rename the `src/ui.ts` / `src/ui.css` bullet to `src/artifact-popover.ts` / `src/artifact-popover.css`, and the `src/config.ts` bullet to `src/settings-panel.ts`. Add bullets for the new modules:

```markdown
- `src/theme.ts` / `src/theme.css` — `applyTheme` reflects the chosen theme onto
  `<html>` via a `data-cae-theme` attribute; `theme.css` defines the cae-prefixed
  design tokens (light default, dark via `prefers-color-scheme`, forced overrides).
- `src/draggable.ts` — `makeDraggable` (Pointer Events, click/drag threshold) and the
  pure `clampToViewport` helper that keeps the button stack on-screen.
- `src/settings-panel.css` — backdrop + config-panel + section styles.
```

- [ ] **Step 2: Relax the single-CSS-file statement in the Styling section**

In the Styling section, update the opening sentence so it no longer mandates a single file. Replace:

> UI styles live in a **separate `.css` source file**, not in inline `el.style` assignments.

with:

> UI styles live in **separate `.css` source files** (e.g. `theme.css`,
> `artifact-popover.css`, `settings-panel.css`), not in inline `el.style`
> assignments. Each is imported with `?inline` and injected once via `GM_addStyle`
> (inject `theme.css` first so component styles can reference its variables).
> Dynamic geometry (a dragged position, a computed popover anchor) may be set inline
> via `el.style.left/top/right/bottom`; only colors, borders, and other presentation
> stay in CSS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update architecture and styling notes for QoL UI work"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check suite**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: eslint clean, `tsc --noEmit` clean, all vitest tests pass, bundle builds to `dist/claude-artifact-extractor.user.js`.

- [ ] **Step 2: Manual verification in Tampermonkey**

Install the freshly built `dist/claude-artifact-extractor.user.js` and confirm on a live Claude conversation:

- Theme: with OS in dark mode the UI is dark; switch OS to light → UI is light (Auto). In Config, pick Light/Dark → UI switches instantly and persists across reload; pick Auto → follows OS again.
- Gear button shows to the right of the Artifacts button by default. Clicking it opens the config panel.
- Config panel: a dimmed backdrop covers the page; ESC closes it; clicking the backdrop closes it; Close button closes it. Appearance changes (theme, show-settings) apply immediately without Save; export-action changes require Save (and Save preserves the theme/gear choices).
- Uncheck "Show settings button" → gear disappears immediately; the Tampermonkey "Config…" menu command still opens the panel.
- Drag the button stack to a new spot → it moves as a unit; a plain click still toggles the popover / opens config (no accidental toggle from a drag). Reload → the stack reappears at the saved spot. The popover opens anchored above the stack at its new position.
- Resize the window so the saved spot would be off-screen, then reload → the stack is clamped fully into view.

- [ ] **Step 3: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "chore: QoL UI verification fixes"
```

(Skip if no changes were needed.)

---

## Notes for the implementer

- **DRY/YAGNI:** The dark token block is intentionally repeated in `theme.css` (once under the `prefers-color-scheme` media query, once under `[data-cae-theme='dark']`) because CSS cannot share a declaration block across a media-query boundary. This is the minimal correct form — do not try to "fix" it by collapsing.
- **Inline styles:** Only geometry (`left/top/right/bottom`) is ever set inline, by the drag logic and the popover anchor. All themeable presentation stays in the `.css` files — keep it that way.
- **Live-apply vs. Save:** The Appearance section persists on `change`; everything else persists on Save. The Save handler spreads `getSettings()` first so it never clobbers the live-applied appearance fields or `buttonPos`.
- **Ordering caveat:** Tasks 6 and 7 are mutually referential (`artifact-popover.ts` imports `openSettingsPanel`, which Task 7 creates). If implementing strictly in order, use the temporary `openConfigPanel as openSettingsPanel` alias noted in Task 6 Step 1, then drop it after Task 7.
