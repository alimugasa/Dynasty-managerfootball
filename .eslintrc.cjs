module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  // legacy/ is frozen reference material and is never linted or reformatted.
  ignorePatterns: ['dist', 'node_modules', 'legacy', '*.config.js'],
  rules: {
    'no-console': ['error', { allow: ['error', 'warn'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      // Command-line tooling reports to the terminal; that is its output, not a
      // stray debug statement.
      files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
      rules: { 'no-console': 'off' },
    },
  ],
};
