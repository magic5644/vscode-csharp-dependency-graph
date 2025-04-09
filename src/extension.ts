import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { findCsprojFiles } from "./csprojFinder";
import { parseCsprojFiles, Project } from "./csprojParser";
import { generateDotFile } from "./graphGenerator";
import { findCSharpSourceFiles } from "./csharpSourceFinder";
import { parseClassDependencies } from "./csharpClassParser";
import { findSolutionFiles, parseSolutionFile } from "./slnParser";
import { minimatch } from "minimatch";
import { GraphPreviewProvider } from "./graphPreview";
import { prepareVizJs } from "./vizInitializer";
import sanitizeHtml from "sanitize-html";

interface DependencyGraphConfig {
  includeNetVersion: boolean;
  includePackageDependencies: boolean;
  excludeTestProjects: boolean;
  testProjectPatterns: string[];
  useSolutionFile: boolean;
  classDependencyColor: string;
  packageNodeColor: string;
  excludeSourcePatterns: string[];
  openPreviewOnGraphvizFileOpen: boolean;
}

/**
 * Checks if a file path matches a given pattern
 */
function isPathMatchingPattern(filePath: string, pattern: string): boolean {
  const fileName = path.basename(filePath);
  return pattern.includes("/")
    ? minimatch(filePath, pattern)
    : minimatch(fileName, pattern);
}

/**
 * Checks if a file path matches any of the provided patterns
 */
function isPathMatchingAnyPattern(
  filePath: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => isPathMatchingPattern(filePath, pattern));
}

function sanitizeDotContent(dotContent: string): string {
  // Verify that content looks like a DOT graph - Limit characters to avoid excessive backtracking
  const dotGraphRegex = /^\s*(?:di)?graph\s+[\w"{}][^\n]{0,100}/i;
  if (!dotGraphRegex.exec(dotContent.trim())) {
    console.warn("Warning: Content doesn't appear to be a valid DOT graph");
  }

  // Add global graph attributes to improve edge rendering
  if (dotContent.includes('digraph') && !dotContent.includes('splines=')) {
    // Add graph attributes to optimize rendering, especially when multiple edges are close
    // Utiliser une regex plus simple et plus sûre
    dotContent = dotContent.replace(
      /digraph\s+[\w"]+\s*\{/i,
      match => `${match}\n  // Graph attributes for better edge rendering\n  graph [splines=polyline, overlap=false, nodesep=0.8, ranksep=1.0];\n  edge [penwidth=1.5, arrowsize=0.8];\n  node [shape=box, style=filled, fillcolor=aliceblue];\n`
    );
  }

  // Sanitize HTML in label attributes
  dotContent = dotContent.replace(
    /label\s*=\s*["']([^"']*)["']/gi,
    (_match, labelContent) => {
      const sanitized = sanitizeHtml(labelContent, {
        allowedTags: [],
        allowedAttributes: {},
      });
      return `label="${sanitized}"`;
    }
  );

  // Fix common issues with node/edge definitions that can cause rendering problems
  dotContent = dotContent 
    // Ensure proper spacing in edge definitions
    .replace(/->(\S)/g, '-> $1')
    
    // Fix issues with quotes within node attributes - Pas de backtracking possible
    .replace(/label\s*=\s*"([^"]*)"/g, (match) => {
      return match.replace(/\\"/g, '\\\\"');
    })

  return dotContent;
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    await initializeVizJs(context);
  } catch (error) {
    console.error("Error initializing Viz.js:", error);
    vscode.window.showWarningMessage(
      "C# Dependency Graph: Error initializing visualization. Preview may not work correctly."
    );
  }

  const graphPreviewProvider = new GraphPreviewProvider(context.extensionUri);

  // Register main command
  registerDependencyGraphCommand(context, graphPreviewProvider);

  // Register preview command
  registerGraphvizPreviewCommand(context, graphPreviewProvider);

  // Setup auto-preview for Graphviz files
  setupAutoPreview(graphPreviewProvider);
}

async function initializeVizJs(context: vscode.ExtensionContext): Promise<void> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Initializing Viz.js...",
      cancellable: false,
    },
    async () => {
      await prepareVizJs(context.extensionUri);
    }
  );
}

