#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Using require syntax which avoids TypeScript typing issues
const { glob } = require('glob');

/**
 * Class for checking markdown files for potentially malicious characters
 */
class MarkdownSecurityChecker {
    // Define patterns for malicious characters
    static MALICIOUS_CHAR_PATTERNS = [
        // Zero-width characters
        {
            name: 'Zero-width space',
            regex: /\u200B/g,
            description: 'Invisible space character that can be used to hide text'
        },
        {
            name: 'Zero-width non-joiner',
            regex: /\u200C/g,
            description: 'Prevents characters from joining in scripts that use ligatures'
        },
        {
            name: 'Zero-width joiner',
            regex: /\u200D/g,
            description: 'Joins characters that normally would not join'
        },
        {
            name: 'Zero-width no-break space',
            regex: /\uFEFF/g,
            description: 'Byte order mark or zero-width non-breaking space'
        },
        
        // Unicode control and format characters - Excluding common ASCII characters
        {
            name: 'Control characters',
            regex: /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g,
            description: 'ASCII and Unicode control characters'
        },
        {
            name: 'Format characters',
            regex: /[\u2000-\u200F\u2028-\u202F\u205F-\u206F]/g,
            description: 'Unicode format and control characters'
        },
        
        // Bidirectional override characters
        {
            name: 'LTR Override',
            regex: /\u202D/g,
            description: 'Left-to-Right Override'
        },
        {
            name: 'RTL Override',
            regex: /\u202E/g,
            description: 'Right-to-Left Override - Can be used for spoofing'
        },
        {
            name: 'LTR Embedding',
            regex: /\u202A/g,
            description: 'Left-to-Right Embedding'
        },
        {
            name: 'RTL Embedding',
            regex: /\u202B/g,
            description: 'Right-to-Left Embedding'
        },
        {
            name: 'PDF',
            regex: /\u202C/g,
            description: 'Pop Directional Formatting'
        },
        
        // Invisible operators
        {
            name: 'Invisible Times',
            regex: /\u2062/g,
            description: 'Invisible times operator'
        },
        {
            name: 'Invisible Plus',
            regex: /\u2064/g,
            description: 'Invisible plus operator'
        },
        {
            name: 'Invisible Separator',
            regex: /\u2063/g,
            description: 'Invisible separator/comma'
        },
        
        // Variation selectors and language tags
        {
            name: 'Variation Selectors',
            regex: /[\uFE00-\uFE0F\uE0100-\uE01EF]/g,
            description: 'Variation selectors for glyph variants'
        },
        {
            name: 'Language Tag Characters',
            regex: /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g,
            description: 'Characters used in language tags'
        }
    ];

    /**
     * Find all Markdown files in the given workspace folder
     * @param {string} workspaceFolder The workspace folder to search in
     * @returns {Promise<string[]>} A promise that resolves to an array of file paths
     */
    static async findMarkdownFiles(workspaceFolder) {
        try {
            const files = await glob('**/*.{md,mdc}', {
                cwd: workspaceFolder,
                ignore: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/bin/**', '**/obj/**']
            });
            return files.map(file => path.join(workspaceFolder, file));
        } catch (error) {
            console.error('Error finding Markdown files:', error);
            return [];
        }
    }

    /**
     * Check a single file for malicious characters
     * @param {string} filePath The path to the file to check
     * @returns {Promise<Object>} A CheckResult with any findings
     */
    static async checkFile(filePath) {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const result = {
            filePath,
            findings: []
        };

        lines.forEach((line, lineIdx) => {
            this.MALICIOUS_CHAR_PATTERNS.forEach(charPattern => {
                let match;
                while ((match = charPattern.regex.exec(line)) !== null) {
                    // Ensure we're not matching regular ASCII visible characters (0x20-0x7E)
                    const charCode = match[0].charCodeAt(0);
                    if (!(charCode >= 0x20 && charCode <= 0x7E)) {
                        result.findings.push({
                            character: match[0],
                            charInfo: charPattern,
                            position: {
                                line: lineIdx + 1,
                                column: match.index + 1
                            }
                        });
                    }
                }
                // Reset the regex for the next line
                charPattern.regex.lastIndex = 0;
            });
        });

        return result;
    }

    /**
     * Check all Markdown files in a workspace folder
     * @param {string} workspaceFolder The workspace folder to check
     * @returns {Promise<Array>} An array of check results for each file
     */
    static async checkWorkspace(workspaceFolder) {
        const files = await this.findMarkdownFiles(workspaceFolder);
        const results = [];
        
        for (const file of files) {
            const result = await this.checkFile(file);
            if (result.findings.length > 0) {
                results.push(result);
            }
        }
        
        return results;
    }

    /**
     * Generate a report from check results
     * @param {Array} results Check results to report on
     * @returns {string} A formatted string report
     */
    static generateReport(results) {
        if (results.length === 0) {
            return 'No malicious characters found in Markdown files. ✅';
        }

        let report = '# Markdown Security Check Report\n\n';
        report += `Date: ${new Date().toISOString()}\n\n`;
        report += `Found ${results.length} file(s) with potential security issues:\n\n`;

        results.forEach(result => {
            report += `## ${path.basename(result.filePath)}\n`;
            report += `Path: ${result.filePath}\n\n`;
            report += `Total findings: ${result.findings.length}\n\n`;
            
            const groupedByType = result.findings.reduce((acc, finding) => {
                const type = finding.charInfo.name;
                if (!acc[type]) {
                    acc[type] = [];
                }
                acc[type].push(finding);
                return acc;
            }, {});

            Object.entries(groupedByType).forEach(([type, findings]) => {
                report += `### ${type} (${findings.length})\n`;
                report += `${findings[0].charInfo.description}\n\n`;
                
                report += '| Line | Column | Character Code |\n';
                report += '|------|--------|---------------|\n';
                
                findings.forEach(finding => {
                    const charCode = Array.from(finding.character)
                        .map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
                        .join(' ');
                    
                    report += `| ${finding.position.line} | ${finding.position.column} | ${charCode} |\n`;
                });
                
                report += '\n';
            });
            
            report += '\n';
        });

        return report;
    }
}

/**
 * Main function to run the script
 */
async function main() {
    try {
        // Get workspace folder from command line arguments or use current directory
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
    } catch (error) {
        console.error('Error running Markdown security check:', error);
        process.exit(2);
    }
}

// Run the script when it's directly executed (not imported)
if (require.main === module) {
    main();
}
