# Footnote Fixes + Deferred Normalization + Config Page — Design

**Date:** 2026-05-30
**Status:** Draft (awaiting user review)

## Problem

The current footnote rendering (`src/footnotes.ts`) works but has four shortcomings,
and the surrounding code has two structural issues the user wants addressed in the
same pass:

1. **Footnotes are numbered (`[^1]`, `[^2]`).** They should be *named* after each
   citation's source, so the Markdown is readable and stable.
2. **Markers are injected at the exact `end_index` offset**, splitting prose
   mid-sentence. They should move to the end of the line/paragraph.
3. **No deduplication.** The same source can appear many times — both as repeated
   reference-list entries at the bottom and as repeated markers within one
   paragraph.
4. **No config surface.** There is no settings page, and we want a minimal one that
   proves a setting can be persisted.

Structural issues to fix at the same time:

5. **Eager normalization.** `extractArtifacts` transforms the raw conversation into
   self-defined `ArtifactDoc`/`Citation` types the moment the popover opens. The
   raw input should be kept as-is until it is actually needed (export time).
6. **Inline styles.** `src/ui.ts` assigns styles via `Object.assign(el.style, …)`,
   contrary to CLAUDE.md, which mandates an external `src/ui.css` injected via
   `GM_addStyle`.

## Data model (recap)

Each `md_citations[]` entry (offsets are UTF-16 indices into the clean
`input.content`):

```jsonc
{
  "title": "Emilevankrieken",                       // short slug -> footnote NAME
  "url": "https://www.emilevankrieken.com/...",      // identity + reference URL
  "metadata": { "preview_title": "How I use Obsidian for academic work | Emile van Krieken" },
  "start_index": 1959,
  "end_index": 2146
}
```

- **Footnote name** comes from `title` (the slug).
- **Reference-list description** uses the friendly source title
  `metadata.preview_title || title` and the top-level `url`.
  (`sources[].title`/`sources[].url`, when present, are expected to match
  `preview_title`/`url`; we use `preview_title`/`url`.)
- Citations may share a URL, overlap, or share a `start`/`end`.

## Architecture & data flow

```
capture (unchanged) → SELECT raw artifacts → list in UI → on Copy: RENDER
```

No raw→custom-type transformation happens on UI load. The self-defined
`ArtifactDoc` and `Citation` types are **removed**. The only new self-defined type
is `Reference`, which is genuinely *computed* output (deduped, with an assigned
name) rather than a re-typing of the input.

### Modules

- **`src/types.ts`** — keep the `Raw*` types only. Loosen `RawMdCitation` so
  `title?` and `url?` are optional (URL-less citations must survive). Remove
  `ArtifactDoc` and `Citation`. Add:
  ```ts
  /** A deduped, named source ready for the reference list. */
  export interface Reference {
    /** Footnote identifier, e.g. "Emilevankrieken" (no spaces). */
    name: string;
    /** Human-friendly description: preview_title || title. */
    label: string;
    /** Source URL, or '' when the citation had none. */
    url: string;
  }
  ```

- **`src/conversation.ts`** — replace `extractArtifacts` with
  `findArtifacts(conversation): RawArtifactInput[]`. Pure **selection**: walk
  `chat_messages`, find `tool_use`/`name === "artifacts"` blocks, keep the final
  version per `input.id` (last write wins), require string `content` + `id`. No
  field transformation — raw inputs are returned as-is.

- **`src/citations.ts`** *(new, pure)* —
  `resolveReferences(mdCitations: RawMdCitation[] | undefined): { references: Reference[]; nameByIndex: (string | null)[] }`.
  - **Identity key:** `url` when present, else `preview_title || title`. A citation
    with neither contributes no reference (and `nameByIndex[i] = null`).
  - **Dedup:** one `Reference` per identity. First occurrence in document order
    wins for `name`/`label`/`url`. `references` is in first-appearance order.
  - **Name derivation** from `title` (the slug):
    1. Trim.
    2. Replace runs of whitespace (incl. spaces) with a single `_`.
    3. Strip `[` and `]` (footnote-breaking characters).
    4. Empty result → `ref-N` (N = 1-based position among references).
  - **Collision:** when two *different* references derive the same name, append
    `-2`, `-3`, … to the later ones. (Same reference reused = same name, no
    suffix — that is expected footnote reuse.)
  - **`nameByIndex`** maps each input citation index to its reference name (or
    `null`), so the placement step knows which marker each offset produces.

- **`src/footnotes.ts`** *(rewrite, pure)* —
  `renderFootnotes(content: string, mdCitations: RawMdCitation[] | undefined): { body: string; references: string[] }`.
  1. `const { references, nameByIndex } = resolveReferences(mdCitations)`.
  2. **Placement.** For each citation `i` with a valid `end_index`
     (`Number.isInteger`, `0 ≤ end ≤ content.length`) and non-null
     `nameByIndex[i]`, compute the **insertion point** by scanning forward from
     `end` to the nearest **boundary**:
     - a `\n`,
     - a `<br>` / `<br/>` / `<br />` (case-insensitive),
     - a `|` **only when the current source line is a table row** — i.e. the line
       containing `end` (between the previous and next `\n`), once leading
       whitespace is trimmed, starts with `|`,
     - end of string if none of the above is found.
     Insert the marker immediately *before* that boundary character/token.
  3. **Intra-paragraph dedup.** Citations that resolve to the same insertion point
     belong to one segment. Within a segment, dedup by reference name and emit the
     distinct names consecutively in first-appearance order, e.g. `[^a][^b]`.
  4. Apply insertions at **descending** insertion points so earlier offsets stay
     valid. (Group by insertion point; build the combined marker string per point;
     splice them in from the back.)
  5. Citations with no/invalid `end_index` (or null name) get **no marker**, but
     their reference still appears in the reference list (no source lost).
  6. **Reference list:** one line per unique `Reference`, in first-appearance
     order: `[^name]: label — url`, omitting ` — url` when `url` is `''`.