function registerDependencyGraphCommand(
  context: vscode.ExtensionContext,
  graphPreviewProvider: GraphPreviewProvider
): void {
  const disposable = vscode.commands.registerCommand(
    "vscode-csharp-dependency-graph.generate-dependency-graph",
    async () => {
      try {
        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        // Get configuration
        const config = loadConfiguration();

        // Find and select solution file
        const selectedSolutionFile = await findAndSelectSolutionFile(
          workspaceFolder,
          config
        );
        if (selectedSolutionFile === null) {
          return; // User cancelled
        }

        // Select graph type
        const graphType = await selectGraphType();
        if (!graphType) {
          return; // User cancelled
        }

        const generateClassGraph =
          graphType.label === "Class Dependencies";
        const baseFilename = generateClassGraph
          ? "class-dependency-graph"
          : "project-dependency-graph";

        // Get file save location
        const saveUri = await getSaveLocation(
          workspaceFolder,
          baseFilename
        );
        if (!saveUri) {
          return; // User cancelled
        }

        await generateAndSaveGraph(
          workspaceFolder,
          saveUri,
          selectedSolutionFile,
          generateClassGraph,
          config,
          graphPreviewProvider
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error: ${errorMessage}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

function loadConfiguration() {
  const config = vscode.workspace.getConfiguration(
    "csharpDependencyGraph"
  );
  return {
    includeNetVersion: config.get<boolean>("includeNetVersion", true),
    includePackageDependencies: config.get<boolean>(
      "includePackageDependenciesInProjectGraph",
      true
    ),
    excludeTestProjects: config.get<boolean>("excludeTestProjects", true),
    testProjectPatterns: config.get<string[]>("testProjectPatterns", [
      "*Test*",
      "*Tests*",
      "*TestProject*",
    ]),
    useSolutionFile: config.get<boolean>("useSolutionFile", true),
    classDependencyColor: config.get<string>(
      "classDependencyColor",
      "lightgray"
    ),
    packageNodeColor: config.get<string>(
      "packageDependencyColor",
      "#ffcccc"
    ),
    excludeSourcePatterns: config.get<string[]>(
      "excludeSourcePatterns",
      [
        "**/obj/**",
        "**/bin/**",
        "**/Generated/**",
        "**/node_modules/**",
      ]
    ),
    openPreviewOnGraphvizFileOpen: config.get<boolean>(
      "openPreviewOnGraphvizFileOpen",
      true
    ),
  };
}

async function findAndSelectSolutionFile(
  workspaceFolder: vscode.WorkspaceFolder,
  config: DependencyGraphConfig
): Promise<string | undefined | null> {
  // Find solution files if enabled
  let slnFiles: string[] = [];
  if (config.useSolutionFile) {
    slnFiles = await findSolutionFiles(workspaceFolder.uri.fsPath);
  }

  // Ask user to choose a solution file if multiple are found
  if (slnFiles.length > 1) {
    const slnOptions = slnFiles.map((file) => ({
      label: path.basename(file),
      description: file,
      file: file,
    }));

    const selection = await vscode.window.showQuickPick(
      [
        {
          label: "Scan for all .csproj files",
          description: "Find all projects by scanning directories",
          file: "",
        },
        ...slnOptions,
      ],
      {
        placeHolder: "Select a solution file or scan for all projects",
      }
    );

    if (!selection) {
      return null; // User cancelled
    }

    return selection.file || undefined;
  } else if (slnFiles.length === 1) {
    // If only one solution file is found, ask if the user wants to use it
    const useSlnFile = await vscode.window.showQuickPick(
      ["Use solution file", "Scan for all projects"],
      {
        placeHolder: `Found solution file: ${path.basename(slnFiles[0])}`,
      }
    );

    if (useSlnFile === "Use solution file") {
      return slnFiles[0];
    } else if (!useSlnFile) {
      return null; // User cancelled
    }
  }

  return undefined; // No solution file selected, scan for all projects
}

async function selectGraphType() {
  return vscode.window.showQuickPick(
    [
      {
        label: "Project Dependencies",
        description: "Generate graph with project-level dependencies",
      },
      {
        label: "Class Dependencies",
        description:
          "Generate detailed graph with class-level dependencies",
      },
    ],
    { placeHolder: "Select the type of dependency graph to generate" }
  );
}

async function getSaveLocation(
  workspaceFolder: vscode.WorkspaceFolder,
  baseFilename: string
): Promise<vscode.Uri | undefined> {
  const defaultPath = path.join(
    workspaceFolder.uri.fsPath,
    `${baseFilename}.dot`
  );

  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPath),
    filters: {
      "Dot files": ["dot"],
      "All files": ["*"],
    },
    title: "Save Dependency Graph",
  });
}

async function generateAndSaveGraph(
  workspaceFolder: vscode.WorkspaceFolder,
  saveUri: vscode.Uri,
  selectedSolutionFile: string | undefined,
  generateClassGraph: boolean,
  config: DependencyGraphConfig,
  graphPreviewProvider: GraphPreviewProvider
): Promise<void> {
  const filePath = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating dependency graph...",
      cancellable: false,
    },
    async (progress) => {
      // Find all .csproj files
      progress.report({ message: "Finding project files..." });

      const csprojFiles: string[] = await getCsprojFiles(
        workspaceFolder,
        selectedSolutionFile,
        config
      );

      if (csprojFiles.length === 0) {
        throw new Error("No .csproj files found in the workspace");
      }
      // Parse .csproj files to extract dependencies
      progress.report({ message: "Parsing .csproj files..." });
      const projects: Project[] = await parseCsprojFiles(csprojFiles);
      
      // Ensure packageDependencies exists and targetFramework is set
      projects.forEach(project => {
        project.packageDependencies = project.packageDependencies || [];
        // Ensure targetFramework is always defined to meet Project interface requirements
        if (project.targetFramework === undefined) {
          project.targetFramework = "unknown";
        }
      });

      let dotContent: string;

      if (generateClassGraph) {
        dotContent = await generateClassDependencyGraph(
          csprojFiles,
          projects,
          config,
          progress
        );
      } else {
        // Generate the DOT file with project dependencies only
        progress.report({
          message: "Generating .dot file with project dependencies...",
        });
        dotContent = generateDotFile(projects, {
          includeNetVersion: config.includeNetVersion,
          includeClassDependencies: false,
          classDependencyColor: config.classDependencyColor,
          includePackageDependencies: config.includePackageDependencies,
          packageNodeColor: config.packageNodeColor,
        });
      }

      // Write the file
      fs.writeFileSync(saveUri.fsPath, dotContent);

      return saveUri.fsPath;
    }
  );

  // Show completion message and options
  vscode.window
    .showInformationMessage(
      `Dependency graph saved to ${path.basename(filePath)}`,
      "Open File",
      "Preview"
    )
    .then((selection) => {
      if (selection === "Open File") {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.file(filePath)
        );
      } else if (selection === "Preview") {
        const dotContent = fs.readFileSync(filePath, "utf8");
        const title = path.basename(filePath);
        graphPreviewProvider.showPreview(
          sanitizeDotContent(dotContent),
          title,
          filePath
        );
      }
    });
}

