import { getSettings, saveSettings, type Settings } from './settings';

const PANEL_ID = 'cae-config-panel';

/** Toggles a floating settings panel: which action buttons appear, plus the
 *  Obsidian vault + folder used by "Save to Obsidian". Persists via settings.ts. */
export function openConfigPanel(): void {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const settings = getSettings();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'cae-config-panel';

  const heading = document.createElement('h2');
  heading.className = 'cae-config-heading';
  heading.textContent = 'Artifact Exporter — Config';

  const copyCheck = makeCheckbox('Show "Copy" button', settings.showCopy);
  const downloadCheck = makeCheckbox('Show "Download" button', settings.showDownload);
  const obsidianCheck = makeCheckbox('Show "Save to Obsidian" button', settings.showObsidian);

  const vaultField = makeField('Obsidian vault name', 'e.g. My Vault', settings.obsidianVault);
  const folderField = makeField('Folder path (blank = vault root)', 'e.g. Clippings', settings.obsidianFolder);

  const debugCheck = makeCheckbox('Enable debug capture (logs every API response)', settings.debug);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'cae-config-save';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    const next: Settings = {
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
  close.addEventListener('click', () => panel.remove());

  panel.append(
    heading,
    copyCheck.wrap,
    downloadCheck.wrap,
    obsidianCheck.wrap,
    vaultField.wrap,
    folderField.wrap,
    debugCheck.wrap,
    save,
    close,
  );
  document.body.appendChild(panel);
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
