import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { findCsprojFiles } from "./csprojFinder";
import { parseCsprojFiles, Project } from "./csprojParser";
import { generateDotFile } from "./graphGeneratorAdapter";
import { findCSharpSourceFiles } from "./csharpSourceFinder";
import { parseClassDependencies } from "./csharpClassParser";
import { findSolutionFiles, parseSolutionFile } from "./slnParser";
import { minimatch } from "minimatch";
import { GraphPreviewProvider } from "./graphPreview";
import { prepareVizJs } from "./vizInitializer";
import { sanitizeDotContent } from './dotSanitizer';
import { DotParser } from './dotParser';
import { 
  detectProjectCycles, 
  detectClassCycles, 
  generateDotWithHighlightedCycles, 
  generateCyclesOnlyGraph, 
  generateCycleReport,
  CycleAnalysisResult
} from './cycleDetector';

// Modern UX components
import { NotificationManager } from './notifications/NotificationManager';
import { StatusBarManager } from './statusbar/StatusBarManager';
import { KeybindingManager } from './commands/KeybindingManager';
import { ModernGraphWebviewProvider } from './ModernGraphWebviewProvider';

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
let lastGraphTitle: string | null = null;

// Modern UX managers
let notificationManager: NotificationManager;
let statusBarManager: StatusBarManager;
let keybindingManager: KeybindingManager;
let modernGraphProvider: ModernGraphWebviewProvider;

/**
 * Safely registers a VS Code command with error handling for duplicate registrations
 * @param context The extension context
 * @param commandId The command identifier
 * @param handler The command handler function
 * @returns The disposable if successful, null if the command was already registered
 */
async function safeRegisterCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  handler: (...args: any[]) => any
): Promise<vscode.Disposable | null> {
  try {
    // Check if command already exists
    const existingCommands = await vscode.commands.getCommands(true);
    if (existingCommands.includes(commandId)) {
      console.warn(`Command ${commandId} already exists, skipping registration...`);
      return null;
    }

    const disposable = vscode.commands.registerCommand(commandId, handler);
    context.subscriptions.push(disposable);
    return disposable;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.warn(`Command ${commandId} already registered, skipping...`);
      return null;
    } else {
      console.error(`Error registering command ${commandId}:`, error);
      throw error;
    }
  }
}

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
 **/

