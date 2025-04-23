/**
 * This file provides backward compatibility for existing code that uses the old graphGenerator functions
 */
import { Project } from './csprojParser';
import { ClassDependency } from './csharpClassParser';
import { GraphGenerator } from './strategies/GraphGenerator';
import { GraphOptions } from './strategies/GraphGenerationStrategy';

// Create a singleton instance of the graph generator
const graphGenerator = new GraphGenerator();

/**
 * Generates a DOT file content for visualizing the project dependencies
 * This adapter function maintains backward compatibility with existing code
 * 
 * @param projects List of projects to include in the graph
 * @param options Graph configuration options
 * @param classDependencies Optional list of class dependencies for class-level graphs
 * @returns DOT file content as a string
 */
export function generateDotFile(
  projects: Project[], 
  options: GraphOptions,
  classDependencies?: ClassDependency[]
): string {
  // Ensure includeClassDependencies is properly set based on the presence of classDependencies
  const adaptedOptions: GraphOptions = {
    ...options,
    // If includeClassDependencies is undefined but classDependencies are provided,
    // we should set it to true to ensure the class graph strategy is selected
    includeClassDependencies: options.includeClassDependencies !== undefined 
      ? options.includeClassDependencies 
      : (classDependencies && classDependencies.length > 0)
  };

  return graphGenerator.generateDotFile(projects, adaptedOptions, classDependencies);
}