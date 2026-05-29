import type { ExtractedArtifact } from './types';

/**
 * Renders an extracted artifact to Markdown using footnote-style references
 * ([^1] markers + a reference list at the bottom), which round-trips cleanly
 * into Obsidian and most Markdown viewers.
 *
 * Assumes `artifact.body` already contains [^n] markers placed by the extractor,
 * matching `artifact.references[].index`.
 */
export function renderMarkdown(artifact: ExtractedArtifact): string {
  const parts: string[] = [];

  if (artifact.title) {
    parts.push(`# ${artifact.title}`, '');
  }

  parts.push(artifact.body.trim());

  if (artifact.references.length > 0) {
    parts.push('', '---', '');
    for (const ref of artifact.references) {
      const label = ref.title ? `${ref.title} — ${ref.url}` : ref.url;
      parts.push(`[^${ref.index}]: ${label}`);
    }
  }

  return parts.join('\n') + '\n';
}