export async function activate(context: vscode.ExtensionContext) {
  try {
    console.log('C# Dependency Graph extension is being activated...');
    
    await initializeVizJs(context);
  } catch (error) {
    console.error("Error initializing Viz.js:", error);
    vscode.window.showWarningMessage(
      "C# Dependency Graph: Error initializing visualization. Preview may not work correctly."
    );
  }

  try {
    // Initialize modern UI components
    notificationManager = NotificationManager.getInstance();
    statusBarManager = StatusBarManager.getInstance();
    keybindingManager = KeybindingManager.getInstance();
    modernGraphProvider = new ModernGraphWebviewProvider(context.extensionUri, context);

    // Register the webview provider
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ModernGraphWebviewProvider.viewType,
        modernGraphProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );

    // Add to disposables
    context.subscriptions.push(
      notificationManager,
      statusBarManager,
      keybindingManager,
      modernGraphProvider
    );

    const graphPreviewProvider = new GraphPreviewProvider(context.extensionUri);

    // Register commands with error handling
    try {
      // Register main command
      await registerDependencyGraphCommand(context, graphPreviewProvider);
      console.log('Registered main dependency graph command');

      // Register preview command
      await registerGraphvizPreviewCommand(context, graphPreviewProvider);
      console.log('Registered Graphviz preview command');

      // Register cycle analysis commands
      await registerCycleAnalysisCommands(context, graphPreviewProvider);
      console.log('Registered cycle analysis commands');

      // Register modern graph commands
      await registerModernGraphCommands(context);
      console.log('Registered modern graph commands');
    } catch (error) {
      console.error('Error registering commands:', error);
      vscode.window.showErrorMessage(
        `C# Dependency Graph: Error registering commands: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Setup auto-preview for Graphviz files
    try {
      setupAutoPreview(graphPreviewProvider);
      console.log('Setup auto-preview for Graphviz files');
    } catch (error) {
      console.error('Error setting up auto-preview:', error);
    }

    // Initialize keybindings
    try {
      await keybindingManager.initialize(context);
      console.log('Initialized keybindings');
    } catch (error) {
      console.error('Error initializing keybindings:', error);
    }

    console.log('C# Dependency Graph extension activated successfully');
  } catch (error) {
    console.error('Critical error during extension activation:', error);
    vscode.window.showErrorMessage(
      `C# Dependency Graph: Critical activation error: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error; // Re-throw to prevent partial activation
  }
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

async function registerDependencyGraphCommand(
  context: vscode.ExtensionContext,
  graphPreviewProvider: GraphPreviewProvider
): Promise<void> {
  await safeRegisterCommand(
    context,
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
      // Removed unused _lastDotContent assignment
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

/**
 * Helper function to generate graph content for modern UX components
 * @param workspaceFolder The workspace folder to analyze
 * @param selectedSolutionFile Optional solution file to use
 * @param generateClassGraph Whether to generate class or project dependencies
 * @param config Extension configuration
 * @returns Promise with DOT content string
 */
async function generateGraphContent(
  workspaceFolder: vscode.WorkspaceFolder,
  selectedSolutionFile: string | undefined,
  generateClassGraph: boolean,
  config: DependencyGraphConfig
): Promise<string> {
  // Find all .csproj files
  const csprojFiles: string[] = await getCsprojFiles(
    workspaceFolder,
    selectedSolutionFile,
    config
  );

  if (csprojFiles.length === 0) {
    throw new Error("No .csproj files found in the workspace");
  }

  // Parse .csproj files to extract dependencies
  const projects: Project[] = await parseCsprojFiles(csprojFiles);

  // Ensure packageDependencies exists and targetFramework is set
  projects.forEach(project => {
    project.packageDependencies = project.packageDependencies || [];
    project.targetFramework ??= "unknown";
  });

  let dotContent: string;
  let cycleAnalysisResult: CycleAnalysisResult | null = null;

  if (generateClassGraph) {
    const { dotContent: classDotContent, cycleAnalysis } = await generateClassDependencyGraph(
      csprojFiles,
      projects,
      config,
      { report: () => {} } // Simple progress stub for internal use
    );
    dotContent = classDotContent;
    cycleAnalysisResult = cycleAnalysis;
  } else {
    // Generate the DOT file with project dependencies only
    dotContent = generateDotFile(projects, {
      includeNetVersion: config.includeNetVersion,
      includeClassDependencies: false,
      classDependencyColor: config.classDependencyColor,
      includePackageDependencies: config.includePackageDependencies,
      packageNodeColor: config.packageNodeColor,
    });

    // Detect cycles if enabled
    if (config.detectCyclicDependencies) {
      cycleAnalysisResult = detectProjectCycles(projects);
      
      if (cycleAnalysisResult.cycles.length > 0) {
        dotContent = generateDotWithHighlightedCycles(dotContent, cycleAnalysisResult.cycles);
      }
    }
  }

  // Store results for later use
  lastCycleAnalysisResult = cycleAnalysisResult;
  // Removed unused _lastDotContent assignment
  lastGraphTitle = generateClassGraph ? "Class Dependencies" : "Project Dependencies";

  return dotContent;
}

/**
 * Creates simulated class dependencies from DOT graph nodes and edges
 */
function createSimulatedClassDependencies(
  nodes: Set<string>,
  edges: Map<string, string[]>
): { projectName: string; className: string; namespace: string; filePath: string; dependencies: Array<{ className: string; namespace: string; projectName: string }> }[] {
  return Array.from(nodes).map(nodeName => {
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
          projectName: "external"
        };
      }) || []
    };
  });
}

/**
 * Creates simulated project dependencies from DOT graph nodes and edges
 */
