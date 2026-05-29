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
