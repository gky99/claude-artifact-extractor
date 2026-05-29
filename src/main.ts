import { getCaptured, clearCaptured, installFetchInterceptor } from './fetch-interceptor';
import { extractArtifact } from './extractor';
import { renderMarkdown } from './markdown';

// Install the interceptor IMMEDIATELY (run-at: document-start) so we catch
// the app's API calls from the very first request.
installFetchInterceptor();

GM_registerMenuCommand('Export artifact → Markdown (download)', () => {
  withMarkdown((md) => {
    GM_download({
      url: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })),
      name: 'claude-artifact.md',
    });
  });
});

GM_registerMenuCommand('Export artifact → Markdown (copy)', () => {
  withMarkdown((md) => {
    GM_setClipboard(md, 'text');
    console.info('[artifact-exporter] Markdown copied to clipboard.');
  });
});

// --- Discovery helpers (remove once the extractor is implemented) -----------

GM_registerMenuCommand('Dump captured responses (console)', () => {
  const captured = getCaptured();
  console.info(`[artifact-exporter] ${captured.length} captured response(s):`);
  for (const c of captured) {
    console.groupCollapsed(`#${c.id} ${c.method} ${c.status} ${c.url}`);
    console.log(c.json ?? c.text);
    console.groupEnd();
  }
  // Also park them on the page for interactive poking in DevTools.
  (unsafeWindow as unknown as Record<string, unknown>).__claudeCaptured = captured;
  console.info('[artifact-exporter] Also available as window.__claudeCaptured');
});

GM_registerMenuCommand('Clear captured responses', () => {
  clearCaptured();
  console.info('[artifact-exporter] Capture store cleared.');
});

function withMarkdown(use: (md: string) => void): void {
  try {
    const artifact = extractArtifact(getCaptured());
    use(renderMarkdown(artifact));
  } catch (err) {
    console.error('[artifact-exporter] Export failed:', err);
    alert(`Artifact export failed:\n${(err as Error).message}`);
  }
}
