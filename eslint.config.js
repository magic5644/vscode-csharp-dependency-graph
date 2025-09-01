const eslint = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  eslint.configs.recommended,
  
  // Apply to all TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      },
      globals: {
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // Override some strict rules for practical use
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow' // Allow leading underscore for unused parameters
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow'
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow'
        },
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'allow'
        },
        {
          selector: 'typeLike',
          format: ['PascalCase']
        },
        {
          selector: 'interface',
          format: ['PascalCase']
          // Removed the I prefix requirement
        },
        {
          selector: 'enumMember',
          format: ['PascalCase']
        },
        {
          selector: 'objectLiteralProperty',
          format: null // Allow any format for object literal properties
        },
        {
          selector: 'typeProperty',
          format: null // Allow any format for type properties (for XML interfaces)
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'curly': 'warn', // Changed from 'error' to 'warn'
      'eqeqeq': 'error',
      'no-throw-literal': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'semi': 'off'
    }
  },

  // Configuration for test files
  {
    files: ['src/test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      },
      globals: {
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        // Mocha globals
        suite: 'readonly',
        test: 'readonly',
        setup: 'readonly',
        teardown: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // Same rules as TypeScript files but more relaxed for tests
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/naming-convention': 'off', // More relaxed for tests
      'curly': 'off' // Allow single-line if statements in tests
    }
  },

  // Configuration for webview TypeScript files
  {
    files: ['src/webview/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json'
      },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        acquireVsCodeApi: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MessageEvent: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        WebviewMessage: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'curly': 'off',
      'no-undef': 'error'
    }
  },

  // Configuration for webview JavaScript files
  {
    files: ['src/webviewScripts/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module', // Changed from 'script' to support import/export
      globals: {
        d3: 'readonly',
        acquireVsCodeApi: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        XMLSerializer: 'readonly'
      }
    },
    rules: {
      'no-inner-declarations': 'off',
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }]
    }
  },

  // Configuration for other JavaScript files (config files, etc.)
  {
    files: ['*.js'],
    ignores: ['src/webviewScripts/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    }
  },

  // Global ignores
  {
    ignores: [
      'out/**',
      'dist/**',
      '**/*.d.ts',
      'node_modules/**',
      'examples/**',
      'assets/**',
      '.eslintrc.js',
      'eslint.config.js'
    ]
  }
];
