const STORE_KEY = 'cae-settings';

export type Theme = 'auto' | 'light' | 'dark';

/** The viewport corner the button stack is anchored to. */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Persisted button-stack position, stored relative to its nearest corner so it
 *  keeps the same relative spot when the viewport resizes. `dx`/`dy` are the
 *  inward distances (px) from that corner's vertical/horizontal edges. */
export interface ButtonPos {
  corner: Corner;
  dx: number;
  dy: number;
}

const CORNERS: readonly Corner[] = ['tl', 'tr', 'bl', 'br'];

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
  /** Capture every /api/ response into the debug store + show the dump command.
   *  Off by default to avoid the memory cost of broad capture. */
  debug: boolean;
  /** UI color theme. 'auto' follows the OS via prefers-color-scheme. */
  theme: Theme;
  /** Show the floating gear (settings) button. */
  showSettingsButton: boolean;
  /** Persisted corner-relative position of the draggable button stack;
   *  null = default corner. */
  buttonPos: ButtonPos | null;
}

const DEFAULTS: Settings = {
  showCopy: true,
  showDownload: false,
  showObsidian: false,
  obsidianVault: '',
  obsidianFolder: '',
  debug: false,
  theme: 'auto',
  showSettingsButton: true,
  buttonPos: null,
};

function parseButtonPos(value: unknown): ButtonPos | null {
  if (
    typeof value === 'object' && value !== null &&
    CORNERS.includes((value as ButtonPos).corner) &&
    Number.isFinite((value as ButtonPos).dx) &&
    Number.isFinite((value as ButtonPos).dy)
  ) {
    const { corner, dx, dy } = value as ButtonPos;
    return { corner, dx, dy };
  }
  return null;
}

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
    debug: typeof parsed.debug === 'boolean' ? parsed.debug : DEFAULTS.debug,
    theme:
      parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'auto'
        ? parsed.theme
        : DEFAULTS.theme,
    showSettingsButton:
      typeof parsed.showSettingsButton === 'boolean'
        ? parsed.showSettingsButton
        : DEFAULTS.showSettingsButton,
    buttonPos: 'buttonPos' in parsed ? parseButtonPos(parsed.buttonPos) : DEFAULTS.buttonPos,
  };
}

/** Listeners notified after settings are persisted, so modules can react to a
 *  change live (no page reload). */
const listeners: Array<() => void> = [];

/** Registers a listener invoked after every saveSettings(). */
export function subscribe(listener: () => void): void {
  listeners.push(listener);
}

/** Persists the full settings object, then notifies subscribers (best-effort:
 *  a throwing listener never blocks persistence or other listeners). */
export function saveSettings(s: Settings): void {
  GM_setValue(STORE_KEY, JSON.stringify(s));
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a subscriber must never break saving or sibling subscribers */
    }
  }
}
