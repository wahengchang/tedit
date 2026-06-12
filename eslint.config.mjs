// D01 依賴鐵律:core 不准 import cli/web;cli 與 web 互不 import。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'spike/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // e2e 腳本含 page.evaluate 回呼(瀏覽器端執行)
    files: ['e2e/**/*.mjs', 'e2eCli/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/cli/**', '**/web/**'], message: 'core 不准依賴 cli/web(D01)' }] },
      ],
    },
  },
  {
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/web/**'], message: 'cli 不准依賴 web(D01)' }] },
      ],
    },
  },
  {
    files: ['src/web/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/cli/**'], message: 'web 不准依賴 cli(D01)' }] },
      ],
    },
  },
);
