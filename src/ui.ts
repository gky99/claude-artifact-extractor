import { getLatestConversation } from './fetch-interceptor';
import { extractArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import type { ArtifactDoc } from './types';

const BTN_ID = 'cae-export-button';
const POPOVER_ID = 'cae-export-popover';

/** Mounts the floating export button once the DOM is ready. */
export function mountUI(): void {
  if (document.getElementById(BTN_ID)) return;

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.textContent = '⬇ Artifacts';
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#2d2d2d',
    color: '#fff',
    font: '13px system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  } satisfies Partial<CSSStyleDeclaration>);

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
  const artifacts = conversation ? extractArtifacts(conversation) : [];

  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  Object.assign(popover.style, {
    position: 'fixed',
    bottom: '60px',
    right: '20px',
    zIndex: '2147483647',
    width: '320px',
    maxHeight: '50vh',
    overflowY: 'auto',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.2)',
    background: '#1e1e1e',
    color: '#eee',
    font: '13px system-ui, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  } satisfies Partial<CSSStyleDeclaration>);

  if (artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = conversation
      ? 'No artifacts found in this conversation.'
      : 'No conversation captured yet. Open a research conversation, then reopen this.';
    popover.appendChild(empty);
  } else {
    artifacts.forEach((artifact, index) => {
      popover.appendChild(renderRow(artifact, index));
    });
  }

  document.body.appendChild(popover);
}

function renderRow(artifact: ArtifactDoc, index: number): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 0',
    borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.textContent = artifact.title || '(untitled artifact)';
  title.style.fontWeight = '600';

  const meta = document.createElement('div');
  meta.textContent = `${artifact.citations.length} reference(s)`;
  meta.style.opacity = '0.7';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy Markdown';
  Object.assign(copy.style, {
    alignSelf: 'flex-start',
    marginTop: '2px',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: '#3a3a3a',
    color: '#fff',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
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
