import { Project } from './csprojParser';

/**
 * Generates a DOT file content for visualizing the project dependencies
 */
export function generateDotFile(projects: Project[], includeNetVersion: boolean): string {
  let dotContent = 'digraph CSharpDependencies {\n';
  dotContent += '  graph [rankdir=LR, fontname="Helvetica", fontsize=14];\n';
  dotContent += '  node [shape=box, style=filled, fillcolor=lightblue, fontname="Helvetica", fontsize=12];\n';
  dotContent += '  edge [fontname="Helvetica", fontsize=10];\n\n';

  // Define nodes
  for (const project of projects) {
    const label = includeNetVersion && project.targetFramework
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
  
  dotContent += '}\n';
  return dotContent;
}
