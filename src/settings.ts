const STORE_KEY = 'cae-settings';

/** Persisted user settings. One JSON blob under STORE_KEY. */
export interface Settings {
  /** Show the "Copy" button on each artifact row. */
  showCopy: boolean;
  /** Show the "Download" button. */
  showDownload: boolean;
  /** Show the "Save to Obsidian" button. */
  showObsidian: boolean;
  /** Obsidian vault name (required for Save to Obsidian). */
  obsidianVault: string;
  /** Vault-relative folder; '' means the vault root. */
  obsidianFolder: string;
}

const DEFAULTS: Settings = {
  showCopy: true,
  showDownload: false,
  showObsidian: false,
  obsidianVault: '',
  obsidianFolder: '',
};

/** Reads settings, merging any stored values over defaults. Tolerant of
 *  missing/corrupt/partial stored data — always returns a complete Settings. */
export function getSettings(): Settings {
  const raw = GM_getValue<string>(STORE_KEY, '');
  if (!raw) return { ...DEFAULTS };
  let parsed: Partial<Settings>;
  try {
    parsed = JSON.parse(raw) as Partial<Settings>;
  } catch {
    return { ...DEFAULTS };
  }
  return {
    showCopy: typeof parsed.showCopy === 'boolean' ? parsed.showCopy : DEFAULTS.showCopy,
    showDownload: typeof parsed.showDownload === 'boolean' ? parsed.showDownload : DEFAULTS.showDownload,
    showObsidian: typeof parsed.showObsidian === 'boolean' ? parsed.showObsidian : DEFAULTS.showObsidian,
    obsidianVault: typeof parsed.obsidianVault === 'string' ? parsed.obsidianVault : DEFAULTS.obsidianVault,
    obsidianFolder: typeof parsed.obsidianFolder === 'string' ? parsed.obsidianFolder : DEFAULTS.obsidianFolder,
  };
}

/** Persists the full settings object. */
export function saveSettings(s: Settings): void {
  GM_setValue(STORE_KEY, JSON.stringify(s));
}