- **`src/markdown.ts`** — `renderArtifactMarkdown(input: RawArtifactInput): string`.
  Builds `# input.title` (omit when empty) + trimmed body + `---` + reference list
  (the `---` block omitted when there are no references). Calls
  `renderFootnotes(input.content, input.md_citations)`.

- **`src/ui.ts`** — list rows off `findArtifacts(conversation)`. Each row shows
  `input.title || '(untitled artifact)'` and `${input.md_citations?.length ?? 0}
  reference(s)`. **Copy** calls `renderArtifactMarkdown(input)`. All inline
  `Object.assign(el.style, …)` blocks are replaced with `cae-`-prefixed
  `className`s defined in `ui.css`. Inject the stylesheet once via `GM_addStyle`
  before mounting.

- **`src/config.ts`** *(new)* — `openConfigPanel()` toggles a floating config panel
  (click the menu command again to close). The panel demonstrates persistence:
  - A text `<input>` pre-filled from `GM_getValue('cae-dummy-setting', '')`.
  - A **Save** button → `GM_setValue('cae-dummy-setting', value)`, then shows a
    transient "Saved ✓".
  - A **read-back** line that displays the currently persisted value
    (`GM_getValue` re-read after save / on open) so persistence across reloads is
    visible.
  Styled via `cae-` classes in `ui.css`. Placeholder copy otherwise — no real
  settings wired to behavior yet.

- **`src/ui.css`** *(new)* — holds **all** styles (button, popover, rows, config
  panel). Every class `cae-`-prefixed. Imported as a string via Vite's `?inline`
  query and injected with `GM_addStyle`.

- **`src/main.ts`** — register `GM_registerMenuCommand('Config…', openConfigPanel)`
  alongside the existing discovery commands. Inject `ui.css` via `GM_addStyle`
  (either here or in `mountUI`, before any UI is built).

- **`vite.config.ts`** — add `GM_addStyle`, `GM_getValue`, `GM_setValue` to the
  `grant` array.

## Worked example

Input `content` (one paragraph, one table row), with citations whose `end_index`
land mid-text:

```
Researchers prefer linking notes over folders.

| Tool | Notes |
| --- | --- |
| Obsidian | Great for linking<br>Used by researchers |
```

- A citation to `https://a.example` (title `Smith2024`) ending inside
  "linking notes" → marker at end of that prose line:
  `Researchers prefer linking notes over folders.[^Smith2024]`
- A citation to the same URL again in the same paragraph → **deduped** (no second
  marker).
- A citation (title `Obsidian Docs`) ending inside "Used by researchers" → marker
  before the closing `|`: `...<br>Used by researchers[^Obsidian_Docs] |`.

Reference list:

```
[^Smith2024]: Smith 2024 — https://a.example
[^Obsidian_Docs]: Obsidian Documentation — https://obsidian.md
```

## Testing

Add **vitest** (the project currently has no test runner; update CLAUDE.md's
"no test runner yet" note accordingly). `pnpm test` runs it.

- **`citations.test.ts`** — identity by URL; URL-less fallback to title; dedup
  (first wins, document order); space/whitespace → `_`; `[`/`]` stripping; empty
  title → `ref-N`; collision suffixes for distinct references; reuse keeps one
  name.
- **`footnotes.test.ts`** — boundary placement at `\n`, `<br>` (and `<br/>`), and
  table `|`; `|` ignored outside table rows; intra-paragraph dedup; multiple
  distinct refs render `[^a][^b]`; no/invalid offset → listed but no marker;
  reference-list has no duplicate lines and renders the no-URL line without
  ` — `.
- **`conversation.test.ts`** — final-version-per-id selection; tolerant skipping of
  malformed blocks.

## Scope (YAGNI)

**In scope:** named footnotes, end-of-line/cell marker placement, dual dedup
(reference list + intra-paragraph), deferred normalization (drop
`ArtifactDoc`/`Citation`), style extraction to `ui.css`, dummy **persisted** config
page, vitest setup + unit tests.

**Out of scope:** real settings that change behavior, `GM_download` export, any
change to the fetch interceptor/capture store, full Markdown table parsing beyond
the simple `|`/`<br>` boundary scan, multi-conversation history.

## Decisions & assumptions

- Footnote **name** = `title` slug; reference **description** = `preview_title ||
  title`; **URL** = top-level `url`. `sources[]` is assumed redundant with these.
- Boundary set for placement: `\n`, `<br>` variants, and table-row `|`. `<br>` is
  treated as a boundary everywhere; `|` only inside table rows (line starts with
  `|` after trimming).
- Dedup identity: `url` || `preview_title || title`. Reference list and
  intra-paragraph markers both key on this.
- Same reference reused across paragraphs keeps one name and one bottom definition
  (standard footnote reuse); it is only deduped *within* a paragraph for repeated
  markers.
