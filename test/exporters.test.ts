import { describe, it, expect } from 'vitest';
import { toFileName, buildObsidianUri } from '../src/exporters';

describe('toFileName', () => {
  it('strips filesystem-unsafe characters but keeps spaces', () => {
    expect(toFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(toFileName('My Report')).toBe('My Report');
  });

  it('collapses whitespace runs and trims', () => {
    expect(toFileName('  hello   world  ')).toBe('hello world');
    expect(toFileName('tab\tand\nnewline')).toBe('tab and newline');
  });

  it('strips control characters except tab/newline/CR', () => {
    expect(toFileName('a\x00b\x07c')).toBe('abc');
    expect(toFileName('x\x1fy')).toBe('xy');
  });

  it('falls back for empty / whitespace / undefined titles', () => {
    expect(toFileName('')).toBe('Untitled artifact');
    expect(toFileName('   ')).toBe('Untitled artifact');
    expect(toFileName(undefined)).toBe('Untitled artifact');
  });
});

describe('buildObsidianUri', () => {
  it('builds a new-note URI with encoded vault + folder/file and clipboard flag', () => {
    expect(buildObsidianUri({ vault: 'My Vault', folder: 'Clippings', title: 'My Report' })).toBe(
      'obsidian://new?vault=My%20Vault&file=Clippings%2FMy%20Report&clipboard=true',
    );
  });

  it('omits the folder segment when folder is empty (vault root)', () => {
    expect(buildObsidianUri({ vault: 'V', folder: '', title: 'Note' })).toBe(
      'obsidian://new?vault=V&file=Note&clipboard=true',
    );
  });

  it('strips leading/trailing slashes on the folder', () => {
    expect(buildObsidianUri({ vault: 'V', folder: '/sub/dir/', title: 'Note' })).toBe(
      'obsidian://new?vault=V&file=sub%2Fdir%2FNote&clipboard=true',
    );
  });

  it('sanitizes the title through toFileName', () => {
    expect(buildObsidianUri({ vault: 'V', folder: '', title: 'a/b:c' })).toBe(
      'obsidian://new?vault=V&file=abc&clipboard=true',
    );
  });
});
