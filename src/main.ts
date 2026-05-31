import { getCaptured, installFetchInterceptor } from './fetch-interceptor';
import { mountUI, renderButtonStack } from './artifact-popover';
import { openSettingsPanel } from './settings-panel';
import { getSettings, subscribe } from './settings';
import { applyTheme } from './theme';
import themeCss from './theme.css?inline';
import popoverCss from './artifact-popover.css?inline';
import panelCss from './settings-panel.css?inline';

// Install the interceptor IMMEDIATELY (run-at: document-start) so we catch the
// app's API calls from the very first request.
installFetchInterceptor();
// Inject tokens first so component styles can reference the variables.
GM_addStyle(themeCss);
GM_addStyle(popoverCss);
GM_addStyle(panelCss);

// Reflect the saved theme onto <html> before the UI mounts.
applyTheme(getSettings().theme);

// Mount the floating UI once the DOM body exists.
if (document.body) {
  mountUI();
} else {
  document.addEventListener('DOMContentLoaded', mountUI, { once: true });
}

// --- Discovery helper (kept for debugging schema drift) --------------------

function dumpCaptured(): void {
  const captured = getCaptured();
  console.info(`[artifact-extractor] ${captured.length} captured response(s):`);
  for (const c of captured) {
    console.groupCollapsed(`#${c.id} ${c.method} ${c.status} ${c.url}`);
    console.log(c.json ?? c.text);
    console.groupEnd();
  }
  (unsafeWindow as unknown as Record<string, unknown>).__claudeCaptured = captured;
  console.info('[artifact-extractor] Also available as window.__claudeCaptured');
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

// Live-apply appearance changes: theme to <html>, and rebuild the button stack
// (e.g. when the gear is toggled or the position is persisted).
subscribe(() => {
  applyTheme(getSettings().theme);
  renderButtonStack();
});

GM_registerMenuCommand('Config…', openSettingsPanel);
