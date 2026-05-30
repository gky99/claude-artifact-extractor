import { getCaptured, installFetchInterceptor } from './fetch-interceptor';
import { mountUI } from './ui';
import { openConfigPanel } from './config';
import { getSettings, subscribe } from './settings';
import css from './ui.css?inline';

// Install the interceptor IMMEDIATELY (run-at: document-start) so we catch the
// app's API calls from the very first request.
installFetchInterceptor();
// Inject all UI styles once (cae-prefixed; safe to add at document-start).
GM_addStyle(css);

// Mount the floating UI once the DOM body exists.
if (document.body) {
  mountUI();
} else {
  document.addEventListener('DOMContentLoaded', mountUI, { once: true });
}

// --- Discovery helper (kept for debugging schema drift) --------------------

function dumpCaptured(): void {
  const captured = getCaptured();
  console.info(`[artifact-exporter] ${captured.length} captured response(s):`);
  for (const c of captured) {
    console.groupCollapsed(`#${c.id} ${c.method} ${c.status} ${c.url}`);
    console.log(c.json ?? c.text);
    console.groupEnd();
  }
  (unsafeWindow as unknown as Record<string, unknown>).__claudeCaptured = captured;
  console.info('[artifact-exporter] Also available as window.__claudeCaptured');
}

// The dump command only exists while debug capture is on (there's nothing to
// dump otherwise). Register/unregister it live as the Config toggle changes.
let dumpMenuId: number | undefined;
function syncDebugMenu(): void {
  const debug = getSettings().debug;
  if (debug && dumpMenuId === undefined) {
    dumpMenuId = GM_registerMenuCommand('Dump captured responses (console)', dumpCaptured);
  } else if (!debug && dumpMenuId !== undefined) {
    GM_unregisterMenuCommand(dumpMenuId);
    dumpMenuId = undefined;
  }
}

syncDebugMenu();
subscribe(syncDebugMenu);

GM_registerMenuCommand('Config…', openConfigPanel);
