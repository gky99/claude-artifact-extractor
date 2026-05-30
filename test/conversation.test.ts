import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findArtifacts } from '../src/conversation';
import type { RawConversation } from '../src/types';

const conv = (messages: unknown[]): RawConversation =>
  ({ uuid: 'c', chat_messages: messages } as unknown as RawConversation);

const artifactBlock = (input: Record<string, unknown>) => ({
  type: 'tool_use',
  name: 'artifacts',
  input,
});

function loadSample(): RawConversation {
  const path = fileURLToPath(new URL('../sample-response.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as RawConversation;
}

describe('findArtifacts', () => {
  it('returns the raw artifact input untouched', () => {
    const result = findArtifacts(
      conv([{ content: [artifactBlock({ id: 'x', content: '# Hi', md_citations: [{ url: 'u' }] })] }]),
    );
    expect(result).toEqual([{ id: 'x', content: '# Hi', md_citations: [{ url: 'u' }] }]);
  });

  it('keeps the final version when an id appears multiple times', () => {
    const result = findArtifacts(
      conv([
        { content: [artifactBlock({ id: 'x', content: 'v1', command: 'create' })] },
        { content: [artifactBlock({ id: 'x', content: 'v2', command: 'update' })] },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('v2');
  });

  it('skips non-artifact blocks and malformed inputs', () => {
    const result = findArtifacts(
      conv([
        { content: [{ type: 'text' }, artifactBlock({ id: 42, content: 'bad' })] },
        { content: 'not-an-array' },
      ]),
    );
    expect(result).toEqual([]);
  });

  it('returns [] for null/empty conversations', () => {
    expect(findArtifacts(null)).toEqual([]);
    expect(findArtifacts(conv([]))).toEqual([]);
  });

  it('selects the real sample artifact as raw input with 12 citations', () => {
    const artifacts = findArtifacts(loadSample());
    expect(artifacts).toHaveLength(1);
    const a = artifacts[0];
    expect(a.title).toBe(
      'How Obsidian Users Actually Build Their Second Brains: Workflows, Simplification, and What Survives',
    );
    expect(a.content.startsWith('# How Obsidian users actually build their second brains')).toBe(true);
    expect(a.md_citations).toHaveLength(12);
  });
});
