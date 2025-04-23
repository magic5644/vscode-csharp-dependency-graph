import { Project } from '../csprojParser';

/**
 * Common options for graph generation
 */
export interface GraphOptions {
  includeNetVersion: boolean;
  classDependencyColor: string;
  includePackageDependencies?: boolean;
  packageNodeColor?: string;
  includeClassDependencies?: boolean;
}

/**
 * Type for additional data provided to strategy implementations
 */
export type StrategyAdditionalData = unknown;

/**
 * Interface for graph generation strategies
 */
export interface GraphGenerationStrategy {
  /**
   * Generate DOT file content for a graph
   * @param projects Project data
   * @param options Graph configuration options
   * @param additionalData Optional additional data needed by specific strategies
   * @returns DOT file content as string
   */
  generate(
    projects: Project[], 
    options: GraphOptions, 
    additionalData?: StrategyAdditionalData
  ): string;
}

/**
 * Abstract base class with common functionality for graph generators
 */
export abstract class BaseGraphStrategy implements GraphGenerationStrategy {
  /**
   * Generate DOT file content for a graph
   * @param projects Project data
   * @param options Graph configuration options
   * @param additionalData Optional additional data needed by specific strategies
   * @returns DOT file content as string 
   */
  public abstract generate(
    projects: Project[], 
    options: GraphOptions,
    additionalData?: StrategyAdditionalData
  ): string;

  /**
   * Generate the header of a DOT file
   */
  protected generateHeader(): string {
    let dotContent = 'digraph CSharpDependencies {\n';
    dotContent += '  graph [rankdir=LR, fontname="Helvetica", fontsize=14, splines=sprite, overlap=false, nodesep=0.2, ranksep=0.8];\n';
    dotContent += '  node [shape=box, style=filled, fillcolor=lightblue, fontname="Helvetica", fontsize=11];\n';
    dotContent += '  edge [fontname="Helvetica", fontsize=9];\n\n';
    return dotContent;
  }

  /**
   * Generate the footer of a DOT file
   */
  protected generateFooter(): string {
    return '}\n';
  }
}