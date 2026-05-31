# Claude Artifact Extractor — Design

**Date:** 2026-05-29
**Status:** Approved (design); implementation pending plan

## Problem

Claude's research feature produces a Markdown **artifact** with inline source
citations. The native "Download as Markdown / PDF" exports only the artifact's
prose and **drops the references**, because the references are stored as separate
metadata, not embedded in the Markdown text.

This project is a Tampermonkey userscript that captures Claude's own API data,
reconstructs the artifact **with its references as Obsidian-style footnotes**, and
lets the user copy it to the clipboard.

## Confirmed data model

Source: the conversation-load response

```
GET https://claude.ai/api/organizations/{org}/chat_conversations/{conv}
      ?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong
```

Shape (fields we rely on):

```jsonc
{
  "uuid": "...", "name": "...", "summary": "...",
  "chat_messages": [
    {
      "uuid": "...", "sender": "human" | "assistant", "index": 0,
      "parent_message_uuid": "...",
      "content": [ /* content blocks */ ]
    }
  ]
}
```

Content block types observed: `text` (with a `citations` array, often empty),
`thinking`, `tool_use`, `tool_result`.

**The research report is a `tool_use` block with `name === "artifacts"`.** Its
`input` is:

```jsonc
{
  "id": "compass_artifact_wf-..._text/markdown",
  "type": "text/markdown",
  "title": "How Obsidian Users Actually Build Their Second Brains: ...",
  "source": "c",
  "command": "create",          // also: "update" / "rewrite" for later versions
  "content": "# How Obsidian users...\n\n...",   // CLEAN markdown, no inline markers
  "language": null,
  "version_uuid": "...",
  "md_citations": [ /* the references the native export drops */ ]
}
```

Each `md_citations[]` entry:

```jsonc
{
  "uuid": "...",
  "title": "Emilevankrieken",                 // short label
  "url": "https://www.emilevankrieken.com/blog/2025/academic-obsidian/",
  "metadata": {
    "type": "generic_metadata",
    "preview_title": "How I use Obsidian for academic work | Emile van Krieken",
    "icon_url": "https://www.google.com/s2/favicons?sz=64&domain=...",
    "source": "Emilevankrieken"
  },
  "origin_tool_name": "web_search",
  "sources": [ { "title": "...", "url": "...", "uuid": "..." } ],
  "start_index": 1959,    // char offset into input.content
  "end_index": 2146       // char offset into input.content
}
```

Key facts driving the design:

- `input.content` is **clean Markdown with zero inline citation markers**.
- `md_citations[].start_index/end_index` are **character offsets into
  `input.content`** that mark the span of prose each source supports.
- Citations can **overlap / share a start** (e.g. `1959..2146` and `1959..2184`)
  and **multiple citations can share a URL** (sample: 12 citations, 4 unique URLs).
- `metadata.preview_title` is the human-friendly source title; `title` is a short
  slug. Use `preview_title || title` as the footnote label.

## Output format

Obsidian-style footnotes:

```markdown
# <artifact title>

<artifact content, with [^n] markers inserted at each citation's end_index>

---

[^1]: <preview_title or title> — <url>
[^2]: ...
```

- **No deduplication.** Each `md_citations[]` entry gets its own footnote number,
  in array order. Two citations to the same URL produce two footnotes — that's
  fine for now and keeps the mapping trivial (citation index → footnote number).
- A marker `[^n]` is inserted at the citation's `end_index`. Multiple markers at
  the same point render consecutively (`...text[^1][^2]`).
- Indices are **UTF-16 offsets** — plain JavaScript string indices. Verified
  empirically: in the sample, citation end_index 5292 lands cleanly after
  `"...The recall payoff"` using `content.slice()`, while a code-point array
  (`Array.from`) overshoots past the emoji at index 4893. So marker insertion
  uses direct string indexing (`content.slice(0, end) + marker + content.slice(end)`),
  inserting markers in **descending end_index order** so earlier offsets stay valid.

## Architecture

Data flow: `fetch` patch → capture store → artifact extractor → footnote renderer
→ output, surfaced through a popover UI.

### Modules

- **`src/fetch-interceptor.ts`** — patch `unsafeWindow.fetch` at
  `document-start`. Capture responses whose URL matches the
  `chat_conversations/<uuid>` load endpoint; clone before reading; parse JSON;
  store. Capture failures are swallowed so interception never breaks the page.
- **`src/conversation.ts`** — types for the captured response + a parser that
  walks `chat_messages`, finds `artifacts` tool_use blocks, and groups versions by
  `input.id` (keeping the final version per id). Produces:

  ```ts
  interface ArtifactDoc {
    id: string;
    title: string;
    content: string;
    citations: { url: string; label: string; start: number; end: number }[];
    versionUuid: string;
  }
  ```

- **`src/footnotes.ts`** — pure function: `(content, citations) => markdownBody`.
  Numbers citations in array order (no dedup); inserts `[^n]` markers at
  `end_index` using UTF-16 string indexing, in descending end_index order so
  earlier offsets stay valid; returns body + ordered reference list. Fallback: if
  an artifact ever lacks indices, append the reference list with no inline anchors
  (preserves all sources).
- **`src/markdown.ts`** — assembles `# title` + body + `---` + footnote list into
  the final document.
- **`src/ui.ts`** — a floating button on `claude.ai`. Click opens a **popover
  listing artifacts only** (title, reference count, version). Each row has a
  **Copy** action. (Prototype: confirms what is capturable and informs the final
  selection UX.)
- **`src/main.ts`** — installs the interceptor immediately, then mounts the UI.

### Output behaviors

- **Copy** the rendered Markdown to clipboard via `GM_setClipboard`. This is the
  only output for now — it's enough to verify the rendered result by pasting.
- **Download is deferred** (out of scope for this iteration). The renderer returns
  a plain string, so adding `GM_download` later is a small, isolated change.

### Build / tooling

- Vite + vite-plugin-monkey, TypeScript. Userscript metadata (name,
  `@match https://claude.ai/*`, `@run-at document-start`, grants
  `GM_registerMenuCommand`, `GM_setClipboard`) is generated from `vite.config.ts`.
  (`GM_download` will be added when download lands.)

## Edge cases & decisions

- **Multiple artifact versions** (same `id`, `command` create→update→rewrite):
  keep the final version. Verify whether `update`/`rewrite` carry full vs partial
  `content`; if partial, reconstruct from the version chain. (`create` carries
  full content, confirmed.)
- **Overlapping / shared-start citation spans:** allowed; markers inserted by
  `end_index`. No deduplication — each citation is its own footnote.
- **Multiple conversations captured in one session:** the popover keys artifacts
  by conversation; for the prototype it can show artifacts from the most recently
  loaded conversation.
- **Interception safety:** clone responses before reading; never throw into the
  page; SSE/non-JSON responses are ignored for extraction.
- **Discovery aid:** retain a menu command to dump captured responses to the
  console / `window.__claudeCaptured` for debugging schema drift.

## Scope (YAGNI)

In scope: capture, artifact extraction, footnote rendering (no dedup), popover
listing artifacts, **copy to clipboard**.

Out of scope (for now): **download** (deferred), citation dedup, exporting plain
assistant answers or whole conversations, PDF output, multi-conversation history
browser, settings UI for reference style.

## Open items to verify during implementation

1. `update` / `rewrite` artifact payloads: full or partial `content`?
2. ~~Whether `start_index/end_index` are code-point or UTF-16 offsets~~ —
   **Resolved:** UTF-16 offsets (plain JS string indices). Verified against the
   emoji-containing sample (citation end 5292 aligns with `content.slice`).
