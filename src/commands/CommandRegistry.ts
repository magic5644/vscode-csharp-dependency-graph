import * as vscode from "vscode";
import { GraphController } from "../controllers/GraphController";
import { ModernGraphWebviewProvider } from "../ModernGraphWebviewProvider";
import { NotificationManager } from "../notifications/NotificationManager";

export class CommandRegistry {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly graphController: GraphController,
    private readonly modernGraphProvider: ModernGraphWebviewProvider,
    private readonly notificationManager: NotificationManager
  ) {}

  public async registerCommands(): Promise<void> {
    try {
      // Register main dependency graph command
      await this.safeRegisterCommand(
        "vscode-csharp-dependency-graph.generate-dependency-graph",
        () => this.graphController.generateDependencyGraph()
      );

      // Register preview command
      await this.safeRegisterCommand(
        "vscode-csharp-dependency-graph.previewGraphviz",
        () => this.graphController.previewGraphviz()
      );

      // Register cycle analysis commands
      await this.safeRegisterCommand(
        "vscode-csharp-dependency-graph.analyze-cycles",
        (uri?: vscode.Uri) => this.graphController.analyzeCycles(uri)
      );

      await this.safeRegisterCommand(
        "vscode-csharp-dependency-graph.generate-cycle-report",
        (uri?: vscode.Uri) => this.graphController.generateCycleReportCommand(uri)
      );

      // Register modern graph commands
      await this.registerModernGraphCommands();

      console.log('All commands registered successfully');
    } catch (error) {
      console.error('Error registering commands:', error);
      vscode.window.showErrorMessage(
        `C# Dependency Graph: Error registering commands: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async registerModernGraphCommands(): Promise<void> {
    // Register command to open modern graph view
    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.open-modern-graph",
      async (uri?: vscode.Uri) => {
        try {
          if (this.modernGraphProvider) {
            if (uri) {
              await this.modernGraphProvider.openGraphView(uri);
            } else {
              // If no file URI provided, use the active editor's file
              const activeEditor = vscode.window.activeTextEditor;
              if (activeEditor) {
                await this.modernGraphProvider.openGraphView(activeEditor.document.uri);
              } else {
                vscode.window.showErrorMessage("No file selected and no active editor");
              }
            }
          } else {
            vscode.window.showErrorMessage("Modern graph provider not initialized");
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.notificationManager.showError(`Failed to open modern view: ${errorMessage}`);
        }
      }
    );

    // Register command to generate graph with modern view
    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.generate-modern-graph",
      () => this.graphController.generateModernGraph()
    );

    // Register keybinding commands
    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.refresh-graph",
      async () => {
        if (this.modernGraphProvider) {
          await this.modernGraphProvider.refresh();
        }
        this.notificationManager.showInfo("Graph refreshed");
      }
    );

    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.zoom-in",
      () => {
        this.modernGraphProvider?.postMessage({ command: 'zoomIn' });
      }
    );

    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.zoom-out",
      () => {
        this.modernGraphProvider?.postMessage({ command: 'zoomOut' });
      }
    );

    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.fit-graph",
      () => {
        this.modernGraphProvider?.postMessage({ command: 'fitToView' });
      }
    );

    await this.safeRegisterCommand(
      "vscode-csharp-dependency-graph.search-nodes",
      async () => {
        const searchTerm = await vscode.window.showInputBox({
          prompt: "Search nodes in dependency graph",
          placeHolder: "Enter class or project name..."
        });
        
        if (searchTerm) {
          this.modernGraphProvider?.postMessage({ 
            command: 'search', 
            data: { term: searchTerm }
          });
        }
      }
    );

    await this.safeRegisterCommand(
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
          this.modernGraphProvider?.postMessage({ 
            command: 'export', 
            data: { format: format.value }
          });
        }
      }
    );
  }

  /**
   * Safely registers a VS Code command with error handling for duplicate registrations
   */
  private async safeRegisterCommand<A extends unknown[]>(
    commandId: string,
    handler: (...args: A) => unknown
  ): Promise<vscode.Disposable | null> {
    try {
      // Check if command already exists
      const existingCommands = await vscode.commands.getCommands(true);
      if (existingCommands.includes(commandId)) {
        console.warn(`Command ${commandId} already exists, skipping registration...`);
        return null;
      }

      const disposable = vscode.commands.registerCommand(commandId, handler);
      this.context.subscriptions.push(disposable);
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
}
