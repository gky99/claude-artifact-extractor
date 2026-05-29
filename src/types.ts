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
