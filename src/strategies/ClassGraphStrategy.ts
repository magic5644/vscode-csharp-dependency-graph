import { Project } from '../csprojParser';
import { ClassDependency } from '../csharpClassParser';
import { GraphOptions, BaseGraphStrategy, StrategyAdditionalData } from './GraphGenerationStrategy';

/**
 * Extended options specific to class dependency graphs
 */
export interface ClassGraphOptions extends GraphOptions {
  includeClassDependencies: boolean;
}

/**
 * Strategy for generating class dependency graphs
 */
export class ClassGraphStrategy extends BaseGraphStrategy {
  /**
   * Generate a DOT graph showing class dependencies
   * @param projects List of projects
   * @param options Graph configuration options
   * @param additionalData Class dependencies (as ClassDependency[])
   */
  public generate(
    projects: Project[], 
    options: GraphOptions,
    additionalData?: StrategyAdditionalData
  ): string {
    // Ensure we have class dependencies
    const classDependencies = additionalData as ClassDependency[];
    if (!classDependencies || classDependencies.length === 0) {
      throw new Error('Class dependencies are required for generating a class dependency graph');
    }
    
    const classOptions = options as ClassGraphOptions;
    
    let dotContent = this.generateHeader();
    
    // Generate project subgraphs with their classes
    dotContent += this.generateProjectSubgraphs(projects, classDependencies, classOptions);
    
    // Generate dependency edges between classes
    dotContent += this.generateClassDependencyEdges(classDependencies);
    
    dotContent += this.generateFooter();
    return dotContent;
  }

  /**
   * Generates subgraphs for each project with their classes
   */
  private generateProjectSubgraphs(
    projects: Project[],
    classDependencies: ClassDependency[],
    options: ClassGraphOptions
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
  private generateClassDependencyEdges(classDependencies: ClassDependency[]): string {
    let dotContent = '';
    
    for (const classInfo of classDependencies) {
      const sourceNodeId = `"${classInfo.projectName}.${classInfo.className}"`;
      
      for (const dependency of classInfo.dependencies) {
        const targetClass = this.findTargetClass(classDependencies, classInfo, dependency);
        
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
  private findTargetClass(
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
}