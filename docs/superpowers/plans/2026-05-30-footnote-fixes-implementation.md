# Footnote Fixes + Deferred Normalization + Config Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make footnotes named (from each source's `title`), move citation markers to the end of their line/cell, deduplicate references (globally and within a paragraph), defer raw→typed normalization until export, extract all UI styles into `src/ui.css`, and add a persisted dummy config page.

**Architecture:** Keep Claude's raw captured shapes (`RawConversation`, `RawArtifactInput`, `RawMdCitation`) untouched until export. The popover lists raw artifact inputs; only on **Copy** does the pure pipeline run: `resolveReferences` (identity + dedup + naming) → `renderFootnotes` (boundary-aware placement + intra-paragraph dedup + reference list) → `renderArtifactMarkdown`. UI styling moves to an injected stylesheet; a config panel persists a value via `GM_getValue`/`GM_setValue`.

**Tech Stack:** TypeScript, Vite + vite-plugin-monkey, vitest (already installed), Tampermonkey GM APIs.

---

## File structure

- `src/types.ts` *(modify)* — loosen `RawMdCitation`; add `Reference`; later remove `ArtifactDoc`/`Citation`.
- `src/citations.ts` *(create)* — `resolveReferences`: identity, dedup, name assignment.
- `src/conversation.ts` *(modify)* — add `findArtifacts` (raw selection); later remove `extractArtifacts` + helpers.
- `src/footnotes.ts` *(rewrite)* — `renderFootnotes(content, mdCitations)`: boundary placement + intra-paragraph dedup + reference lines.
- `src/markdown.ts` *(modify)* — `renderArtifactMarkdown(input: RawArtifactInput)`.
- `src/ui.ts` *(modify)* — list raw inputs; render on copy; later swap inline styles for classes.
- `src/ui.css` *(create)* — all UI styles, `cae-` prefixed.
- `src/config.ts` *(create)* — `openConfigPanel()` with a persisted dummy setting.
- `src/main.ts` *(modify)* — inject styles; register `Config…` menu command.
- `src/gm.d.ts` *(modify)* — ambient declarations for `GM_addStyle`/`GM_getValue`/`GM_setValue`.
- `eslint.config.js` *(modify)* — add the three GM globals.
- `vite.config.ts` *(modify)* — add the three grants.
- `test/citations.test.ts`, `test/footnotes.test.ts`, `test/conversation.test.ts`, `test/markdown.test.ts` *(create)*.
- `CLAUDE.md` *(modify)* — update test-runner note and module list.

Note on commit greenness: TypeScript's `noUnusedLocals` does not flag unused **exports**, so `ArtifactDoc`/`Citation`/`extractArtifacts` can remain unused after Task 3 and be deleted cleanly in Task 4 while every intermediate commit still typechecks.

---

### Task 1: `citations.ts` — identity, dedup, and naming

**Files:**
- Modify: `src/types.ts`
- Create: `src/citations.ts`
- Test: `test/citations.test.ts`

- [ ] **Step 1: Loosen `RawMdCitation` and add `Reference` in `src/types.ts`**

Replace the existing `RawMdCitation` interface (currently requires `url: string`, `start_index`, `end_index`) with this loosened version, and add `Reference` right after it:

```ts
export interface RawMdCitation {
  uuid?: string;
  title?: string;
  url?: string;
  metadata?: { preview_title?: string };
  /** UTF-16 offsets into the artifact `content`. */
  start_index?: number;
  end_index?: number;
}

/** A deduped, named source ready for the reference list (computed output). */
export interface Reference {
  /** Footnote identifier, e.g. "Emilevankrieken" (no spaces, no brackets). */
  name: string;
  /** Human-friendly description: preview_title || title. May be ''. */
  label: string;
  /** Source URL, or '' when the citation had none. */
  url: string;
}
```

Leave `ArtifactDoc` and `Citation` in place for now (removed in Task 4).