function createSimulatedProjectDependencies(
  nodes: Set<string>,
  edges: Map<string, string[]>
): { name: string; path: string; dependencies: string[]; packageDependencies: never[]; targetFramework: string }[] {
  return Array.from(nodes)
    .filter(node => !node.includes('~')) // Filter out package nodes which often contain ~ in DOT
    .map(projectName => ({
      name: projectName,
      path: "",
      dependencies: edges.get(projectName) || [],
      packageDependencies: [],
      targetFramework: ""
    }));
}

/**
 * Creates preview content for cycles in a graph
 */
function createCyclePreviewContent(
  dotContent: string,
  cycles: Array<{ nodes: string[]; type: 'project' | 'class'; complexity: number }>,
  title: string,
  filePath: string
): {
  content: string;
  title: string;
  filePath: string;
  cyclesOnlyContent?: string;
} {
  const highlightedDotContent = generateDotWithHighlightedCycles(dotContent, cycles);
  const sanitizeResult = sanitizeDotContent(highlightedDotContent);
  const cyclesOnlyDot = generateCyclesOnlyGraph(cycles);
  const cyclesOnlySanitized = sanitizeDotContent(cyclesOnlyDot);
  
  return {
    content: sanitizeResult.content,
    title: `${title} (With Cycles)`,
    filePath: filePath,
    cyclesOnlyContent: cyclesOnlySanitized.content
  };
}

/**
 * Handles analysis of DOT content for cycles
 */
async function handleCycleAnalysis(
  dotContent: string, 
  dotFilePath: string,
  progress: vscode.Progress<{ message?: string }>,
  graphPreviewProvider: GraphPreviewProvider
): Promise<void> {
  // Extract nodes and edges from DOT content using the DotParser
  const { nodes, edges, isClassGraph } = DotParser.parse(dotContent);
  
  if (isClassGraph) {
    // In a real implementation, you would parse the DOT to recover the full class structure
    progress.report({ message: "Reconstructing class dependencies..." });
    
    // Create a simulated class dependency structure
    const simClasses = createSimulatedClassDependencies(nodes, edges);
    lastCycleAnalysisResult = detectClassCycles(simClasses);
  } else {
    // Create a simulated project structure for project graphs
    progress.report({ message: "Reconstructing project dependencies..." });
    
    const simProjects = createSimulatedProjectDependencies(nodes, edges);
    lastCycleAnalysisResult = detectProjectCycles(simProjects);
  }
  
  if (!lastCycleAnalysisResult || lastCycleAnalysisResult.cycles.length === 0) {
    vscode.window.showInformationMessage("No dependency cycles detected in the graph");
    return;
  }
  
  // Add highlighting to cycles
  progress.report({ message: "Highlighting cycles in graph..." });
  
  // Create preview for the cycles
  const previewData = createCyclePreviewContent(
    dotContent,
    lastCycleAnalysisResult.cycles,
    lastGraphTitle ?? path.basename(dotFilePath),
    dotFilePath
  );
  
  // Show the preview
  graphPreviewProvider.showPreview(
    previewData.content,
    previewData.title,
    previewData.filePath,
    previewData.cyclesOnlyContent
  );
}

async function registerGraphvizPreviewCommand(
  context: vscode.ExtensionContext,
  graphPreviewProvider: GraphPreviewProvider
): Promise<void> {
  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.previewGraphviz",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (
        editor &&
        (editor.document.languageId === "dot" ||
          editor.document.fileName.endsWith(".dot") ||
          editor.document.fileName.endsWith(".gv"))
      ) {
        const dotContent = editor.document.getText();
        const title = path.basename(editor.document.fileName);
        
        // Store content and title for later use (for cycle analysis)
        // Removed unused _lastDotContent assignment
        lastGraphTitle = title;
        
        // Analyze cycles in the graph before showing preview
        await analyzeCyclesInDotContent(dotContent, editor.document.fileName);
        
        // Now show the preview with cycle data
        const sanitizeResult = sanitizeDotContent(dotContent);
        
        // Only create cycles-only content if cycles were detected
        let cyclesOnlyContent = undefined;
        if (lastCycleAnalysisResult && lastCycleAnalysisResult.cycles.length > 0) {
          const cyclesOnlyDot = generateCyclesOnlyGraph(lastCycleAnalysisResult.cycles);
          const cyclesOnlySanitized = sanitizeDotContent(cyclesOnlyDot);
          cyclesOnlyContent = cyclesOnlySanitized.content;
        }
        
        graphPreviewProvider.showPreview(
          sanitizeResult.content,
          title,
          editor.document.fileName,
          cyclesOnlyContent
        );
      } else {
        vscode.window.showErrorMessage(
          "No Graphviz file is currently open."
        );
      }
    }
  );
}

