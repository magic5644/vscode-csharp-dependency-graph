import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { findCsprojFiles } from "../csprojFinder";
import { parseCsprojFiles, Project } from "../csprojParser";
import { generateDotFile } from "../graphGeneratorAdapter";
import { findCSharpSourceFiles } from "../csharpSourceFinder";
import { parseClassDependencies, ClassDependency } from "../csharpClassParser";
import { findSolutionFiles, parseSolutionFile } from "../slnParser";
import { minimatch } from "minimatch";
import { GraphPreviewProvider } from "../graphPreview";
import { sanitizeDotContent } from '../dotSanitizer';
import { DotParser } from '../dotParser';
import { 
  detectProjectCycles, 
  detectClassCycles, 
  generateDotWithHighlightedCycles, 
  generateCyclesOnlyGraph, 
  generateCycleReport,
  CycleAnalysisResult
} from '../cycleDetector';
import { ModernGraphWebviewProvider } from '../ModernGraphWebviewProvider';
import { NotificationManager } from '../notifications/NotificationManager';
import { StatusBarManager } from '../statusbar/StatusBarManager';

export interface DependencyGraphConfig {
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

export class GraphController {
  private lastCycleAnalysisResult: CycleAnalysisResult | null = null;
  private lastGraphTitle: string | null = null;

  constructor(
    private graphPreviewProvider: GraphPreviewProvider,
    private modernGraphProvider: ModernGraphWebviewProvider,
    private notificationManager: NotificationManager,
    private statusBarManager: StatusBarManager
  ) {}

  public async generateDependencyGraph(): Promise<void> {
    try {
      // Get workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Get configuration
      const config = this.loadConfiguration();

      // Find and select solution file
      const selectedSolutionFile = await this.findAndSelectSolutionFile(
        workspaceFolder,
        config
      );
      if (selectedSolutionFile === null) {
        return; // User cancelled
      }

      // Select graph type
      const graphType = await this.selectGraphType();
      if (!graphType) {
        return; // User cancelled
      }

      const generateClassGraph =
        graphType.label === "Class Dependencies";
      const baseFilename = generateClassGraph
        ? "class-dependency-graph"
        : "project-dependency-graph";

      // Get file save location
      const saveUri = await this.getSaveLocation(
        workspaceFolder,
        baseFilename
      );
      if (!saveUri) {
        return; // User cancelled
      }

      await this.generateAndSaveGraph(
        workspaceFolder,
        saveUri,
        selectedSolutionFile,
        generateClassGraph,
        config
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error: ${errorMessage}`);
    }
  }

  public async generateModernGraph(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        this.notificationManager.showError("No workspace folder open");
        return;
      }

      // Show progress notification
      await this.notificationManager.showProgress(
        "Generating Modern Dependency Graph",
        async (progress, _token) => {
          progress.report({ message: "Analyzing project structure..." });

          const config = this.loadConfiguration();
          const selectedSolutionFile = await this.findAndSelectSolutionFile(workspaceFolder, config);
          
          if (selectedSolutionFile === null) {
            return; // User cancelled
          }

          progress.report({ message: "Selecting graph type...", increment: 20 });
          const graphType = await this.selectGraphType();
          if (!graphType) {
            return; // User cancelled
          }

          const generateClassGraph = graphType.label === "Class Dependencies";
          
          progress.report({ message: "Generating graph data...", increment: 40 });
          const dotContent = await this.generateGraphContent(
            workspaceFolder,
            selectedSolutionFile,
            generateClassGraph,
            config
          );

          progress.report({ message: "Opening modern view...", increment: 80 });
          if (this.modernGraphProvider) {
            await this.modernGraphProvider.showGraph(dotContent, {
              title: generateClassGraph ? "Class Dependencies" : "Project Dependencies",
              hasCycles: false // Will be determined by graph analysis
            });
          }

          progress.report({ message: "Complete!", increment: 100 });
        }
      );

      this.statusBarManager.updateDependencyCount(0); // Will be updated by graph provider
      this.notificationManager.showInfo("Modern dependency graph generated successfully!");

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.notificationManager.showError(`Error generating modern graph: ${errorMessage}`);
    }
  }

  public async analyzeCycles(fileUri?: vscode.Uri): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // Get the dot file content and path
      const { dotFilePath, dotContent } = await this.getDotFileContent(fileUri);
      if (!dotFilePath || !dotContent) {
        return; // Error already shown to user
      }

      // Store content and title for later use
      this.lastGraphTitle = path.basename(dotFilePath);

      // Start progress indicator
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing dependency cycles...",
        cancellable: false,
      }, async (progress) => {
        await this.handleCycleAnalysis(dotContent, dotFilePath, progress);
      });
      
      // Show options based on analysis results
      if (this.lastCycleAnalysisResult && this.lastCycleAnalysisResult.cycles.length > 0) {
        vscode.window.showInformationMessage(
          `${this.lastCycleAnalysisResult.cycles.length} cycles detected in the dependency graph`,
          "View Cycles Only", 
          "Generate Report"
        ).then(selection => {
          if (selection === "View Cycles Only") {
            this.showCyclesOnlyGraph();
          } else if (selection === "Generate Report") {
            this.generateAndShowCycleReport(workspaceFolder);
          }
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error analyzing cycles: ${errorMessage}`);
    }
  }

