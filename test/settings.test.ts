import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSettings, saveSettings, subscribe } from '../src/settings';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('GM_getValue', (k: string, d: unknown) => (k in store ? store[k] : d));
  vi.stubGlobal('GM_setValue', (k: string, v: unknown) => {
    store[k] = v;
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getSettings()).toEqual({
      showCopy: true,
      showDownload: false,
      showObsidian: false,
      obsidianVault: '',
      obsidianFolder: '',
      debug: false,
      theme: 'auto',
      showSettingsButton: true,
      buttonPos: null,
    });
  });

  it('round-trips saved settings', () => {
    saveSettings({
      showCopy: false,
      showDownload: true,
      showObsidian: true,
      obsidianVault: 'My Vault',
      obsidianFolder: 'Clippings',
      debug: true,
      theme: 'dark',
      showSettingsButton: false,
      buttonPos: { x: 100, y: 200 },
    });
    expect(getSettings()).toEqual({
      showCopy: false,
      showDownload: true,
      showObsidian: true,
      obsidianVault: 'My Vault',
      obsidianFolder: 'Clippings',
      debug: true,
      theme: 'dark',
      showSettingsButton: false,
      buttonPos: { x: 100, y: 200 },
    });
  });

  it('falls back to defaults on corrupt stored JSON', () => {
    store['cae-settings'] = '{not valid json';
    expect(getSettings().showCopy).toBe(true);
    expect(getSettings().obsidianVault).toBe('');
  });

  it('fills missing keys from defaults (partial stored object)', () => {
    store['cae-settings'] = JSON.stringify({ showDownload: true });
    const s = getSettings();
    expect(s.showDownload).toBe(true);
    expect(s.showCopy).toBe(true); // default preserved
    expect(s.obsidianFolder).toBe('');
  });

  it('defaults debug to false and ignores a non-boolean stored value', () => {
    expect(getSettings().debug).toBe(false);
    store['cae-settings'] = JSON.stringify({ debug: 'yes' });
    expect(getSettings().debug).toBe(false);
  });

  it('notifies subscribers on save', () => {
    const calls: number[] = [];
    subscribe(() => calls.push(1));
    saveSettings(getSettings());
    expect(calls).toEqual([1]);
  });

  it('a throwing subscriber neither blocks persistence nor other subscribers', () => {
    const calls: string[] = [];
    subscribe(() => {
      throw new Error('boom');
    });
    subscribe(() => calls.push('ran'));
    saveSettings({ ...getSettings(), debug: true });
    expect(calls).toEqual(['ran']);
    expect(getSettings().debug).toBe(true); // persisted despite the throw
  });

  it('defaults theme to auto and ignores an invalid stored value', () => {
    expect(getSettings().theme).toBe('auto');
    store['cae-settings'] = JSON.stringify({ theme: 'rainbow' });
    expect(getSettings().theme).toBe('auto');
  });

  it('accepts each valid theme value', () => {
    for (const t of ['auto', 'light', 'dark'] as const) {
      store['cae-settings'] = JSON.stringify({ theme: t });
      expect(getSettings().theme).toBe(t);
    }
  });

  it('defaults showSettingsButton to true and ignores non-boolean', () => {
    expect(getSettings().showSettingsButton).toBe(true);
    store['cae-settings'] = JSON.stringify({ showSettingsButton: 'no' });
    expect(getSettings().showSettingsButton).toBe(true);
  });

  it('defaults buttonPos to null and round-trips a valid point', () => {
    expect(getSettings().buttonPos).toBeNull();
    store['cae-settings'] = JSON.stringify({ buttonPos: { x: 12, y: 34 } });
    expect(getSettings().buttonPos).toEqual({ x: 12, y: 34 });
  });

  it('rejects a malformed buttonPos (non-finite or wrong shape)', () => {
    store['cae-settings'] = JSON.stringify({ buttonPos: { x: 'a', y: 1 } });
    expect(getSettings().buttonPos).toBeNull();
    store['cae-settings'] = JSON.stringify({ buttonPos: 5 });
    expect(getSettings().buttonPos).toBeNull();
  });
});
