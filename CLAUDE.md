# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Tampermonkey userscript that exports Claude research artifacts to Markdown with
inline references preserved (the native "Download as Markdown/PDF" drops them). It
works by capturing the page's own API data, not by scraping the rendered DOM.

## Commands

```bash
npm run dev        # Vite dev server; serves a hot-reloading .user.js to install once in Tampermonkey
npm run build      # Bundle to dist/claude-artifact-exporter.user.js (the installable artifact)
npm run lint       # eslint + tsc --noEmit
npm run typecheck  # tsc --noEmit only
```

There is no test runner yet. Verification is manual: build, install in Tampermonkey,
exercise the menu commands on a live Claude research conversation.

## Architecture

Single userscript, bundled by **Vite + vite-plugin-monkey**. The userscript
metadata block (name, `@match https://claude.ai/*`, `@run-at document-start`,
`@grant` list) is **generated from `vite.config.ts`** — edit grants/matches there,
never in a hand-written header.

Data flow: `fetch` patch → capture store → extractor → markdown renderer.

- `src/main.ts` — entry. Installs the interceptor immediately, then registers all
  Tampermonkey menu commands (export-to-download, export-to-clipboard, and the
  discovery commands dump/clear).
- `src/fetch-interceptor.ts` — patches **`unsafeWindow.fetch`** (the page's real
  fetch, not the sandboxed copy) and stashes responses matching `/api/`. Responses
  are **cloned before reading** so the app's own consumer is never disturbed;
  capture failures are swallowed so interception can never break the page.
- `src/extractor.ts` — captured JSON → normalized `ExtractedArtifact`.
  **Currently a stub that throws** — the real Claude schema is unknown.
- `src/markdown.ts` — `ExtractedArtifact` → Markdown. Uses footnote references:
  expects `[^n]` markers already in `body`, emits a matching `[^n]:` list.
- `src/types.ts` — captured-response and artifact shapes. Intentionally loose
  until the schema is reverse-engineered.

## Key constraints

- **Patch `unsafeWindow.fetch`, not `window.fetch`.** With GM grants active the
  userscript runs in a sandbox; only `unsafeWindow` reaches the fetch the Claude
  app actually calls. This is why `@run-at document-start` matters — the patch must
  be in place before the app issues requests.
- **Never let interception throw into the app.** All capture work is wrapped so a
  failure logs/silently drops the captured response rather than breaking Claude.
- **Schema is undiscovered.** Before implementing `extractor.ts`, run the
  discovery workflow: menu → "Dump captured responses", inspect JSON in DevTools
  (also on `window.__claudeCaptured`), then write extraction against the real shape.
  Tighten `src/types.ts` at the same time.

## Design decisions (from initial brainstorming)

- Trigger via **Tampermonkey menu** (`GM_registerMenuCommand`), not injected DOM —
  robust to Claude UI changes.
- Output **both** download (`GM_download`) and clipboard (`GM_setClipboard`).
- **Footnote-style** references for Obsidian compatibility.
