# Claude Artifact Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tampermonkey userscript that captures Claude's conversation API data, extracts research artifacts, and copies them to the clipboard as Markdown with inline `[^n]` footnote references that the native export drops.

**Architecture:** A `document-start` patch on `unsafeWindow.fetch` captures the `chat_conversations` load response. A pure extractor walks the message tree to find `artifacts` tool_use blocks (each carrying clean markdown `content` plus a separate `md_citations[]` array with UTF-16 `start_index`/`end_index` offsets). A pure footnote renderer inserts `[^n]` markers at each citation's `end_index` and appends a reference list. A floating button opens a popover listing captured artifacts, each with a Copy action (`GM_setClipboard`).

**Tech Stack:** TypeScript, Vite + vite-plugin-monkey, Vitest (unit tests for pure modules), Greasemonkey APIs (`GM_setClipboard`, `GM_registerMenuCommand`).

---

## Key facts (verified against `sample-response.json`)

- Endpoint: `GET https://claude.ai/api/organizations/{org}/chat_conversations/{conv}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong`
- Response top-level: `{ uuid, name, summary, chat_messages: [...] }`.
- Each message: `{ uuid, sender, content: ContentBlock[] }`.
- The research report is a content block: `{ type: "tool_use", name: "artifacts", input: {...} }`.
- `input` = `{ id, type: "text/markdown", title, command: "create"|"update"|"rewrite", content, md_citations[], version_uuid }`.
- `input.content` is **clean markdown with zero inline citation markers**.
- Each `md_citations[]` entry: `{ uuid, title, url, metadata: { preview_title, ... }, start_index, end_index }`.
- Offsets are **UTF-16** (plain JS string indices) — verified: citation end 5292 aligns with `content.slice()` past the emoji at index 4893.
- Footnote label = `metadata.preview_title || title`.
- **No deduplication**: each citation → its own footnote, in array order.

## File Structure

- `src/types.ts` (modify) — raw conversation/response types + normalized `ArtifactDoc` / `Citation`.
- `src/conversation.ts` (create) — `extractArtifacts(conversation)` → `ArtifactDoc[]`.
- `src/footnotes.ts` (create) — `renderFootnotes(content, citations)` → `{ body, references }`.
- `src/markdown.ts` (modify) — `renderArtifactMarkdown(doc)` → full markdown string.
- `src/fetch-interceptor.ts` (modify) — capture the conversation-load endpoint; expose `getLatestConversation()`.
- `src/ui.ts` (create) — floating button + popover listing artifacts with Copy.
- `src/main.ts` (modify) — install interceptor, mount UI, keep a debug dump menu command.
- `src/extractor.ts` (delete) — replaced by `conversation.ts` + `markdown.ts`.
- `test/conversation.test.ts`, `test/footnotes.test.ts`, `test/markdown.test.ts` (create).
- `vitest.config.ts` (create), `package.json` (modify: add vitest + `test` script).

---

## Task 1: Add Vitest test tooling

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

Run:

```bash
npm install -D vitest@^3.0.0
```

Expected: adds `vitest` to devDependencies, exits 0.

- [ ] **Step 2: Add the `test` script**

In `package.json`, change the `scripts` block to add a `test` entry:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint . && tsc --noEmit",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Add a smoke test to confirm the runner works**

Create `test/smoke.test.ts`:

```ts
import { test, expect } from 'vitest';

test('vitest runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: PASS — 1 passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm test/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest runner and test script"
```

---

## Task 2: Define types

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Replace `src/types.ts` with the full type set**

The existing file has `CapturedResponse`, `ExtractedArtifact`, `Reference`. Keep
`CapturedResponse`, drop `ExtractedArtifact`/`Reference`, and add raw conversation
types plus the normalized `ArtifactDoc`/`Citation`. Write the whole file:

