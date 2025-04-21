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
import { sanitizeDotContent } from './dotSanitizer';
import { 
  detectProjectCycles, 
  detectClassCycles, 
  generateDotWithHighlightedCycles, 
  generateCyclesOnlyGraph, 
  generateCycleReport,
  CycleAnalysisResult,
  Cycle 
} from './cycleDetector';

interface DependencyGraphConfig {
  includeNetVersion: boolean;
  includePackageDependencies: boolean;
  excludeTestProjects: boolean;
  testProjectPatterns: string[];
  useSolutionFile: boolean;
  classDependencyColor: string;
  packageNodeColor: string;
  cyclicDependencyColor: string;
  excludeSourcePatterns: string[];
  openPreviewOnGraphvizFileOpen: boolean;
  detectCyclicDependencies: boolean;
}

// Store cycle analysis results for use across commands
let lastCycleAnalysisResult: CycleAnalysisResult | null = null;
let lastDotContent: string | null = null;
let lastGraphTitle: string | null = null;

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

/**
 * Enhances a graph with default styling attributes if they're not already present
 * @param content The DOT graph content
 * @returns Enhanced DOT graph content
 */

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

  // Register cycle analysis commands
  registerCycleAnalysisCommands(context, graphPreviewProvider);

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
    cyclicDependencyColor: config.get<string>(
      "cyclicDependencyColor",
      "#FF0000"
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
    detectCyclicDependencies: config.get<boolean>(
      "detectCyclicDependencies",
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
        project.targetFramework ??= "unknown";
      });

      let dotContent: string;
      let cycleAnalysisResult: CycleAnalysisResult | null = null;

      if (generateClassGraph) {
        const { dotContent: classDotContent, cycleAnalysis } = await generateClassDependencyGraph(
          csprojFiles,
          projects,
          config,
          progress
        );
        dotContent = classDotContent;
        cycleAnalysisResult = cycleAnalysis;
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

        // Detect cycles if enabled
        if (config.detectCyclicDependencies) {
          progress.report({ message: "Analyzing dependency cycles..." });
          cycleAnalysisResult = detectProjectCycles(projects);
          
          if (cycleAnalysisResult.cycles.length > 0) {
            dotContent = generateDotWithHighlightedCycles(dotContent, cycleAnalysisResult.cycles);
          }
        }
      }

      // Store results for later use
      lastCycleAnalysisResult = cycleAnalysisResult;
      lastDotContent = dotContent;
      lastGraphTitle = path.basename(saveUri.fsPath);

      // Write the file
      fs.writeFileSync(saveUri.fsPath, dotContent);

      return saveUri.fsPath;
    }
  );

  // Show completion message and options with additional cycle detection info
  const actions = ["Open File", "Preview"];
  
  if (lastCycleAnalysisResult && lastCycleAnalysisResult.cycles.length > 0) {
    actions.push("View Cycles", "Generate Report");
  }
  
  vscode.window
    .showInformationMessage(
      `Dependency graph saved to ${path.basename(filePath)}${lastCycleAnalysisResult?.cycles.length ? 
        ` (${lastCycleAnalysisResult.cycles.length} cycles detected)` : 
        ''}`,
      ...actions
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
        const sanitizeResult = sanitizeDotContent(dotContent);
        graphPreviewProvider.showPreview(
          sanitizeResult.content,
          title,
          filePath
        );
      } else if (selection === "View Cycles" && lastCycleAnalysisResult) {
        showCyclesOnlyGraph(graphPreviewProvider);
      } else if (selection === "Generate Report" && lastCycleAnalysisResult) {
        generateAndShowCycleReport(workspaceFolder);
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
): Promise<{ dotContent: string, cycleAnalysis: CycleAnalysisResult | null }> {
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
    
    let dotContent = generateDotFile(
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

    let cycleAnalysis: CycleAnalysisResult | null = null;
    
    // Detect cycles if enabled
    if (config.detectCyclicDependencies) {
      progress.report({ message: "Analyzing class dependency cycles..." });
      cycleAnalysis = detectClassCycles(classDependencies);
      
      if (cycleAnalysis.cycles.length > 0) {
        dotContent = generateDotWithHighlightedCycles(dotContent, cycleAnalysis.cycles);
      }
    }

    return { dotContent, cycleAnalysis };
  } catch (error) {
    console.error("Error during class analysis:", error);
    // Fallback to project-level graph if class analysis fails
    progress.report({
      message:
        "Class analysis failed, generating project-level graph instead...",
    });
    
    const dotContent = generateDotFile(projects, {
      includeNetVersion: config.includeNetVersion,
      includeClassDependencies: false,
      classDependencyColor: config.classDependencyColor,
      includePackageDependencies: config.includePackageDependencies,
      packageNodeColor: config.packageNodeColor,
    });
    
    return { dotContent, cycleAnalysis: null };
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
          const sanitizeResult = sanitizeDotContent(dotContent);
          graphPreviewProvider.showPreview(
            sanitizeResult.content,
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
        const sanitizeResult = sanitizeDotContent(dotContent);
        graphPreviewProvider.showPreview(
          sanitizeResult.content,
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

function registerCycleAnalysisCommands(
  context: vscode.ExtensionContext,
  graphPreviewProvider: GraphPreviewProvider
): void {
  // Register command to analyze cycles in a dependency graph
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-csharp-dependency-graph.analyze-cycles",
      async (fileUri?: vscode.Uri) => {
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder open");
            return;
          }

          let dotFilePath: string;
          let dotContent: string;

          // Check if command was triggered from the context menu (via explorer)
          if (fileUri && (fileUri.fsPath.endsWith('.dot') || fileUri.fsPath.endsWith('.gv'))) {
            // Command triggered from explorer context menu
            dotFilePath = fileUri.fsPath;
            dotContent = fs.readFileSync(dotFilePath, 'utf8');
          } else {
            // Check if there's an active editor
            const editor = vscode.window.activeTextEditor;
            if (!editor || (!editor.document.fileName.endsWith('.dot') && !editor.document.fileName.endsWith('.gv'))) {
              vscode.window.showErrorMessage("Please open a Graphviz (.dot/.gv) file for analysis");
              return;
            }
            
            dotFilePath = editor.document.fileName;
            dotContent = editor.document.getText();
          }

          // Store content and title for later use
          lastDotContent = dotContent;
          lastGraphTitle = path.basename(dotFilePath);

          // Start progress indicator
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing dependency cycles...",
            cancellable: false,
          }, async (progress) => {
            // Attempt to get the projects or class dependencies by extracting from the DOT content
            // This is a simplified approach - extract node definitions
            const nodeRegex = /"([^"]+)"\s*\[/g;
            const edgeRegex = /"([^"]+)"\s*->\s*"([^"]+)"/g;
            
            const nodes = new Set<string>();
            const edges = new Map<string, string[]>();
            
            let match;
            while ((match = nodeRegex.exec(dotContent)) !== null) {
              nodes.add(match[1]);
            }
            
            // Reset lastIndex to start from the beginning
            edgeRegex.lastIndex = 0;
            
            while ((match = edgeRegex.exec(dotContent)) !== null) {
              const source = match[1];
              const target = match[2];
              
              if (!edges.has(source)) {
                edges.set(source, []);
              }
              
              edges.get(source)!.push(target);
            }
            
            // Convert to Project or ClassDependency structure
            const isClassGraph = dotContent.includes("cluster_");
            
            if (isClassGraph) {
              // This is a simplified approach for demonstration
              // In a real implementation, you would parse the DOT to recover the full class structure
              progress.report({ message: "Reconstructing class dependencies..." });
              
              // Create a simulated class dependency structure
              const simClasses = Array.from(nodes).map(nodeName => {
                // Extract project name and class name (if in format "ProjectName.ClassName")
                const parts = nodeName.split('.');
                const projectName = parts.length > 1 ? parts[0] : "Unknown";
                const className = parts.length > 1 ? parts[1] : nodeName;
                
                return {
                  projectName,
                  className,
                  namespace: "",
                  filePath: "",
                  dependencies: edges.get(nodeName)?.map(dep => {
                    // Again, simplified extraction of class name
                    const depParts = dep.split('.');
                    return {
                      className: depParts.length > 1 ? depParts[1] : dep,
                      namespace: "",
                      projectName: "external" // Adding the missing projectName field
                    };
                  }) || []
                };
              });
              
              lastCycleAnalysisResult = detectClassCycles(simClasses);
            } else {
              // Create a simulated project structure for project graphs
              progress.report({ message: "Reconstructing project dependencies..." });
              
              const simProjects = Array.from(nodes)
                .filter(node => !node.includes('~')) // Filter out package nodes which often contain ~ in DOT
                .map(projectName => ({
                  name: projectName,
                  path: "", // Adding the missing path field
                  dependencies: edges.get(projectName) || [],
                  packageDependencies: [],
                  targetFramework: ""
                }));
              
              lastCycleAnalysisResult = detectProjectCycles(simProjects);
            }
            
            if (!lastCycleAnalysisResult || lastCycleAnalysisResult.cycles.length === 0) {
              vscode.window.showInformationMessage("No dependency cycles detected in the graph");
              return;
            }
            
            // Add highlighting to cycles
            progress.report({ message: "Highlighting cycles in graph..." });
            const highlightedDotContent = generateDotWithHighlightedCycles(
              dotContent, 
              lastCycleAnalysisResult.cycles
            );
            
            // Preview the highlighted graph
            const sanitizeResult = sanitizeDotContent(highlightedDotContent);
            const cyclesOnlyDot = generateCyclesOnlyGraph(lastCycleAnalysisResult.cycles);
            const cyclesOnlySanitized = sanitizeDotContent(cyclesOnlyDot);
            graphPreviewProvider.showPreview(
              sanitizeResult.content,
              `${lastGraphTitle} (With Cycles)`,
              dotFilePath,
              cyclesOnlySanitized.content // Pass the cycles-only content
            );
          });
          
          // Show options based on analysis results
          if (lastCycleAnalysisResult && lastCycleAnalysisResult.cycles.length > 0) {
            vscode.window.showInformationMessage(
              `${lastCycleAnalysisResult.cycles.length} cycles detected in the dependency graph`,
              "View Cycles Only", 
              "Generate Report"
            ).then(selection => {
              if (selection === "View Cycles Only") {
                showCyclesOnlyGraph(graphPreviewProvider);
              } else if (selection === "Generate Report") {
                generateAndShowCycleReport(workspaceFolder);
              }
            });
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error analyzing cycles: ${errorMessage}`);
        }
      }
    )
  );

  // Register command to generate a cycle report
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-csharp-dependency-graph.generate-cycle-report",
      async (fileUri?: vscode.Uri) => {
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder open");
            return;
          }

          // If we already have analysis results, use them
          if (!lastCycleAnalysisResult && fileUri) {
            // Run the analysis command first to get the results
            await vscode.commands.executeCommand("vscode-csharp-dependency-graph.analyze-cycles", fileUri);
            
            // If analysis failed or no cycles were detected
            if (!lastCycleAnalysisResult) {
              return;
            }
          } else if (!lastCycleAnalysisResult) {
            vscode.window.showErrorMessage(
              "No cycle analysis results available. Please analyze a dependency graph first."
            );
            return;
          }

          generateAndShowCycleReport(workspaceFolder);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Error generating cycle report: ${errorMessage}`);
        }
      }
    )
  );
}

