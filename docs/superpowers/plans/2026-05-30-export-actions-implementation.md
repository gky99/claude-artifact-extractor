# Configurable Export Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-artifact **Download** and **Save to Obsidian** actions alongside the existing **Copy**, each individually toggled in the config panel, and make the artifact title the *filename* instead of an `# H1` in the body.

**Architecture:** A new `settings.ts` owns a single persisted JSON settings blob (which buttons show + Obsidian vault/folder). A new `exporters.ts` holds the three actions plus two pure helpers (`toFileName`, `buildObsidianUri`). `ui.ts` reads settings and renders only the enabled buttons. `config.ts` is rewritten into a real settings panel. `markdown.ts` stops emitting the title heading. **Save to Obsidian** reuses Obsidian's OS-registered `obsidian://new` protocol with `clipboard=true` — no native helper, no new GM grants.

**Tech Stack:** TypeScript, Vite + vite-plugin-monkey, Tampermonkey GM APIs, vitest. Pure helpers are unit-tested; browser-API actions and UI are verified by build + manual install.

**Conventions for every commit:** This is a Windows/PowerShell + pnpm repo. Append the project's standard `Co-Authored-By` trailer to each commit message. Per CLAUDE.md, do this work in a **git worktree branched off the latest `dev`**, and squash to a single commit before merging back to `dev`.

---

## File Structure

- **Create** `src/settings.ts` — `Settings` type, `getSettings()`, `saveSettings()`. Sole owner of `GM_getValue`/`GM_setValue` for settings.
- **Create** `src/exporters.ts` — pure `toFileName()` + `buildObsidianUri()`; impure `copyArtifact()`, `downloadArtifact()`, `saveToObsidian()`.
- **Create** `test/settings.test.ts` — defaults, round-trip, corrupt/partial tolerance.
- **Create** `test/exporters.test.ts` — `toFileName` + `buildObsidianUri` only (pure).
- **Modify** `src/markdown.ts` — drop the `# <title>` heading.
- **Modify** `test/markdown.test.ts` — expect title-less output.
- **Rewrite** `src/config.ts` — real settings panel (3 checkboxes + 2 Obsidian fields).
- **Modify** `src/ui.ts` — render enabled buttons from settings.
- **Modify** `src/ui.css` — styles for the new buttons + config checkboxes/fields.
- **Modify** `CLAUDE.md` — document the new modules + behavior.

No change to `vite.config.ts` (no new grants), `fetch-interceptor.ts`, `conversation.ts`, `citations.ts`, `footnotes.ts`, `main.ts`.

---

## Task 1: Drop the title heading from rendered Markdown

**Files:**

- Modify: `test/markdown.test.ts`
- Modify: `src/markdown.ts:18-28`

- [ ] **Step 1: Update the tests to expect title-less output**

Replace the first two `it(...)` blocks in `test/markdown.test.ts` with:

```ts
  it('assembles body with named markers and a deduped reference list (no title heading)', () => {
    const input: RawArtifactInput = {
      id: 'a',
      type: 'text/markdown',
      title: 'My Report',
      content: 'Claim one.\nClaim two.',
      md_citations: [
        { title: 'Smith', url: 'https://a', metadata: { preview_title: 'Smith 2024' }, start_index: 0, end_index: 6 },
        { title: 'Smith', url: 'https://a', metadata: { preview_title: 'Smith 2024' }, start_index: 11, end_index: 17 },
      ],
    };
    expect(renderArtifactMarkdown(input)).toBe(
      'Claim one.[^Smith]\nClaim two.[^Smith]\n\n---\n\n[^Smith]: Smith 2024 — https://a\n',
    );
  });

  it('never emits a title heading and omits the rule when there are no citations', () => {
    const input: RawArtifactInput = { id: 'a', type: 't', title: 'Has Title', content: 'Just body.' };
    expect(renderArtifactMarkdown(input)).toBe('Just body.\n');
  });
```

In the third test (`renders the real sample...`), replace the line
`expect(md).toContain('# How Obsidian Users Actually Build Their Second Brains');`
with:

```ts
    expect(md.split('\n')[0]).not.toBe('# How Obsidian Users Actually Build Their Second Brains');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- markdown`
