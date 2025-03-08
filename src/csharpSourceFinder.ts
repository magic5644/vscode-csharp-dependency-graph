import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { minimatch } from 'minimatch';

const readdir = util.promisify(fs.readdir);

/**
 * Finds all .cs files in the specified projects
 * @param projectPaths Paths of the projects to analyze
 * @param excludePatterns File patterns to exclude
 */
export async function findCSharpSourceFiles(
  projectPaths: string[],
  excludePatterns: string[] = ['**/obj/**', '**/bin/**']
): Promise<Map<string, string[]>> {
  const projectSourceFiles = new Map<string, string[]>();
  
  for (const projectPath of projectPaths) {
    try {
      const sourceFiles: string[] = [];
      const projectDir = path.dirname(projectPath);
      const projectName = path.basename(projectPath, '.csproj');
      
      await searchDirectory(projectDir, sourceFiles, excludePatterns);
      
      // Do not add the project if there are no source files
      if (sourceFiles.length > 0) {
        projectSourceFiles.set(projectName, sourceFiles);
      }
    } catch (err) {
      console.error(`Error analyzing project ${projectPath}:`, err);
    }
  }
  
  return projectSourceFiles;
}

async function searchDirectory(
  dir: string, 
  results: string[], 
  excludePatterns: string[]
): Promise<void> {
  // Check if the directory matches an exclusion pattern
  if (isExcluded(dir, excludePatterns)) {
    return;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursion into subdirectories, but not excluded directories
        if (!isExcluded(fullPath, excludePatterns)) {
          await searchDirectory(fullPath, results, excludePatterns);
        }
      } else if (entry.isFile() && entry.name.endsWith('.cs')) {
        // Add the .cs file if it is not excluded
        if (!isExcluded(fullPath, excludePatterns)) {
          results.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error searching in ${dir}:`, error);
  }
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
