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
