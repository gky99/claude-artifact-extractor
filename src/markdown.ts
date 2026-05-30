import type { RawArtifactInput } from './types';
import { renderFootnotes } from './footnotes';

/**
 * Renders a raw artifact input to a complete Markdown document:
 *
 *   <body with [^name] markers>
 *
 *   ---
 *
 *   [^name]: <label> — <url>
 *
 * The title is NOT rendered as a heading — it is used only as the export
 * filename by the exporters. The reference section (and its `---` separator)
 * is omitted when there are no citations.
 */
export function renderArtifactMarkdown(input: RawArtifactInput): string {
  const { body, references } = renderFootnotes(input.content ?? '', input.md_citations);

  const parts: string[] = [body.trim()];
  if (references.length > 0) {
    parts.push('', '---', '', references.join('\n'));
  }
  return parts.join('\n') + '\n';
}
