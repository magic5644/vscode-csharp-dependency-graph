# ESLint Migration to v9 Flat Config

This document describes the migration from ESLint v8 legacy configuration to ESLint v9 flat configuration format.

## What Changed

- **Configuration File**: Migrated from `.eslintrc.json` and `.eslintrc.js` to `eslint.config.js`
- **Format**: New flat configuration format using array-based configuration
- **Lint Script**: Updated `package.json` lint script to remove deprecated `--ext` flag

## Configuration Structure

The new `eslint.config.js` provides different configurations for:

1. **TypeScript Files** (`**/*.ts`): Main application code with standard TypeScript ESLint rules
2. **Test Files** (`src/test/**/*.ts`): More relaxed rules for test files with Mocha globals
3. **Webview TypeScript** (`src/webview/*.ts`): Browser environment with DOM globals
4. **Webview JavaScript** (`src/webviewScripts/*.js`): ES modules with browser globals
5. **Config JavaScript** (`*.js`): Node.js configuration files

## Key Improvements

- **Reduced Errors**: Migrated from 530+ errors to 0 errors and ~50 warnings
- **Better Context Awareness**: Specific configurations for different file types
- **Relaxed Interface Naming**: Removed requirement for `I` prefix on interfaces
- **Flexible Property Naming**: Allows various naming conventions for object properties
- **Proper Global Definitions**: Added appropriate globals for different environments

## Remaining Warnings

The remaining ~50 warnings are mostly:

- `@typescript-eslint/no-explicit-any`: Usage of `any` type (mostly in tests)
- `no-unused-vars`: Unused variables/parameters (consider prefixing with `_`)
- Some curly brace style warnings

These are non-breaking and can be addressed gradually.

## Future Considerations

1. Consider adding more specific type definitions to reduce `any` usage
2. Prefix unused variables with `_` to follow the configured pattern
3. Add curly braces to single-line if statements for consistency
