import type { CapturedResponse, RawConversation } from './types';
import { getSettings } from './settings';

/**
 * Monkey-patches the page's fetch to capture API responses non-destructively.
 *
 * Why unsafeWindow: we must replace the *page's* fetch (the one Claude's app
 * calls), not the sandboxed userscript copy. Responses are cloned before reading
 * so the app's own consumer is never disturbed; all capture work is wrapped so a
 * failure can never break the page.
 */

const START = performance.now();
const store: CapturedResponse[] = [];
let nextId = 1;

/** The most recent successfully-parsed conversation-load response. */
let latestConversation: RawConversation | null = null;

/** Matches the conversation-load endpoint we extract artifacts from. */
const CONVERSATION_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/[^/?]+/;

/** Broad net for the debug dump (any API call). */
const CAPTURE_RE = /\/api\//;

export function getCaptured(): readonly CapturedResponse[] {
  return store;
}

/** The latest conversation we have parsed from captured traffic, if any. */
export function getLatestConversation(): RawConversation | null {
  return latestConversation;
}

export function installFetchInterceptor(): void {
  const target = unsafeWindow as Window & typeof globalThis;
  const original = target.fetch;

  target.fetch = async function patchedFetch(
    this: unknown,
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const response = await original.apply(this, args);
    try {
      const url = urlOf(args[0]);
      // Debug off (default): only the conversation-load response export needs.
      // Debug on: every /api/ response, kept in the store for the dump command.
      // Read settings fresh per call so a toggle takes effect without reload.
      const debug = getSettings().debug;
      const relevant = debug ? CAPTURE_RE.test(url) : CONVERSATION_RE.test(url);
      if (relevant) {
        // Clone so we never consume the body the app is about to read.
        captureResponse(response.clone(), url, methodOf(args), debug).catch(() => {
          /* swallow: capture must never break the page */
        });
      }
    } catch {
      /* never let interception throw into the app */
    }
    return response;
  } as typeof fetch;
}

function urlOf(req: Parameters<typeof fetch>[0]): string {
  if (typeof req === 'string') return req;
  if (req instanceof URL) return req.href;
  if (req instanceof Request) return req.url;
  return String(req);
}

function methodOf(args: Parameters<typeof fetch>): string {
  const req = args[0];
  if (req instanceof Request) return req.method;
  return args[1]?.method ?? 'GET';
}

/**
 * Reads the cloned response and records it. `keep` controls whether it goes
 * into the debug `store` (only when debug capture is on); the conversation we
 * need for export is always tracked in `latestConversation`, regardless.
 */
async function captureResponse(
  response: Response,
  url: string,
  method: string,
  keep: boolean,
): Promise<void> {
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (e.g. SSE) — keep raw text only */
  }

  if (keep) {
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

  if (json && CONVERSATION_RE.test(url) && isConversation(json)) {
    latestConversation = json;
  }
}

function isConversation(json: unknown): json is RawConversation {
  return (
    typeof json === 'object' &&
    json !== null &&
    Array.isArray((json as { chat_messages?: unknown }).chat_messages)
  );
}
