import { Project } from './csprojParser';
import { ClassDependency } from './csharpClassParser';

interface GraphOptions {
  includeNetVersion: boolean;
  includeClassDependencies: boolean;
}

/**
 * Generates a DOT file content for visualizing the project dependencies
 */
export function generateDotFile(
  projects: Project[], 
  options: GraphOptions,
  classDependencies?: ClassDependency[]
): string {
  let dotContent = injectHeadOfDotFile();

  if (options.includeClassDependencies && classDependencies) {
    // Generate a graph with class dependencies
    return generateClassDependencyGraph(projects, classDependencies, options);
  }
  
  // Project-level dependency graph
  
  // Define nodes
  for (const project of projects) {
    const label = options.includeNetVersion && project.targetFramework
      ? `${project.name}\\n(${project.targetFramework})`
      : project.name;
    
    dotContent += `  "${project.name}" [label="${label}"];\n`;
  }
  
  dotContent += '\n';
  
  // Define edges
  for (const project of projects) {
    for (const dependency of project.dependencies) {
      dotContent += `  "${project.name}" -> "${dependency}";\n`;
    }
  }
  
  dotContent += injectEndOfDotFile();
  return dotContent;
}

/**
 * Generates a DOT graph for dependencies between classes
 */
function generateClassDependencyGraph(
  projects: Project[],
  classDependencies: ClassDependency[],
  options: GraphOptions
): string {
  let dotContent = injectHeadOfDotFile();
  
  // Create subgraphs by project
  for (const project of projects) {
    dotContent += `  subgraph "cluster_${project.name}" {\n`;
    dotContent += `    label="${project.name}${options.includeNetVersion && project.targetFramework ? ' (' + project.targetFramework + ')' : ''}";\n`;
    dotContent += '    style="filled";\n';
    dotContent += '    color=lightgrey;\n\n';
    
    // Add nodes for the classes of this project
    const projectClasses = classDependencies.filter(c => c.projectName === project.name);
    
    for (const classInfo of projectClasses) {
      // Use the full class name with namespace for the node ID
      const nodeId = `"${project.name}.${classInfo.className}"`;
      dotContent += `    ${nodeId} [label="${classInfo.className}", fillcolor=white, tooltip="${classInfo.namespace}.${classInfo.className}"];\n`;
    }
    
    dotContent += '  }\n\n';
  }
  
  // Add edges for the dependencies
  for (const classInfo of classDependencies) {
    const sourceNodeId = `"${classInfo.projectName}.${classInfo.className}"`;
    
    for (const dependency of classInfo.dependencies) {
      // Try to find the target class in all classes
      // First, search in the same project
      let targetClass = classDependencies.find(
        c => c.projectName === classInfo.projectName && c.className === dependency
      );
      
      // If not found, search in all projects
      if (!targetClass) {
        targetClass = classDependencies.find(c => c.className === dependency);
      }
      
      if (targetClass) {
        const targetNodeId = `"${targetClass.projectName}.${targetClass.className}"`;
        dotContent += `  ${sourceNodeId} -> ${targetNodeId};\n`;
      }
    }
  }
  
  dotContent += injectEndOfDotFile();
  return dotContent;
}

function injectHeadOfDotFile() {
  let dotContent = 'digraph CSharpDependencies {\n';
  dotContent += '  graph [rankdir=LR, fontname="Helvetica", fontsize=14, splines=ortho];\n';
  dotContent += '  node [shape=box, style=filled, fillcolor=lightblue, fontname="Helvetica", fontsize=11];\n';
  dotContent += '  edge [fontname="Helvetica", fontsize=9];\n\n';
  return dotContent;
}

function injectEndOfDotFile() {
  const dotContent = '}\n';
  return dotContent;
}