- [ ] **Step 2: Write the failing test `test/citations.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveReferences } from '../src/citations';
import type { RawMdCitation } from '../src/types';

const cite = (c: Partial<RawMdCitation>): RawMdCitation => c;

describe('resolveReferences', () => {
  it('names a footnote from the title slug', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'Emilevankrieken', url: 'https://a.example' }),
    ]);
    expect(nameByIndex).toEqual(['Emilevankrieken']);
    expect(references).toEqual([
      { name: 'Emilevankrieken', label: 'Emilevankrieken', url: 'https://a.example' },
    ]);
  });

  it('uses preview_title as the label but the slug as the name', () => {
    const { references } = resolveReferences([
      cite({ title: 'Slug', url: 'u', metadata: { preview_title: 'Friendly Title' } }),
    ]);
    expect(references[0]).toEqual({ name: 'Slug', label: 'Friendly Title', url: 'u' });
  });

  it('replaces whitespace with underscores and strips brackets', () => {
    const { nameByIndex } = resolveReferences([
      cite({ title: 'Hello World', url: 'u1' }),
      cite({ title: 'a[b]c', url: 'u2' }),
    ]);
    expect(nameByIndex).toEqual(['Hello_World', 'abc']);
  });

  it('falls back to ref-N for an empty title', () => {
    const { nameByIndex } = resolveReferences([cite({ url: 'u' })]);
    expect(nameByIndex).toEqual(['ref-1']);
  });

  it('dedupes by URL, first occurrence wins for name/label', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'First', url: 'same' }),
      cite({ title: 'Second', url: 'same' }),
    ]);
    expect(references).toHaveLength(1);
    expect(references[0].name).toBe('First');
    expect(nameByIndex).toEqual(['First', 'First']);
  });

  it('falls back to title for identity when there is no URL', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'NoUrl', metadata: { preview_title: 'P' } }),
      cite({ title: 'NoUrl', metadata: { preview_title: 'P' } }),
    ]);
    expect(references).toHaveLength(1);
    expect(nameByIndex).toEqual(['NoUrl', 'NoUrl']);
    expect(references[0]).toEqual({ name: 'NoUrl', label: 'P', url: '' });
  });

  it('suffixes the name when two DIFFERENT sources collide', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'Dup', url: 'u1' }),
      cite({ title: 'Dup', url: 'u2' }),
    ]);
    expect(references.map((r) => r.name)).toEqual(['Dup', 'Dup-2']);
    expect(nameByIndex).toEqual(['Dup', 'Dup-2']);
  });

  it('maps citations with no identity to null', () => {
    const { references, nameByIndex } = resolveReferences([cite({})]);
    expect(references).toHaveLength(0);
    expect(nameByIndex).toEqual([null]);
  });

  it('tolerates undefined input', () => {
    expect(resolveReferences(undefined)).toEqual({ references: [], nameByIndex: [] });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run test/citations.test.ts`
Expected: FAIL — cannot resolve import `../src/citations` (module does not exist yet).

- [ ] **Step 4: Implement `src/citations.ts`**

```ts
import type { RawMdCitation, Reference } from './types';

export interface ResolvedReferences {
  /** Unique references in first-appearance order. */
  references: Reference[];
  /** For each input citation index, its footnote name, or null if it has none. */
  nameByIndex: (string | null)[];
}

/** Friendly description for the reference list: preview_title || title. */
function friendlyLabel(c: RawMdCitation): string {
  return c.metadata?.preview_title || c.title || '';
}

/** Dedup key: the URL if present, else the (preview) title. Null if neither. */
function identityKey(c: RawMdCitation): string | null {
  if (typeof c.url === 'string' && c.url.length > 0) return `url:${c.url}`;
  const title = c.metadata?.preview_title || c.title;
  return title ? `title:${title}` : null;
}

/** Footnote name from the title slug: whitespace -> '_', strip brackets. */
function baseName(c: RawMdCitation): string {
  return (c.title ?? '').trim().replace(/\s+/g, '_').replace(/[[\]]/g, '');
}

export function resolveReferences(
  mdCitations: RawMdCitation[] | undefined,
): ResolvedReferences {
  const references: Reference[] = [];
  const nameByIndex: (string | null)[] = [];
  const byIdentity = new Map<string, Reference>();
  const usedNames = new Set<string>();
  const list = Array.isArray(mdCitations) ? mdCitations : [];

  list.forEach((c, i) => {
    const key = c ? identityKey(c) : null;
    if (!key) {
      nameByIndex[i] = null;
      return;
    }

    const existing = byIdentity.get(key);
    if (existing) {
      nameByIndex[i] = existing.name;
      return;
    }

    // New reference -> assign a unique name.
    let name = baseName(c) || `ref-${references.length + 1}`;
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(`${name}-${n}`)) n++;
      name = `${name}-${n}`;
    }
    usedNames.add(name);

    const ref: Reference = {
      name,
      label: friendlyLabel(c),
      url: typeof c.url === 'string' ? c.url : '',
    };
    byIdentity.set(key, ref);
    references.push(ref);
    nameByIndex[i] = name;
  });

  return { references, nameByIndex };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run test/citations.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/citations.ts test/citations.test.ts
git commit -m "feat: resolveReferences — identity, dedup, named footnotes"
```