```ts
/**
 * Shapes of the data we capture from Claude's API.
 *
 * Raw* types model the conversation-load response
 * (GET .../chat_conversations/{uuid}?tree=True&rendering_mode=messages&...).
 * Only the fields we rely on are typed; the rest is left open.
 */

/** A single captured fetch response, stored for later inspection/extraction. */
export interface CapturedResponse {
  /** Monotonic id within this page session. */
  id: number;
  /** Request URL. */
  url: string;
  /** HTTP method. */
  method: string;
  /** HTTP status. */
  status: number;
  /** Parsed JSON body if the response was JSON, else null. */
  json: unknown;
  /** Raw text body (kept for SSE / non-JSON payloads). */
  text: string;
  /** ms since page-script start, for ordering. */
  at: number;
}

/** Top-level conversation-load response. */
export interface RawConversation {
  uuid: string;
  name?: string;
  summary?: string;
  chat_messages: RawMessage[];
}

export interface RawMessage {
  uuid: string;
  sender: 'human' | 'assistant';
  content: RawContentBlock[];
}

/** A content block. Only `tool_use` (name "artifacts") matters to us. */
export interface RawContentBlock {
  type: string;
  name?: string;
  input?: RawArtifactInput;
}

/** The `input` of an `artifacts` tool_use block. */
export interface RawArtifactInput {
  id: string;
  type: string;
  title?: string;
  command?: string;
  content?: string;
  md_citations?: RawMdCitation[];
  version_uuid?: string;
}

export interface RawMdCitation {
  uuid?: string;
  title?: string;
  url: string;
  metadata?: { preview_title?: string };
  /** UTF-16 offsets into the artifact `content`. */
  start_index: number;
  end_index: number;
}

/** A normalized citation ready for rendering. */
export interface Citation {
  /** Display label: preview_title || title || url. */
  label: string;
  url: string;
  /** UTF-16 offsets into ArtifactDoc.content. */
  start: number;
  end: number;
}

/** A normalized artifact ready for markdown rendering. */
export interface ArtifactDoc {
  id: string;
  title: string;
  /** Clean markdown, no inline citation markers. */
  content: string;
  citations: Citation[];
  versionUuid: string;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: FAIL — `src/extractor.ts` and `src/markdown.ts` still import the removed
`ExtractedArtifact`/`Reference`. This is expected; later tasks fix them. Confirm
the ONLY errors reference `extractor.ts` / `markdown.ts`, not `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: define conversation and artifact types"
```

---

## Task 3: Extract artifacts from a conversation

**Files:**

- Create: `src/conversation.ts`
- Test: `test/conversation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/conversation.test.ts`. It loads the real captured sample as a fixture:

```ts
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractArtifacts } from '../src/conversation';
import type { RawConversation } from '../src/types';