/**
 * Analyzes the cycles in a DOT content without showing UI feedback
 */
async function analyzeCyclesInDotContent(dotContent: string, _filePath: string): Promise<void> {
  try {
    // Extract nodes and edges from DOT content using the DotParser
    const { nodes, edges, isClassGraph } = DotParser.parse(dotContent);
    
    if (isClassGraph) {
      // Create a simulated class dependency structure
      const simClasses = createSimulatedClassDependencies(nodes, edges);
      lastCycleAnalysisResult = detectClassCycles(simClasses);
    } else {
      // Create a simulated project structure for project graphs
      const simProjects = createSimulatedProjectDependencies(nodes, edges);
      lastCycleAnalysisResult = detectProjectCycles(simProjects);
    }
  } catch (error) {
    console.error("Error analyzing cycles in preview:", error);
    // Don't show error to user, just set analysis result to null
    lastCycleAnalysisResult = null;
  }
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
  const useModernView = config.get<boolean>(
    "useModernViewForDotFiles",
    true
  );

  // Set to track files that have already been previewed
  const previewedFiles = new Set<string>();

  if (openPreviewOnGraphvizFileOpen) {
    vscode.workspace.onDidOpenTextDocument(async (document) => {
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
        
        // Store content and title for later use (for cycle analysis)
        const dotContent = document.getText();
        const title = path.basename(document.fileName);
        // Removed unused _lastDotContent assignment
        lastGraphTitle = title;
        
        // Analyze cycles in the graph before showing preview
        await analyzeCyclesInDotContent(dotContent, document.fileName);
        
        if (useModernView) {
          // Use modern graph view
          if (modernGraphProvider) {
            await modernGraphProvider.openGraphView(document.uri);
          }
        } else {
          // Use traditional preview
          const sanitizeResult = sanitizeDotContent(dotContent);
          
          // Only create cycles-only content if cycles were detected
          let cyclesOnlyContent = undefined;
          if (lastCycleAnalysisResult && lastCycleAnalysisResult.cycles.length > 0) {
            const cyclesOnlyDot = generateCyclesOnlyGraph(lastCycleAnalysisResult.cycles);
            const cyclesOnlySanitized = sanitizeDotContent(cyclesOnlyDot);
            cyclesOnlyContent = cyclesOnlySanitized.content;
          }
          
          graphPreviewProvider.showPreview(
            sanitizeResult.content,
            title,
            document.fileName,
            cyclesOnlyContent
          );
        }
      }
    });

    // Reset the set when a file is closed (to allow re-preview if reopened)
    vscode.workspace.onDidCloseTextDocument((document) => {
      previewedFiles.delete(document.fileName);
    });
  }
}

async function registerCycleAnalysisCommands(
  context: vscode.ExtensionContext,
  graphPreviewProvider: GraphPreviewProvider
): Promise<void> {
  // Register command to analyze cycles in a dependency graph
  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.analyze-cycles",
    async (fileUri?: vscode.Uri) => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder open");
          return;
        }

        // Get the dot file content and path
        const { dotFilePath, dotContent } = await getDotFileContent(fileUri);
        if (!dotFilePath || !dotContent) {
          return; // Error already shown to user
        }

        // Store content and title for later use
        // Removed unused _lastDotContent assignment
        lastGraphTitle = path.basename(dotFilePath);

        // Start progress indicator
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Analyzing dependency cycles...",
          cancellable: false,
        }, async (progress) => {
          await handleCycleAnalysis(dotContent, dotFilePath, progress, graphPreviewProvider);
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
  );

  // Register command to generate a cycle report
  await safeRegisterCommand(
    context,
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
  );
}

