import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  generateHtmlTemplate,
  GraphPreviewTemplateParams,
} from "./templates/graphPreviewTemplate";

/**
 * Base interface defining the message structure for webview communications
 */
interface WebviewMessage {
  command: string;
}

/**
 * Interface for SVG export messages
 */
interface ExportSvgMessage extends WebviewMessage {
  command: "exportSvg";
  svgData: string;
  title?: string;
}

/**
 * Interface for error messages
 */
interface ErrorMessage extends WebviewMessage {
  command: "error";
  text: string;
}

/**
 * Type for all possible message types
 */
type WebviewMessageType = ExportSvgMessage | ErrorMessage;

/**
 * Provider for rendering the dependency graph preview
 */
export class GraphPreviewProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionUri: vscode.Uri;
  private _sourceFilePath: string | undefined;
  private _cyclesOnlyDotContent: string | undefined;
  private _hasCycles: boolean = false;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  /**
   * Shows the graph preview in a webview panel
   * @param dotContent The DOT content to render
   * @param title The title of the webview panel
   * @param sourceFilePath Optional path to the source file
   * @param cyclesOnlyDotContent Optional DOT content showing only cycles
   */
  public showPreview(
    dotContent: string,
    title: string,
    sourceFilePath?: string,
    cyclesOnlyDotContent?: string
  ): void {
    this._sourceFilePath = sourceFilePath;
    this._cyclesOnlyDotContent = cyclesOnlyDotContent;
    this._hasCycles = !!cyclesOnlyDotContent; // If there is content for cycles-only, then there are cycles

    if (this._panel) {
      this._handleExistingPanel(title, dotContent);
    } else {
      this._createNewPanel(title, dotContent);
    }
  }

  /**
   * Handle scenario where panel already exists
   */
  private _handleExistingPanel(title: string, dotContent: string): void {
    if (!this._panel) {return;}

    this._panel.reveal();
    this._panel.title = title;
    this._updateContent(dotContent);
  }

  /**
   * Creates a new webview panel
   */
  private _createNewPanel(title: string, dotContent: string): void {
    this._panel = vscode.window.createWebviewPanel(
      "vscode-csharp-dependency-graph",
      title,
      vscode.ViewColumn.Beside,
      this._getWebviewOptions()
    );

    // Handle panel closure
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewMessageType) => {
        this._handleWebviewMessage(message);
      }
    );

    // Verify that all required resources exist
    this._verifyResources().catch(error => {
      console.error("Error verifying resources:", error);
    });

    // Load and update content
    this._updateContent(dotContent);
  }

  /**
   * Returns the webview options
   */
  private _getWebviewOptions(): vscode.WebviewOptions &
    vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "resources"),
        vscode.Uri.joinPath(this._extensionUri, "resources", "js"),
        vscode.Uri.joinPath(this._extensionUri, "out"), // Add the out directory
        vscode.Uri.joinPath(this._extensionUri, "dist"), // Add the dist directory for production
        vscode.Uri.joinPath(this._extensionUri, "dist", "resources"),
        vscode.Uri.joinPath(this._extensionUri, "dist", "webviewScripts")
      ],
    };
  }

  /**
   * Handles messages from the webview
   */
  private async _handleWebviewMessage(
    message: WebviewMessageType
  ): Promise<void> {
    if (message.command === "error") {
      vscode.window.showErrorMessage(message.text);
    } else if (message.command === "exportSvg") {
      await this._handleExportSvg(message);
    }
  }

  /**
   * Handles exporting the graph as SVG
   */
  private async _handleExportSvg(message: ExportSvgMessage): Promise<void> {
    try {
      // Direct use of SVG data
      const svgContent = message.svgData;

      // Determine the default directory and filename
      const defaultUri = this._getDefaultExportUri(message.title);

      // Show save dialog
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        filters: {
          "SVG Files": ["svg"],
          "All Files": ["*"],
        },
        title: "Export SVG",
      });

      if (saveUri) {
        // Write SVG content to file
        const writeData = Buffer.from(svgContent, "utf8");
        await vscode.workspace.fs.writeFile(saveUri, writeData);
        vscode.window.showInformationMessage(
          `SVG exported to ${saveUri.fsPath}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to export SVG: ${errorMessage}`);
    }
  }

  /**
   * Gets the default URI for exporting SVG
   */
  private _getDefaultExportUri(title?: string): vscode.Uri {
    if (this._sourceFilePath) {
      // Use the directory of the DOT source file
      const sourceDir = path.dirname(this._sourceFilePath);
      // Get the basename without extension and use it for the SVG file
      const baseName = path.basename(
        this._sourceFilePath,
        path.extname(this._sourceFilePath)
      );
      const fileName = `${baseName}.svg`;
      return vscode.Uri.file(path.join(sourceDir, fileName));
    } else {
      // Fallback if no source file (generated from command)
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const baseDir = workspaceFolder ? workspaceFolder.uri.fsPath : "";
      return vscode.Uri.file(
        path.join(baseDir, `${title ?? "dependency-graph"}.svg`)
      );
    }
  }

  /**
   * Updates the webview content with the current dot content
   */
  private _updateContent(dotContent: string): void {
    if (!this._panel) {
      return;
    }

    const templateParams = this._prepareTemplateParams(dotContent);
    this._panel.webview.html = generateHtmlTemplate(templateParams);
  }

  /**
   * Prepares template parameters for the HTML template
   */
  private _prepareTemplateParams(
    dotContent: string
  ): GraphPreviewTemplateParams {
    if (!this._panel) {
      throw new Error("No panel available");
    }

    // Try production paths first (dist/resources), then fallback to development paths (resources)
    let d3Uri, d3GraphvizUri, graphvizUri, wasmFolderUri;
    
    // Check if we're running in production mode (packaged extension)
    const distResourcesPath = vscode.Uri.joinPath(this._extensionUri, "dist", "resources", "js");
    const devResourcesPath = vscode.Uri.joinPath(this._extensionUri, "resources", "js");
    
    try {
      // Check if dist/resources exists by checking for d3.min.js
      const distD3Path = vscode.Uri.joinPath(distResourcesPath, "d3.min.js");
      fs.accessSync(distD3Path.fsPath, fs.constants.F_OK);
      
      // If we get here, the dist resources exist, so use them
      console.log("Using production resources from dist/resources/js");
      d3Uri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(distResourcesPath, "d3.min.js")
      );
      d3GraphvizUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(distResourcesPath, "d3-graphviz.min.js")
      );
      graphvizUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(distResourcesPath, "graphviz.umd.js")
      );
      wasmFolderUri = this._panel.webview.asWebviewUri(distResourcesPath);
    } catch {
      // Fallback to development resources
      console.log("Falling back to development resources in resources/js");
      d3Uri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(devResourcesPath, "d3.min.js")
      );
      d3GraphvizUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(devResourcesPath, "d3-graphviz.min.js")
      );
      graphvizUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(devResourcesPath, "graphviz.umd.js")
      );
      wasmFolderUri = this._panel.webview.asWebviewUri(devResourcesPath);
    }
    
    // Determine the correct path to the webview script
    // Try to use the production path first (dist)
    const distScriptPath = vscode.Uri.joinPath(
      this._extensionUri, 
      "dist", 
      "webviewScripts", 
      "graphPreviewBundle.js"
    );
    
    // Fallback to the development path (out)
    const outScriptPath = vscode.Uri.joinPath(
      this._extensionUri, 
      "out", 
      "webviewScripts", 
      "graphPreviewBundle.js"
    );
    
    // Check if the dist file exists, otherwise use the out file
    const scriptPath = fs.existsSync(distScriptPath.fsPath) 
      ? distScriptPath 
      : outScriptPath;
    
    const webviewScriptUri = this._panel.webview.asWebviewUri(scriptPath);

    return {
      cspSource: this._panel.webview.cspSource,
      d3Uri,
      graphvizUri,
      d3GraphvizUri,
      wasmFolderUri,
      webviewScriptUri,
      dotContent,
      cyclesOnlyDotContent: this._cyclesOnlyDotContent,
      hasCycles: this._hasCycles,
    };
  }

  /**
   * Verifies that all required resources exist
   * This is useful for debugging resource loading issues
   */
  private async _verifyResources(): Promise<void> {
    // Get all resource paths - prioritize dist paths first, then fallback paths
    const resourcePaths = [
      // Production resources (these should be in the packaged extension)
      vscode.Uri.joinPath(this._extensionUri, "dist", "resources", "js", "d3.min.js"),
      vscode.Uri.joinPath(this._extensionUri, "dist", "resources", "js", "d3-graphviz.min.js"),
      vscode.Uri.joinPath(this._extensionUri, "dist", "resources", "js", "graphviz.umd.js"),
      vscode.Uri.joinPath(this._extensionUri, "dist", "webviewScripts", "graphPreviewBundle.js"),
      
      // Development fallback resources (should only be used during development)
      vscode.Uri.joinPath(this._extensionUri, "resources", "js", "d3.min.js"),
      vscode.Uri.joinPath(this._extensionUri, "resources", "js", "d3-graphviz.min.js"),
      vscode.Uri.joinPath(this._extensionUri, "resources", "js", "graphviz.umd.js"),
      vscode.Uri.joinPath(this._extensionUri, "out", "webviewScripts", "graphPreviewBundle.js"),
    ];

    // Check if each file exists
    console.log("Verifying resources:");
    let foundProdResources = 0;
    let foundDevResources = 0;
    
    for (let i = 0; i < resourcePaths.length; i++) {
      const path = resourcePaths[i];
      try {
        await vscode.workspace.fs.stat(path);
        if (i < 4) {
          // Production resources
          foundProdResources++;
          console.log(`✅ Production: ${path.fsPath} exists`);
        } else {
          // Development resources
          foundDevResources++;
          console.log(`✅ Development: ${path.fsPath} exists`);
        }
      } catch {
        if (i < 4) {
          console.log(`❌ Production: ${path.fsPath} does not exist`);
        } else {
          console.log(`❌ Development: ${path.fsPath} does not exist`);
        }
      }
    }
    
    // Log summary
    if (foundProdResources === 4) {
      console.log("✅ All production resources found - running in production mode");
    } else if (foundDevResources === 4) {
      console.log("ℹ️ All development resources found - running in development mode");
    } else {
      console.log(`⚠️ Warning: Missing resources - found ${foundProdResources}/4 production and ${foundDevResources}/4 development resources`);
    }
  }
}
