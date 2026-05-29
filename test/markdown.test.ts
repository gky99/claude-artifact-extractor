import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderArtifactMarkdown } from '../src/markdown';
import { extractArtifacts } from '../src/conversation';
import type { ArtifactDoc, RawConversation } from '../src/types';

test('assembles title, body with markers, and reference list', () => {
  const doc: ArtifactDoc = {
    id: 'a',
    title: 'My Report',
    content: 'Hello world.',
    citations: [{ label: 'Greeting', url: 'https://example.com', start: 0, end: 5 }],
    versionUuid: 'v1',
  };
  const md = renderArtifactMarkdown(doc);
  expect(md).toBe(
    '# My Report\n\nHello[^1] world.\n\n---\n\n[^1]: Greeting — https://example.com\n',
  );
});

test('omits the reference section when there are no citations', () => {
  const doc: ArtifactDoc = {
    id: 'a', title: 'T', content: 'Body only.', citations: [], versionUuid: '',
  };
  expect(renderArtifactMarkdown(doc)).toBe('# T\n\nBody only.\n');
});

test('renders the real sample artifact with 12 footnote definitions', () => {
  const path = fileURLToPath(new URL('../sample-response.json', import.meta.url));
  const conv = JSON.parse(readFileSync(path, 'utf8')) as RawConversation;
  const md = renderArtifactMarkdown(extractArtifacts(conv)[0]);
  expect(md).toContain('# How Obsidian Users Actually Build Their Second Brains');
  expect((md.match(/^\[\^\d+\]: /gm) ?? [])).toHaveLength(12);
  expect(md).toContain('[^1]'); // at least one inline marker present
});
