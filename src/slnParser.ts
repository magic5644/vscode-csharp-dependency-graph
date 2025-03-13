import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const readFile = util.promisify(fs.readFile);

/**
 * Represents a project reference in a solution file
 */
export interface SlnProject {
  name: string;
  path: string;
  guid: string;
}

/**
 * Parses a .sln file to extract project references
 * @param slnFilePath Path to the .sln file
 * @returns Array of project paths
 */
export async function parseSolutionFile(slnFilePath: string): Promise<string[]> {
  try {
    const content = await readFile(slnFilePath, 'utf8');
    const projects = extractProjectsFromSln(content, slnFilePath);
    return projects.map(p => p.path);
  } catch (error) {
    console.error(`Error parsing solution file ${slnFilePath}:`, error);
    return [];
  }
}

/**
 * Extracts project information from solution file content
 * @param content Solution file content
 * @param slnFilePath Path to the solution file (needed to resolve relative paths)
 * @returns Array of project information
 */
function extractProjectsFromSln(content: string, slnFilePath: string): SlnProject[] {
  const projects: SlnProject[] = [];
  const slnDir = path.dirname(slnFilePath);
  
  // Regular expression to match project declarations in solution file
  const projectRegex = /Project\("\{[0-9A-F-]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"\{([0-9A-F-]+)\}"/gi;
  let match;
  
  while ((match = projectRegex.exec(content)) !== null) {
    const projectName = match[1];
    const projectPath = match[2];
    const projectGuid = match[3];
    
    // Only include .csproj files (skip solution folders and other project types)
    if (projectPath.endsWith('.csproj')) {
      // Convert relative path to absolute
      const absolutePath = path.join(slnDir, projectPath.replace(/\\/g, path.sep));
      
      projects.push({
        name: projectName,
        path: absolutePath,
        guid: projectGuid
      });
    }
  }
  
  return projects;
}

/**
 * Finds all .sln files in a directory
 * @param directoryPath Directory to search in
 * @returns Promise with array of solution file paths
 */
export async function findSolutionFiles(directoryPath: string): Promise<string[]> {
  const readdir = util.promisify(fs.readdir);
  const slnFiles: string[] = [];
  
  async function searchDirectory(dir: string) {
    try {
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
    } catch (error) {
      console.error(`Error searching for .sln files in ${dir}:`, error);
    }
  }
  
  await searchDirectory(directoryPath);
  return slnFiles;
}
