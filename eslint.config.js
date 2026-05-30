import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        // Greasemonkey/Tampermonkey APIs provided at runtime by the userscript host.
        GM_registerMenuCommand: 'readonly',
        GM_download: 'readonly',
        GM_setClipboard: 'readonly',
        unsafeWindow: 'readonly',
        GM_addStyle: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
      },
    },
  },
);
