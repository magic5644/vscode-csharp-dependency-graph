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
  
  // Helper function to check if directory should be processed
  function shouldProcessDirectory(entry: fs.Dirent): boolean {
    return entry.isDirectory() && 
           entry.name !== 'node_modules' && 
           entry.name !== '.git' && 
           !entry.name.startsWith('.');
  }
  
  // Helper function to check if file is a csproj that should be included
  function shouldIncludeCsprojFile(entry: fs.Dirent): boolean {
    if (!entry.isFile() || !entry.name.endsWith('.csproj')) {
      return false;
    }
    
    if (!excludeTestProjects) {
      return true;
    }
    
    // Check if it matches any test project pattern
    return !testProjectPatterns.some(pattern => minimatch(entry.name, pattern));
  }
  
  async function searchDirectory(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Process directories
      if (shouldProcessDirectory(entry)) {
        await searchDirectory(fullPath);
        continue;
      }
      
      // Process csproj files
      if (shouldIncludeCsprojFile(entry)) {
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
