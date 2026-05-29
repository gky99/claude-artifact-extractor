import type { CapturedResponse, ExtractedArtifact } from './types';

/**
 * Turns captured API responses into a normalized artifact ready for rendering.
 *
 * STATUS: stub. The real Claude response schema is not yet known. Run capture
 * mode (Tampermonkey menu → "Dump captured responses") on a research
 * conversation, inspect the console output, then implement extraction here:
 *
 *   1. Identify which captured response carries the artifact text.
 *   2. Identify where citations live and how they map into the text.
 *   3. Replace citation anchors with [^n] markers and collect References.
 *
 * Throwing here keeps the export path honest until extraction is implemented.
 */
export function extractArtifact(
  _captured: readonly CapturedResponse[],
): ExtractedArtifact {
  throw new Error(
    'extractArtifact not implemented yet. Use "Dump captured responses" to ' +
      'inspect the API shape, then implement extraction in src/extractor.ts.',
  );
}
