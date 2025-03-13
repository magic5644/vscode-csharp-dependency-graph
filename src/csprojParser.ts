import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as xml2js from 'xml2js';

const readFile = util.promisify(fs.readFile);

export interface Project {
  name: string;
  path: string;
  targetFramework: string;
  dependencies: string[];
}

/**
 * Parses .csproj files to extract project names and dependencies
 */
export async function parseCsprojFiles(filePaths: string[]): Promise<Project[]> {
  const projects: Project[] = [];
  
  for (const filePath of filePaths) {
    try {
      const content = await readFile(filePath, 'utf8');
      const parser = new xml2js.Parser();
      
      // Use promise-based parsing properly
      const result = await parser.parseStringPromise(content);
      
      if (!result?.Project) {
        continue;
      }
      
      const projectName = path.basename(filePath, '.csproj');
      let targetFramework = '';
      const dependencies: string[] = [];
      
      // Extract target framework
      targetFramework = extractTargetFramework(result, targetFramework);
      
      // Extract project references
      extractProjectReferences(result, dependencies);
      
      projects.push({
        name: projectName,
        path: filePath,
        targetFramework,
        dependencies
      });
    } catch (error) {
      console.error(`Failed to parse ${filePath}:`, error);
    }
  }
  
  return projects;
}

function extractTargetFramework(result: any, targetFramework: string) {
  if (result.Project.PropertyGroup && Array.isArray(result.Project.PropertyGroup)) {
    for (const group of result.Project.PropertyGroup) {
      if (group.TargetFramework && Array.isArray(group.TargetFramework) && group.TargetFramework.length > 0) {
        targetFramework = String(group.TargetFramework[0]);
        break;
      } else if (group.TargetFrameworks && Array.isArray(group.TargetFrameworks) && group.TargetFrameworks.length > 0) {
        // Use first of multiple target frameworks
        const frameworks = String(group.TargetFrameworks[0]).split(';');
        if (frameworks.length > 0) {
          targetFramework = frameworks[0];
        }
        break;
      }
    }
  }
  return targetFramework;
}

function extractProjectReferences(result: any, dependencies: string[]) {
  // Early return if no item groups
  const itemGroups = result?.Project?.ItemGroup;
  if (!itemGroups || !Array.isArray(itemGroups)) {
    return;
  }

  // Process each item group
  for (const group of itemGroups) {
    addProjectReferencesFromGroup(group, dependencies);
  }
}

function addProjectReferencesFromGroup(group: any, dependencies: string[]) {
  const projectRefs = group?.ProjectReference;
  if (!projectRefs || !Array.isArray(projectRefs)) {
    return;
  }

  for (const reference of projectRefs) {
    const includePath = reference?.$.Include;
    if (includePath) {
      const refName = path.basename(String(includePath), '.csproj');
      dependencies.push(refName);
    }
  }
}