---

### Task 2: `conversation.ts` — `findArtifacts` (raw selection)

**Files:**
- Modify: `src/conversation.ts`
- Test: `test/conversation.test.ts`

- [ ] **Step 1: Write the failing test `test/conversation.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { findArtifacts } from '../src/conversation';
import type { RawConversation } from '../src/types';

const conv = (messages: unknown[]): RawConversation =>
  ({ uuid: 'c', chat_messages: messages } as unknown as RawConversation);

const artifactBlock = (input: Record<string, unknown>) => ({
  type: 'tool_use',
  name: 'artifacts',
  input,
});

describe('findArtifacts', () => {
  it('returns the raw artifact input untouched', () => {
    const result = findArtifacts(
      conv([{ content: [artifactBlock({ id: 'x', content: '# Hi', md_citations: [{ url: 'u' }] })] }]),
    );
    expect(result).toEqual([{ id: 'x', content: '# Hi', md_citations: [{ url: 'u' }] }]);
  });

  it('keeps the final version when an id appears multiple times', () => {
    const result = findArtifacts(
      conv([
        { content: [artifactBlock({ id: 'x', content: 'v1', command: 'create' })] },
        { content: [artifactBlock({ id: 'x', content: 'v2', command: 'update' })] },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('v2');
  });

  it('skips non-artifact blocks and malformed inputs', () => {
    const result = findArtifacts(
      conv([
        { content: [{ type: 'text' }, artifactBlock({ id: 42, content: 'bad' })] },
        { content: 'not-an-array' },
      ]),
    );
    expect(result).toEqual([]);
  });

  it('returns [] for null/empty conversations', () => {
    expect(findArtifacts(null)).toEqual([]);
    expect(findArtifacts(conv([]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/conversation.test.ts`
Expected: FAIL — `findArtifacts` is not exported by `../src/conversation`.

- [ ] **Step 3: Add `findArtifacts` to `src/conversation.ts`**

Add these imports/exports to the top of `src/conversation.ts` (keep the existing `extractArtifacts` and its helpers for now). Ensure `RawArtifactInput` and `RawConversation` are imported:

```ts
import type { RawArtifactInput, RawConversation } from './types';

/**
 * Selects every markdown artifact's RAW input from a conversation, keeping the
 * final version per `id` (last write wins). Pure selection — no normalization;
 * the raw `RawArtifactInput` is returned untouched. Tolerant of malformed data.
 */
export function findArtifacts(
  conversation: RawConversation | null | undefined,
): RawArtifactInput[] {
  const messages = conversation?.chat_messages;
  if (!Array.isArray(messages)) return [];

  const byId = new Map<string, RawArtifactInput>();
  for (const message of messages) {
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type !== 'tool_use' || block.name !== 'artifacts') continue;
      const input = block.input;
      if (!input || typeof input.content !== 'string' || typeof input.id !== 'string') {
        continue;
      }
      byId.set(input.id, input); // last write wins -> final version
    }
  }
  return [...byId.values()];
}
```

(If `src/conversation.ts` already imports `RawArtifactInput`/`RawConversation` in its existing import block, do not duplicate the import — just add the function.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/conversation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/conversation.ts test/conversation.test.ts
git commit -m "feat: findArtifacts — select raw artifact inputs without normalizing"
```

---

### Task 3: Rewrite `footnotes.ts`, update `markdown.ts`, rewire `ui.ts`

**Files:**
- Rewrite: `src/footnotes.ts`
- Modify: `src/markdown.ts`
- Modify: `src/ui.ts`
- Test: `test/footnotes.test.ts`, `test/markdown.test.ts`

- [ ] **Step 1: Write the failing test `test/footnotes.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderFootnotes } from '../src/footnotes';
import type { RawMdCitation } from '../src/types';

const cite = (c: Partial<RawMdCitation>): RawMdCitation => c;