Expected: FAIL — output still contains `# My Report` / `# How Obsidian...`.

- [ ] **Step 3: Remove the title heading in `markdown.ts`**

Replace the body of `renderArtifactMarkdown` (lines 18-28) with:

```ts
export function renderArtifactMarkdown(input: RawArtifactInput): string {
  const { body, references } = renderFootnotes(input.content ?? '', input.md_citations);

  const parts: string[] = [body.trim()];
  if (references.length > 0) {
    parts.push('', '---', '', references.join('\n'));
  }
  return parts.join('\n') + '\n';
}
```

Also update the doc-comment above it: change the example from `# <title>` + body to just `<body with [^name] markers>` and note the title is no longer rendered (it is used only as a filename by the exporters).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- markdown`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/markdown.ts test/markdown.test.ts
git commit -m "feat: drop title heading from rendered markdown (title becomes filename)"
```

---

## Task 2: Settings store (`settings.ts`)

**Files:**

- Create: `src/settings.ts`
- Test: `test/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSettings, saveSettings } from '../src/settings';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('GM_getValue', (k: string, d: unknown) => (k in store ? store[k] : d));
  vi.stubGlobal('GM_setValue', (k: string, v: unknown) => {
    store[k] = v;
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getSettings()).toEqual({
      showCopy: true,
      showDownload: false,
      showObsidian: false,
      obsidianVault: '',
      obsidianFolder: '',
    });
  });

  it('round-trips saved settings', () => {
    saveSettings({
      showCopy: false,
      showDownload: true,
      showObsidian: true,
      obsidianVault: 'My Vault',
      obsidianFolder: 'Clippings',
    });
    expect(getSettings()).toEqual({
      showCopy: false,
      showDownload: true,
      showObsidian: true,
      obsidianVault: 'My Vault',
      obsidianFolder: 'Clippings',
    });
  });

  it('falls back to defaults on corrupt stored JSON', () => {
    store['cae-settings'] = '{not valid json';
    expect(getSettings().showCopy).toBe(true);
    expect(getSettings().obsidianVault).toBe('');
  });

  it('fills missing keys from defaults (partial stored object)', () => {
    store['cae-settings'] = JSON.stringify({ showDownload: true });
    const s = getSettings();
    expect(s.showDownload).toBe(true);
    expect(s.showCopy).toBe(true); // default preserved
    expect(s.obsidianFolder).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- settings`
Expected: FAIL — cannot resolve `../src/settings`.

- [ ] **Step 3: Implement `settings.ts`**

Create `src/settings.ts`:

```ts
const STORE_KEY = 'cae-settings';

/** Persisted user settings. One JSON blob under STORE_KEY. */
export interface Settings {
  /** Show the "Copy" button on each artifact row. */
  showCopy: boolean;
  /** Show the "Download" button. */
  showDownload: boolean;
  /** Show the "Save to Obsidian" button. */
  showObsidian: boolean;
  /** Obsidian vault name (required for Save to Obsidian). */
  obsidianVault: string;
  /** Vault-relative folder; '' means the vault root. */
  obsidianFolder: string;
}

const DEFAULTS: Settings = {
  showCopy: true,
  showDownload: false,
  showObsidian: false,
  obsidianVault: '',
  obsidianFolder: '',
};

/** Reads settings, merging any stored values over defaults. Tolerant of
 *  missing/corrupt/partial stored data — always returns a complete Settings. */
export function getSettings(): Settings {
  const raw = GM_getValue<string>(STORE_KEY, '');
  if (!raw) return { ...DEFAULTS };
  let parsed: Partial<Settings>;
  try {
    parsed = JSON.parse(raw) as Partial<Settings>;
  } catch {
    return { ...DEFAULTS };
  }
  return {
    showCopy: typeof parsed.showCopy === 'boolean' ? parsed.showCopy : DEFAULTS.showCopy,
    showDownload: typeof parsed.showDownload === 'boolean' ? parsed.showDownload : DEFAULTS.showDownload,
    showObsidian: typeof parsed.showObsidian === 'boolean' ? parsed.showObsidian : DEFAULTS.showObsidian,
    obsidianVault: typeof parsed.obsidianVault === 'string' ? parsed.obsidianVault : DEFAULTS.obsidianVault,
    obsidianFolder: typeof parsed.obsidianFolder === 'string' ? parsed.obsidianFolder : DEFAULTS.obsidianFolder,
  };
}

/** Persists the full settings object. */
export function saveSettings(s: Settings): void {
  GM_setValue(STORE_KEY, JSON.stringify(s));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- settings`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts test/settings.test.ts