  public async generateCycleReportCommand(fileUri?: vscode.Uri): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      // If we already have analysis results, use them
      if (!this.lastCycleAnalysisResult && fileUri) {
        // Run the analysis command first to get the results
        await this.analyzeCycles(fileUri);
        
        // If analysis failed or no cycles were detected
        if (!this.lastCycleAnalysisResult) {
          return;
        }
      } else if (!this.lastCycleAnalysisResult) {
        vscode.window.showErrorMessage(
          "No cycle analysis results available. Please analyze a dependency graph first."
        );
        return;
      }

      this.generateAndShowCycleReport(workspaceFolder);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Error generating cycle report: ${errorMessage}`);
    }
  }

  public async previewGraphviz(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (
      editor &&
      (editor.document.languageId === "dot" ||
        editor.document.fileName.endsWith(".dot") ||
        editor.document.fileName.endsWith(".gv"))
    ) {
      const dotContent = editor.document.getText();
      const title = path.basename(editor.document.fileName);
      
      this.lastGraphTitle = title;
      
      // Analyze cycles in the graph before showing preview
      await this.analyzeCyclesInDotContent(dotContent, editor.document.fileName);
      
      // Now show the preview with cycle data
      const sanitizeResult = sanitizeDotContent(dotContent);
      
      // Only create cycles-only content if cycles were detected
      let cyclesOnlyContent = undefined;
      if (this.lastCycleAnalysisResult && this.lastCycleAnalysisResult.cycles.length > 0) {
        const cyclesOnlyDot = generateCyclesOnlyGraph(this.lastCycleAnalysisResult.cycles);
        const cyclesOnlySanitized = sanitizeDotContent(cyclesOnlyDot);
        cyclesOnlyContent = cyclesOnlySanitized.content;
      }
      
      this.graphPreviewProvider.showPreview(
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

  public setupAutoPreview(): void {
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
          this.lastGraphTitle = title;
          
          // Analyze cycles in the graph before showing preview
          await this.analyzeCyclesInDotContent(dotContent, document.fileName);
          
          if (useModernView) {
            // Use modern graph view
            if (this.modernGraphProvider) {
              await this.modernGraphProvider.openGraphView(document.uri);
            }
          } else {
            // Use traditional preview
            const sanitizeResult = sanitizeDotContent(dotContent);
            
            // Only create cycles-only content if cycles were detected
            let cyclesOnlyContent = undefined;
            if (this.lastCycleAnalysisResult && this.lastCycleAnalysisResult.cycles.length > 0) {
              const cyclesOnlyDot = generateCyclesOnlyGraph(this.lastCycleAnalysisResult.cycles);
              const cyclesOnlySanitized = sanitizeDotContent(cyclesOnlyDot);
              cyclesOnlyContent = cyclesOnlySanitized.content;
            }
            
            this.graphPreviewProvider.showPreview(
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

  private loadConfiguration(): DependencyGraphConfig {
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

  private async findAndSelectSolutionFile(
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

  private async selectGraphType() {
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

  private async getSaveLocation(
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

  private async generateAndSaveGraph(
    workspaceFolder: vscode.WorkspaceFolder,
    saveUri: vscode.Uri,
    selectedSolutionFile: string | undefined,
    generateClassGraph: boolean,
    config: DependencyGraphConfig
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

        const csprojFiles: string[] = await this.getCsprojFiles(
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
          const { dotContent: classDotContent, cycleAnalysis } = await this.generateClassDependencyGraph(
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
        this.lastCycleAnalysisResult = cycleAnalysisResult;
        this.lastGraphTitle = path.basename(saveUri.fsPath);

        // Write the file
        fs.writeFileSync(saveUri.fsPath, dotContent);

        return saveUri.fsPath;
      }
    );

    // Show completion message and options with additional cycle detection info
    const actions = ["Open File", "Preview"];
    
    if (this.lastCycleAnalysisResult && this.lastCycleAnalysisResult.cycles.length > 0) {
      actions.push("View Cycles", "Generate Report");
    }
    
    vscode.window
      .showInformationMessage(
        `Dependency graph saved to ${path.basename(filePath)}${this.lastCycleAnalysisResult?.cycles.length ? 
          ` (${this.lastCycleAnalysisResult.cycles.length} cycles detected)` : 
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
          this.graphPreviewProvider.showPreview(
            sanitizeResult.content,
            title,
            filePath
          );
        } else if (selection === "View Cycles" && this.lastCycleAnalysisResult) {
          this.showCyclesOnlyGraph();
        } else if (selection === "Generate Report" && this.lastCycleAnalysisResult) {
          this.generateAndShowCycleReport(workspaceFolder);
        }
      });
  }

  private async getCsprojFiles(
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
            !this.isPathMatchingAnyPattern(filePath, config.testProjectPatterns)
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

  private async generateClassDependencyGraph(
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

  private async generateGraphContent(
    workspaceFolder: vscode.WorkspaceFolder,
    selectedSolutionFile: string | undefined,
    generateClassGraph: boolean,
    config: DependencyGraphConfig
  ): Promise<string> {
    // Find all .csproj files
    const csprojFiles: string[] = await this.getCsprojFiles(
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
      const { dotContent: classDotContent, cycleAnalysis } = await this.generateClassDependencyGraph(
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
    this.lastCycleAnalysisResult = cycleAnalysisResult;
    this.lastGraphTitle = generateClassGraph ? "Class Dependencies" : "Project Dependencies";

    return dotContent;
  }

  private async handleCycleAnalysis(
    dotContent: string, 
    dotFilePath: string,
    progress: vscode.Progress<{ message?: string }>
  ): Promise<void> {
    // Extract nodes and edges from DOT content using the DotParser
    const { nodes, edges, isClassGraph } = DotParser.parse(dotContent);
    
    if (isClassGraph) {
      // In a real implementation, you would parse the DOT to recover the full class structure
      progress.report({ message: "Reconstructing class dependencies..." });
      
      // Create a simulated class dependency structure
      const simClasses = this.createSimulatedClassDependencies(nodes, edges);
      this.lastCycleAnalysisResult = detectClassCycles(simClasses);
    } else {
      // Create a simulated project structure for project graphs
      progress.report({ message: "Reconstructing project dependencies..." });
      
      const simProjects = this.createSimulatedProjectDependencies(nodes, edges);
      this.lastCycleAnalysisResult = detectProjectCycles(simProjects);
    }
    
    if (!this.lastCycleAnalysisResult || this.lastCycleAnalysisResult.cycles.length === 0) {
      vscode.window.showInformationMessage("No dependency cycles detected in the graph");
      return;
    }
    
    // Add highlighting to cycles
    progress.report({ message: "Highlighting cycles in graph..." });
    
    // Create preview for the cycles
    const previewData = this.createCyclePreviewContent(
      dotContent,
      this.lastCycleAnalysisResult.cycles,
      this.lastGraphTitle ?? path.basename(dotFilePath),
      dotFilePath
    );
    
    // Show the preview
    this.graphPreviewProvider.showPreview(
      previewData.content,
      previewData.title,
      previewData.filePath,
      previewData.cyclesOnlyContent
    );
  }

  private async analyzeCyclesInDotContent(dotContent: string, _filePath: string): Promise<void> {
    try {
      // Extract nodes and edges from DOT content using the DotParser
      const { nodes, edges, isClassGraph } = DotParser.parse(dotContent);
      
      if (isClassGraph) {
        // Create a simulated class dependency structure
        const simClasses = this.createSimulatedClassDependencies(nodes, edges);
        this.lastCycleAnalysisResult = detectClassCycles(simClasses);
      } else {
        // Create a simulated project structure for project graphs
        const simProjects = this.createSimulatedProjectDependencies(nodes, edges);
        this.lastCycleAnalysisResult = detectProjectCycles(simProjects);
      }
    } catch (error) {
      console.error("Error analyzing cycles in preview:", error);
      // Don't show error to user, just set analysis result to null
      this.lastCycleAnalysisResult = null;
    }
  }

  private showCyclesOnlyGraph(): void {
    if (!this.lastCycleAnalysisResult || this.lastCycleAnalysisResult.cycles.length === 0) {
      vscode.window.showInformationMessage("No dependency cycles detected to display");
      return;
    }

    // Generate cycles-only DOT content
    const cyclesOnlyDot = generateCyclesOnlyGraph(this.lastCycleAnalysisResult.cycles);
    const sanitizeResult = sanitizeDotContent(cyclesOnlyDot);
    
    // Show the preview
    const title = `${this.lastGraphTitle || "Dependency Graph"} - Cycles Only`;
    this.graphPreviewProvider.showPreview(
      sanitizeResult.content,
      title,
      undefined, // No source file path for cycles-only view
      sanitizeResult.content // Use same content as cycles-only content
    );
  }

  private async generateAndShowCycleReport(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    if (!this.lastCycleAnalysisResult || this.lastCycleAnalysisResult.cycles.length === 0) {
      vscode.window.showInformationMessage("No dependency cycles detected to report");
      return;
    }

    try {
      // Generate the report content
      const reportContent = generateCycleReport(this.lastCycleAnalysisResult);
      
      // Create a unique filename for the report
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
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

  private async getDotFileContent(fileUri?: vscode.Uri): Promise<{ dotFilePath: string | null; dotContent: string | null }> {
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

  private createSimulatedClassDependencies(
    nodes: Set<string>,
    edges: Map<string, string[]>
  ): ClassDependency[] {
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

  private createSimulatedProjectDependencies(
    nodes: Set<string>,
    edges: Map<string, string[]>
  ): Project[] {
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

  private createCyclePreviewContent(
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

  private isPathMatchingPattern(filePath: string, pattern: string): boolean {
    const fileName = path.basename(filePath);
    return pattern.includes("/")
      ? minimatch(filePath, pattern)
      : minimatch(fileName, pattern);
  }

  private isPathMatchingAnyPattern(
    filePath: string,
    patterns: string[]
  ): boolean {
    return patterns.some((pattern) => this.isPathMatchingPattern(filePath, pattern));
  }
}
