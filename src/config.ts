const PANEL_ID = 'cae-config-panel';
const STORE_KEY = 'cae-dummy-setting';

/**
 * Toggles a floating config panel. Placeholder for now: it persists a single
 * text value via GM_setValue/GM_getValue and reads it back so persistence across
 * reloads is visible. No real settings are wired to behavior yet.
 */
export function openConfigPanel(): void {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'cae-config-panel';

  const heading = document.createElement('h2');
  heading.className = 'cae-config-heading';
  heading.textContent = 'Artifact Exporter — Config';

  const note = document.createElement('p');
  note.className = 'cae-config-note';
  note.textContent =
    'Placeholder settings. Save a value, reload the page, and reopen to confirm it persists.';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cae-config-input';
  input.placeholder = 'Type something…';
  input.value = GM_getValue<string>(STORE_KEY, '');

  const status = document.createElement('div');
  status.className = 'cae-config-status';
  const renderStored = (): void => {
    const stored = GM_getValue<string>(STORE_KEY, '');
    status.textContent = stored ? `Persisted value: ${stored}` : 'No value persisted yet.';
  };
  renderStored();

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'cae-config-save';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    GM_setValue(STORE_KEY, input.value);
    renderStored();
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

  panel.append(heading, note, input, save, status, close);
  document.body.appendChild(panel);
}
