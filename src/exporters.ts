import type { Settings } from './settings';

/** Minimal typing for the File System Access "save file" picker, which is not
 *  in lib.dom's Window type. Present on Chromium; absent elsewhere. */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

/** Turns an artifact title into a safe bare filename (no extension).
 *  Strips \ / : * ? " < > | and control chars (excluding tab \x09, LF \x0a, CR \x0d
 *  so they survive to the \s+ collapse step), collapses whitespace, trims;
 *  falls back to "Untitled artifact" when nothing usable remains. */
export function toFileName(title: string | undefined): string {
  const cleaned = (title ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Untitled artifact';
}

/** Builds an `obsidian://new` URI that pulls the note body from the clipboard.
 *  folder '' targets the vault root; leading/trailing slashes are stripped. */
export function buildObsidianUri(opts: { vault: string; folder: string; title: string }): string {
  const filename = toFileName(opts.title);
  const folder = opts.folder.replace(/^\/+|\/+$/g, '');
  const filePath = folder ? `${folder}/${filename}` : filename;
  const enc = encodeURIComponent;
  return `obsidian://new?vault=${enc(opts.vault)}&file=${enc(filePath)}&clipboard=true`;
}

/** Copies the rendered Markdown to the clipboard. */
export function copyArtifact(markdown: string): void {
  GM_setClipboard(markdown, 'text');
}

/** Opens the native Save As picker and writes the Markdown. Falls back to an
 *  anchor+Blob download where the picker is unavailable. User cancel is silent.
 *  Note: non-cancel errors are re-thrown; the UI caller is responsible for
 *  surfacing them. */
export async function downloadArtifact(markdown: string, title: string | undefined): Promise<void> {
  const name = `${toFileName(title)}.md`;
  const picker = unsafeWindow as unknown as SaveFilePickerWindow;
  if (picker.showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      // Call as a method on the window so `this` stays bound (a detached call
      // throws "Illegal invocation" on Chromium).
      handle = await picker.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // user cancelled
      throw err;
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(markdown);
    } finally {
      await writable.close();
    }
    return;
  }
  // Fallback: classic anchor download (no picker).
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer the revoke so the click-initiated download can grab the blob first;
  // a synchronous revoke can abort the download in some non-Chromium engines
  // (this fallback path only runs where showSaveFilePicker is unavailable).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Copies the body to the clipboard and fires `obsidian://new` so Obsidian
 *  writes the note. Returns false (and does nothing) when the vault is unset.
 *  No post-fire error handling: an unregistered protocol fails silently. */
export function saveToObsidian(markdown: string, title: string | undefined, s: Settings): boolean {
  if (!s.obsidianVault.trim()) return false;
  GM_setClipboard(markdown, 'text');
  fireUri(buildObsidianUri({ vault: s.obsidianVault, folder: s.obsidianFolder, title: title ?? '' }));
  return true;
}

/** Fires a custom-protocol URL via a transient hidden iframe so the host tab
 *  never navigates and an unregistered scheme fails quietly. */
function fireUri(uri: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = uri;
  document.body.appendChild(iframe);
  // keep the iframe alive briefly so the OS protocol handler can read src
  setTimeout(() => iframe.remove(), 1000);
}
