import { getLatestConversation } from './fetch-interceptor';
import { findArtifacts } from './conversation';
import { renderArtifactMarkdown } from './markdown';
import { getSettings, saveSettings, type Settings, type ButtonPos, type Corner } from './settings';
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
  // Keep the stack on-screen when the viewport changes. Registered once (not in
  // renderButtonStack, which rebuilds on every settings change); it looks the
  // stack up by id so it survives rebuilds.
  window.addEventListener('resize', clampStackToViewport);
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
    onDrop: () => {
      const pos = nearestCornerPos(stack.getBoundingClientRect());
      placeStack(stack, pos);
      saveSettings({ ...getSettings(), buttonPos: pos });
    },
  });
}

/** Picks the viewport corner the stack's center is nearest, and the inward
 *  offset (px) from that corner's edges to the stack's near edges. */
function nearestCornerPos(rect: DOMRect): ButtonPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = rect.left + rect.width / 2 > vw / 2;
  const bottom = rect.top + rect.height / 2 > vh / 2;
  const corner = `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as Corner;
  return {
    corner,
    dx: Math.max(0, right ? vw - rect.right : rect.left),
    dy: Math.max(0, bottom ? vh - rect.bottom : rect.top),
  };
}

/** Anchors the stack to its stored corner, clamping the offset so it stays
 *  fully on-screen. Using corner anchors (right/bottom vs left/top) lets the
 *  browser preserve the relative position across resizes for free. */
function placeStack(stack: HTMLElement, pos: ButtonPos): void {
  const rect = stack.getBoundingClientRect();
  // dx/dy are inward distances, so clamping them to [0, viewport - size] is the
  // same 1-D clamp clampToViewport already applies to a top-left point.
  const { x: dx, y: dy } = clampToViewport(
    { x: pos.dx, y: pos.dy },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  const right = pos.corner === 'tr' || pos.corner === 'br';
  const bottom = pos.corner === 'bl' || pos.corner === 'br';
  stack.style.left = right ? 'auto' : `${dx}px`;
  stack.style.right = right ? `${dx}px` : 'auto';
  stack.style.top = bottom ? 'auto' : `${dy}px`;
  stack.style.bottom = bottom ? `${dy}px` : 'auto';
}

/** Applies the persisted corner position, or leaves the CSS default corner. */
function applyStoredPosition(stack: HTMLElement): void {
  const pos = getSettings().buttonPos;
  if (pos) placeStack(stack, pos);
}

/** Re-clamps the stack into the current viewport on resize (display only — the
 *  stored corner offset is the user's intent and is left untouched, so the
 *  stack rubber-bands back out when the window grows again). */
function clampStackToViewport(): void {
  const stack = document.getElementById(STACK_ID);
  const pos = getSettings().buttonPos;
  if (stack && pos) placeStack(stack, pos);
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