async function registerModernGraphCommands(context: vscode.ExtensionContext): Promise<void> {
  // Register command to open modern graph view
  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.open-modern-graph",
    async (fileUri?: vscode.Uri) => {
      try {
        if (modernGraphProvider) {
          if (fileUri) {
            await modernGraphProvider.openGraphView(fileUri);
          } else {
            // If no file URI provided, use the active editor's file
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              await modernGraphProvider.openGraphView(activeEditor.document.uri);
            } else {
              vscode.window.showErrorMessage("No file selected and no active editor");
            }
          }
        } else {
          vscode.window.showErrorMessage("Modern graph provider not initialized");
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        notificationManager.showError(`Failed to open modern view: ${errorMessage}`);
      }
    }
  );

  // Register command to generate graph with modern view
  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.generate-modern-graph",
    async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          notificationManager.showError("No workspace folder open");
          return;
        }

        // Show progress notification
        await notificationManager.showProgress(
          "Generating Modern Dependency Graph",
          async (progress, _token) => {
            progress.report({ message: "Analyzing project structure..." });

            const config = loadConfiguration();
            const selectedSolutionFile = await findAndSelectSolutionFile(workspaceFolder, config);
            
            if (selectedSolutionFile === null) {
              return; // User cancelled
            }

            progress.report({ message: "Selecting graph type...", increment: 20 });
            const graphType = await selectGraphType();
            if (!graphType) {
              return; // User cancelled
            }

            const generateClassGraph = graphType.label === "Class Dependencies";
            
            progress.report({ message: "Generating graph data...", increment: 40 });
            const dotContent = await generateGraphContent(
              workspaceFolder,
              selectedSolutionFile,
              generateClassGraph,
              config
            );

            progress.report({ message: "Opening modern view...", increment: 80 });
            if (modernGraphProvider) {
              await modernGraphProvider.showGraph(dotContent, {
                title: generateClassGraph ? "Class Dependencies" : "Project Dependencies",
                hasCycles: false // Will be determined by graph analysis
              });
            }

            progress.report({ message: "Complete!", increment: 100 });
          }
        );

        statusBarManager.updateDependencyCount(0); // Will be updated by graph provider
        notificationManager.showInfo("Modern dependency graph generated successfully!");

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        notificationManager.showError(`Error generating modern graph: ${errorMessage}`);
      }
    }
  );

  // Register keybinding commands
  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.refresh-graph",
    async () => {
      if (modernGraphProvider) {
        await modernGraphProvider.refresh();
      }
      notificationManager.showInfo("Graph refreshed");
    }
  );

  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.zoom-in",
    () => {
      modernGraphProvider?.postMessage({ command: 'zoomIn' });
    }
  );

  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.zoom-out",
    () => {
      modernGraphProvider?.postMessage({ command: 'zoomOut' });
    }
  );

  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.fit-graph",
    () => {
      modernGraphProvider?.postMessage({ command: 'fitToView' });
    }
  );

  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.search-nodes",
    async () => {
      const searchTerm = await vscode.window.showInputBox({
        prompt: "Search nodes in dependency graph",
        placeHolder: "Enter class or project name..."
      });
      
      if (searchTerm) {
        modernGraphProvider?.postMessage({ 
          command: 'search', 
          data: { term: searchTerm }
        });
      }
    }
  );

  await safeRegisterCommand(
    context,
    "vscode-csharp-dependency-graph.export-graph",
    async () => {
      const format = await vscode.window.showQuickPick([
        { label: 'SVG', value: 'svg' },
        { label: 'PNG', value: 'png' },
        { label: 'DOT', value: 'dot' }
      ], {
        placeHolder: "Select export format"
      });

      if (format) {
        modernGraphProvider?.postMessage({ 
          command: 'export', 
          data: { format: format.value }
        });
      }
    }
  );
}

// Missing function implementations

/**
 * Shows a cycles-only graph in the preview provider
 */
