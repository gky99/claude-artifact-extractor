# Configurable Export Actions (Copy / Download / Save to Obsidian) — Design

**Date:** 2026-05-30
**Status:** Draft (awaiting user review)

## Problem

Today each artifact row offers a single **Copy Markdown** action (`src/ui.ts`),
and the config panel (`src/config.ts`) only persists a dummy setting. The user
wants two more ways to get an artifact out, and wants each action to be
individually enableable:

1. **Copy** — existing clipboard export (unchanged behavior, but see the title
   change below).
2. **Download** — open the browser's native **Save As** picker and write the
   Markdown to a `.md` file the user chooses.
3. **Save to Obsidian** — drop the Markdown straight into a configured Obsidian
   vault + folder, without a native helper binary.

Plus two cross-cutting changes:

4. **Config-driven buttons.** Each of the three actions has a checkbox in the
   config panel; only the checked actions render as buttons on each artifact row.
5. **Title becomes the filename, not body content.** The rendered Markdown should
   **no longer** begin with a `# <title>` heading. The title is used as the
   suggested **filename** (Download) and note path (Obsidian) instead. Copy emits
   the same title-less body for consistency (paste into a note whose filename is
   the title).

## How "Save to Obsidian" works (no native helper)

The Obsidian Web Clipper does **not** use a Native Messaging helper binary. The
Obsidian **desktop app registers the `obsidian://` URL scheme with the OS**; any
app/extension/userscript can fire those URLs and Obsidian — a real native app with
full disk access to its vaults — performs the file write. There is no token or
credential gating the protocol.

We reuse the same mechanism. `obsidian://new` (Obsidian **1.7.2+**) accepts:

- `vault` — vault name,
- `file` — vault-relative path + filename (Obsidian appends `.md`),
- `clipboard` — pull the note body from the **system clipboard** (sidesteps the
  URL-length limit that would truncate large artifacts),
- `silent` — *omitted here* (we want Obsidian to open the note as confirmation).

So **Save to Obsidian** = `GM_setClipboard(markdown)` then fire
`obsidian://new?vault=<vault>&file=<folder>/<title>&clipboard=true`. Firing the
URL activates Obsidian (required for the protocol to act). No new GM grants are
needed — `showSaveFilePicker` and `obsidian://` are plain browser features, and
`GM_setClipboard` is already granted.

