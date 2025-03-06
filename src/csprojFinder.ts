import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { minimatch } from 'minimatch';

const readdir = util.promisify(fs.readdir);

/**
 * Recursively finds all .csproj files in the given directory
 * @param directoryPath The directory to search in
 * @param excludeTestProjects Whether to exclude test projects
 * @param testProjectPatterns Glob patterns to identify test projects
 */
export async function findCsprojFiles(
  directoryPath: string,
  excludeTestProjects: boolean = false,
  testProjectPatterns: string[] = ["*Test*", "*Tests*", "*TestProject*"]
): Promise<string[]> {
  const csprojFiles: string[] = [];
  
  async function searchDirectory(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip node_modules and .git directories
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && !entry.name.startsWith('.')) {
          await searchDirectory(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.csproj')) {
        // Check if it's a test project and should be excluded
        if (excludeTestProjects) {
          const isTestProject = testProjectPatterns.some(pattern => 
            minimatch(entry.name, pattern)
          );
          
          if (isTestProject) {
            continue; // Skip this test project
          }
        }
        
        csprojFiles.push(fullPath);
      }
    }
  }
  
  await searchDirectory(directoryPath);
  return csprojFiles;
}

/**
 * Checks if a file path matches any of the exclusion patterns
 */
function isExcluded(filePath: string, excludePatterns: string[]): boolean {
  try {
    return excludePatterns.some(pattern => {
      // Use the correct minimatch syntax
      return minimatch(filePath, pattern, { dot: true, matchBase: true });
    });
  } catch (error) {
    console.error(`Error checking path ${filePath}:`, error);
    return false; // Do not exclude the file in case of error
  }
}
