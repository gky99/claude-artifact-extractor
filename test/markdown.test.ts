import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderArtifactMarkdown } from '../src/markdown';
import { findArtifacts } from '../src/conversation';
import type { RawArtifactInput, RawConversation } from '../src/types';

describe('renderArtifactMarkdown', () => {
  it('assembles title, body with named markers, and a deduped reference list', () => {
    const input: RawArtifactInput = {
      id: 'a',
      type: 'text/markdown',
      title: 'My Report',
      content: 'Claim one.\nClaim two.',
      md_citations: [
        { title: 'Smith', url: 'https://a', metadata: { preview_title: 'Smith 2024' }, start_index: 0, end_index: 6 },
        { title: 'Smith', url: 'https://a', metadata: { preview_title: 'Smith 2024' }, start_index: 11, end_index: 17 },
      ],
    };
    expect(renderArtifactMarkdown(input)).toBe(
      '# My Report\n\nClaim one.[^Smith]\nClaim two.[^Smith]\n\n---\n\n[^Smith]: Smith 2024 — https://a\n',
    );
  });

  it('omits the heading when there is no title and the rule when there are no citations', () => {
    const input: RawArtifactInput = { id: 'a', type: 't', content: 'Just body.' };
    expect(renderArtifactMarkdown(input)).toBe('Just body.\n');
  });

  it('renders the real sample with 4 unique, named footnote definitions', () => {
    const path = fileURLToPath(new URL('../sample-response.json', import.meta.url));
    const conv = JSON.parse(readFileSync(path, 'utf8')) as RawConversation;
    const md = renderArtifactMarkdown(findArtifacts(conv)[0]);
    expect(md).toContain('# How Obsidian Users Actually Build Their Second Brains');
    const defs = md.match(/^\[\^[^\]]+\]: /gm) ?? [];
    expect(defs).toHaveLength(4); // 12 citations dedupe to 4 unique URLs
    const names = [...md.matchAll(/^\[\^([^\]]+)\]: /gm)].map((m) => m[1]);
    expect(names).toContain('Emilevankrieken');
    expect(names).toContain('Thesis_Whisperer');
    for (const n of names) expect(n).not.toMatch(/\s/);
    expect(md).toMatch(/\[\^Emilevankrieken\]/); // at least one inline marker
  });
});
