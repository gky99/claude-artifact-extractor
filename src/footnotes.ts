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
    if (typeof end !== 'number' || !Number.isInteger(end) || end < 0 || end > content.length) return;
    const point = boundaryAfter(content, end);
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
    // The first `|` is the row's leading delimiter; a marker never goes before it.
    const leadingPipe = content.indexOf('|', lineStart);
    const pipe = content.indexOf('|', Math.max(end, leadingPipe + 1));
    if (pipe !== -1 && pipe < lineEnd) best = Math.min(best, pipe);
  }

  // Skip trailing horizontal whitespace so the marker hugs the last word.
  // Floor at lineStart (never crosses a non-space char, so it stays in-cell).
  let insert = best;
  while (insert > lineStart && (content[insert - 1] === ' ' || content[insert - 1] === '\t')) {
    insert--;
  }
  return insert;
}
