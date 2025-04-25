module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'commonjs',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }]
  },
  ignorePatterns: ['out', 'dist', '**/*.d.ts', 'node_modules', '.eslintrc.js'],
  
  // Add overrides for webview JavaScript files
  overrides: [
    {
      files: ['src/webviewScripts/*.js'],
      env: {
        browser: true,
        es6: true
      },
      rules: {
        'no-inner-declarations': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', {
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_'
        }],
        'no-undef': 'error'
      },
      globals: {
        'd3': 'readonly',
        'acquireVsCodeApi': 'readonly'
      }
    },
    {
      // Apply to all JavaScript files, including config files
      files: ['*.js'],
      // Exclude JavaScript files in the browser context which we already configured
      excludedFiles: ['src/webviewScripts/*.js'],
      // Don't use the TypeScript parser for regular JS files
      parser: 'espree',
      env: {
        node: true,
        es6: true
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'commonjs'
      }
    }
  ]
};
