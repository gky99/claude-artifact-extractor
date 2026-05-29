/**
 * Shapes of the data we capture from Claude's API.
 *
 * NOTE: These are intentionally loose right now. The real schema is unknown
 * until we run capture mode against live traffic (see fetch-interceptor.ts).
 * Once we inspect dumped responses, tighten these types and the extractor.
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

/**
 * The normalized artifact we ultimately render to markdown.
 * Filled in once the source schema is understood.
 */
export interface ExtractedArtifact {
  title: string;
  /** Markdown body BEFORE reference rewriting (may contain citation markers). */
  body: string;
  references: Reference[];
}

export interface Reference {
  /** 1-based index used for the [^n] footnote marker. */
  index: number;
  title?: string;
  url: string;
}
