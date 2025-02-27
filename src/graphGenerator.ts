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
  let dotContent = 'digraph CSharpDependencies {\n';
  dotContent += '  graph [rankdir=LR, fontname="Helvetica", fontsize=14];\n';
  dotContent += '  node [shape=box, style=filled, fillcolor=lightblue, fontname="Helvetica", fontsize=12];\n';
  dotContent += '  edge [fontname="Helvetica", fontsize=10];\n\n';

  if (options.includeClassDependencies && classDependencies) {
    // Générer un graphe avec les dépendances de classes
    return generateClassDependencyGraph(projects, classDependencies, options);
  }
  
  // Graphe de dépendances au niveau projet
  
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
  
  dotContent += '}\n';
  return dotContent;
}

/**
 * Génère un graphe DOT pour les dépendances entre classes
 */
function generateClassDependencyGraph(
  projects: Project[],
  classDependencies: ClassDependency[],
  options: GraphOptions
): string {
  let dotContent = 'digraph CSharpDependencies {\n';
  dotContent += '  graph [rankdir=LR, fontname="Helvetica", fontsize=14, splines=ortho];\n';
  dotContent += '  node [shape=box, style=filled, fontname="Helvetica", fontsize=11];\n';
  dotContent += '  edge [fontname="Helvetica", fontsize=9];\n\n';
  
  // Créer des sous-graphes par projet
  for (const project of projects) {
    dotContent += `  subgraph "cluster_${project.name}" {\n`;
    dotContent += `    label="${project.name}${options.includeNetVersion && project.targetFramework ? ' (' + project.targetFramework + ')' : ''}";\n`;
    dotContent += '    style="filled";\n';
    dotContent += '    color=lightgrey;\n\n';
    
    // Ajouter les nœuds des classes de ce projet
    const projectClasses = classDependencies.filter(c => c.projectName === project.name);
    
    for (const classInfo of projectClasses) {
      // Utiliser le nom complet de la classe avec namespace pour l'ID du nœud
      const nodeId = `"${project.name}.${classInfo.className}"`;
      dotContent += `    ${nodeId} [label="${classInfo.className}", fillcolor=white, tooltip="${classInfo.namespace}.${classInfo.className}"];\n`;
    }
    
    dotContent += '  }\n\n';
  }
  
  // Ajouter les arêtes pour les dépendances
  for (const classInfo of classDependencies) {
    const sourceNodeId = `"${classInfo.projectName}.${classInfo.className}"`;
    
    for (const dependency of classInfo.dependencies) {
      // Essayer de trouver la classe cible dans toutes les classes
      // D'abord, chercher dans le même projet
      let targetClass = classDependencies.find(
        c => c.projectName === classInfo.projectName && c.className === dependency
      );
      
      // Si non trouvé, chercher dans tous les projets
      if (!targetClass) {
        targetClass = classDependencies.find(c => c.className === dependency);
      }
      
      if (targetClass) {
        const targetNodeId = `"${targetClass.projectName}.${targetClass.className}"`;
        dotContent += `  ${sourceNodeId} -> ${targetNodeId};\n`;
      }
    }
  }
  
  dotContent += '}\n';
  return dotContent;
}