function showCyclesOnlyGraph(graphPreviewProvider: GraphPreviewProvider): void {
  if (!lastCycleAnalysisResult || !lastGraphTitle) {
    vscode.window.showErrorMessage("No cycle analysis results available");
    return;
  }

  const cyclesOnlyDot = generateCyclesOnlyGraph(lastCycleAnalysisResult.cycles);
  const sanitizeResult = sanitizeDotContent(cyclesOnlyDot);
  
  graphPreviewProvider.showPreview(
    sanitizeResult.content,
    `${lastGraphTitle} (Cycles Only)`,
    undefined,
    sanitizeResult.content // Pass the same content as cyclesOnlyDotContent
  );
}

async function generateAndShowCycleReport(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  if (!lastCycleAnalysisResult || !lastGraphTitle) {
    vscode.window.showErrorMessage("No cycle analysis results available");
    return;
  }

  // Generate report content
  const reportContent = generateCycleReport(lastCycleAnalysisResult);
  
  // Create a temporary markdown file to show the report
  const reportFileName = `${lastGraphTitle.replace('.dot', '')}-cycle-report.md`;
  const reportPath = path.join(workspaceFolder.uri.fsPath, reportFileName);
  
  // Save the report
  fs.writeFileSync(reportPath, reportContent);
  
  // Open the report file
  vscode.commands.executeCommand("vscode.open", vscode.Uri.file(reportPath));
  
  vscode.window.showInformationMessage(`Cycle analysis report saved to ${reportFileName}`);
}

export function deactivate() {}
