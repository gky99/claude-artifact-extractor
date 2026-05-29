import type { CapturedResponse } from './types';

/**
 * Monkey-patches the page's fetch to capture API responses non-destructively.
 *
 * Why unsafeWindow: we need to replace the *page's* fetch (the one Claude's app
 * calls), not the sandboxed userscript copy. Tampermonkey exposes the real page
 * window as `unsafeWindow`. Responses are cloned before reading so the app's own
 * consumer is never disturbed.
 */

const START = performance.now();
const store: CapturedResponse[] = [];
let nextId = 1;

/** URL substrings we care about. Broad on purpose during discovery. */
const CAPTURE_PATTERNS = ['/api/'];

function shouldCapture(url: string): boolean {
  return CAPTURE_PATTERNS.some((p) => url.includes(p));
}

export function getCaptured(): readonly CapturedResponse[] {
  return store;
}

export function clearCaptured(): void {
  store.length = 0;
}

export function installFetchInterceptor(): void {
  const target = unsafeWindow as Window & typeof globalThis;
  const original = target.fetch;

  target.fetch = async function patchedFetch(
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const response = await original.apply(this, args);

    try {
      const req = args[0];
      const url =
        typeof req === 'string'
          ? req
          : req instanceof URL
            ? req.href
            : req instanceof Request
              ? req.url
              : String(req);

      if (shouldCapture(url)) {
        const method =
          (typeof req === 'object' && req instanceof Request
            ? req.method
            : (args[1]?.method ?? 'GET')) || 'GET';

        // Clone so we never consume the body the app is about to read.
        captureResponse(response.clone(), url, method).catch(() => {
          /* swallow: capture must never break the page */
        });
      }
    } catch {
      /* never let interception throw into the app */
    }

    return response;
  } as typeof fetch;
}

async function captureResponse(
  response: Response,
  url: string,
  method: string,
): Promise<void> {
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (e.g. SSE stream chunks) — keep raw text only */
  }

  store.push({
    id: nextId++,
    url,
    method,
    status: response.status,
    json,
    text,
    at: performance.now() - START,
  });
}
