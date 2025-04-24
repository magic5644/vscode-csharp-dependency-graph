import { Project } from '../csprojParser';
import { GraphOptions, BaseGraphStrategy, StrategyAdditionalData } from './GraphGenerationStrategy';

/**
 * Strategy for generating project dependency graphs
 */
export class ProjectGraphStrategy extends BaseGraphStrategy {
  /**
   * Generate a DOT graph showing project dependencies
   * @param projects List of projects
   * @param options Graph configuration options
   * @param _additionalData Not used in this strategy
   */
  public generate(
    projects: Project[], 
    options: GraphOptions,
    _additionalData?: StrategyAdditionalData
  ): string {
    let dotContent = this.generateHeader();
    
    // Add project nodes
    dotContent += this.generateProjectNodes(projects, options);
    
    // Add package nodes if enabled
    if (options.includePackageDependencies) {
      dotContent += this.generatePackageNodes(projects, options);
    }

    dotContent += '\n';
    
    // Add project dependency edges
    dotContent += this.generateProjectEdges(projects);
    
    // Add package dependency edges if enabled
    if (options.includePackageDependencies) {
      dotContent += this.generatePackageEdges(projects);
    }
    
    dotContent += this.generateFooter();
    return dotContent;
  }

  /**
   * Generate project node definitions
   */
  private generateProjectNodes(projects: Project[], options: GraphOptions): string {
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
   * Generate package node definitions
   */
  private generatePackageNodes(projects: Project[], options: GraphOptions): string {
    const uniquePackages = this.collectUniquePackages(projects);
    
    let dotContent = '\n  // Package nodes\n';
    for (const packageName of uniquePackages) {
      dotContent += `  "${packageName}" [label="${packageName}", shape=ellipse, style=filled, fillcolor="${options.packageNodeColor ?? '#ffcccc'}"];\n`;
    }
    
    return dotContent;
  }

  /**
   * Collect unique package names across projects
   */
  private collectUniquePackages(projects: Project[]): Set<string> {
    const uniquePackages = new Set<string>();
    
    for (const project of projects) {
      for (const pkg of project.packageDependencies) {
        uniquePackages.add(pkg.name);
      }
    }
    
    return uniquePackages;
  }

  /**
   * Generate project reference edges
   */
  private generateProjectEdges(projects: Project[]): string {
    let dotContent = '  // Project reference edges\n';
    
    for (const project of projects) {
      for (const dependency of project.dependencies) {
        dotContent += `  "${project.name}" -> "${dependency}" [penwidth=1.0];\n`;
      }
    }
    
    return dotContent;
  }

  /**
   * Generate package reference edges
   */
  private generatePackageEdges(projects: Project[]): string {
    let dotContent = '\n  // Package reference edges\n';
    
    for (const project of projects) {
      for (const pkg of project.packageDependencies) {
        dotContent += `  "${project.name}" -> "${pkg.name}" [style=dashed, penwidth=0.5];\n`;
      }
    }
    
    return dotContent;
  }
}