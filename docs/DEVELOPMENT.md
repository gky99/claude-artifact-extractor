# Development

Developer notes for working on Claude Artifact Extractor. End-user docs live in
the [README](../README.md).

## Stack

Single Tampermonkey userscript, bundled by **Vite + [vite-plugin-monkey]**. The
userscript metadata block (name, `@match https://claude.ai/*`,
`@run-at document-start`, `@grant` list) is **generated from `vite.config.ts`** —
edit grants/matches there, never in a hand-written header.

[vite-plugin-monkey]: https://github.com/lisonge/vite-plugin-monkey

## Commands

This project uses **pnpm** (pinned via the `packageManager` field in
`package.json`). Install it with `corepack enable pnpm` if you don't have it.

```bash
pnpm install       # install dependencies (uses pnpm-lock.yaml)
pnpm dev           # Vite dev server; serves a hot-reloading .user.js to install once in Tampermonkey
pnpm build         # Bundle to dist/claude-artifact-extractor.user.js (the installable artifact)
pnpm test          # vitest run
pnpm lint          # eslint + tsc --noEmit
pnpm typecheck     # tsc --noEmit only
```

With `pnpm dev`, open the URL Vite prints and install the served userscript in
Tampermonkey once — it then hot-reloads as you edit. For a fixed install, run
`pnpm build` and drag `dist/claude-artifact-extractor.user.js` into Tampermonkey.

> **Dev-mode caveat:** `pnpm dev` cannot intercept the *initial* conversation
> load on CSP-strict claude.ai, so artifacts from the first page load may be
> missing. The UI is still testable, and the production build is unaffected.

## Testing

Unit tests run on **vitest** (`pnpm test`), covering the pure modules
(`citations.ts`, `footnotes.ts`, `conversation.ts`, `markdown.ts`, `settings.ts`,
`exporters.ts`). A captured `sample-response.json` fixture drives the
conversation/extraction tests.

UI, capture, and persistence are verified manually: build, install in
Tampermonkey, and exercise the floating popover and Config panel on a live Claude
conversation.

## Architecture

Data flow: `fetch` patch → capture store → `findArtifacts` (raw selection) →
`resolveReferences` (dedup + naming) → footnote placement → markdown renderer.

- `src/main.ts` — entry. Installs the interceptor immediately, injects styles,
  mounts the floating UI, and registers the `Config…` menu command (plus the
  debug-only "Dump captured responses" command).
- `src/fetch-interceptor.ts` — patches **`unsafeWindow.fetch`** (the page's real
  fetch, not the sandboxed copy) and stashes responses matching `/api/`.
  Responses are **cloned before reading** so the app's own consumer is never
  disturbed; capture failures are swallowed so interception can never break the
  page.
- `src/conversation.ts` — captured JSON → raw artifact selection
  (`findArtifacts`), keeping the final version per artifact `id`. No
  normalization: raw `RawArtifactInput` shapes flow through untouched until
  export.
- `src/citations.ts` — `resolveReferences`: dedupes sources (by URL, else title),
  assigns each a footnote name from its `title` slug (spaces→`_`, brackets
  stripped, collisions suffixed `-2`), and keeps a friendly label
  (`preview_title`).
- `src/footnotes.ts` — inserts named `[^name]` markers at the end of each
  citation's line/table-cell, dedupes repeated sources within a paragraph, and
  emits a deduplicated reference list.
- `src/markdown.ts` — `RawArtifactInput` → Markdown (body + footnote list). The
  title is **not** rendered as a heading; it is used only as the export filename.
- `src/types.ts` — captured-response and raw artifact shapes plus the computed
  `Reference` type.
- `src/artifact-popover.ts` / `src/artifact-popover.css` — floating popover
  listing artifacts with per-row action buttons (Copy / Download / Save to
  Obsidian) and a draggable button stack with a gear button to open settings.
- `src/settings-panel.ts` / `src/settings-panel.css` — focus-modal settings panel
  with themed sections: checkboxes that toggle each row action and the Obsidian
  vault + folder path, persisted via settings.ts.
- `src/theme.ts` / `src/theme.css` — `applyTheme` reflects the chosen theme onto
  `<html>` via a `data-cae-theme` attribute; `theme.css` defines the cae-prefixed
  design tokens (light default, dark via `prefers-color-scheme`, forced
  overrides).
