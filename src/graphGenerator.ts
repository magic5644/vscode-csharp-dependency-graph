import { Project } from './csprojParser';
import { ClassDependency } from './csharpClassParser';

interface GraphOptions {
  includeNetVersion: boolean;
  includeClassDependencies: boolean;
  classDependencyColor: string;
  includePackageDependencies?: boolean; // Add this option
  packageNodeColor?: string; // Add this for styling
}

/**
 * Generates a DOT file content for visualizing the project dependencies
 */
export function generateDotFile(
  projects: Project[], 
  options: GraphOptions,
  classDependencies?: ClassDependency[]
): string {
  // If class dependencies are included, delegate to specialized function
  if (options.includeClassDependencies && classDependencies) {
    return generateClassDependencyGraph(projects, classDependencies, options);
  }
  
  // For project-level graph, build it from components
  let dotContent = injectHeadOfDotFile();
  
  // Add project nodes
  dotContent += generateProjectNodes(projects, options);
  
  // Add package nodes if enabled
  if (options.includePackageDependencies) {
    dotContent += generatePackageNodes(projects, options);
  }

  dotContent += '\n';
  
  // Add project dependency edges
  dotContent += generateProjectEdges(projects);
  
  // Add package dependency edges if enabled
  if (options.includePackageDependencies) {
    dotContent += generatePackageEdges(projects);
  }
  
  dotContent += injectEndOfDotFile();
  return dotContent;
}

/**
 * Generates project node definitions
 */
function generateProjectNodes(projects: Project[], options: GraphOptions): string {
  let dotContent = '';
  
  for (const project of projects) {
    const label = options.includeNetVersion && project.targetFramework
      ? `${project.name}\\n(${project.targetFramework})`
      : project.name;
    
    dotContent += `  "${project.name}" [label="${label}"];\n`;
  }
  
  return dotContent;
}

/**
 * Generates package node definitions
 */
function generatePackageNodes(projects: Project[], options: GraphOptions): string {
  const uniquePackages = collectUniquePackages(projects);
  
  let dotContent = '\n  // Package nodes\n';
  for (const packageName of uniquePackages) {
    dotContent += `  "${packageName}" [label="${packageName}", shape=ellipse, style=filled, fillcolor="${options.packageNodeColor ?? '#ffcccc'}"];\n`;
  }
  
  return dotContent;
}

/**
 * Collects unique package names across projects
 */
function collectUniquePackages(projects: Project[]): Set<string> {
  const uniquePackages = new Set<string>();
  
  for (const project of projects) {
    for (const pkg of project.packageDependencies) {
      uniquePackages.add(pkg.name);
    }
  }
  
  return uniquePackages;
}

/**
 * Generates project reference edges
 */
function generateProjectEdges(projects: Project[]): string {
  let dotContent = '  // Project reference edges\n';
  
  for (const project of projects) {
    for (const dependency of project.dependencies) {
      dotContent += `  "${project.name}" -> "${dependency}" [penwidth=1.0];\n`;
    }
  }
  
  return dotContent;
}

/**
 * Generates package reference edges
 */
function generatePackageEdges(projects: Project[]): string {
  let dotContent = '\n  // Package reference edges\n';
  
  for (const project of projects) {
    for (const pkg of project.packageDependencies) {
      dotContent += `  "${project.name}" -> "${pkg.name}" [style=dashed, penwidth=0.5];\n`;
    }
  }
  
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
  
  // Generate project subgraphs with their classes
  dotContent += generateProjectSubgraphs(projects, classDependencies, options);
  
  // Generate dependency edges between classes
  dotContent += generateClassDependencyEdges(classDependencies);
  
  dotContent += injectEndOfDotFile();
  return dotContent;
}

/**
 * Generates subgraphs for each project with their classes
 */
function generateProjectSubgraphs(
  projects: Project[],
  classDependencies: ClassDependency[],
  options: GraphOptions
): string {
  let dotContent = '';
  
  for (const project of projects) {
    dotContent += `  subgraph "cluster_${project.name}" {\n`;
    dotContent += `    label="${project.name}${options.includeNetVersion && project.targetFramework ? ' (' + project.targetFramework + ')' : ''}";\n`;
    dotContent += `    style="filled";\n`;
    dotContent += `    color="${options.classDependencyColor}";\n\n`;
    
    // Add nodes for the classes of this project
    const projectClasses = classDependencies.filter(c => c.projectName === project.name);
    
    for (const classInfo of projectClasses) {
      // Use the full class name with namespace for the node ID
      const nodeId = `"${project.name}.${classInfo.className}"`;
      dotContent += `    ${nodeId} [label="${classInfo.className}", fillcolor=white, tooltip="${classInfo.namespace}.${classInfo.className}"];\n`;
    }
    
    dotContent += '  }\n\n';
  }
  
  return dotContent;
}

/**
 * Generates edges between classes based on dependencies
 */
function generateClassDependencyEdges(classDependencies: ClassDependency[]): string {
  let dotContent = '';
  
  for (const classInfo of classDependencies) {
    const sourceNodeId = `"${classInfo.projectName}.${classInfo.className}"`;
    
    for (const dependency of classInfo.dependencies) {
      const targetClass = findTargetClass(classDependencies, classInfo, dependency);
      
      if (targetClass) {
        const targetNodeId = `"${targetClass.projectName}.${targetClass.className}"`;
        dotContent += `  ${sourceNodeId} -> ${targetNodeId} [penwidth=1.5];\n`;
      }
    }
  }
  
  return dotContent;
}

/**
 * Finds the target class for a dependency
 */
function findTargetClass(
  classDependencies: ClassDependency[],
  sourceClass: ClassDependency,
  dependency: { className: string, namespace: string }
): ClassDependency | undefined {
  // First, search in the same project
  let targetClass = classDependencies.find(
    c => c.projectName === sourceClass.projectName && 
         c.className === dependency.className && 
         c.namespace === dependency.namespace
  );
  
  // If not found, search in all projects
  if (!targetClass) {
    targetClass = classDependencies.find(
      c => c.className === dependency.className && 
           c.namespace === dependency.namespace
    );
  }
  
  return targetClass;
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
