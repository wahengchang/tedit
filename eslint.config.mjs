// D01 依賴鐵律:core 不准 import cli/web;cli 與 web 互不 import。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'spike/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
