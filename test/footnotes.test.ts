import { describe, it, expect } from 'vitest';
import { renderFootnotes } from '../src/footnotes';
import type { RawMdCitation } from '../src/types';

const cite = (c: Partial<RawMdCitation>): RawMdCitation => c;

describe('renderFootnotes — placement', () => {
  it('moves the marker to the end of the prose line (newline boundary)', () => {
    const content = 'First line here.\nSecond line.';
    const { body } = renderFootnotes(content, [
      cite({ title: 'Src', url: 'u', start_index: 0, end_index: 6 }),
    ]);
    expect(body).toBe('First line here.[^Src]\nSecond line.');
  });

  it('places the marker before a <br> (and <br/>)', () => {
    const { body } = renderFootnotes('a<br>b', [
      cite({ title: 'X', url: 'u', start_index: 0, end_index: 1 }),
    ]);
    expect(body).toBe('a[^X]<br>b');
    const r2 = renderFootnotes('a<br/>b', [
      cite({ title: 'X', url: 'u', start_index: 0, end_index: 1 }),
    ]);
    expect(r2.body).toBe('a[^X]<br/>b');
  });

  it('places the marker before the closing pipe inside a table row, trimming the space', () => {
    const content = '| c1 | val here |';
    const { body } = renderFootnotes(content, [
      cite({ title: 'Y', url: 'u', start_index: 11, end_index: 15 }),
    ]);
    expect(body).toBe('| c1 | val here[^Y] |');
  });

  it('ignores | as a boundary outside a table row', () => {
    const content = 'pipes | are | literal';
    const { body } = renderFootnotes(content, [
      cite({ title: 'Z', url: 'u', start_index: 0, end_index: 5 }),
    ]);
    expect(body).toBe('pipes | are | literal[^Z]');
  });

  it('counts UTF-16 offsets correctly when placing at line end past a non-BMP char', () => {
    const content = 'a😀b\nnext'; // 😀 = U+1F600 (2 UTF-16 units), 'b' at index 3
    const { body } = renderFootnotes(content, [
      cite({ title: 'S', url: 'u', start_index: 0, end_index: 1 }),
    ]);
    expect(body).toBe('a😀b[^S]\nnext');
  });

  it('dedupes repeated markers for the same source within a paragraph', () => {
    const content = 'x and y here.';
    const { body } = renderFootnotes(content, [
      cite({ title: 'A', url: 'same', start_index: 0, end_index: 5 }),
      cite({ title: 'A', url: 'same', start_index: 6, end_index: 12 }),
    ]);
    expect(body).toBe('x and y here.[^A]');
  });

  it('renders distinct sources at the same point as consecutive markers', () => {
    const content = 'foo bar.';
    const { body } = renderFootnotes(content, [
      cite({ title: 'A', url: 'u1', start_index: 0, end_index: 3 }),
      cite({ title: 'B', url: 'u2', start_index: 4, end_index: 7 }),
    ]);
    expect(body).toBe('foo bar.[^A][^B]');
  });

  it('lists a citation with no offset but inserts no marker', () => {
    const content = 'untouched body';
    const { body, references } = renderFootnotes(content, [
      cite({ title: 'NoOffset', url: 'u' }),
    ]);
    expect(body).toBe('untouched body');
    expect(references).toEqual(['[^NoOffset]: NoOffset — u']);
  });

  it('handles <br /> with a space', () => {
    const { body } = renderFootnotes('a<br />b', [
      cite({ title: 'X', url: 'u', start_index: 0, end_index: 1 }),
    ]);
    expect(body).toBe('a[^X]<br />b');
  });

  it('never places a marker before a table row opening pipe', () => {
    const content = '| cell data |';
    const { body } = renderFootnotes(content, [
      cite({ title: 'T', url: 'u', start_index: 0, end_index: 0 }),
    ]);
    expect(body).toBe('| cell data[^T] |');
  });

  it('hugs the last word when a citation ends exactly on an internal cell separator', () => {
    const content = '| a | b | c |';
    const { body } = renderFootnotes(content, [
      cite({ title: 'P', url: 'u', start_index: 2, end_index: 4 }),
    ]);
    expect(body).toBe('| a[^P] | b | c |');
  });
});

describe('renderFootnotes — reference list', () => {
  it('emits one line per unique reference with label and url', () => {
    const { references } = renderFootnotes('ab', [
      cite({ title: 'A', url: 'u', metadata: { preview_title: 'Friendly' }, start_index: 0, end_index: 1 }),
      cite({ title: 'A', url: 'u', metadata: { preview_title: 'Friendly' }, start_index: 1, end_index: 2 }),
    ]);
    expect(references).toEqual(['[^A]: Friendly — u']);
  });

  it('omits the url segment when there is no url', () => {
    const { references } = renderFootnotes('ab', [
      cite({ title: 'NoUrl', metadata: { preview_title: 'P' }, start_index: 0, end_index: 1 }),
    ]);
    expect(references).toEqual(['[^NoUrl]: P']);
  });

  it('uses the url alone when there is no title/label', () => {
    const { references } = renderFootnotes('ab', [
      cite({ url: 'https://x', start_index: 0, end_index: 1 }),
    ]);
    expect(references).toEqual(['[^ref-1]: https://x']);
  });
});
