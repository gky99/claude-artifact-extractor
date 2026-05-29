import type {
  ArtifactDoc,
  Citation,
  RawArtifactInput,
  RawConversation,
  RawMdCitation,
} from './types';

/**
 * Walks a conversation-load response and returns every markdown artifact found,
 * normalized for rendering. Tolerant of missing/malformed fields: anything that
 * doesn't look like a usable artifact is skipped rather than throwing.
 *
 * Each artifact lives in a content block: { type: "tool_use", name: "artifacts",
 * input: { content, md_citations, ... } }. The same artifact `id` can appear
 * multiple times (command create -> update -> rewrite); we keep the LAST
 * occurrence in document order, which is the final version.
 */
export function extractArtifacts(conversation: RawConversation): ArtifactDoc[] {
  const messages = conversation?.chat_messages;
  if (!Array.isArray(messages)) return [];

  const byId = new Map<string, ArtifactDoc>();

  for (const message of messages) {
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type !== 'tool_use' || block.name !== 'artifacts') continue;
      const doc = toArtifactDoc(block.input);
      if (doc) byId.set(doc.id, doc); // last write wins -> final version
    }
  }

  return [...byId.values()];
}

function toArtifactDoc(input: RawArtifactInput | undefined): ArtifactDoc | null {
  if (!input || typeof input.content !== 'string' || typeof input.id !== 'string') {
    return null;
  }
  return {
    id: input.id,
    title: input.title ?? '',
    content: input.content,
    citations: normalizeCitations(input.md_citations),
    versionUuid: input.version_uuid ?? '',
  };
}

function normalizeCitations(raw: RawMdCitation[] | undefined): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const c of raw) {
    if (!c || typeof c.url !== 'string') continue;
    out.push({
      label: c.metadata?.preview_title || c.title || c.url,
      url: c.url,
      start: typeof c.start_index === 'number' ? c.start_index : -1,
      end: typeof c.end_index === 'number' ? c.end_index : -1,
    });
  }
  return out;
}