async function getCsprojFiles(
  workspaceFolder: vscode.WorkspaceFolder,
  selectedSolutionFile: string | undefined,
  config: DependencyGraphConfig
): Promise<string[]> {
  let csprojFiles: string[];

  if (selectedSolutionFile) {
    // If a solution file is selected, use that
    csprojFiles = await parseSolutionFile(selectedSolutionFile);

    // Filter out test projects if needed
    if (config.excludeTestProjects) {
      csprojFiles = csprojFiles.filter(
        (filePath) =>
          !isPathMatchingAnyPattern(filePath, config.testProjectPatterns)
      );
    }
  } else {
    // Otherwise search for all .csproj files
    csprojFiles = await findCsprojFiles(
      workspaceFolder.uri.fsPath,
      config.excludeTestProjects,
      config.testProjectPatterns,
      false // Don't use solution file since we already checked
    );
  }

  return csprojFiles;
}

async function generateClassDependencyGraph(
  csprojFiles: string[],
  projects: Project[],
  config: DependencyGraphConfig,
  progress: vscode.Progress<{ message?: string }>
): Promise<string> {
  try {
    // Find C# source files and parse class dependencies
    progress.report({ message: "Finding C# source files..." });
    const projectSourceFiles = await findCSharpSourceFiles(
      csprojFiles,
      config.excludeSourcePatterns
    );

    // Verify that source files were found
    const totalSourceFiles = Array.from(
      projectSourceFiles.values()
    ).reduce((sum, files) => sum + files.length, 0);

    if (totalSourceFiles === 0) {
      throw new Error("No C# source files found in the projects");
    }

    progress.report({
      message: `Analyzing class dependencies in ${totalSourceFiles} files...`,
    });
    const classDependencies = await parseClassDependencies(
      projectSourceFiles
    );

    if (classDependencies.length === 0) {
      throw new Error("No classes found in the source files");
    }

    // Generate the DOT file with class dependencies
    progress.report({
      message: `Generating .dot file with ${classDependencies.length} classes...`,
    });
    return generateDotFile(
      projects,
      {
        includeNetVersion: config.includeNetVersion,
        includeClassDependencies: true,
        classDependencyColor: config.classDependencyColor,
        includePackageDependencies: config.includePackageDependencies,
        packageNodeColor: config.packageNodeColor,
      },
      classDependencies
    );
  } catch (error) {
    console.error("Error during class analysis:", error);
    // Fallback to project-level graph if class analysis fails
    progress.report({
      message:
        "Class analysis failed, generating project-level graph instead...",
    });
    return generateDotFile(projects, {
      includeNetVersion: config.includeNetVersion,
      includeClassDependencies: false,
      classDependencyColor: config.classDependencyColor,
      includePackageDependencies: config.includePackageDependencies,
      packageNodeColor: config.packageNodeColor,
    });
  }
}

