import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MarkdownSecurityChecker } from '../../../scripts/markdownSecurityChecker';

suite('Markdown Security Checker Test Suite', () => {
	
    let tempDir: string;
    
    setup(async () => {
        // Create a temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-security-test-'));
    });
    
    teardown(() => {
        // Clean up temporary directory
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
    
    test('Should detect zero-width space character', async () => {
        // Create a test file with zero-width space
        const testFilePath = path.join(tempDir, 'test-zwsp.md');
        const content = `# Test File\n\nThis is a test file with a zero-width space\u200Bhere.`;
        fs.writeFileSync(testFilePath, content);
        
        const result = await MarkdownSecurityChecker.checkFile(testFilePath);
        
        // Find the zero-width space character in findings
        const zwspFindings = result.findings.filter(f => f.charInfo.name === 'Zero-width space');
        assert.strictEqual(zwspFindings.length, 1, 'Should find one zero-width space character');
        assert.strictEqual(zwspFindings[0].charInfo.name, 'Zero-width space', 'Should detect zero-width space');
    });
    
    test('Should detect right-to-left override character', async () => {
        // Create a test file with RTL override character (potentially used for spoofing)
        const testFilePath = path.join(tempDir, 'test-rtlo.md');
        const content = `# Test File\n\nThis filename could be spoofed: important\u202Etxt.exe`;
        fs.writeFileSync(testFilePath, content);
        
        const result = await MarkdownSecurityChecker.checkFile(testFilePath);
        
        // Find the RTL override character in findings
        const rtlFindings = result.findings.filter(f => f.charInfo.name === 'RTL Override');
        assert.strictEqual(rtlFindings.length, 1, 'Should find one RTL override character');
        assert.strictEqual(rtlFindings[0].charInfo.name, 'RTL Override', 'Should detect RTL override character');
    });
    
    test('Should detect multiple malicious characters', async () => {
        // Create a test file with multiple malicious characters
        const testFilePath = path.join(tempDir, 'test-multiple.md');
        const content = `# Test File\n\nThis has a zero-width joiner\u200Dhere and RTL embedding\u202Bthere.`;
        fs.writeFileSync(testFilePath, content);
        
        const result = await MarkdownSecurityChecker.checkFile(testFilePath);
        
        // Check that we find at least the two specific characters we inserted
        const zwjFindings = result.findings.filter(f => f.charInfo.name === 'Zero-width joiner');
        const rtlEmbedFindings = result.findings.filter(f => f.charInfo.name === 'RTL Embedding');
        
        assert.strictEqual(zwjFindings.length, 1, 'Should find one zero-width joiner');
        assert.strictEqual(rtlEmbedFindings.length, 1, 'Should find one RTL embedding character');
    });
    
    test('Should find markdown files in directory', async () => {
        // Create test files with different extensions
        fs.writeFileSync(path.join(tempDir, 'test1.md'), '# Test');
        fs.writeFileSync(path.join(tempDir, 'test2.mdc'), '# Test');
        fs.writeFileSync(path.join(tempDir, 'test3.txt'), '# Test');
        fs.writeFileSync(path.join(tempDir, 'test4.md'), '# Test');
        
        const files = await MarkdownSecurityChecker.findMarkdownFiles(tempDir);
        
        assert.strictEqual(files.length, 3, 'Should find 3 markdown files (.md and .mdc)');
        const fileNames = files.map(f => path.basename(f)).sort();
        assert.deepStrictEqual(fileNames, ['test1.md', 'test2.mdc', 'test4.md']);
    });
    
    test('Should generate report correctly', async () => {
        // Create a test file with a malicious character
        const testFilePath = path.join(tempDir, 'test-report.md');
        const content = `# Test File\n\nThis has a zero-width space\u200Bhere.`;
        fs.writeFileSync(testFilePath, content);
        
        const results = await MarkdownSecurityChecker.checkWorkspace(tempDir);
        const report = MarkdownSecurityChecker.generateReport(results);
        
        assert.ok(report.includes('# Markdown Security Check Report'), 'Report should have a title');
        assert.ok(report.includes('test-report.md'), 'Report should include the filename');
        assert.ok(report.includes('Zero-width space'), 'Report should include the character name');
    });
    
    test('Should not find any malicious characters in clean file', async () => {
        const testFilePath = path.join(tempDir, 'test-clean.md');
        const content = '# Clean File\n\nThis is a clean markdown file without any malicious characters.';
        fs.writeFileSync(testFilePath, content);
        
        const result = await MarkdownSecurityChecker.checkFile(testFilePath);
        
        assert.strictEqual(result.findings.length, 0, 'Should not find any malicious characters');
    });
});