import type { RawArtifactInput, RawConversation } from './types';

/**
 * Selects every markdown artifact's RAW input from a conversation, keeping the
 * final version per `id` (last write wins). Pure selection — no normalization;
 * the raw `RawArtifactInput` is returned untouched. Tolerant of malformed data.
 */
export function findArtifacts(
  conversation: RawConversation | null | undefined,
): RawArtifactInput[] {
  const messages = conversation?.chat_messages;
  if (!Array.isArray(messages)) return [];

  const byId = new Map<string, RawArtifactInput>();
  for (const message of messages) {
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type !== 'tool_use' || block.name !== 'artifacts') continue;
      const input = block.input;
      if (!input || typeof input.content !== 'string' || typeof input.id !== 'string') {
        continue;
      }
      byId.set(input.id, input); // last write wins -> final version
    }
  }
  return [...byId.values()];
}
