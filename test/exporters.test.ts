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
  // Format mirrors obsidianmd/obsidian-clipper: file then vault, a BARE `&clipboard`
  // flag (tells Obsidian to read the body from the clipboard), then a `&content=`
  // fallback Obsidian only uses if it cannot access the clipboard.
  it('builds a new-note URI: encoded file then vault, bare clipboard flag + content fallback', () => {
    const uri = buildObsidianUri({ vault: 'My Vault', folder: 'Clippings', title: 'My Report' });
    expect(uri.startsWith('obsidian://new?file=Clippings%2FMy%20Report&vault=My%20Vault&clipboard&content=')).toBe(
      true,
    );
  });

  it('omits the folder segment when folder is empty (vault root)', () => {
    const uri = buildObsidianUri({ vault: 'V', folder: '', title: 'Note' });
    expect(uri.startsWith('obsidian://new?file=Note&vault=V&clipboard&content=')).toBe(true);
  });

  it('strips leading/trailing slashes on the folder', () => {
    const uri = buildObsidianUri({ vault: 'V', folder: '/sub/dir/', title: 'Note' });
    expect(uri.startsWith('obsidian://new?file=sub%2Fdir%2FNote&vault=V&clipboard&content=')).toBe(true);
  });

  it('sanitizes the title through toFileName', () => {
    const uri = buildObsidianUri({ vault: 'V', folder: '', title: 'a/b:c' });
    expect(uri.startsWith('obsidian://new?file=abc&vault=V&clipboard&content=')).toBe(true);
  });

  it('uses a bare clipboard flag (not clipboard=true) and includes a content fallback', () => {
    const uri = buildObsidianUri({ vault: 'V', folder: '', title: 'N' });
    expect(uri).toContain('&clipboard&content=');
    expect(uri).not.toContain('clipboard=true');
  });
});
