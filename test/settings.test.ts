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
    });
    expect(getSettings()).toEqual({
      showCopy: false,
      showDownload: true,
      showObsidian: true,
      obsidianVault: 'My Vault',
      obsidianFolder: 'Clippings',
      debug: true,
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
});
