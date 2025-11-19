#!/usr/bin/env node
 

import { MarkdownSecurityChecker } from './markdownSecurityChecker.js';

// Main execution logic with top-level await
const workspaceFolder = process.argv[2] || process.cwd();

console.log(`Checking Markdown files in ${workspaceFolder} for malicious characters...`);

// Check workspace for malicious characters
const results = await MarkdownSecurityChecker.checkWorkspace(workspaceFolder);

// Generate and print report
const report = MarkdownSecurityChecker.generateReport(results);
console.log(report);

// Exit with error code if malicious characters were found (for CI/CD integration)
if (results.length > 0) {
    console.error('❌ Malicious characters detected in Markdown files. Exiting with error code 1.');
    process.exit(1);
} else {
    console.log('✅ No malicious characters detected in Markdown files.');
    process.exit(0);
}
