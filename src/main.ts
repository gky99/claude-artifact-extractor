import { getCaptured, clearCaptured, installFetchInterceptor } from './fetch-interceptor';
import { mountUI } from './ui';
import { openConfigPanel } from './config';
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

GM_registerMenuCommand('Dump captured responses (console)', () => {
  const captured = getCaptured();
  console.info(`[artifact-exporter] ${captured.length} captured response(s):`);
  for (const c of captured) {
    console.groupCollapsed(`#${c.id} ${c.method} ${c.status} ${c.url}`);
    console.log(c.json ?? c.text);
    console.groupEnd();
  }
  (unsafeWindow as unknown as Record<string, unknown>).__claudeCaptured = captured;
  console.info('[artifact-exporter] Also available as window.__claudeCaptured');
});

GM_registerMenuCommand('Clear captured responses', () => {
  clearCaptured();
  console.info('[artifact-exporter] Capture store cleared.');
});

GM_registerMenuCommand('Config…', openConfigPanel);
