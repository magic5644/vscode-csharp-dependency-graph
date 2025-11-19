import * as vscode from "vscode";
import { GraphPreviewProvider } from "./graphPreview";
import { prepareVizJs } from "./vizInitializer";

// Modern UX components
import { NotificationManager } from './notifications/NotificationManager';
import { StatusBarManager } from './statusbar/StatusBarManager';
import { KeybindingManager } from './commands/KeybindingManager';
import { ModernGraphWebviewProvider } from './ModernGraphWebviewProvider';

// Refactored components
import { GraphController } from './controllers/GraphController';
import { CommandRegistry } from './commands/CommandRegistry';

// Modern UX managers
let notificationManager: NotificationManager;
let statusBarManager: StatusBarManager;
let keybindingManager: KeybindingManager;
let modernGraphProvider: ModernGraphWebviewProvider;

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

    // Register the webview provider and add all disposables
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ModernGraphWebviewProvider.viewType,
        modernGraphProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      ),
      notificationManager,
      statusBarManager,
      keybindingManager,
      modernGraphProvider
    );

    const graphPreviewProvider = new GraphPreviewProvider(context.extensionUri);

    // Initialize controller
    const graphController = new GraphController(
      graphPreviewProvider,
      modernGraphProvider,
      notificationManager,
      statusBarManager
    );

    // Initialize command registry
    const commandRegistry = new CommandRegistry(
      context,
      graphController,
      modernGraphProvider,
      notificationManager
    );

    // Register commands
    await commandRegistry.registerCommands();

    // Setup auto-preview for Graphviz files
    try {
      graphController.setupAutoPreview();
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

    console.log('C# Dependency Graph extension deactivated successfully');
  } catch (error) {
    console.error('Error during extension deactivation:', error);
  }
}
