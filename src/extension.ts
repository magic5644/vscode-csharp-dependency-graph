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
  // Check that the content looks like a DOT graph
  const dotGraphRegex = /^\s*(?:di)?graph\s+[\w"{}][^\n]{0,100}/i;
  if (!dotGraphRegex.exec(dotContent.trim())) {
    console.warn("Warning: Content doesn't appear to be a valid DOT graph");
  }

  // Add global attributes to improve edge rendering
  if (dotContent.includes('digraph') && !dotContent.includes('splines=')) {
    dotContent = dotContent.replace(
      /digraph\s+[\w"]+\s*\{/i,
      match => `${match}\n  // Graph attributes for better edge rendering\n  graph [splines=polyline, overlap=false, nodesep=0.8, ranksep=1.0];\n  edge [penwidth=1.5, arrowsize=0.8];\n  node [shape=box, style=filled, fillcolor=aliceblue];\n`
    );
  }

  // Handle both single and double quoted node IDs that might contain apostrophes
  dotContent = dotContent.replace(
    /"([^"]*?)"/g,
    (_match, nodeId) => {
      // Replace apostrophes and other special characters in node IDs
      const sanitized = nodeId
        .replace(/'/g, '&#39;')
      return `"${sanitized}"`;
    }
  );

  // Handle attributes with label properties - preserving newlines
  dotContent = dotContent.replace(
    /\[([^\]]*?)label\s*=\s*(?:"([^"]*)"|'([^']*)')([^\]]*?)\]/g,
    (_match, beforeLabel, doubleQuotedContent, singleQuotedContent, afterLabel) => {
      // Handle newlines in label content - use the non-undefined content
      const labelContent = doubleQuotedContent !== undefined ? doubleQuotedContent : singleQuotedContent;
      
      let sanitized = sanitizeHtml(labelContent, {
        allowedTags: [],
        allowedAttributes: {},
      });
      
      // Preserve valid newlines sequences
      sanitized = sanitized
        .replace(/'/g, '&#39;')      // Ensure apostrophes are HTML escaped
        .replace(/"/g, '&quot;')     // Ensure quotes are HTML escaped
      
      return `[${beforeLabel}label="${sanitized}"${afterLabel}]`;
    }
  );

  // Handle all other attributes - using a more direct approach to ensure all apostrophes are caught
  dotContent = dotContent.replace(
    /=\s*["']([^"']*?)["']/g,
    (_match, attrContent) => {
      // Handle newlines and other special characters
      const sanitized = attrContent
        .replace(/'/g, '&#39;')      // Apostrophes
        .replace(/"/g, '&quot;')     // Double quotes
        // Acute accents
        .replace(/é/g, '&#233;')
        .replace(/É/g, '&#201;')
        .replace(/á/g, '&#225;')
        .replace(/Á/g, '&#193;')
        .replace(/í/g, '&#237;')
        .replace(/Í/g, '&#205;')
        .replace(/ó/g, '&#243;')
        .replace(/Ó/g, '&#211;')
        .replace(/ú/g, '&#250;')
        .replace(/Ú/g, '&#218;')
        .replace(/ý/g, '&#253;')
        .replace(/Ý/g, '&#221;')
        // Grave accents
        .replace(/è/g, '&#232;')
        .replace(/È/g, '&#200;')
        .replace(/à/g, '&#224;')
        .replace(/À/g, '&#192;')
        .replace(/ì/g, '&#236;')
        .replace(/Ì/g, '&#204;')
        .replace(/ò/g, '&#242;')
        .replace(/Ò/g, '&#210;')
        .replace(/ù/g, '&#249;')
        .replace(/Ù/g, '&#217;')
        // Circumflex
        .replace(/ê/g, '&#234;')
        .replace(/Ê/g, '&#202;')
        .replace(/â/g, '&#226;')
        .replace(/Â/g, '&#194;')
        .replace(/î/g, '&#238;')
        .replace(/Î/g, '&#206;')
        .replace(/ô/g, '&#244;')
        .replace(/Ô/g, '&#212;')
        .replace(/û/g, '&#251;')
        .replace(/Û/g, '&#219;')
        // Diaeresis
        .replace(/ë/g, '&#235;')
        .replace(/Ë/g, '&#203;')
        .replace(/ä/g, '&#228;')
        .replace(/Ä/g, '&#196;')
        .replace(/ï/g, '&#239;')
        .replace(/Ï/g, '&#207;')
        .replace(/ö/g, '&#246;')
        .replace(/Ö/g, '&#214;')
        .replace(/ü/g, '&#252;')
        .replace(/Ü/g, '&#220;')
        .replace(/ÿ/g, '&#255;')
        // Other special characters
        .replace(/ç/g, '&#231;')
        .replace(/Ç/g, '&#199;')
        .replace(/ñ/g, '&#241;')
        .replace(/Ñ/g, '&#209;')
        .replace(/œ/g, '&#339;')
        .replace(/Œ/g, '&#338;')
        .replace(/æ/g, '&#230;')
        .replace(/Æ/g, '&#198;');
      
      return `="${sanitized}"`;
    }
  );

  // Fix common edge syntax issues
  dotContent = dotContent 
    // Ensure adequate spacing in edge definitions
    .replace(/->(\S)/g, '-> $1')
    
    // Additional fix for graph identifiers with spaces
    .replace(/(di)?graph\s+(\w+\s+\w+)(\s*{)/gi, (_match, di, name, bracket) => {
      return `${di || ''}graph "${name}"${bracket}`;
    });

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
