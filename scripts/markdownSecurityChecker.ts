#!/usr/bin/env node
/* eslint-disable no-control-regex -- Intentional: this tool must detect control characters in Markdown */

import * as fs from 'node:fs';
import * as path from 'node:path';
// Import glob correctly for v11.0.2
import { glob } from 'glob';

/**
 * Structure to hold information about malicious characters
 */
interface MaliciousCharInfo {
    name: string;
    regex: RegExp;
    description: string;
}

/**
 * Result of checking a file
 */
interface CheckResult {
    filePath: string;
    findings: {
        character: string;
        charInfo: MaliciousCharInfo;
        position: {
            line: number;
            column: number;
        };
    }[];
}

/**
 * Class for checking markdown files for potentially malicious characters
 */
export class MarkdownSecurityChecker {
    // Define patterns for malicious characters
    private static readonly maliciousCharPatterns: MaliciousCharInfo[] = [
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
        
        // Variation selectors and language tags - Fixed to only include actual variation selectors
        {
            name: 'Variation Selectors (FE00-FE0F)',
            regex: /[\uFE00-\uFE0F]/g,
            description: 'Variation selectors for glyph variants (BMP)'
        },
        {
            name: 'Variation Selectors Supplement (E0100-E01EF)',
            // Use surrogate pair range: U+E0100–U+E01EF = \uDB40[\uDD00-\uDDEF]
            regex: /\uDB40[\uDD00-\uDDEF]/g,
            description: 'Supplementary variation selectors (astral plane)'
        },
        {
            name: 'Language Tag Characters',
            // Removing normal ASCII characters from this pattern
            regex: /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g,
            description: 'Characters used in language tags'
        }
    ];

    /**
     * Find all Markdown files in the given workspace folder
     * @param workspaceFolder The workspace folder to search in
     * @returns A promise that resolves to an array of file paths
     */
    public static async findMarkdownFiles(workspaceFolder: string): Promise<string[]> {
        try {
            const files = await glob('**/*.{md,mdc}', {
                cwd: workspaceFolder,
                ignore: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/bin/**', '**/obj/**']
            });
            return files.map((file: string) => path.join(workspaceFolder, file));
        } catch (error) {
            console.error('Error finding Markdown files:', error);
            return [];
        }
    }

    /**
     * Check a single file for malicious characters
     * @param filePath The path to the file to check
     * @returns A CheckResult with any findings
     */
    public static async checkFile(filePath: string): Promise<CheckResult> {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        const result: CheckResult = {
            filePath,
            findings: []
        };

        lines.forEach((line, lineIdx) => {
            this.maliciousCharPatterns.forEach(charPattern => {
                let match;
                while ((match = charPattern.regex.exec(line)) !== null) {
                    // Ensure we're not matching regular ASCII visible characters (0x20-0x7E)
                    const codePoint = match[0].codePointAt(0)!;
                    if (!(codePoint >= 0x20 && codePoint <= 0x7E)) {
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
     * @param workspaceFolder The workspace folder to check
     * @returns An array of check results for each file
     */
    public static async checkWorkspace(workspaceFolder: string): Promise<CheckResult[]> {
        const files = await this.findMarkdownFiles(workspaceFolder);
        const results: CheckResult[] = [];
        
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
     * @param results Check results to report on
     * @returns A formatted string report
     */
    public static generateReport(results: CheckResult[]): string {
        if (results.length === 0) {
            return 'No malicious characters found in Markdown files. ✅';
        }

        let report = '# Markdown Security Check Report\n\n';
        report += `Date: ${new Date().toISOString()}\n\n`;
        report += `Found ${results.length} file(s) with potential security issues:\n\n`;

        results.forEach(result => {
            report += this.generateFileReport(result);
        });

        return report;
    }

    /**
     * Generate report section for a single file
     * @param result Check result for a file
     * @returns Formatted report section
     */
    private static generateFileReport(result: CheckResult): string {
        let report = `## ${path.basename(result.filePath)}\n`;
        report += `Path: ${result.filePath}\n\n`;
        report += `Total findings: ${result.findings.length}\n\n`;
        
        const groupedByType = this.groupFindingsByType(result.findings);

        Object.entries(groupedByType).forEach(([type, findings]) => {
            report += this.generateTypeSection(type, findings);
        });
        
        report += '\n';
        return report;
    }

    /**
     * Group findings by character type
     * @param findings Array of findings
     * @returns Findings grouped by type
     */
    private static groupFindingsByType(findings: CheckResult['findings']): Record<string, typeof findings> {
        return findings.reduce((acc, finding) => {
            const type = finding.charInfo.name;
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(finding);
            return acc;
        }, {} as Record<string, typeof findings>);
    }

    /**
     * Generate report section for a character type
     * @param type Character type name
     * @param findings Findings of this type
     * @returns Formatted type section
     */
    private static generateTypeSection(type: string, findings: CheckResult['findings']): string {
        let section = `### ${type} (${findings.length})\n`;
        section += `${findings[0].charInfo.description}\n\n`;
        
        section += '| Line | Column | Character Code |\n';
        section += '|------|--------|---------------|\n';
        
        findings.forEach(finding => {
            section += this.generateFindingRow(finding);
        });
        
        section += '\n';
        return section;
    }

    /**
     * Generate table row for a single finding
     * @param finding Single finding
     * @returns Formatted table row
     */
    private static generateFindingRow(finding: CheckResult['findings'][0]): string {
        const charCode = Array.from(finding.character)
            .map(c => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`)
            .join(' ');
        
        return `| ${finding.position.line} | ${finding.position.column} | ${charCode} |\n`;
    }
}