/**
 * @deprecated This file is kept for backward compatibility. 
 * Please use the new implementation in src/strategies/GraphGenerator.ts instead.
 * 
 * All functions in this file now delegate to the new Strategy Pattern implementation.
 */
import { Project } from './csprojParser';
import { ClassDependency } from './csharpClassParser';
import { generateDotFile as adapterGenerateDotFile } from './graphGeneratorAdapter';
import { GraphOptions as NewGraphOptions } from './strategies/GraphGenerationStrategy';

/**
 * @deprecated Use the GraphOptions interface in src/strategies/GraphGenerationStrategy.ts instead
 */
export interface GraphOptions extends NewGraphOptions {
  // This interface now extends the new GraphOptions interface for compatibility
  // The includeClassDependencies property is already included in the new interface as optional
}

/**
 * @deprecated Use the GraphGenerator class in src/strategies/GraphGenerator.ts instead
 * Generates a DOT file content for visualizing the project dependencies
 */
export function generateDotFile(
  projects: Project[], 
  options: GraphOptions,
  classDependencies?: ClassDependency[]
): string {
  return adapterGenerateDotFile(projects, options, classDependencies);
}

// Implementation details are delegated to adapter
