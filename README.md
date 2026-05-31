# Claude Artifact Extractor

A Tampermonkey userscript that exports Claude **research artifacts** to Markdown
**with inline references preserved**.

Claude's built-in "Download as Markdown / PDF" drops the inline citations that
make research output useful. This script captures the page's own API data (by
monkey-patching `fetch`) and rebuilds the artifact as Markdown with footnote-style
references (`[^1]` markers + a reference list), which round-trips cleanly into
Obsidian.

## Status

Early. The **capture pipeline works**; the **extractor is a stub** because
Claude's response schema still needs to be reverse-engineered from live traffic.
See the discovery workflow below.

## How it works

1. At `document-start`, the script patches the page's `fetch` (via `unsafeWindow`)
   and clones every response to `claude.ai/api/...` into an in-memory store.
   Cloning means the app's own data flow is never disturbed.
2. Tampermonkey menu commands let you dump captured responses (discovery) or, once
   the extractor is implemented, export the open artifact as Markdown — either
   downloaded as a `.md` file or copied to the clipboard.

## Develop

This project uses [pnpm](https://pnpm.io/). Install it with `corepack enable pnpm`
(or `npm i -g pnpm`) if you don't have it.

```bash
pnpm install
pnpm dev         # vite dev server; serves a live .user.js for install
pnpm build       # outputs dist/claude-artifact-extractor.user.js
pnpm lint        # eslint + tsc --noEmit
```

With `pnpm dev`, open the URL Vite prints and install the served userscript in
Tampermonkey once — it then hot-reloads as you edit. For a fixed install, run
`pnpm build` and drag `dist/claude-artifact-extractor.user.js` into Tampermonkey.

## Discovery workflow (reverse-engineering the schema)

1. Install the script and open a Claude **research** conversation.
2. Tampermonkey menu → **Dump captured responses (console)**. Inspect the JSON in
   DevTools (also parked on `window.__claudeCaptured`).
3. Find which response carries the artifact text and where citations live.
4. Implement `src/extractor.ts`: map citation anchors to `[^n]` markers and collect
   the `references` list. Then the two **Export artifact → Markdown** menu commands
   become usable.
