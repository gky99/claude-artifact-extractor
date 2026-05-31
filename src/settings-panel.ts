import { getSettings, saveSettings, type Settings, type Theme } from './settings';

const PANEL_ID = 'cae-config-panel';
const BACKDROP_ID = 'cae-backdrop';

/** Toggles the settings modal. Appearance controls (theme, gear visibility)
 *  apply live; export-action + debug settings commit on Save. Dismissable via
 *  ESC, backdrop click, or Close. */
export function openSettingsPanel(): void {
  if (document.getElementById(PANEL_ID)) {
    closePanel();
    return;
  }

  const settings = getSettings();

  const backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  backdrop.className = 'cae-backdrop';
  backdrop.addEventListener('click', closePanel);

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'cae-config-panel';

  const heading = document.createElement('h2');
  heading.className = 'cae-config-heading';
  heading.textContent = 'Artifact Extractor — Config';

  // --- Appearance (live-applied) ---
  const appearance = makeSection('Appearance');

  const themeField = document.createElement('label');
  themeField.className = 'cae-config-field';
  const themeLabel = document.createElement('span');
  themeLabel.className = 'cae-config-label';
  themeLabel.textContent = 'Theme';
  const themeSelect = document.createElement('select');
  themeSelect.className = 'cae-config-select';
  for (const [value, text] of [['auto', 'Auto (system)'], ['light', 'Light'], ['dark', 'Dark']] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    themeSelect.appendChild(opt);
  }
  themeSelect.value = settings.theme;
  themeSelect.addEventListener('change', () => {
    saveSettings({ ...getSettings(), theme: themeSelect.value as Theme });
  });
  themeField.append(themeLabel, themeSelect);

  const gearCheck = makeCheckbox('Show settings button', settings.showSettingsButton);
  gearCheck.input.addEventListener('change', () => {
    saveSettings({ ...getSettings(), showSettingsButton: gearCheck.input.checked });
  });

  appearance.append(themeField, gearCheck.wrap);

  // --- Export actions (Save-committed) ---
  const actions = makeSection('Export actions');
  const copyCheck = makeCheckbox('Show "Copy" button', settings.showCopy);
  const downloadCheck = makeCheckbox('Show "Download" button', settings.showDownload);
  const obsidianCheck = makeCheckbox('Show "Save to Obsidian" button', settings.showObsidian);
  const vaultField = makeField('Obsidian vault name', 'e.g. My Vault', settings.obsidianVault);
  const folderField = makeField('Folder path (blank = vault root)', 'e.g. Clippings', settings.obsidianFolder);
  actions.append(
    copyCheck.wrap,
    downloadCheck.wrap,
    obsidianCheck.wrap,
    vaultField.wrap,
    folderField.wrap,
  );

  // --- Debug (Save-committed) ---
  const debug = makeSection('Debug');
  const debugCheck = makeCheckbox('Enable debug capture (logs every API response)', settings.debug);
  debug.append(debugCheck.wrap);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'cae-config-save';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    const cur = getSettings(); // preserves live-applied theme/showSettingsButton/buttonPos
    const next: Settings = {
      ...cur,
      showCopy: copyCheck.input.checked,
      showDownload: downloadCheck.input.checked,
      showObsidian: obsidianCheck.input.checked,
      obsidianVault: vaultField.input.value,
      obsidianFolder: folderField.input.value,
      debug: debugCheck.input.checked,
    };
    saveSettings(next);
    save.textContent = 'Saved ✓';
    setTimeout(() => {
      save.textContent = 'Save';
    }, 1500);
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cae-config-close';
  close.textContent = 'Close';
  close.addEventListener('click', closePanel);

  panel.append(heading, appearance, actions, debug, save, close);
  document.body.append(backdrop, panel);
  document.addEventListener('keydown', onKeydown);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closePanel();
}

function closePanel(): void {
  document.removeEventListener('keydown', onKeydown);
  document.getElementById(PANEL_ID)?.remove();
  document.getElementById(BACKDROP_ID)?.remove();
}

function makeSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'cae-config-section';
  const heading = document.createElement('div');
  heading.className = 'cae-config-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function makeCheckbox(label: string, checked: boolean): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement('label');
  wrap.className = 'cae-config-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(input, span);
  return { wrap, input };
}

function makeField(label: string, placeholder: string, value: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement('label');
  wrap.className = 'cae-config-field';
  const span = document.createElement('span');
  span.className = 'cae-config-label';
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cae-config-input';
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(span, input);
  return { wrap, input };
}