describe('renderFootnotes — placement', () => {
  it('moves the marker to the end of the prose line (newline boundary)', () => {
    const content = 'First line here.\nSecond line.';
    const { body } = renderFootnotes(content, [
      cite({ title: 'Src', url: 'u', start_index: 0, end_index: 6 }),
    ]);
    expect(body).toBe('First line here.[^Src]\nSecond line.');
  });

  it('places the marker before a <br> (and <br/>)', () => {
    const { body } = renderFootnotes('a<br>b', [
      cite({ title: 'X', url: 'u', start_index: 0, end_index: 1 }),
    ]);
    expect(body).toBe('a[^X]<br>b');
    const r2 = renderFootnotes('a<br/>b', [
      cite({ title: 'X', url: 'u', start_index: 0, end_index: 1 }),
    ]);
    expect(r2.body).toBe('a[^X]<br/>b');
  });

  it('places the marker before the closing pipe inside a table row, trimming the space', () => {
    const content = '| c1 | val here |';
    const { body } = renderFootnotes(content, [
      cite({ title: 'Y', url: 'u', start_index: 11, end_index: 15 }),
    ]);
    expect(body).toBe('| c1 | val here[^Y] |');
  });

  it('ignores | as a boundary outside a table row', () => {
    const content = 'pipes | are | literal';
    const { body } = renderFootnotes(content, [
      cite({ title: 'Z', url: 'u', start_index: 0, end_index: 5 }),
    ]);
    expect(body).toBe('pipes | are | literal[^Z]');
  });

  it('dedupes repeated markers for the same source within a paragraph', () => {
    const content = 'x and y here.';
    const { body } = renderFootnotes(content, [
      cite({ title: 'A', url: 'same', start_index: 0, end_index: 5 }),
      cite({ title: 'A', url: 'same', start_index: 6, end_index: 12 }),
    ]);
    expect(body).toBe('x and y here.[^A]');
  });

  it('renders distinct sources at the same point as consecutive markers', () => {
    const content = 'foo bar.';
    const { body } = renderFootnotes(content, [
      cite({ title: 'A', url: 'u1', start_index: 0, end_index: 3 }),
      cite({ title: 'B', url: 'u2', start_index: 4, end_index: 7 }),
    ]);
    expect(body).toBe('foo bar.[^A][^B]');
  });

  it('lists a citation with no offset but inserts no marker', () => {
    const content = 'untouched body';
    const { body, references } = renderFootnotes(content, [
      cite({ title: 'NoOffset', url: 'u' }),
    ]);
    expect(body).toBe('untouched body');
    expect(references).toEqual(['[^NoOffset]: NoOffset — u']);
  });
});

