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
