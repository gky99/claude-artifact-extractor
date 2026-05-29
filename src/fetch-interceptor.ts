import type { CapturedResponse, RawConversation } from './types';

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

export function clearCaptured(): void {
  store.length = 0;
}

/** The latest conversation we have parsed from captured traffic, if any. */
export function getLatestConversation(): RawConversation | null {
  return latestConversation;
}

export function installFetchInterceptor(): void {
  const target = unsafeWindow as Window & typeof globalThis;
  const original = target.fetch;

  target.fetch = async function patchedFetch(
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    const response = await original.apply(this, args);
    try {
      const url = urlOf(args[0]);
      if (CAPTURE_RE.test(url)) {
        // Clone so we never consume the body the app is about to read.
        captureResponse(response.clone(), url, methodOf(args)).catch(() => {
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
    /* non-JSON (e.g. SSE) — keep raw text only */
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