- `src/draggable.ts` — `makeDraggable` (Pointer Events, click/drag threshold) and
  the pure `clampToViewport` helper that keeps the button stack on-screen.
- `src/settings.ts` — typed, persisted settings (GM_getValue/GM_setValue): which
  action buttons show, the Obsidian vault/folder, theme, and button position.
- `src/exporters.ts` — the three row actions (copy; download via
  showSaveFilePicker with anchor fallback; save-to-Obsidian via obsidian://new +
  clipboard) plus pure toFileName/buildObsidianUri helpers.

## Styling

UI styles live in **separate `.css` source files** (e.g. `theme.css`,
`artifact-popover.css`, `settings-panel.css`), not in inline `el.style`
assignments. Each is imported with `?inline` and injected once via `GM_addStyle`
(inject `theme.css` first so component styles can reference its variables).
Dynamic geometry (a dragged position, a computed popover anchor) may be set
inline via `el.style.left/top/right/bottom`; only colors, borders, and other
presentation stay in CSS. All CSS is inlined into the single bundled userscript at
build time — no second asset is shipped and nothing is fetched at runtime.

```ts
import css from './artifact-popover.css?inline'; // compiled to a string literal in the bundle
GM_addStyle(css);                                // inject once, before mounting UI
```

- `GM_addStyle` must be listed in the `grant` array in `vite.config.ts` (grants
  are generated from there, never hand-written).
- **Prefix every class with `cae-`.** `GM_addStyle` injects *global* rules into
  Claude's own page, so unprefixed names risk colliding with Claude's CSS.
- Authoring CSS externally (vs. `Object.assign(el.style, …)`) unlocks
  `:hover`/`:focus`, media queries, and `@keyframes`, and keeps DOM construction
  separate from presentation.

**Why not Tampermonkey `@resource`?** It *can* attach a separate CSS asset via
`@resource` + `GM_getResourceText`, but that requires hosting the file at a URL
and adds an install-time network dependency. Compiling our small stylesheet into
the one `.user.js` via Vite is simpler and keeps the artifact self-contained.

## Key constraints

- **Patch `unsafeWindow.fetch`, not `window.fetch`.** With GM grants active the
  userscript runs in a sandbox; only `unsafeWindow` reaches the fetch the Claude
  app actually calls. This is why `@run-at document-start` matters — the patch
  must be in place before the app issues requests.
- **Never let interception throw into the app.** All capture work is wrapped so a
  failure logs/silently drops the captured response rather than breaking Claude.
- **Schema is reverse-engineered.** Extraction lives in `src/conversation.ts`
  (`findArtifacts`) against the real conversation-load shape; the
  `sample-response.json` fixture drives the unit tests.

## Discovery workflow (diagnosing schema drift)

Claude's response schema is reverse-engineered, so it can drift. To inspect live
traffic:

1. Open **Config…** and enable **Debug capture**. This registers the menu command
   and starts capturing every `/api/` response.
2. Tampermonkey menu → **Dump captured responses (console)**. Inspect the JSON in
   DevTools (also parked on `window.__claudeCaptured`).
3. Find which response carries the artifact text and where citations live, then
   update `findArtifacts` / the citation resolution accordingly.

## Parallel development

When multiple tasks are worked on in parallel, each task should be developed in
its own **git worktree** branched off the **latest `dev` branch** — not in the
shared working copy. Pull/refresh `dev` before creating the worktree so every task
starts from current tip.

**Squash before merging back.** A worktree's branch may accumulate many small
commits (TDD steps, review fixes). When integrating into `dev`, squash them into a
**single commit** so `dev` history stays one-commit-per-task — e.g.
`git reset --soft <pre-merge-base> && git commit` on `dev`, or
`git merge --squash <branch>`. Do not preserve the intermediate commits or a
`--no-ff` merge bubble on `dev`.

## Design decisions (from initial brainstorming)

- Trigger via a floating UI + Tampermonkey menu, not Claude's own DOM controls —
  robust to Claude UI changes.
- Output **multiple** destinations (clipboard, file download, Obsidian).
- **Footnote-style** references for Obsidian compatibility.
