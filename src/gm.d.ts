/**
 * Ambient declarations for the legacy Greasemonkey/Tampermonkey globals we use.
 *
 * `@types/greasemonkey` provides the modern `GM.*` namespace and `unsafeWindow`,
 * but not the legacy underscore globals the userscript host injects when the
 * matching `@grant` is present. We declare only the two we call.
 */

declare function GM_registerMenuCommand(
  name: string,
  fn: () => void,
  accessKey?: string,
): number;

declare function GM_unregisterMenuCommand(menuCmdId: number): void;

declare function GM_setClipboard(
  data: string,
  type?: 'text' | 'html' | { type?: string; mimetype?: string },
): void;

declare function GM_addStyle(css: string): HTMLStyleElement;

declare function GM_getValue<T = unknown>(name: string, defaultValue?: T): T;

declare function GM_setValue(name: string, value: unknown): void;