Sources: [Obsidian URI — Obsidian Help](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI),
[Web Clipper / Obsidian URI — DeepWiki](https://deepwiki.com/obsidianmd/obsidian-help/6.1-obsidian-uri).

## Architecture & data flow

```
settings store (GM_*)  ──read on popover open──►  ui.ts renders enabled buttons
        ▲                                                  │ click
        │ config panel writes                              ▼
   config.ts  ◄──── getSettings/saveSettings ────►  exporters.ts action
                                                    (copy / download / obsidian)
                                                          uses renderArtifactMarkdown(input)
```

Settings are read when the popover opens; changing config takes effect the next
time the popover is opened (re-open to see changes). Defaults preserve today's
behavior: **Copy on, Download off, Save-to-Obsidian off**, vault/folder empty.

### Modules

- **`src/settings.ts`** *(new)* — owns the settings schema + persistence over
  `GM_getValue`/`GM_setValue`. One stored JSON blob under a single key.
  ```ts
  export interface Settings {
    showCopy: boolean;       // default true
    showDownload: boolean;   // default false
    showObsidian: boolean;   // default false
    obsidianVault: string;   // default ''
    obsidianFolder: string;  // default '' (empty = vault root)
  }
  export function getSettings(): Settings;        // merge stored over defaults
  export function saveSettings(s: Settings): void;
  ```
  Tolerant load: missing/corrupt stored value → defaults; unknown keys ignored.

- **`src/exporters.ts`** *(new)* — the three actions plus two **pure,
  unit-testable** helpers:
  ```ts
  // Pure helpers
  export function toFileName(title: string | undefined): string;
  // strip \ / : * ? " < > | and control chars; collapse spaces; trim;
  // empty -> 'Untitled artifact'. No extension (callers add .md / Obsidian adds it).
  export function buildObsidianUri(opts: {
    vault: string; folder: string; title: string;
  }): string;
  // obsidian://new?vault=<enc>&file=<enc(folder + '/' + filename)>&clipboard=true
  // folder '' -> file is just the filename; strips leading/trailing slashes on folder.

  // Actions (impure; take already-rendered markdown)
  export function copyArtifact(markdown: string): void;
  export function downloadArtifact(markdown: string, title: string | undefined): Promise<void>;
  export function saveToObsidian(markdown: string, title: string | undefined, s: Settings): boolean;
  ```
  - `downloadArtifact`: call `unsafeWindow.showSaveFilePicker({ suggestedName:
    toFileName(title) + '.md', types: [{ description: 'Markdown', accept: {
    'text/markdown': ['.md'] } }] })`, write via the returned writable. User
    cancel (`AbortError`) → silent no-op. If `showSaveFilePicker` is unavailable,
    fall back to an anchor + `Blob` download (no picker). Use `unsafeWindow` so the
    file handle lives in the page realm, avoiding Tampermonkey sandbox cross-realm
    issues.
  - `saveToObsidian`: if `s.obsidianVault` is empty → **no-op, return false**
    (caller shows a hint). Else `GM_setClipboard(markdown, 'text')`, then fire the
    URI via a transient hidden `<iframe>` (so the Claude tab never navigates), and
    return true.

- **`src/markdown.ts`** *(edit)* — `renderArtifactMarkdown(input)` **no longer
  prepends `# <title>`**. Output is `body.trim()` + (`---` + reference list when
  there are references). The title heading is removed entirely; the title is only
  used downstream for filenames.

- **`src/ui.ts`** *(edit)* — `renderRow(artifact)` reads `getSettings()` and
  appends only the enabled buttons in order: Copy, Download, Save to Obsidian.
  Each button:
  - **Copy** → `copyArtifact(renderArtifactMarkdown(artifact))`, transient
    "Copied!".
  - **Download** → `downloadArtifact(renderArtifactMarkdown(artifact),
    artifact.title)`.
  - **Save to Obsidian** → `saveToObsidian(md, artifact.title, settings)`; on
    `false` (no vault) show transient "Set vault in Config…", on `true` show
    "Sent to Obsidian ✓".
  If **no** action is enabled, the row still lists the artifact (title + ref
  count) with no buttons.

- **`src/config.ts`** *(rewrite)* — replace the dummy setting with the real panel,
  reading/writing via `settings.ts`. Sections:
  - **Buttons** — three checkboxes bound to `showCopy` / `showDownload` /
    `showObsidian`.
  - **Obsidian** — two always-visible text inputs: **Vault name** and **Folder
    path** (placeholder e.g. `Clippings`; empty = vault root).
  - **Save** button → `saveSettings(...)`, transient "Saved ✓". **Close** button.
  Styled via existing `cae-` classes in `ui.css` (add new classes as needed,
  all `cae-`-prefixed).

- **`src/main.ts`** — unchanged wiring (already registers `Config…`); no new menu
  commands.

- **`vite.config.ts`** — **no grant changes.** `showSaveFilePicker`, `obsidian://`,
  and the hidden-iframe trick are plain web APIs; `GM_setClipboard`/`GM_addStyle`/
  `GM_getValue`/`GM_setValue` are already granted.

## Edge cases

- **Save to Obsidian with empty vault** → no-op; button shows "Set vault in
  Config…". Folder may be empty (vault root). The action never partially runs.
- **Download cancelled** → `AbortError` swallowed, no error surfaced.
- **`showSaveFilePicker` unavailable** (non-Chromium) → anchor+Blob fallback
  download (no picker), still produces the file.
- **Untitled artifact** → `toFileName` returns `Untitled artifact`; Obsidian path
  becomes `<folder>/Untitled artifact`.
- **Obsidian not installed / didn't receive it** → not detectable from the page.
  We do **no post-fire error handling**: once the clipboard is set and the URI is
  fired, our responsibility ends. Firing via a hidden `<iframe>` means an
  unregistered `obsidian://` scheme fails *silently* — no navigation, no error
  page, no "open with…" dialog. The button still shows the optimistic "Sent to
  Obsidian ✓"; the checkmark means "URL fired", not "note delivered". Any
  browser/OS-level outcome after that (including Chrome's own "Open Obsidian?"
  permission prompt when it *is* installed) is the platform's UX, not ours.
- **Filename-unsafe titles** (`/ \ : * ? " < > |`, control chars) → stripped by
  `toFileName`; spaces preserved (valid in both file pickers and Obsidian).

## Testing

- **`exporters.test.ts`** *(new, vitest)* — pure helpers only:
  - `toFileName`: strips each unsafe char; preserves spaces; trims; collapses
    internal whitespace runs; empty/whitespace/undefined → `Untitled artifact`.
  - `buildObsidianUri`: URL-encodes vault/file; joins folder + filename with a
    single `/`; strips leading/trailing slashes on folder; folder `''` → file is
    just the filename; always includes `clipboard=true` and omits `silent`.
- **`markdown.test.ts`** *(update)* — assert the rendered output **no longer**
  contains a `# <title>` heading; body + reference list only; an empty title no
  longer changes the body (heading never emitted).
- **`settings.test.ts`** *(new)* — defaults when nothing stored; round-trip
  save→load; corrupt/partial stored JSON falls back to defaults; unknown keys
  ignored.
- **Manual** — build, install, on a live conversation: toggle each checkbox and
  confirm buttons appear/disappear; Download opens the Save As picker and writes
  the file; Save to Obsidian (with vault set) lands the note in the configured
  vault/folder and opens it; with vault unset shows the hint and writes nothing.

## Scope (YAGNI)

**In scope:** three per-row actions, config checkboxes gating each, Obsidian
vault/folder settings, title-as-filename (drop the `# title` heading everywhere),
`obsidian://new` + clipboard save, `showSaveFilePicker` download with anchor
fallback, settings persistence module, unit tests for the pure helpers + settings
+ updated markdown test.

**Out of scope:** native-messaging helper / arbitrary-path silent saves, migrating
to a Chrome extension, `GM_download`, per-artifact custom filenames or templates,
`silent` Obsidian mode, multi-vault selection UI, detecting whether Obsidian
received the note, batch/all-artifacts export, any change to the fetch
interceptor/capture store.

## Decisions & assumptions

- The title is surfaced **only** as a filename now; the `# <title>` heading is
  removed from rendered Markdown for all three actions (Copy included).
- Save to Obsidian **opens** Obsidian (no `silent`) — required for the protocol to
  act and gives visible confirmation.
- Content reaches Obsidian via the **clipboard** (`clipboard=true`), not embedded
  in the URL, to avoid URL-length truncation on large artifacts.
- Config fields are **always visible** (not hidden behind the Obsidian checkbox).
- Empty vault = no-op with hint; empty folder = vault root.
- No new GM grants; Download uses `unsafeWindow.showSaveFilePicker`, falling back
  to an anchor+Blob download where the API is missing.