function loadSample(): RawConversation {
  const path = fileURLToPath(new URL('../sample-response.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as RawConversation;
}

test('extracts the markdown artifact from the sample conversation', () => {
  const artifacts = extractArtifacts(loadSample());
  expect(artifacts).toHaveLength(1);
  const a = artifacts[0];
  expect(a.title).toBe(
    'How Obsidian Users Actually Build Their Second Brains: Workflows, Simplification, and What Survives',
  );
  expect(a.content.startsWith('# How Obsidian users actually build their second brains')).toBe(true);
  expect(a.citations).toHaveLength(12);
});

test('normalizes citation label, url, and offsets', () => {
  const a = extractArtifacts(loadSample())[0];
  const first = a.citations[0];
  expect(first.label).toBe('How I use Obsidian for academic work | Emile van Krieken');
  expect(first.url).toBe('https://www.emilevankrieken.com/blog/2025/academic-obsidian/');
  expect(first.start).toBe(1959);
  expect(first.end).toBe(2146);
});

test('returns an empty array when there are no artifacts', () => {
  expect(extractArtifacts({ uuid: 'x', chat_messages: [] })).toEqual([]);
});

test('ignores malformed input safely', () => {
  // @ts-expect-error testing runtime robustness against bad shapes
  expect(extractArtifacts(null)).toEqual([]);
  // @ts-expect-error testing runtime robustness against bad shapes
  expect(extractArtifacts({})).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- conversation`
Expected: FAIL — cannot find module `../src/conversation`.

- [ ] **Step 3: Implement `src/conversation.ts`**

```ts
import type {
  ArtifactDoc,
  Citation,
  RawArtifactInput,
  RawConversation,
  RawMdCitation,
} from './types';

/**
 * Walks a conversation-load response and returns every markdown artifact found,
 * normalized for rendering. Tolerant of missing/malformed fields: anything that
 * doesn't look like a usable artifact is skipped rather than throwing.
 *
 * Each artifact lives in a content block: { type: "tool_use", name: "artifacts",
 * input: { content, md_citations, ... } }. The same artifact `id` can appear
 * multiple times (command create -> update -> rewrite); we keep the LAST
 * occurrence in document order, which is the final version.
 */
export function extractArtifacts(conversation: RawConversation): ArtifactDoc[] {
  const messages = conversation?.chat_messages;
  if (!Array.isArray(messages)) return [];

  const byId = new Map<string, ArtifactDoc>();

  for (const message of messages) {
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type !== 'tool_use' || block.name !== 'artifacts') continue;
      const doc = toArtifactDoc(block.input);
      if (doc) byId.set(doc.id, doc); // last write wins -> final version
    }
  }

  return [...byId.values()];
}

function toArtifactDoc(input: RawArtifactInput | undefined): ArtifactDoc | null {
  if (!input || typeof input.content !== 'string' || typeof input.id !== 'string') {
    return null;
  }
  return {
    id: input.id,
    title: input.title ?? '',
    content: input.content,
    citations: normalizeCitations(input.md_citations),
    versionUuid: input.version_uuid ?? '',
  };
}

function normalizeCitations(raw: RawMdCitation[] | undefined): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const c of raw) {
    if (!c || typeof c.url !== 'string') continue;
    out.push({
      label: c.metadata?.preview_title || c.title || c.url,
      url: c.url,
      start: typeof c.start_index === 'number' ? c.start_index : -1,
      end: typeof c.end_index === 'number' ? c.end_index : -1,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- conversation`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/conversation.ts test/conversation.test.ts
git commit -m "feat: extract normalized artifacts from conversation data"
```

---

## Task 4: Render footnotes

**Files:**

- Create: `src/footnotes.ts`
- Test: `test/footnotes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/footnotes.test.ts`:

```ts
import { test, expect } from 'vitest';
import { renderFootnotes } from '../src/footnotes';
import type { Citation } from '../src/types';

test('inserts a marker at the citation end_index and lists the reference', () => {
  const content = 'Hello world.';
  const citations: Citation[] = [
    { label: 'Greeting', url: 'https://example.com', start: 0, end: 5 },
  ];
  const { body, references } = renderFootnotes(content, citations);
  expect(body).toBe('Hello[^1] world.');
  expect(references).toEqual(['[^1]: Greeting — https://example.com']);
});

test('numbers citations in array order without deduping shared urls', () => {
  const content = 'AB';
  const citations: Citation[] = [
    { label: 'one', url: 'https://same.com', start: 0, end: 1 },
    { label: 'two', url: 'https://same.com', start: 1, end: 2 },
  ];
  const { body, references } = renderFootnotes(content, citations);
  expect(body).toBe('A[^1]B[^2]');
  expect(references).toEqual([
    '[^1]: one — https://same.com',
    '[^2]: two — https://same.com',
  ]);
});

test('two citations ending at the same offset render consecutive markers in order', () => {
  const content = 'AB';
  const citations: Citation[] = [
    { label: 'one', url: 'https://a.com', start: 0, end: 2 },
    { label: 'two', url: 'https://b.com', start: 1, end: 2 },
  ];
  const { body } = renderFootnotes(content, citations);
  expect(body).toBe('AB[^1][^2]');
});

test('uses UTF-16 offsets so markers land correctly after non-BMP characters', () => {
  const content = 'x✓y'; // '✓' (U+2713) is BMP; use an emoji for non-BMP
  const emoji = 'a😀b'; // 😀 is U+1F600, 2 UTF-16 units
  const citations: Citation[] = [
    { label: 's', url: 'https://e.com', start: 0, end: 3 }, // after the emoji (a=1,😀=2)
  ];
  const { body } = renderFootnotes(emoji, citations);
  expect(body).toBe('a😀[^1]b');
  expect(content).toContain('✓'); // sanity, unused branch
});

test('falls back to an unanchored reference list when offsets are missing', () => {
  const content = 'No anchors here.';
  const citations: Citation[] = [
    { label: 'src', url: 'https://x.com', start: -1, end: -1 },
  ];
  const { body, references } = renderFootnotes(content, citations);
  expect(body).toBe('No anchors here.');
  expect(references).toEqual(['[^1]: src — https://x.com']);
});

test('returns empty references for no citations', () => {
  const { body, references } = renderFootnotes('plain', []);
  expect(body).toBe('plain');
  expect(references).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- footnotes`
Expected: FAIL — cannot find module `../src/footnotes`.

- [ ] **Step 3: Implement `src/footnotes.ts`**

```ts
import type { Citation } from './types';

export interface FootnoteResult {
  /** The artifact content with `[^n]` markers inserted. */
  body: string;
  /** Reference definition lines, e.g. `[^1]: Label — https://url`. */
  references: string[];
}

/**
 * Inserts `[^n]` markers into `content` at each citation's `end` offset and
 * builds a matching reference list. Citations are numbered in array order with
 * NO deduplication (each citation is its own footnote).
 *
 * Offsets are UTF-16 string indices (plain `String.prototype.slice`). Markers are
 * inserted in descending `end` order so earlier offsets remain valid as we go.
 * When two citations share an `end`, they are emitted in ascending citation
 * number so the rendered order reads `[^1][^2]`.
 *
 * A citation with a non-positive/invalid `end` (no offset data) gets no inline
 * marker but is still listed in the reference list, so no source is lost.
 */
export function renderFootnotes(content: string, citations: Citation[]): FootnoteResult {
  const references = citations.map(
    (c, i) => `[^${i + 1}]: ${c.label} — ${c.url}`,
  );

  // Pair each citation with its 1-based number, keep only insertable ones.
  const insertable = citations
    .map((c, i) => ({ num: i + 1, end: c.end }))
    .filter((x) => Number.isInteger(x.end) && x.end >= 0 && x.end <= content.length);

  // Insert from the end of the string backwards. Sort by end descending; for
  // equal ends, higher number first so that after both inserts the lower number
  // ends up to the left (-> "[^1][^2]").
  insertable.sort((a, b) => (b.end - a.end) || (b.num - a.num));

  let body = content;
  for (const { num, end } of insertable) {
    body = body.slice(0, end) + `[^${num}]` + body.slice(end);
  }

  return { body, references };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- footnotes`
Expected: PASS — 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/footnotes.ts test/footnotes.test.ts
git commit -m "feat: render inline footnote markers and reference list"
```

---

## Task 5: Assemble the final markdown document

**Files:**

- Modify: `src/markdown.ts`
- Test: `test/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/markdown.test.ts`:

```ts
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderArtifactMarkdown } from '../src/markdown';
import { extractArtifacts } from '../src/conversation';
import type { ArtifactDoc, RawConversation } from '../src/types';

test('assembles title, body with markers, and reference list', () => {
  const doc: ArtifactDoc = {
    id: 'a',
    title: 'My Report',
    content: 'Hello world.',
    citations: [{ label: 'Greeting', url: 'https://example.com', start: 0, end: 5 }],
    versionUuid: 'v1',
  };
  const md = renderArtifactMarkdown(doc);
  expect(md).toBe(
    '# My Report\n\nHello[^1] world.\n\n---\n\n[^1]: Greeting — https://example.com\n',
  );
});

test('omits the reference section when there are no citations', () => {
  const doc: ArtifactDoc = {
    id: 'a', title: 'T', content: 'Body only.', citations: [], versionUuid: '',
  };
  expect(renderArtifactMarkdown(doc)).toBe('# T\n\nBody only.\n');
});

test('renders the real sample artifact with 12 footnote definitions', () => {
  const path = fileURLToPath(new URL('../sample-response.json', import.meta.url));
  const conv = JSON.parse(readFileSync(path, 'utf8')) as RawConversation;
  const md = renderArtifactMarkdown(extractArtifacts(conv)[0]);
  expect(md).toContain('# How Obsidian Users Actually Build Their Second Brains');
  expect((md.match(/^\[\^\d+\]: /gm) ?? [])).toHaveLength(12);
  expect(md).toContain('[^1]'); // at least one inline marker present
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- markdown`
Expected: FAIL — `renderArtifactMarkdown` is not exported (file still exports old
`renderMarkdown`).

- [ ] **Step 3: Replace `src/markdown.ts`**

```ts
import type { ArtifactDoc } from './types';
import { renderFootnotes } from './footnotes';

/**
 * Renders an artifact to a complete Markdown document:
 *
 *   # <title>
 *
 *   <body with [^n] markers>
 *
 *   ---
 *
 *   [^1]: <label> — <url>
 *
 * The reference section (and its `---` separator) is omitted when the artifact
 * has no citations. Footnote style round-trips cleanly into Obsidian.
 */
export function renderArtifactMarkdown(doc: ArtifactDoc): string {
  const { body, references } = renderFootnotes(doc.content, doc.citations);

  const parts: string[] = [];
  if (doc.title) parts.push(`# ${doc.title}`, '');
  parts.push(body.trim());
  if (references.length > 0) {
    parts.push('', '---', '', references.join('\n'));
  }
  return parts.join('\n') + '\n';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- markdown`
Expected: PASS — 3 passed.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — conversation, footnotes, markdown all green.

- [ ] **Step 6: Commit**

```bash
git add src/markdown.ts test/markdown.test.ts
git commit -m "feat: assemble full artifact markdown document"
```

---

## Task 6: Capture the conversation endpoint

**Files:**

- Modify: `src/fetch-interceptor.ts`

The current interceptor captures any `/api/` URL into a flat store. Narrow the
capture target to the conversation-load endpoint and expose the latest parsed
conversation, while keeping the raw store for the debug dump.

- [ ] **Step 1: Replace `src/fetch-interceptor.ts`**

```ts
import type { CapturedResponse, RawConversation } from './types';

/**
 * Monkey-patches the page's fetch to capture API responses non-destructively.
 *
 * Why unsafeWindow: we must replace the *page's* fetch (the one Claude's app
 * calls), not the sandboxed userscript copy. Responses are cloned before reading
 * so the app's own consumer is never disturbed; all capture work is wrapped so a
 * failure can never break the page.
 */

const START = performance.now();
const store: CapturedResponse[] = [];
let nextId = 1;

/** The most recent successfully-parsed conversation-load response. */
let latestConversation: RawConversation | null = null;

/** Matches the conversation-load endpoint we extract artifacts from. */
const CONVERSATION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/[^/?]+/;

/** Broad net for the debug dump (any API call). */
const CAPTURE_RE = /\/api\//;

export function getCaptured(): readonly CapturedResponse[] {
  return store;
}

export function clearCaptured(): void {
  store.length = 0;
}

/** The latest conversation we have parsed from captured traffic, if any. */
export function getLatestConversation(): RawConversation | null {
  return latestConversation;
}

export function installFetchInterceptor(): void {
  const target = unsafeWindow as Window & typeof globalThis;
  const original = target.fetch;

  target.fetch = async function patchedFetch(
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const response = await original.apply(this, args);
    try {
      const url = urlOf(args[0]);
      if (CAPTURE_RE.test(url)) {
        // Clone so we never consume the body the app is about to read.
        captureResponse(response.clone(), url, methodOf(args)).catch(() => {
          /* swallow: capture must never break the page */
        });
      }
    } catch {
      /* never let interception throw into the app */
    }
    return response;
  } as typeof fetch;
}

function urlOf(req: Parameters<typeof fetch>[0]): string {
  if (typeof req === 'string') return req;
  if (req instanceof URL) return req.href;
  if (req instanceof Request) return req.url;
  return String(req);
}

function methodOf(args: Parameters<typeof fetch>): string {
  const req = args[0];
  if (req instanceof Request) return req.method;
  return args[1]?.method ?? 'GET';
}

async function captureResponse(
  response: Response,
  url: string,
  method: string,
): Promise<void> {
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (e.g. SSE) — keep raw text only */
  }

  store.push({
    id: nextId++,
    url,
    method,
    status: response.status,
    json,
    text,
    at: performance.now() - START,
  });

  if (json && CONVERSATION_RE.test(url) && isConversation(json)) {
    latestConversation = json;
  }
}

function isConversation(json: unknown): json is RawConversation {
  return (
    typeof json === 'object' &&
    json !== null &&
    Array.isArray((json as { chat_messages?: unknown }).chat_messages)
  );
}
```

- [ ] **Step 2: Verify typecheck (interceptor portion)**

Run: `npm run typecheck`
Expected: errors now only from `src/main.ts` (still imports the deleted
`extractor.ts` / old `renderMarkdown`) — `fetch-interceptor.ts` itself is clean.
Task 8 fixes `main.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/fetch-interceptor.ts
git commit -m "feat: capture conversation-load endpoint and expose latest conversation"
```

---

## Task 7: Floating button + artifact popover

**Files:**

- Create: `src/ui.ts`

This module is DOM/side-effecty and is verified manually (per CLAUDE.md), not unit
tested. It depends only on `getLatestConversation`, `extractArtifacts`,
`renderArtifactMarkdown`, and `GM_setClipboard`.

- [ ] **Step 1: Create `src/ui.ts`**

```ts
import { getLatestConversation } from './fetch-interceptor';
import { extractArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import type { ArtifactDoc } from './types';

const BTN_ID = 'cae-export-button';
const POPOVER_ID = 'cae-export-popover';

/** Mounts the floating export button once the DOM is ready. */
export function mountUI(): void {
  if (document.getElementById(BTN_ID)) return;

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.textContent = '⬇ Artifacts';
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#2d2d2d',
    color: '#fff',
    font: '13px system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  } satisfies Partial<CSSStyleDeclaration>);

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
  const artifacts = conversation ? extractArtifacts(conversation) : [];

  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  Object.assign(popover.style, {
    position: 'fixed',
    bottom: '60px',
    right: '20px',
    zIndex: '2147483647',
    width: '320px',
    maxHeight: '50vh',
    overflowY: 'auto',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#1e1e1e',
    color: '#eee',
    font: '13px system-ui, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  } satisfies Partial<CSSStyleDeclaration>);

  if (artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = conversation
      ? 'No artifacts found in this conversation.'
      : 'No conversation captured yet. Open a research conversation, then reopen this.';
    popover.appendChild(empty);
  } else {
    artifacts.forEach((artifact, index) => {
      popover.appendChild(renderRow(artifact, index));
    });
  }

  document.body.appendChild(popover);
}

function renderRow(artifact: ArtifactDoc, index: number): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 0',
    borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.textContent = artifact.title || '(untitled artifact)';
  title.style.fontWeight = '600';

  const meta = document.createElement('div');
  meta.textContent = `${artifact.citations.length} reference(s)`;
  meta.style.opacity = '0.7';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy Markdown';
  Object.assign(copy.style, {
    alignSelf: 'flex-start',
    marginTop: '2px',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: '#3a3a3a',
    color: '#fff',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  copy.addEventListener('click', () => {
    GM_setClipboard(renderArtifactMarkdown(artifact), 'text');
    copy.textContent = 'Copied!';
    setTimeout(() => {
      copy.textContent = 'Copy Markdown';
    }, 1500);
  });

  row.append(title, meta, copy);
  return row;
}
```

- [ ] **Step 2: Verify typecheck (ui portion)**

Run: `npm run typecheck`
Expected: still only `src/main.ts` errors remain. `ui.ts` is clean (uses
`GM_setClipboard` from the greasemonkey types, `unsafeWindow` unused here).

- [ ] **Step 3: Commit**

```bash
git add src/ui.ts
git commit -m "feat: floating button and artifact popover with copy action"
```

---

## Task 8: Wire up entry point

**Files:**

- Modify: `src/main.ts`
- Delete: `src/extractor.ts`
- Modify: `vite.config.ts` (drop `GM_download` grant)

- [ ] **Step 1: Delete the obsolete extractor**

```bash
git rm src/extractor.ts
```

- [ ] **Step 2: Replace `src/main.ts`**

```ts
import { getCaptured, clearCaptured, installFetchInterceptor } from './fetch-interceptor';
import { mountUI } from './ui';

// Install the interceptor IMMEDIATELY (run-at: document-start) so we catch the
// app's API calls from the very first request.
installFetchInterceptor();

// Mount the floating UI once the DOM body exists.
if (document.body) {
  mountUI();
} else {
  document.addEventListener('DOMContentLoaded', mountUI, { once: true });
}

// --- Discovery helper (kept for debugging schema drift) --------------------

GM_registerMenuCommand('Dump captured responses (console)', () => {
  const captured = getCaptured();
  console.info(`[artifact-exporter] ${captured.length} captured response(s):`);
  for (const c of captured) {
    console.groupCollapsed(`#${c.id} ${c.method} ${c.status} ${c.url}`);
    console.log(c.json ?? c.text);
    console.groupEnd();
  }
  (unsafeWindow as unknown as Record<string, unknown>).__claudeCaptured = captured;
  console.info('[artifact-exporter] Also available as window.__claudeCaptured');
});

GM_registerMenuCommand('Clear captured responses', () => {
  clearCaptured();
  console.info('[artifact-exporter] Capture store cleared.');
});
```

- [ ] **Step 3: Drop the unused `GM_download` grant in `vite.config.ts`**

In `vite.config.ts`, change the `grant` array to remove `GM_download` (download is
deferred; only `GM_registerMenuCommand` and `GM_setClipboard` are used now):

```ts
        grant: [
          'GM_registerMenuCommand',
          'GM_setClipboard',
        ],
```

- [ ] **Step 4: Verify the whole project typechecks and lints**

Run: `npm run lint`
Expected: PASS — eslint clean and `tsc --noEmit` reports no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all conversation/footnotes/markdown tests green.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts vite.config.ts
git commit -m "feat: wire interceptor and UI in entry point; drop extractor stub"
```

---

## Task 9: Build the installable userscript

**Files:**

- (none new; produces `dist/claude-artifact-extractor.user.js`)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: PASS — writes `dist/claude-artifact-extractor.user.js`.

- [ ] **Step 2: Verify the userscript header**

Run: `node -e "const s=require('fs').readFileSync('dist/claude-artifact-extractor.user.js','utf8'); const h=s.slice(0, s.indexOf('==/UserScript==')); console.log(h)"`
Expected: header contains `@match https://claude.ai/*`, `@run-at document-start`,
`@grant GM_registerMenuCommand`, `@grant GM_setClipboard`, and does NOT contain
`@grant GM_download`.

- [ ] **Step 3: Manual verification checklist (per CLAUDE.md — no automated browser test)**

Document the result in the commit message. Steps:

1. Install `dist/claude-artifact-extractor.user.js` in Tampermonkey.
2. Open a Claude research conversation that contains a report artifact.
3. Confirm the `⬇ Artifacts` button appears bottom-right.
4. Click it → popover lists the artifact with its reference count.
5. Click `Copy Markdown` → paste into an editor.
6. Confirm: `# Title`, body with `[^n]` markers, `---`, and `[^n]:` reference
   lines with URLs.

- [ ] **Step 4: Commit the build (or confirm dist is gitignored)**

`dist/` is in `.gitignore`, so there is nothing to commit here. Record manual
verification by amending the Task 8 commit or adding an empty marker commit only
if the user wants a record. Otherwise the feature is complete.

---

## Self-Review

**Spec coverage:**

- Capture conversation endpoint → Task 6. ✓
- Artifact extraction (tool_use "artifacts", final version per id) → Task 3. ✓
- Footnotes, no dedup, UTF-16 offsets, descending insertion, fallback → Task 4. ✓
- Markdown assembly (title + body + `---` + refs, omit when empty) → Task 5. ✓
- Popover listing artifacts only, Copy action via `GM_setClipboard` → Task 7. ✓
- `document-start`, `unsafeWindow.fetch`, clone-before-read, never throw → Task 6. ✓
- Debug dump menu command retained → Task 8. ✓
- Download deferred / `GM_download` grant removed → Task 8. ✓
- Build + header grants → Task 9. ✓

**Type consistency:** `ArtifactDoc { id, title, content, citations, versionUuid }`
and `Citation { label, url, start, end }` are defined in Task 2 and used
identically in Tasks 3, 4, 5, 7. `renderFootnotes` returns `{ body, references }`
(Task 4) consumed in Task 5. `getLatestConversation` (Task 6) consumed in Task 7.
`extractArtifacts` / `renderArtifactMarkdown` names consistent across tasks.

**Open item still pending:** whether `update`/`rewrite` artifact payloads carry
full vs partial `content`. The sample only has a `create`. Task 3 keeps the last
occurrence per id, which is correct IF later versions carry full content. Flagged
for verification when such a sample is available; current behavior is the safe
default for the data we have.