function registerGraphvizPreviewCommand(
  context: vscode.ExtensionContext,
  graphPreviewProvider: GraphPreviewProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-csharp-dependency-graph.previewGraphviz",
      () => {
        const editor = vscode.window.activeTextEditor;
        if (
          editor &&
          (editor.document.languageId === "dot" ||
            editor.document.fileName.endsWith(".dot") ||
            editor.document.fileName.endsWith(".gv"))
        ) {
          const dotContent = editor.document.getText();
          const title = path.basename(editor.document.fileName);
          graphPreviewProvider.showPreview(
            sanitizeDotContent(dotContent),
            title,
            editor.document.fileName
          );
        } else {
          vscode.window.showErrorMessage(
            "No Graphviz file is currently open."
          );
        }
      }
    )
  );
}

function setupAutoPreview(
  graphPreviewProvider: GraphPreviewProvider
): void {
  const config = vscode.workspace.getConfiguration(
    "csharpDependencyGraph"
  );
  const openPreviewOnGraphvizFileOpen = config.get<boolean>(
    "openPreviewOnGraphvizFileOpen",
    true
  );

  // Set to track files that have already been previewed
  const previewedFiles = new Set<string>();

  if (openPreviewOnGraphvizFileOpen) {
    vscode.workspace.onDidOpenTextDocument((document) => {
      // Skip if this file has already been previewed
      if (previewedFiles.has(document.fileName)) {
        return;
      }
      
      if (
        document.languageId === "dot" ||
        document.fileName.endsWith(".dot") ||
        document.fileName.endsWith(".gv")
      ) {
        // Add to previewed files set
        previewedFiles.add(document.fileName);
        
        const dotContent = document.getText();
        const title = path.basename(document.fileName);
        graphPreviewProvider.showPreview(
          sanitizeDotContent(dotContent),
          title,
          document.fileName
        );
      }
    });

    // Reset the set when a file is closed (to allow re-preview if reopened)
    vscode.workspace.onDidCloseTextDocument((document) => {
      previewedFiles.delete(document.fileName);
    });
  }
}

export function deactivate() {}
