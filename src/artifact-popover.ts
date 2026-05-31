import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import { getSettings, saveSettings, type Settings } from './settings';
import { copyArtifact, downloadArtifact, saveToObsidian } from './exporters';
import type { RawArtifactInput } from './types';
import { clampToViewport, makeDraggable } from './draggable';
import { openSettingsPanel } from './settings-panel';

const BTN_ID = 'cae-export-button';
const POPOVER_ID = 'cae-export-popover';
const STACK_ID = 'cae-button-stack';
const GEAR_ID = 'cae-settings-button';

/** Mounts the floating button stack once the DOM is ready. */
export function mountUI(): void {
  renderButtonStack();
}

/** (Re)builds the button stack from current settings. Removes any existing
 *  stack and open popover first, so it is safe to call on every settings change. */
export function renderButtonStack(): void {
  document.getElementById(STACK_ID)?.remove();
  document.getElementById(POPOVER_ID)?.remove();

  const settings = getSettings();

  const stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.className = 'cae-button-stack';

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.className = 'cae-button';
  button.textContent = '⬇ Artifacts';
  button.addEventListener('click', togglePopover);
  stack.appendChild(button);

  if (settings.showSettingsButton) {
    const gear = document.createElement('button');
    gear.id = GEAR_ID;
    gear.type = 'button';
    gear.className = 'cae-gear';
    gear.textContent = '⚙';
    gear.title = 'Settings';
    gear.addEventListener('click', openSettingsPanel);
    stack.appendChild(gear);
  }

  document.body.appendChild(stack);
  applyStoredPosition(stack);

  makeDraggable(stack, {
    onDrop: (pos) => {
      const rect = stack.getBoundingClientRect();
      const clamped = clampToViewport(
        pos,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      stack.style.left = `${clamped.x}px`;
      stack.style.top = `${clamped.y}px`;
      saveSettings({ ...getSettings(), buttonPos: clamped });
    },
  });
}

/** Applies the persisted position (clamped), or leaves the default corner. */
function applyStoredPosition(stack: HTMLElement): void {
  const pos = getSettings().buttonPos;
  if (!pos) return;
  const rect = stack.getBoundingClientRect();
  const clamped = clampToViewport(
    pos,
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  stack.style.left = `${clamped.x}px`;
  stack.style.top = `${clamped.y}px`;
  stack.style.right = 'auto';
  stack.style.bottom = 'auto';
}

function togglePopover(): void {
  const existing = document.getElementById(POPOVER_ID);
  if (existing) {
    existing.remove();
    return;
  }
  renderPopover();
}

function renderPopover(): void {
  const conversation = getLatestConversation();
  const artifacts = findArtifacts(conversation);
  const settings = getSettings();

  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  popover.className = 'cae-popover';

  if (artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = conversation
      ? 'No artifacts found in this conversation.'
      : 'No conversation captured yet. Open a research conversation, then reopen this.';
    popover.appendChild(empty);
  } else {
    artifacts.forEach((artifact) => {
      popover.appendChild(renderRow(artifact, settings));
    });
  }

  document.body.appendChild(popover);

  const stack = document.getElementById(STACK_ID);
  if (stack) {
    const rect = stack.getBoundingClientRect();
    popover.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
    popover.style.bottom = `${Math.max(0, window.innerHeight - rect.top + 8)}px`;
  } else {
    popover.style.right = '20px';
    popover.style.bottom = '60px';
  }
}

/** Briefly swaps a button's label, then restores it. */
function flash(btn: HTMLButtonElement, msg: string, revert: string): void {
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = revert;
  }, 1500);
}

function renderRow(artifact: RawArtifactInput, settings: Settings): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cae-row';

  const title = document.createElement('div');
  title.className = 'cae-row-title';
  title.textContent = artifact.title || '(untitled artifact)';

  const meta = document.createElement('div');
  meta.className = 'cae-row-meta';
  meta.textContent = `${artifact.md_citations?.length ?? 0} reference(s)`;

  row.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'cae-row-actions';

  if (settings.showCopy) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'cae-copy';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      copyArtifact(renderArtifactMarkdown(artifact));
      flash(copy, 'Copied!', 'Copy');
    });
    actions.appendChild(copy);
  }

  if (settings.showDownload) {
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'cae-download';
    download.textContent = 'Download';
    download.addEventListener('click', () => {
      downloadArtifact(renderArtifactMarkdown(artifact), artifact.title).catch(() => {
        flash(download, 'Download failed', 'Download');
      });
    });
    actions.appendChild(download);
  }

  if (settings.showObsidian) {
    const obsidian = document.createElement('button');
    obsidian.type = 'button';
    obsidian.className = 'cae-obsidian';
    obsidian.textContent = 'Save to Obsidian';
    obsidian.addEventListener('click', () => {
      const ok = saveToObsidian(renderArtifactMarkdown(artifact), artifact.title, settings);
      flash(obsidian, ok ? 'Sent to Obsidian ✓' : 'Set vault in Config…', 'Save to Obsidian');
    });
    actions.appendChild(obsidian);
  }

  if (actions.childElementCount > 0) row.appendChild(actions);
  return row;
}
