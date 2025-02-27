# C# Dependency Graph Generator for VS Code

This extension generates a visual dependency graph for C# projects in your workspace.

## Features

- Generate a dependency graph of C# projects (.csproj files)
- Exclude test projects from the graph
- Include or exclude .NET version information in the graph
- Save the graph as a .dot file that can be visualized with tools like Graphviz

## Requirements

- VS Code 1.60.0 or higher
- A workspace containing C# projects

## Usage

1. Open a folder containing C# projects
2. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run the command: "Generate C# Dependency Graph"
4. Choose a location to save the .dot file
5. The dependency graph will be generated and saved to the selected location

## Extension Settings

This extension contributes the following settings:

- `csharpDependencyGraph.includeNetVersion`: Enable/disable showing .NET version in the graph
- `csharpDependencyGraph.excludePatterns`: Array of glob patterns to exclude test projects

## Visualizing the Graph

You can visualize the generated .dot file using:

- [Graphviz](https://graphviz.org/) - Open-source graph visualization software
- Online tools like [WebGraphviz](http://www.webgraphviz.com/) or [Viz.js](http://viz-js.com/)
- VS Code extensions like "Graphviz Preview"

## Example Graph

``` graphviz
digraph DependencyGraph {
  graph [rankdir=LR];
  node [shape=box, style=filled, fillcolor=lightblue];

  "ProjectA" [label="ProjectA\n[net6.0]"];
  "ProjectB" [label="ProjectB\n[net6.0]"];
  "ProjectC" [label="ProjectC\n[net6.0]"];

  "ProjectA" -> "ProjectB";
  "ProjectA" -> "ProjectC";
  "ProjectB" -> "ProjectC";
}
```

## License

This extension is licensed under the MIT License.
