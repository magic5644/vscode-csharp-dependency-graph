import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { minimatch } from 'minimatch';
import { parseSolutionFile } from './slnParser';

const readdir = util.promisify(fs.readdir);

/**
 * Recursively finds all .csproj files in the given directory
 * @param directoryPath The directory to search in
 * @param excludeTestProjects Whether to exclude test projects
 * @param testProjectPatterns Glob patterns to identify test projects
 * @param useSolutionFile Whether to look for and use .sln files
 */
export async function findCsprojFiles(
  directoryPath: string,
  excludeTestProjects: boolean = false,
  testProjectPatterns: string[] = ["*Test*", "*Tests*", "*TestProject*"],
  useSolutionFile: boolean = true
): Promise<string[]> {
  let csprojFiles: string[] = [];
  
  // If using solution files is enabled, try to find and parse them first
  if (useSolutionFile) {
    // Find all .sln files in the directory
    const slnFiles = await findSolutionFiles(directoryPath);
    
    if (slnFiles.length > 0) {
      // Use the first solution file found (or let user choose in future)
      const slnFile = slnFiles[0];
      console.log(`Using solution file: ${slnFile}`);
      
      // Parse the solution file to get project file paths
      const projectPaths = await parseSolutionFile(slnFile);
      
      // Filter out test projects if needed
      if (excludeTestProjects) {
        csprojFiles = projectPaths.filter(path => {
          const fileName = path.split(/[\\/]/).pop() || '';
          return !testProjectPatterns.some(pattern => minimatch(fileName, pattern));
        });
      } else {
        csprojFiles = projectPaths;
      }
      
      // If we found projects in the solution file, return them
      if (csprojFiles.length > 0) {
        return csprojFiles;
      }
      
      // Otherwise fall through to directory search
    }
  }
  
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
 * Finds all .sln files in the given directory
 */
async function findSolutionFiles(directoryPath: string): Promise<string[]> {
  const slnFiles: string[] = [];
  
  async function searchDirectory(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && 
          entry.name !== 'node_modules' && 
          entry.name !== '.git' && 
          !entry.name.startsWith('.')) {
        await searchDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.sln')) {
        slnFiles.push(fullPath);
      }
    }
  }
  
  await searchDirectory(directoryPath);
  return slnFiles;
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
