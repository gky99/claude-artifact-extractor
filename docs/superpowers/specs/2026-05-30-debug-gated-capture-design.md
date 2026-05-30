# Debug-gated capture & dump

**Date:** 2026-05-30
**Status:** Approved

## Problem

The fetch interceptor captures *every* `/api/` response into an in-memory
`store` at all times. That broad capture is only needed for the diagnostic
"Dump captured responses (console)" command — yet it runs constantly, growing
memory on every conversation. The only response the export feature actually
needs is the conversation-load response (kept separately in
`latestConversation`).

We want a **Debug** toggle that, when off (the default), captures *only* the
conversation-load response, and when on, captures everything and exposes the
dump command — taking effect live, without a page reload.

## Goals

- Debug **off** (default): capture only the conversation-load response required
  for artifact export; never grow the broad `store`; the dump command is hidden.
- Debug **on**: capture every `/api/` response into `store`; the dump command is
  visible and works. Toggling appears/disappears the command immediately.
- Remove the redundant "Clear captured responses" menu command.
- Keep the existing dump logging format (URL in the collapsed group header +
  `c.json ?? c.text` body) — it already prints both URL and content.

## Non-goals

- Changing the dump output format.
- Live-updating the row-action UI (it already re-reads settings each time the
  popover opens; out of scope here).

## Design

### `settings.ts`
- Add `debug: boolean` to `Settings`, default `false`, with the same tolerant
  per-field merge as the other booleans in `getSettings()`.
- Add a minimal change notifier so modules can react to a save without a reload:
  - `subscribe(listener: () => void): void`.
  - `saveSettings()` invokes every registered listener after persisting.
    Listener invocation is best-effort: a throwing listener is swallowed and
    never breaks `saveSettings()` or other listeners.

### `fetch-interceptor.ts`
- Import `getSettings`. In `patchedFetch`, read `const debug =
  getSettings().debug` per call (consistent with the repo's "read settings
  fresh at use" convention — a toggle takes effect on the next fetch).
- Gate selection:
  `const relevant = debug ? CAPTURE_RE.test(url) : CONVERSATION_RE.test(url)`.
  Only when `relevant`, clone the response and call
  `captureResponse(clone, url, method, /* keep */ debug)`.
- `captureResponse` gains a `keep: boolean` parameter:
  - Push to `store` only when `keep` is true.
  - **Always** set `latestConversation` when the parsed body is a conversation.
  - Net effect: with debug off, only the single conversation response is read &
    parsed, and `store` never grows.
- Remove `clearCaptured` (unused once the Clear command is gone).

### `main.ts`
- Remove the "Clear captured responses" command.
- Add `syncDebugMenu()`:
  - When `getSettings().debug` is true and the dump command isn't registered,
    register it and remember the id returned by `GM_registerMenuCommand`.
  - When debug is false and the command is registered, unregister it via
    `GM_unregisterMenuCommand(id)` and clear the tracked id.
- Call `syncDebugMenu()` once at startup, and again from a
  `subscribe(syncDebugMenu)` listener so Config toggles update the menu live.

### `vite.config.ts`
- Add `'GM_unregisterMenuCommand'` to the `grant` array (grants are generated
  from here, never hand-written).

### `config.ts`
- Add an **"Enable debug capture (logs every API response)"** checkbox below the
  action checkboxes, wired into the save handler's `Settings` object.

## Testing

- Extend `test/settings.test.ts`:
  - `debug` defaults to `false`.
  - `debug` persists through `saveSettings` / `getSettings`.
  - missing/corrupt stored `debug` falls back to the default.
  - `subscribe` listeners fire on `saveSettings`; a throwing listener does not
    prevent persistence or other listeners.
- Interceptor gating and menu register/unregister remain **manual-verify**
  (build → install in Tampermonkey → toggle Debug, watch the store/menu),
  matching the repo's split between unit-tested pure modules and
  manually-verified capture/UI/persistence.

## Data flow (unchanged except gating)

`fetch` patch → (debug ? all `/api/` : conversation-only) → `captureResponse`
→ `store` (only when debug) + `latestConversation` (always) → export / dump.