function showCyclesOnlyGraph(graphPreviewProvider: GraphPreviewProvider): void {
  if (!lastCycleAnalysisResult || lastCycleAnalysisResult.cycles.length === 0) {
    vscode.window.showInformationMessage("No dependency cycles detected to display");
    return;
  }

  // Generate cycles-only DOT content
  const cyclesOnlyDot = generateCyclesOnlyGraph(lastCycleAnalysisResult.cycles);
  const sanitizeResult = sanitizeDotContent(cyclesOnlyDot);
  
  // Show the preview
  const title = `${lastGraphTitle || "Dependency Graph"} - Cycles Only`;
  graphPreviewProvider.showPreview(
    sanitizeResult.content,
    title,
    undefined, // No source file path for cycles-only view
    sanitizeResult.content // Use same content as cycles-only content
  );
}

/**
 * Generates and shows a detailed cycle report
 */
async function generateAndShowCycleReport(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  if (!lastCycleAnalysisResult || lastCycleAnalysisResult.cycles.length === 0) {
    vscode.window.showInformationMessage("No dependency cycles detected to report");
    return;
  }

  try {
    // Generate the report content
    const reportContent = generateCycleReport(lastCycleAnalysisResult);
    
    // Create a unique filename for the report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFileName = `dependency-cycle-report-${timestamp}.md`;
    const reportPath = path.join(workspaceFolder.uri.fsPath, reportFileName);
    
    // Write the report to a file
    fs.writeFileSync(reportPath, reportContent);
    
    // Show completion message and options
    const selection = await vscode.window.showInformationMessage(
      `Dependency cycle report saved to ${reportFileName}`,
      "Open Report",
      "Show in Explorer"
    );
    
    if (selection === "Open Report") {
      const reportUri = vscode.Uri.file(reportPath);
      await vscode.commands.executeCommand("vscode.open", reportUri);
    } else if (selection === "Show in Explorer") {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(reportPath));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error generating cycle report: ${errorMessage}`);
  }
}

/**
 * Gets DOT file content from a file URI or prompts user to select one
 */
async function getDotFileContent(fileUri?: vscode.Uri): Promise<{ dotFilePath: string | null; dotContent: string | null }> {
  let targetFile: vscode.Uri | undefined = fileUri;
  
  // If no file URI provided, try to get the active editor's file
  if (!targetFile) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.fileName.endsWith('.dot')) {
      targetFile = activeEditor.document.uri;
    }
  }
  
  // If still no file, prompt user to select one
  if (!targetFile) {
    const selectedFiles = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Graphviz DOT files': ['dot', 'gv'],
        'All files': ['*']
      },
      title: "Select a DOT file to analyze"
    });
    
    if (!selectedFiles || selectedFiles.length === 0) {
      vscode.window.showInformationMessage("No file selected");
      return { dotFilePath: null, dotContent: null };
    }
    
    targetFile = selectedFiles[0];
  }
  
  try {
    // Read the file content
    const dotContent = fs.readFileSync(targetFile.fsPath, 'utf8');
    return { 
      dotFilePath: targetFile.fsPath, 
      dotContent: dotContent 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error reading DOT file: ${errorMessage}`);
    return { dotFilePath: null, dotContent: null };
  }
}

/**
 * Called when the extension is deactivated
 * This function properly cleans up all resources and disposables
 */
export function deactivate(): void {
  try {
    // Dispose of modern UI components
    if (notificationManager) {
      notificationManager.dispose();
    }
    if (statusBarManager) {
      statusBarManager.dispose();
    }
    if (keybindingManager) {
      keybindingManager.dispose();
    }
    if (modernGraphProvider) {
      modernGraphProvider.dispose();
    }

    // Reset singleton instances to allow fresh initialization
    NotificationManager.resetInstance();
    StatusBarManager.resetInstance();
    KeybindingManager.resetInstance();

    // Clear global variables
    lastCycleAnalysisResult = null;
    // Removed unused _lastDotContent assignment
    lastGraphTitle = null;

    console.log('C# Dependency Graph extension deactivated successfully');
  } catch (error) {
    console.error('Error during extension deactivation:', error);
  }
}
