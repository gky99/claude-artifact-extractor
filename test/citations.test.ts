import { describe, it, expect } from 'vitest';
import { resolveReferences } from '../src/citations';
import type { RawMdCitation } from '../src/types';

const cite = (c: Partial<RawMdCitation>): RawMdCitation => c;

describe('resolveReferences', () => {
  it('names a footnote from the title slug', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'Emilevankrieken', url: 'https://a.example' }),
    ]);
    expect(nameByIndex).toEqual(['Emilevankrieken']);
    expect(references).toEqual([
      { name: 'Emilevankrieken', label: 'Emilevankrieken', url: 'https://a.example' },
    ]);
  });

  it('uses preview_title as the label but the slug as the name', () => {
    const { references } = resolveReferences([
      cite({ title: 'Slug', url: 'u', metadata: { preview_title: 'Friendly Title' } }),
    ]);
    expect(references[0]).toEqual({ name: 'Slug', label: 'Friendly Title', url: 'u' });
  });

  it('replaces whitespace with underscores and strips brackets', () => {
    const { nameByIndex } = resolveReferences([
      cite({ title: 'Hello World', url: 'u1' }),
      cite({ title: 'a[b]c', url: 'u2' }),
    ]);
    expect(nameByIndex).toEqual(['Hello_World', 'abc']);
  });

  it('falls back to ref-N for an empty title', () => {
    const { nameByIndex } = resolveReferences([cite({ url: 'u' })]);
    expect(nameByIndex).toEqual(['ref-1']);
  });

  it('dedupes by URL, first occurrence wins for name/label', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'First', url: 'same' }),
      cite({ title: 'Second', url: 'same' }),
    ]);
    expect(references).toHaveLength(1);
    expect(references[0].name).toBe('First');
    expect(nameByIndex).toEqual(['First', 'First']);
  });

  it('falls back to title for identity when there is no URL', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'NoUrl', metadata: { preview_title: 'P' } }),
      cite({ title: 'NoUrl', metadata: { preview_title: 'P' } }),
    ]);
    expect(references).toHaveLength(1);
    expect(nameByIndex).toEqual(['NoUrl', 'NoUrl']);
    expect(references[0]).toEqual({ name: 'NoUrl', label: 'P', url: '' });
  });

  it('suffixes the name when two DIFFERENT sources collide', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ title: 'Dup', url: 'u1' }),
      cite({ title: 'Dup', url: 'u2' }),
    ]);
    expect(references.map((r) => r.name)).toEqual(['Dup', 'Dup-2']);
    expect(nameByIndex).toEqual(['Dup', 'Dup-2']);
  });

  it('falls back to the preview_title slug for the name when title is absent', () => {
    const { references, nameByIndex } = resolveReferences([
      cite({ url: 'u', metadata: { preview_title: 'Shared Preview' } }),
    ]);
    expect(nameByIndex).toEqual(['Shared_Preview']);
    expect(references[0].name).toBe('Shared_Preview');
  });

  it('maps citations with no identity to null', () => {
    const { references, nameByIndex } = resolveReferences([cite({})]);
    expect(references).toHaveLength(0);
    expect(nameByIndex).toEqual([null]);
  });

  it('tolerates undefined input', () => {
    expect(resolveReferences(undefined)).toEqual({ references: [], nameByIndex: [] });
  });
});
