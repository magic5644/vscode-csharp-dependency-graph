import { Project } from '../csprojParser';
import { ClassDependency } from '../csharpClassParser';
import { GraphOptions } from './GraphGenerationStrategy';
import { ProjectGraphStrategy } from './ProjectGraphStrategy';
import { ClassGraphStrategy } from './ClassGraphStrategy';

/**
 * Context class for graph generation strategies
 */
export class GraphGenerator {
  private projectGraphStrategy: ProjectGraphStrategy;
  private classGraphStrategy: ClassGraphStrategy;
  
  constructor() {
    this.projectGraphStrategy = new ProjectGraphStrategy();
    this.classGraphStrategy = new ClassGraphStrategy();
  }

  /**
   * Generates a DOT file content for visualizing dependencies
   * @param projects List of projects
   * @param options Graph configuration options
   * @param classDependencies Optional class dependencies
   * @returns DOT file content as string
   */
  public generateDotFile(
    projects: Project[], 
    options: GraphOptions & { includeClassDependencies?: boolean },
    classDependencies?: ClassDependency[]
  ): string {
    // Determine which strategy to use based on options and available data
    if (options.includeClassDependencies && classDependencies && classDependencies.length > 0) {
      // Use class graph strategy
      return this.classGraphStrategy.generate(
        projects, 
        options, 
        classDependencies
      );
    } else {
      // Use project graph strategy
      return this.projectGraphStrategy.generate(projects, options);
    }
  }
}