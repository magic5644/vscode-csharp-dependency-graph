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
      
      if (!result || !result.Project) {
        continue;
      }
      
      const projectName = path.basename(filePath, '.csproj');
      let targetFramework = '';
      const dependencies: string[] = [];
      
      // Extract target framework
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
      
      // Extract project references
      if (result.Project.ItemGroup && Array.isArray(result.Project.ItemGroup)) {
        for (const group of result.Project.ItemGroup) {
          if (group.ProjectReference && Array.isArray(group.ProjectReference)) {
            for (const reference of group.ProjectReference) {
              if (reference && reference.$ && reference.$.Include) {
                const refPath = String(reference.$.Include);
                const refName = path.basename(refPath, '.csproj');
                dependencies.push(refName);
              }
            }
          }
        }
      }
      
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
