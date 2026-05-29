import { test, expect } from 'vitest';
import { renderFootnotes } from '../src/footnotes';
import type { Citation } from '../src/types';

test('inserts a marker at the citation end_index and lists the reference', () => {
  const content = 'Hello world.';
  const citations: Citation[] = [
    { label: 'Greeting', url: 'https://example.com', start: 0, end: 5 },
  ];
  const { body, references } = renderFootnotes(content, citations);
  expect(body).toBe('Hello[^1] world.');
  expect(references).toEqual(['[^1]: Greeting — https://example.com']);
});

test('numbers citations in array order without deduping shared urls', () => {
  const content = 'AB';
  const citations: Citation[] = [
    { label: 'one', url: 'https://same.com', start: 0, end: 1 },
    { label: 'two', url: 'https://same.com', start: 1, end: 2 },
  ];
  const { body, references } = renderFootnotes(content, citations);
  expect(body).toBe('A[^1]B[^2]');
  expect(references).toEqual([
    '[^1]: one — https://same.com',
    '[^2]: two — https://same.com',
  ]);
});

test('two citations ending at the same offset render consecutive markers in order', () => {
  const content = 'AB';
  const citations: Citation[] = [
    { label: 'one', url: 'https://a.com', start: 0, end: 2 },
    { label: 'two', url: 'https://b.com', start: 1, end: 2 },
  ];
  const { body } = renderFootnotes(content, citations);
  expect(body).toBe('AB[^1][^2]');
});

test('uses UTF-16 offsets so markers land correctly after non-BMP characters', () => {
  const emoji = 'a😀b'; // 😀 is U+1F600, 2 UTF-16 units; "b" is at index 3
  const citations: Citation[] = [
    { label: 's', url: 'https://e.com', start: 0, end: 3 },
  ];
  const { body } = renderFootnotes(emoji, citations);
  expect(body).toBe('a😀[^1]b');
});

test('falls back to an unanchored reference list when offsets are missing', () => {
  const content = 'No anchors here.';
  const citations: Citation[] = [
    { label: 'src', url: 'https://x.com', start: -1, end: -1 },
  ];
  const { body, references } = renderFootnotes(content, citations);
  expect(body).toBe('No anchors here.');
  expect(references).toEqual(['[^1]: src — https://x.com']);
});

test('returns empty references for no citations', () => {
  const { body, references } = renderFootnotes('plain', []);
  expect(body).toBe('plain');
  expect(references).toEqual([]);
});
