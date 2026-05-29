import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractArtifacts } from '../src/conversation';
import type { RawConversation } from '../src/types';

function loadSample(): RawConversation {
  const path = fileURLToPath(new URL('../sample-response.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as RawConversation;
}

test('extracts the markdown artifact from the sample conversation', () => {
  const artifacts = extractArtifacts(loadSample());
  expect(artifacts).toHaveLength(1);
  const a = artifacts[0];
  expect(a.title).toBe(
    'How Obsidian Users Actually Build Their Second Brains: Workflows, Simplification, and What Survives',
  );
  expect(a.content.startsWith('# How Obsidian users actually build their second brains')).toBe(true);
  expect(a.citations).toHaveLength(12);
});

test('normalizes citation label, url, and offsets', () => {
  const a = extractArtifacts(loadSample())[0];
  const first = a.citations[0];
  expect(first.label).toBe('How I use Obsidian for academic work | Emile van Krieken');
  expect(first.url).toBe('https://www.emilevankrieken.com/blog/2025/academic-obsidian/');
  expect(first.start).toBe(1959);
  expect(first.end).toBe(2146);
});

test('returns an empty array when there are no artifacts', () => {
  expect(extractArtifacts({ uuid: 'x', chat_messages: [] })).toEqual([]);
});

test('ignores malformed input safely', () => {
  // @ts-expect-error testing runtime robustness against bad shapes
  expect(extractArtifacts(null)).toEqual([]);
  // @ts-expect-error testing runtime robustness against bad shapes
  expect(extractArtifacts({})).toEqual([]);
});
