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
  packageDependencies: PackageReference[];
}

// Add interfaces for XML structure
interface CsprojXml {
  Project: {
    PropertyGroup?: PropertyGroup[];
    ItemGroup?: ItemGroup[];
    [key: string]: unknown;
  };
}

interface PropertyGroup {
  TargetFramework?: string[];
  TargetFrameworks?: string[];
  [key: string]: unknown;
}

interface ItemGroup {
  ProjectReference?: ProjectReference[];
  [key: string]: unknown;
}

interface ProjectReference {
  $: {
    Include: string;
    [key: string]: unknown;
  };
}

export interface PackageReference {
  name: string;
  version: string;
}

/**
 * Parses .csproj files to extract project names and dependencies
 */
export async function parseCsprojFiles(filePaths: string[]): Promise<Project[]> {
  const projects: Project[] = [];
  for (const filePath of filePaths) {
    const packageDependencies: PackageReference[] = [];
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
      extractProjectReferences(result, dependencies, packageDependencies);
      
      projects.push({
        name: projectName,
        path: filePath,
        targetFramework,
        dependencies,
        packageDependencies
      });
    } catch (error) {
      console.error(`Failed to parse ${filePath}:`, error);
    }
  }
  
  return projects;
}

function extractTargetFramework(result: CsprojXml, targetFramework: string): string {
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

function extractProjectReferences(result: CsprojXml, dependencies: string[], packageDependencies: PackageReference[]): void {
  // Early return if no item groups
  const itemGroups = result?.Project?.ItemGroup;
  if (!itemGroups || !Array.isArray(itemGroups)) {
    return;
  }

  // Process each item group
  for (const group of itemGroups) {
    addProjectReferencesFromGroup(group, dependencies);
    addPackageReferencesFromGroup(group, packageDependencies);
  }
}

function addProjectReferencesFromGroup(group: ItemGroup, dependencies: string[]): void {
  const projectRefs = group?.ProjectReference;
  if (!projectRefs || !Array.isArray(projectRefs)) {
    return;
  }

  for (const reference of projectRefs) {
    const includePath = reference?.$.Include;
    if (includePath) {
      // Convert string and replace backslashes with forward slashes
      const normalizedPath = String(includePath).replace(/\\/g, '/');
      
      // Extract the last part of the path (the filename with extension)
      const lastPathPart = normalizedPath.split('/').pop() ?? '';
      
      // Remove the extension to get just the project name
      const refName = lastPathPart.replace(/\.csproj$/i, '');
            
      dependencies.push(refName);
    }
  }
}

function addPackageReferencesFromGroup(group: ItemGroup, packageDependencies: PackageReference[]): void {
  const packageRefs = group?.PackageReference;
  if (!packageRefs || !Array.isArray(packageRefs)) {
    return;
  }

  for (const reference of packageRefs) {
    const packageName = reference?.$.Include;
    const packageVersion = reference?.$.Version || 'unknown';
    
    if (packageName) {
      packageDependencies.push({
        name: String(packageName),
        version: String(packageVersion)
      });
    }
  }
}