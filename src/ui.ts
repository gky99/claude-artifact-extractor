import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import { getSettings, type Settings } from './settings';
import { copyArtifact, downloadArtifact, saveToObsidian } from './exporters';
import type { RawArtifactInput } from './types';

const BTN_ID = 'cae-export-button';
const POPOVER_ID = 'cae-export-popover';

/** Mounts the floating export button once the DOM is ready. */
export function mountUI(): void {
  if (document.getElementById(BTN_ID)) return;

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.className = 'cae-button';
  button.textContent = '⬇ Artifacts';
  button.addEventListener('click', togglePopover);
  document.body.appendChild(button);
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
