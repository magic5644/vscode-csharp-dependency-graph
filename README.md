# C# Dependency Graph

<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="C# Dependency Graph Extension Icon">
</p>

Generate interactive dependency graphs for C# projects and classes directly from Visual Studio Code.

## Change Log

See [CHANGELOG.md](./CHANGELOG.md) for a list of changes in README.md

## Features

- **Project-level dependency visualization**: See how your C# projects depend on each other
- **Class-level dependency analysis**: Analyze dependencies between classes across your solution
- **Solution file support**: Automatically detect and use .sln files to find all projects in a solution structure
- **Customizable output**: Configure which elements to include in your dependency graph
- **Exclude test projects**: Option to exclude test projects from the analysis
- **DOT file output**: Generate standard DOT files for use with Graphviz or other visualization tools

## Screenshots

### Project Dependencies

![Project Dependencies](resources/csharp-project-dependencies.gif)

Select view->Command Palette: `C#: Generate Dependency Graph` and select `Project Dependencies`
Graph is generated in  the selected folder. You can open it in Graphviz, Graphviz Online or Graphviz Preview

### Class Dependencies

Select view->Command Palette: `C#: Generate Dependency Graph` and select `Class Dependencies`
Graph is generated in  the selected folder. You can open it in Graphviz, Graphviz Online or Graphviz Preview

![Class Dependencies](resources/csharp-class-dependencies.gif)

Another example of class dependencies
![C# Dependency Graph](resources/graph_example.png)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "C# Dependency Graph"
4. Click Install

### Manual Installation

1. Download the .vsix file from the [releases page](https://github.com/magic5644/vscode-csharp-dependency-graph/releases)
2. In VS Code, go to Extensions (Ctrl+Shift+X)
3. Click on the "..." menu (top-right) and select "Install from VSIX..."
4. Select the downloaded .vsix file

## Requirements

- Visual Studio Code 1.75.0 or higher
- A C# project (typically a .NET solution with .csproj files)

## Usage

### Generating a Dependency Graph

1. Open a folder containing C# projects in VS Code
2. Press `Ctrl+Shift+P` to open the command palette
3. Type "C#: Generate Dependency Graph" and select the command
4. If solution (.sln) files are found, you'll be asked if you want to use one of them
5. Choose the type of dependency graph:
   - **Project Dependencies**: Shows relationships between projects
   - **Class Dependencies**: Shows detailed relationships between classes
6. Select where to save the .dot file
7. The graph will be generated and saved to the specified location

### Viewing the Graph

You can view the generated .dot file using:

- VS Code extensions like [Graphviz Preview](https://marketplace.visualstudio.com/items?itemName=EFanZh.graphviz-preview)
- Online tools like [Graphviz Online](https://dreampuf.github.io/GraphvizOnline/)
- Desktop applications like [Graphviz](https://graphviz.org/)

### Example Class Dependency Graph

Here's an example of a class dependency graph generated by the extension:

## Extension Settings

This extension contributes the following settings:

- `csharpDependencyGraph.useSolutionFile`: Enable or disable using .sln files to identify projects (default: true)
- `csharpDependencyGraph.includeNetVersion`: Include .NET framework version in project nodes (default: true)
- `csharpDependencyGraph.classDependencyColor`: Color for the class dependency graph background (default: lightgray)
- `csharpDependencyGraph.excludeTestProjects`: Exclude test projects from the dependency graph (default: true)
- `csharpDependencyGraph.testProjectPatterns`: Glob patterns to identify test projects
- `csharpDependencyGraph.excludeSourcePatterns`: Glob patterns for source files to exclude from analysis

## How It Works

The extension works by:

1. Finding and parsing .sln files (if enabled) or searching for all .csproj files in the workspace
2. Parsing the project files to extract project references
3. For class-level analysis, parsing all C# files to extract class dependencies including:
   - Inheritance relationships
   - Field and property types
   - Method parameter and return types
   - Static method calls
   - Object instantiations
4. Generating a DOT file representation of the dependency graph

## Code organization

```mermaid
classDiagram
  direction LR

  class Extension {
      +activate(context: vscode.ExtensionContext)
  }

  class GraphGenerator {
      +generateDotFile(projects: Project[], options: GraphOptions, classDependencies?: ClassDependency[]): string
      +generateClassDependencyGraph(projects: Project[], classDependencies: ClassDependency[], options: GraphOptions): string
  }

  class CsprojFinder {
      +findCsprojFiles(workspaceFolder: string, excludeTestProjects: boolean, testProjectPatterns: string[], useSolutionFile: boolean): Promise<string[]>
  }

  class CsprojParser {
      +parseCsprojFiles(csprojPaths: string[]): Promise<Project[]>
  }

  class SlnParser {
      +findSolutionFiles(directoryPath: string): Promise<string[]>
      +parseSolutionFile(slnFilePath: string): Promise<string[]>
  }

  class CsharpSourceFinder {
      +findCSharpSourceFiles(workspaceFolder: string): Promise<string[]>
  }

  class CsharpClassParser {
      +parseClassDependencies(sourceFiles: string[]): Promise<ClassDependency[]>
  }

  Extension --> GraphGenerator
  Extension --> CsprojFinder
  Extension --> CsprojParser
  Extension --> CsharpSourceFinder
  Extension --> CsharpClassParser
  Extension --> SlnParser
  CsprojFinder --> SlnParser
```

## Known Issues

- Very large codebases with many classes may generate complex graphs that are difficult to render
- Some complex C# syntax constructs might not be correctly parsed for class dependencies
- The extension currently only analyzes direct project references in .csproj files, not transitive package references

## Release Notes

### Next Release

### 0.4.0

- **Added** support for solution (.sln) files to correctly identify all projects in the solution structure
- **Fixed** issue where test projects were not being excluded from the dependency graph
- **Fixed** issue when some class dependencies were not being correctly identified

### 0.2.0

- Changed default class dependency color from lightgrey to lightblue
- Improved description for class dependency color

### 0.1.0

Initial release:

- Project dependency graph generation
- Class dependency graph generation
- Customizable graph output
- Test project filtering

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the [MIT License](LICENSE).
