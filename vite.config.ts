import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

// https://github.com/lisonge/vite-plugin-monkey
export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'Claude Artifact Exporter',
        namespace: 'https://github.com/your-name/claude-artifact-exporter',
        description:
          'Export Claude research artifacts to Markdown with inline references preserved.',
        author: 'you',
        match: ['https://claude.ai/*'],
        // We capture page data by patching fetch, so run as early as possible
        // in the page context (not a sandbox) so window.fetch is the real one.
        'run-at': 'document-start',
        grant: [
          'GM_registerMenuCommand',
          'GM_unregisterMenuCommand',
          'GM_setClipboard',
          'GM_addStyle',
          'GM_getValue',
          'GM_setValue',
        ],
      },
    }),
  ],
});