describe('renderFootnotes — reference list', () => {
  it('emits one line per unique reference with label and url', () => {
    const { references } = renderFootnotes('ab', [
      cite({ title: 'A', url: 'u', metadata: { preview_title: 'Friendly' }, start_index: 0, end_index: 1 }),
      cite({ title: 'A', url: 'u', metadata: { preview_title: 'Friendly' }, start_index: 1, end_index: 2 }),
    ]);
    expect(references).toEqual(['[^A]: Friendly — u']);
  });

  it('omits the url segment when there is no url', () => {
    const { references } = renderFootnotes('ab', [
      cite({ title: 'NoUrl', metadata: { preview_title: 'P' }, start_index: 0, end_index: 1 }),
    ]);
    expect(references).toEqual(['[^NoUrl]: P']);
  });

  it('uses the url alone when there is no title/label', () => {
    const { references } = renderFootnotes('ab', [
      cite({ url: 'https://x', start_index: 0, end_index: 1 }),
    ]);
    expect(references).toEqual(['[^ref-1]: https://x']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/footnotes.test.ts`
Expected: FAIL — the current `renderFootnotes(content, citations: Citation[])` signature/behavior does not match (type error on `RawMdCitation`, and placement/naming assertions fail).

- [ ] **Step 3: Rewrite `src/footnotes.ts`**

Replace the entire file contents with:

```ts
import type { RawMdCitation } from './types';
import { resolveReferences } from './citations';

export interface FootnoteResult {
  /** The artifact content with `[^name]` markers inserted at line/cell ends. */
  body: string;
  /** Reference definition lines, e.g. `[^name]: Label — https://url`. */
  references: string[];
}

const BR_RE = /<br\s*\/?>/i;

/**
 * Inserts named `[^name]` markers at the end of each citation's line (or table
 * cell), deduplicating repeated sources within a paragraph, and builds a
 * deduplicated reference list. Offsets are UTF-16 string indices.
 *
 * Boundary precedence (nearest wins, scanning forward from `end_index`):
 *   - a `<br>` / `<br/>` / `<br />` (case-insensitive),
 *   - a `|` cell separator, only when the current source line is a table row
 *     (its trimmed text starts with `|`),
 *   - the end of the line (`\n`) or end of string.
 * Trailing spaces/tabs before the boundary are skipped so the marker attaches to
 * the last visible character.
 *
 * Citations with no/invalid offset get no marker but still appear in the list.
 */
export function renderFootnotes(
  content: string,
  mdCitations: RawMdCitation[] | undefined,
): FootnoteResult {
  const { references, nameByIndex } = resolveReferences(mdCitations);
  const list = Array.isArray(mdCitations) ? mdCitations : [];

  // insertion point -> ordered, de-duplicated footnote names for that segment.
  const byPoint = new Map<number, string[]>();
  list.forEach((c, i) => {
    const name = nameByIndex[i];
    if (!name || !c) return;
    const end = c.end_index;
    if (!Number.isInteger(end) || end! < 0 || end! > content.length) return;
    const point = boundaryAfter(content, end!);
    const names = byPoint.get(point) ?? [];
    if (!names.includes(name)) names.push(name); // intra-paragraph dedup
    byPoint.set(point, names);
  });

  // Insert from the end backwards so earlier offsets stay valid.
  let body = content;
  for (const point of [...byPoint.keys()].sort((a, b) => b - a)) {
    const marker = byPoint.get(point)!.map((n) => `[^${n}]`).join('');
    body = body.slice(0, point) + marker + body.slice(point);
  }

  const refLines = references.map((r) => {
    if (r.label && r.url) return `[^${r.name}]: ${r.label} — ${r.url}`;
    if (r.url) return `[^${r.name}]: ${r.url}`;
    return `[^${r.name}]: ${r.label || r.name}`;
  });

  return { body, references: refLines };
}

/** Index at which to insert a marker for a citation ending at `end`. */
function boundaryAfter(content: string, end: number): number {
  const nextNl = content.indexOf('\n', end);
  const lineEnd = nextNl === -1 ? content.length : nextNl;
  const lineStart = content.lastIndexOf('\n', end - 1) + 1;
  const isTableRow = content.slice(lineStart, lineEnd).trimStart().startsWith('|');

  let best = lineEnd;

  const brMatch = BR_RE.exec(content.slice(end, lineEnd));
  if (brMatch) best = Math.min(best, end + brMatch.index);

  if (isTableRow) {
    const pipe = content.indexOf('|', end);
    if (pipe !== -1 && pipe < lineEnd) best = Math.min(best, pipe);
  }

  // Skip trailing horizontal whitespace so the marker hugs the last word.
  let insert = best;
  while (insert > end && (content[insert - 1] === ' ' || content[insert - 1] === '\t')) {
    insert--;
  }
  return insert;
}
```

- [ ] **Step 4: Run the footnotes test to verify it passes**

Run: `pnpm exec vitest run test/footnotes.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing test `test/markdown.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderArtifactMarkdown } from '../src/markdown';
import type { RawArtifactInput } from '../src/types';

describe('renderArtifactMarkdown', () => {
  it('assembles title, body with named markers, and a deduped reference list', () => {
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
      '# My Report\n\nClaim one.[^Smith]\nClaim two.[^Smith]\n\n---\n\n[^Smith]: Smith 2024 — https://a\n',
    );
  });

  it('omits the heading when there is no title and the rule when there are no citations', () => {
    const input: RawArtifactInput = { id: 'a', type: 't', content: 'Just body.' };
    expect(renderArtifactMarkdown(input)).toBe('Just body.\n');
  });
});
```

- [ ] **Step 6: Run the markdown test to verify it fails**

Run: `pnpm exec vitest run test/markdown.test.ts`
Expected: FAIL — `renderArtifactMarkdown` still expects `ArtifactDoc` (type error / wrong output).

- [ ] **Step 7: Rewrite `src/markdown.ts`**

Replace the entire file contents with:

```ts
import type { RawArtifactInput } from './types';
import { renderFootnotes } from './footnotes';

/**
 * Renders a raw artifact input to a complete Markdown document:
 *
 *   # <title>
 *
 *   <body with [^name] markers>
 *
 *   ---
 *
 *   [^name]: <label> — <url>
 *
 * The reference section (and its `---` separator) is omitted when there are no
 * citations; the heading is omitted when there is no title.
 */
export function renderArtifactMarkdown(input: RawArtifactInput): string {
  const { body, references } = renderFootnotes(input.content ?? '', input.md_citations);

  const parts: string[] = [];
  if (input.title) parts.push(`# ${input.title}`, '');
  parts.push(body.trim());
  if (references.length > 0) {
    parts.push('', '---', '', references.join('\n'));
  }
  return parts.join('\n') + '\n';
}
```

- [ ] **Step 8: Rewire `src/ui.ts` to use raw inputs**

In `src/ui.ts`, change the imports at the top from the old `extractArtifacts`/`ArtifactDoc` to the new API:

```ts
import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import type { RawArtifactInput } from './types';
```

In `renderPopover`, replace the conversation/artifacts lines:

```ts
  const conversation = getLatestConversation();
  const artifacts = findArtifacts(conversation);
```

and the rows loop so it no longer passes an index:

```ts
  } else {
    artifacts.forEach((artifact) => {
      popover.appendChild(renderRow(artifact));
    });
  }
```

Replace the whole `renderRow` function signature and the three data lines (keep the inline styles exactly as they are for now — CSS extraction happens in Task 6). Change the signature to drop `index`, set the row's top border unconditionally to `'none'` (sibling borders return with CSS in Task 6), and read from the raw input:

```ts
function renderRow(artifact: RawArtifactInput): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 0',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.textContent = artifact.title || '(untitled artifact)';
  title.style.fontWeight = '600';

  const meta = document.createElement('div');
  meta.textContent = `${artifact.md_citations?.length ?? 0} reference(s)`;
  meta.style.opacity = '0.7';
```

Leave the rest of `renderRow` (the `copy` button and `row.append(...)`) unchanged except that the click handler already calls `renderArtifactMarkdown(artifact)` — it now receives a `RawArtifactInput`, which is correct.

- [ ] **Step 9: Run the full test suite + typecheck**

Run: `pnpm test`
Expected: PASS (all tests across the four files).
Run: `pnpm typecheck`
Expected: no errors. (`ArtifactDoc`/`Citation`/`extractArtifacts` are now unused but still exported, so no error.)

- [ ] **Step 10: Build to confirm the bundle still compiles**

Run: `pnpm build`
Expected: builds `dist/claude-artifact-exporter.user.js` with no errors.

- [ ] **Step 11: Commit**

```bash
git add src/footnotes.ts src/markdown.ts src/ui.ts test/footnotes.test.ts test/markdown.test.ts
git commit -m "feat: named, deduped, end-of-line footnotes over raw artifact inputs"
```

---

### Task 4: Remove dead normalization code

**Files:**
- Modify: `src/types.ts`
- Modify: `src/conversation.ts`

- [ ] **Step 1: Remove `ArtifactDoc` and `Citation` from `src/types.ts`**

Delete the `Citation` interface and the `ArtifactDoc` interface (the last two blocks in the file). Keep all `Raw*` types and `Reference`.

- [ ] **Step 2: Remove `extractArtifacts` and its helpers from `src/conversation.ts`**

Delete `extractArtifacts`, `toArtifactDoc`, and `normalizeCitations`. Keep `findArtifacts`. Update the import line so it no longer references the removed types — it should read exactly:

```ts
import type { RawArtifactInput, RawConversation } from './types';
```

After this, `src/conversation.ts` contains only the `findArtifacts` function and that import.

- [ ] **Step 3: Verify nothing references the removed symbols**

Run: `pnpm exec grep -rnE "ArtifactDoc|extractArtifacts|normalizeCitations|toArtifactDoc|\bCitation\b" src test`
Expected: no matches.

- [ ] **Step 4: Lint, typecheck, test, build**

Run: `pnpm lint`
Expected: no errors (no unused-symbol warnings).
Run: `pnpm test`
Expected: PASS.
Run: `pnpm build`
Expected: builds cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/conversation.ts
git commit -m "refactor: drop ArtifactDoc/Citation normalization, keep raw shapes"
```

---

### Task 5: Add GM grants, ambient types, and eslint globals

**Files:**
- Modify: `src/gm.d.ts`
- Modify: `eslint.config.js`
- Modify: `vite.config.ts`

- [ ] **Step 1: Add ambient declarations in `src/gm.d.ts`**

Append these declarations to the end of `src/gm.d.ts`:

```ts
declare function GM_addStyle(css: string): HTMLStyleElement;

declare function GM_getValue<T = unknown>(name: string, defaultValue?: T): T;

declare function GM_setValue(name: string, value: unknown): void;
```

- [ ] **Step 2: Add the globals to `eslint.config.js`**

In the `languageOptions.globals` object, add three entries alongside the existing ones:

```js
        GM_addStyle: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
```

- [ ] **Step 3: Add the grants in `vite.config.ts`**

Change the `grant` array to include the three new grants:

```ts
        grant: [
          'GM_registerMenuCommand',
          'GM_setClipboard',
          'GM_addStyle',
          'GM_getValue',
          'GM_setValue',
        ],
```

- [ ] **Step 4: Lint + typecheck + build**

Run: `pnpm lint`
Expected: no errors.
Run: `pnpm build`
Expected: the generated userscript header now lists `@grant GM_addStyle`, `@grant GM_getValue`, `@grant GM_setValue`.

- [ ] **Step 5: Commit**

```bash
git add src/gm.d.ts eslint.config.js vite.config.ts
git commit -m "chore: grant + type GM_addStyle/GM_getValue/GM_setValue"
```

---

### Task 6: Extract UI styles into `src/ui.css`

**Files:**
- Create: `src/ui.css`
- Modify: `src/ui.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/ui.css`**

```css
/* All Artifact Exporter UI styles. Injected once via GM_addStyle.
   Every class is cae-prefixed to avoid colliding with Claude's own CSS. */

.cae-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #2d2d2d;
  color: #fff;
  font: 13px system-ui, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.cae-popover {
  position: fixed;
  bottom: 60px;
  right: 20px;
  z-index: 2147483647;
  width: 320px;
  max-height: 50vh;
  overflow-y: auto;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #1e1e1e;
  color: #eee;
  font: 13px system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.cae-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}

.cae-row + .cae-row {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cae-row-title {
  font-weight: 600;
}

.cae-row-meta {
  opacity: 0.7;
}

.cae-copy,
.cae-config-save,
.cae-config-close {
  align-self: flex-start;
  margin-top: 2px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: #3a3a3a;
  color: #fff;
  cursor: pointer;
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
  padding: 16px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: #1e1e1e;
  color: #eee;
  font: 13px system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.cae-config-heading {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.cae-config-note {
  margin: 0;
  opacity: 0.75;
}

.cae-config-input {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: #2a2a2a;
  color: #fff;
  font: 13px system-ui, sans-serif;
}

.cae-config-status {
  opacity: 0.8;
  font-size: 12px;
}
```

- [ ] **Step 2: Replace inline styles with classes in `src/ui.ts`**

Rewrite `src/ui.ts` so element styling uses the classes above instead of `Object.assign(el.style, …)`. The full file should read:

```ts
import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
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
      popover.appendChild(renderRow(artifact));
    });
  }

  document.body.appendChild(popover);
}

function renderRow(artifact: RawArtifactInput): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cae-row';

  const title = document.createElement('div');
  title.className = 'cae-row-title';
  title.textContent = artifact.title || '(untitled artifact)';

  const meta = document.createElement('div');
  meta.className = 'cae-row-meta';
  meta.textContent = `${artifact.md_citations?.length ?? 0} reference(s)`;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'cae-copy';
  copy.textContent = 'Copy Markdown';
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

- [ ] **Step 3: Inject the stylesheet in `src/main.ts`**

At the top of `src/main.ts`, add the CSS import and inject it before mounting the UI. Add this import alongside the existing imports:

```ts
import css from './ui.css?inline';
```

Then, immediately after `installFetchInterceptor();`, add:

```ts
// Inject all UI styles once (cae-prefixed; safe to add at document-start).
GM_addStyle(css);
```

- [ ] **Step 4: Build + lint**

Run: `pnpm build`
Expected: builds cleanly; the bundle inlines the CSS (no separate asset).
Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui.css src/ui.ts src/main.ts
git commit -m "refactor: move UI styles into src/ui.css injected via GM_addStyle"
```

---

### Task 7: Config page with a persisted dummy setting

**Files:**
- Create: `src/config.ts`
- Modify: `src/main.ts`

(Config panel styles were already added to `src/ui.css` in Task 6.)

- [ ] **Step 1: Create `src/config.ts`**

```ts
const PANEL_ID = 'cae-config-panel';
const STORE_KEY = 'cae-dummy-setting';

/**
 * Toggles a floating config panel. Placeholder for now: it persists a single
 * text value via GM_setValue/GM_getValue and reads it back so persistence across
 * reloads is visible. No real settings are wired to behavior yet.
 */
export function openConfigPanel(): void {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'cae-config-panel';

  const heading = document.createElement('h2');
  heading.className = 'cae-config-heading';
  heading.textContent = 'Artifact Exporter — Config';

  const note = document.createElement('p');
  note.className = 'cae-config-note';
  note.textContent =
    'Placeholder settings. Save a value, reload the page, and reopen to confirm it persists.';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cae-config-input';
  input.placeholder = 'Type something…';
  input.value = GM_getValue<string>(STORE_KEY, '');

  const status = document.createElement('div');
  status.className = 'cae-config-status';
  const renderStored = (): void => {
    const stored = GM_getValue<string>(STORE_KEY, '');
    status.textContent = stored ? `Persisted value: ${stored}` : 'No value persisted yet.';
  };
  renderStored();

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'cae-config-save';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    GM_setValue(STORE_KEY, input.value);
    renderStored();
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

  panel.append(heading, note, input, save, status, close);
  document.body.appendChild(panel);
}
```

- [ ] **Step 2: Register the menu command in `src/main.ts`**

Add the import alongside the others:

```ts
import { openConfigPanel } from './config';
```

Then register the command (place it with the other `GM_registerMenuCommand` calls):

```ts
GM_registerMenuCommand('Config…', openConfigPanel);
```

- [ ] **Step 3: Build + lint + typecheck**

Run: `pnpm lint`
Expected: no errors.
Run: `pnpm build`
Expected: builds cleanly.

- [ ] **Step 4: Manual verification (record the result)**

Install `dist/claude-artifact-exporter.user.js` in Tampermonkey, open `https://claude.ai/`, and use the Tampermonkey menu → **Config…**. Type a value, click **Save** (status shows "Persisted value: …"), reload the page, reopen **Config…**, and confirm the input and status still show the saved value.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/main.ts
git commit -m "feat: config page with a GM-persisted dummy setting"
```

---

### Task 8: Update CLAUDE.md and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the test-runner note in `CLAUDE.md`**

In the `## Commands` section, replace the paragraph that begins "There is no test runner yet…" with:

```markdown
Unit tests run on **vitest** (`pnpm test`), covering the pure modules
(`citations.ts`, `footnotes.ts`, `conversation.ts`, `markdown.ts`). UI, capture,
and persistence are still verified manually: build, install in Tampermonkey, and
exercise the menu commands and the floating popover on a live Claude conversation.
```

- [ ] **Step 2: Update the module list in `CLAUDE.md`**

In the `## Architecture` section's module bullets, replace the stale `src/extractor.ts` bullet and add the new modules so the list reflects reality:

```markdown
- `src/conversation.ts` — captured JSON → raw artifact selection (`findArtifacts`),
  keeping the final version per artifact `id`. No normalization: raw
  `RawArtifactInput` shapes flow through untouched until export.
- `src/citations.ts` — `resolveReferences`: dedupes sources (by URL, else title),
  assigns each a footnote name from its `title` slug (spaces→`_`, brackets stripped,
  collisions suffixed `-2`), and keeps a friendly label (`preview_title`).
- `src/footnotes.ts` — inserts named `[^name]` markers at the end of each
  citation's line/table-cell, dedupes repeated sources within a paragraph, and
  emits a deduplicated reference list.
- `src/markdown.ts` — `RawArtifactInput` → Markdown (title + body + footnote list).
- `src/config.ts` — `Config…` menu command opening a panel that persists a dummy
  setting via `GM_getValue`/`GM_setValue`.
- `src/ui.css` — all UI styles, `cae-`-prefixed, inlined at build via `?inline` +
  `GM_addStyle`.
```

- [ ] **Step 3: Full verification sweep**

Run: `pnpm lint`
Expected: no errors.
Run: `pnpm test`
Expected: PASS (all tests in `test/`).
Run: `pnpm build`
Expected: builds `dist/claude-artifact-exporter.user.js` cleanly.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for vitest and new module layout"
```

---

## Self-review notes

- **Spec coverage:** named footnotes (Task 1), end-of-line/`<br>`/table-cell placement (Task 3), global dedup + intra-paragraph dedup (Tasks 1 & 3), deferred normalization / drop `ArtifactDoc`+`Citation` (Tasks 2–4), style extraction incl. existing styles (Task 6), persisted dummy config page via menu command (Tasks 5 & 7), vitest tests (Tasks 1–3). All spec sections map to a task.
- **Type consistency:** `resolveReferences` returns `{ references: Reference[]; nameByIndex: (string|null)[] }`, consumed verbatim by `renderFootnotes`; `renderFootnotes(content, mdCitations)` consumed by `renderArtifactMarkdown(input)`; `findArtifacts` returns `RawArtifactInput[]` consumed by `ui.ts` and `renderArtifactMarkdown`. Names match across tasks.
- **No placeholders:** every code and command step is concrete.