git commit -m "feat: add persisted settings store"
```

---

## Task 3: Pure exporter helpers (`toFileName`, `buildObsidianUri`)

**Files:**

- Create: `src/exporters.ts` (helpers only in this task)
- Test: `test/exporters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/exporters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toFileName, buildObsidianUri } from '../src/exporters';

describe('toFileName', () => {
  it('strips filesystem-unsafe characters but keeps spaces', () => {
    expect(toFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(toFileName('My Report')).toBe('My Report');
  });

  it('collapses whitespace runs and trims', () => {
    expect(toFileName('  hello   world  ')).toBe('hello world');
    expect(toFileName('tab\tand\nnewline')).toBe('tab and newline');
  });

  it('falls back for empty / whitespace / undefined titles', () => {
    expect(toFileName('')).toBe('Untitled artifact');
    expect(toFileName('   ')).toBe('Untitled artifact');
    expect(toFileName(undefined)).toBe('Untitled artifact');
  });
});

describe('buildObsidianUri', () => {
  it('builds a new-note URI with encoded vault + folder/file and clipboard flag', () => {
    expect(buildObsidianUri({ vault: 'My Vault', folder: 'Clippings', title: 'My Report' })).toBe(
      'obsidian://new?vault=My%20Vault&file=Clippings%2FMy%20Report&clipboard=true',
    );
  });

  it('omits the folder segment when folder is empty (vault root)', () => {
    expect(buildObsidianUri({ vault: 'V', folder: '', title: 'Note' })).toBe(
      'obsidian://new?vault=V&file=Note&clipboard=true',
    );
  });

  it('strips leading/trailing slashes on the folder', () => {
    expect(buildObsidianUri({ vault: 'V', folder: '/sub/dir/', title: 'Note' })).toBe(
      'obsidian://new?vault=V&file=sub%2Fdir%2FNote&clipboard=true',
    );
  });

  it('sanitizes the title through toFileName', () => {
    expect(buildObsidianUri({ vault: 'V', folder: '', title: 'a/b:c' })).toBe(
      'obsidian://new?vault=V&file=abc&clipboard=true',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- exporters`
Expected: FAIL — cannot resolve `../src/exporters`.

- [ ] **Step 3: Implement the helpers**

Create `src/exporters.ts` with **only** the helpers for now (actions added in Task 4):

```ts
import type { Settings } from './settings';

/** Turns an artifact title into a safe bare filename (no extension).
 *  Strips \ / : * ? " < > | and control chars, collapses whitespace, trims;
 *  falls back to "Untitled artifact" when nothing usable remains. */
export function toFileName(title: string | undefined): string {
  const cleaned = (title ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Untitled artifact';
}

/** Builds an `obsidian://new` URI that pulls the note body from the clipboard.
 *  folder '' targets the vault root; leading/trailing slashes are stripped. */
export function buildObsidianUri(opts: { vault: string; folder: string; title: string }): string {
  const filename = toFileName(opts.title);
  const folder = opts.folder.replace(/^\/+|\/+$/g, '');
  const filePath = folder ? `${folder}/${filename}` : filename;
  const enc = encodeURIComponent;
  return `obsidian://new?vault=${enc(opts.vault)}&file=${enc(filePath)}&clipboard=true`;
}
```

> Note: `Settings` is imported now because Task 4 adds `saveToObsidian(..., s: Settings)` in this same file. If your linter flags the unused import between Task 3 and Task 4, proceed to Task 4 in the same sitting (the import is consumed there).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- exporters`
Expected: PASS (7 passing).

- [ ] **Step 5: Commit**

```bash
git add src/exporters.ts test/exporters.test.ts
git commit -m "feat: add toFileName + buildObsidianUri pure helpers"
```

---

## Task 4: Exporter actions (copy / download / save-to-obsidian)

**Files:**

- Modify: `src/exporters.ts` (append actions + the picker typing + the iframe helper)

These wrap browser/GM APIs and are verified by typecheck + manual testing (no unit test).

- [ ] **Step 1: Append the actions to `exporters.ts`**

Add to the **top** of `src/exporters.ts`, right under the existing `import`:

```ts
/** Minimal typing for the File System Access "save file" picker, which is not
 *  in lib.dom's Window type. Present on Chromium; absent elsewhere. */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}
```

Then add these functions at the **end** of the file:

```ts
/** Copies the rendered Markdown to the clipboard. */
export function copyArtifact(markdown: string): void {
  GM_setClipboard(markdown, 'text');
}

/** Opens the native Save As picker and writes the Markdown. Falls back to an
 *  anchor+Blob download where the picker is unavailable. User cancel is silent. */
export async function downloadArtifact(markdown: string, title: string | undefined): Promise<void> {
  const name = `${toFileName(title)}.md`;
  const picker = (unsafeWindow as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await picker({
        suggestedName: name,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // user cancelled
      throw err;
    }
    const writable = await handle.createWritable();
    await writable.write(markdown);
    await writable.close();
    return;
  }
  // Fallback: classic anchor download (no picker).
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Copies the body to the clipboard and fires `obsidian://new` so Obsidian
 *  writes the note. Returns false (and does nothing) when the vault is unset.
 *  No post-fire error handling: an unregistered protocol fails silently. */
export function saveToObsidian(markdown: string, title: string | undefined, s: Settings): boolean {
  if (!s.obsidianVault.trim()) return false;
  GM_setClipboard(markdown, 'text');
  fireUri(buildObsidianUri({ vault: s.obsidianVault, folder: s.obsidianFolder, title: title ?? '' }));
  return true;
}

/** Fires a custom-protocol URL via a transient hidden iframe so the host tab
 *  never navigates and an unregistered scheme fails quietly. */
function fireUri(uri: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = uri;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 1000);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors). If `FileSystemFileHandle`/`createWritable` are unknown, ensure `tsconfig` includes the `DOM` lib (it does for this project); these types ship with lib.dom.

- [ ] **Step 3: Run the full test suite (no regressions)**

Run: `pnpm test`
Expected: PASS — existing + new tests green; the action code is untested but must not break imports.

- [ ] **Step 4: Commit**

```bash
git add src/exporters.ts
git commit -m "feat: add copy/download/save-to-obsidian actions"
```

---

## Task 5: Rewrite the config panel (`config.ts`)

**Files:**

- Rewrite: `src/config.ts`

- [ ] **Step 1: Replace `config.ts` with the real settings panel**

Replace the entire contents of `src/config.ts` with:

```ts
import { getSettings, saveSettings, type Settings } from './settings';

const PANEL_ID = 'cae-config-panel';

/** Toggles a floating settings panel: which action buttons appear, plus the
 *  Obsidian vault + folder used by "Save to Obsidian". Persists via settings.ts. */
export function openConfigPanel(): void {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const settings = getSettings();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'cae-config-panel';

  const heading = document.createElement('h2');
  heading.className = 'cae-config-heading';
  heading.textContent = 'Artifact Extractor — Config';

  const copyCheck = makeCheckbox('Show “Copy” button', settings.showCopy);
  const downloadCheck = makeCheckbox('Show “Download” button', settings.showDownload);
  const obsidianCheck = makeCheckbox('Show “Save to Obsidian” button', settings.showObsidian);

  const vaultField = makeField('Obsidian vault name', 'e.g. My Vault', settings.obsidianVault);
  const folderField = makeField('Folder path (blank = vault root)', 'e.g. Clippings', settings.obsidianFolder);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'cae-config-save';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    const next: Settings = {
      showCopy: copyCheck.input.checked,
      showDownload: downloadCheck.input.checked,
      showObsidian: obsidianCheck.input.checked,
      obsidianVault: vaultField.input.value,
      obsidianFolder: folderField.input.value,
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
  close.addEventListener('click', () => panel.remove());

  panel.append(
    heading,
    copyCheck.wrap,
    downloadCheck.wrap,
    obsidianCheck.wrap,
    vaultField.wrap,
    folderField.wrap,
    save,
    close,
  );
  document.body.appendChild(panel);
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

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: real config panel for button toggles + obsidian vault/folder"
```

---

## Task 6: Render enabled buttons in the popover (`ui.ts`)

**Files:**

- Rewrite: `src/ui.ts`

- [ ] **Step 1: Replace `ui.ts`**

Replace the entire contents of `src/ui.ts` with:

```ts
import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import { getSettings, type Settings } from './settings';
import { copyArtifact, downloadArtifact, saveToObsidian } from './exporters';
import type { RawArtifactInput } from './types';

const BTN_ID = 'cae-export-button';
const POPOVER_ID = 'cae-export-popover';

/** Mounts the floating export button once the DOM is ready. */
export function mountUI(): void {
  if (document.getElementById(BTN_ID)) return;

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.className = 'cae-button';
  button.textContent = '⬇ Artifacts';
  button.addEventListener('click', togglePopover);
  document.body.appendChild(button);
}

function togglePopover(): void {
  const existing = document.getElementById(POPOVER_ID);
  if (existing) {
    existing.remove();
    return;
  }
  renderPopover();
}

function renderPopover(): void {
  const conversation = getLatestConversation();
  const artifacts = findArtifacts(conversation);
  const settings = getSettings();

  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  popover.className = 'cae-popover';

  if (artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = conversation
      ? 'No artifacts found in this conversation.'
      : 'No conversation captured yet. Open a research conversation, then reopen this.';
    popover.appendChild(empty);
  } else {
    artifacts.forEach((artifact) => {
      popover.appendChild(renderRow(artifact, settings));
    });
  }

  document.body.appendChild(popover);
}

/** Briefly swaps a button's label, then restores it. */
function flash(btn: HTMLButtonElement, msg: string, revert: string): void {
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = revert;
  }, 1500);
}

function renderRow(artifact: RawArtifactInput, settings: Settings): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cae-row';

  const title = document.createElement('div');
  title.className = 'cae-row-title';
  title.textContent = artifact.title || '(untitled artifact)';

  const meta = document.createElement('div');
  meta.className = 'cae-row-meta';
  meta.textContent = `${artifact.md_citations?.length ?? 0} reference(s)`;

  row.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'cae-row-actions';

  if (settings.showCopy) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'cae-copy';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      copyArtifact(renderArtifactMarkdown(artifact));
      flash(copy, 'Copied!', 'Copy');
    });
    actions.appendChild(copy);
  }

  if (settings.showDownload) {
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'cae-download';
    download.textContent = 'Download';
    download.addEventListener('click', () => {
      void downloadArtifact(renderArtifactMarkdown(artifact), artifact.title);
    });
    actions.appendChild(download);
  }

  if (settings.showObsidian) {
    const obsidian = document.createElement('button');
    obsidian.type = 'button';
    obsidian.className = 'cae-obsidian';
    obsidian.textContent = 'Save to Obsidian';
    obsidian.addEventListener('click', () => {
      const ok = saveToObsidian(renderArtifactMarkdown(artifact), artifact.title, settings);
      flash(obsidian, ok ? 'Sent to Obsidian ✓' : 'Set vault in Config…', 'Save to Obsidian');
    });
    actions.appendChild(obsidian);
  }

  if (actions.childElementCount > 0) row.appendChild(actions);
  return row;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui.ts
git commit -m "feat: render copy/download/obsidian buttons per settings"
```

---

## Task 7: Styles for the new buttons + config controls (`ui.css`)

**Files:**

- Modify: `src/ui.css`

- [ ] **Step 1: Extend the shared button rule**

In `src/ui.css`, replace the selector list of the existing button rule (currently `.cae-copy, .cae-config-save, .cae-config-close { ... }`, around lines 55-66) with this — adding the two new button classes and dropping the now-misplaced `margin-top` (spacing is handled by `.cae-row-actions`):

```css
.cae-copy,
.cae-download,
.cae-obsidian,
.cae-config-save,
.cae-config-close {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: #3a3a3a;
  color: #fff;
  cursor: pointer;
}
```

- [ ] **Step 2: Append the new layout rules**

Add to the end of `src/ui.css`:

```css
.cae-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
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

- [ ] **Step 3: Build to confirm the bundle compiles**

Run: `pnpm build`
Expected: PASS — `dist/claude-artifact-extractor.user.js` written, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui.css
git commit -m "style: layout for new action buttons and config controls"
```

---

## Task 8: Docs + full verification

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the architecture notes in `CLAUDE.md`**

In the "Architecture" module list, make these edits:

- Update the `src/markdown.ts` line to: `RawArtifactInput → Markdown (body + footnote list). The title is **not** rendered as a heading; it is used only as the export filename.`
- Update the `src/config.ts` line to: `Config… menu command opening a settings panel: checkboxes that toggle each row action (Copy / Download / Save to Obsidian) and the Obsidian vault + folder path, persisted via settings.ts.`
- Add two new bullets after the `src/config.ts` line:
    - `src/settings.ts — typed, persisted settings (GM_getValue/GM_setValue): which action buttons show + the Obsidian vault/folder.`
    - `src/exporters.ts — the three row actions (copy, download via showSaveFilePicker with anchor fallback, save-to-Obsidian via obsidian://new + clipboard) plus pure toFileName/buildObsidianUri helpers.`

In the "Commands" section, update the unit-test line to include the new modules: `covering the pure modules (citations.ts, footnotes.ts, conversation.ts, markdown.ts, settings.ts, exporters.ts)`.

- [ ] **Step 2: Run the full verification suite**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all three PASS — eslint clean, `tsc --noEmit` clean, all tests green, bundle built.

- [ ] **Step 3: Manual smoke test (record results)**

Build, install `dist/claude-artifact-extractor.user.js` in Tampermonkey, open a Claude research conversation with an artifact, then verify:

1. Open **Config…** → toggle each checkbox, set vault (e.g. your vault name) + folder (e.g. `Clippings`), **Save**, reload, reopen Config → values persisted.
2. Open the **⬇ Artifacts** popover → only the enabled buttons show on each row.
3. **Copy** → paste into an editor → Markdown has **no** `# title` heading; footnotes intact.
4. **Download** → native Save As dialog opens pre-filled `<title>.md`; chosen file written.
5. **Save to Obsidian** (vault set) → Obsidian opens and creates the note at `<folder>/<title>` with the body; clipboard holds the Markdown.
6. **Save to Obsidian** (vault blank) → button shows "Set vault in Config…", nothing saved.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document settings + exporters modules and title-as-filename"
```

---

## Self-Review (done while writing)

**Spec coverage:**

- Copy/Download/Save-to-Obsidian actions → Tasks 4 + 6. ✅
- Config checkboxes gate each button → Tasks 5 + 6. ✅
- Obsidian vault/folder settings, always visible → Task 5. ✅
- Title-as-filename, no `# H1` anywhere (Copy included) → Task 1 (render) + Tasks 4/6 (filename use). ✅
- `obsidian://new` + `clipboard=true`, opens Obsidian (no `silent`), hidden-iframe fire → Tasks 3 + 4. ✅
- Empty-vault no-op with hint → Task 4 (`saveToObsidian` returns false) + Task 6 (hint label). ✅
- `showSaveFilePicker` with anchor fallback, AbortError silent, `unsafeWindow` → Task 4. ✅
- No new GM grants → confirmed (no `vite.config.ts` change). ✅
- Tests: `toFileName`, `buildObsidianUri`, settings defaults/round-trip/corrupt/partial, markdown title-less → Tasks 1-3. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `Settings` shape identical across `settings.ts`, `exporters.ts` (`saveToObsidian`), `config.ts`, `ui.ts`. `toFileName(title: string | undefined)` and `buildObsidianUri({vault, folder, title})` signatures match all call sites. `getSettings`/`saveSettings` names consistent. ✅
