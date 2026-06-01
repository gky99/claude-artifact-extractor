import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

// https://github.com/lisonge/vite-plugin-monkey
export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      server: {
        // In dev, the entry is loaded as a native ES module in the PAGE realm,
        // where `unsafeWindow` and the GM_* APIs don't exist — so the script
        // throws "unsafeWindow is not defined" before it can mount. mountGmApi
        // injects a shim that defines `unsafeWindow` and bridges the granted
        // GM_* APIs into that realm. No effect on the production build.
        mountGmApi: true,
      },
      userscript: {
        name: "Claude Artifact Extractor",
        namespace: "https://github.com/gky99/claude-artifact-extractor",
        description:
          "Export Claude research artifacts to Markdown with inline references preserved.",
        author: "gky99",
        match: ["https://claude.ai/*"],
        downloadURL:
          "https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js",
        updateURL:
          "https://github.com/gky99/claude-artifact-extractor/releases/latest/download/claude-artifact-extractor.user.js",
        // We capture page data by patching fetch, so run as early as possible
        // in the page context (not a sandbox) so window.fetch is the real one.
        "run-at": "document-start",
        grant: [
          "GM_registerMenuCommand",
          "GM_unregisterMenuCommand",
          "GM_setClipboard",
          "GM_addStyle",
          "GM_getValue",
          "GM_setValue",
          // The script patches the page's real fetch and reads page-realm APIs
          // via unsafeWindow; declare it so non-Tampermonkey managers expose it.
          "unsafeWindow",
        ],
      },
    }),
  ],
});
