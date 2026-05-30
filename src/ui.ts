import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
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
      popover.appendChild(renderRow(artifact));
    });
  }

  document.body.appendChild(popover);
}

function renderRow(artifact: RawArtifactInput): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cae-row';

  const title = document.createElement('div');
  title.className = 'cae-row-title';
  title.textContent = artifact.title || '(untitled artifact)';

  const meta = document.createElement('div');
  meta.className = 'cae-row-meta';
  meta.textContent = `${artifact.md_citations?.length ?? 0} reference(s)`;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'cae-copy';
  copy.textContent = 'Copy Markdown';
  copy.addEventListener('click', () => {
    GM_setClipboard(renderArtifactMarkdown(artifact), 'text');
    copy.textContent = 'Copied!';
    setTimeout(() => {
      copy.textContent = 'Copy Markdown';
    }, 1500);
  });

  row.append(title, meta, copy);
  return row;
}
