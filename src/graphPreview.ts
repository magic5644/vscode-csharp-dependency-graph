import * as vscode from "vscode";
import * as path from "path";

export class GraphPreviewProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionUri: vscode.Uri;
  private _sourceFilePath: string | undefined;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public showPreview(dotContent: string, title: string, sourceFilePath?: string): void {
    this._sourceFilePath = sourceFilePath;
    // If a panel is already open, show it and update its content
    if (this._panel) {
      this._panel.reveal();
      this._updateContent(dotContent);
      return;
    }

    // Otherwise, create a new panel
    this._panel = vscode.window.createWebviewPanel(
      "csharp-dependency-graph",
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, "resources"),
          vscode.Uri.joinPath(this._extensionUri, "resources", "js"),
        ],
      }
    );

    // Handle panel closure
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "error") {
        vscode.window.showErrorMessage(message.text);
      } else if (message.command === "exportSvg") {
        try {
          // Direct use of SVG data
          const svgContent = message.svgData;
          
          // Determine the default directory based on the source file
          let defaultUri;
          if (this._sourceFilePath) {
            // Use the directory of the DOT source file
            const sourceDir = path.dirname(this._sourceFilePath);
            // Get the basename without extension and use it for the SVG file
            const baseName = path.basename(this._sourceFilePath, path.extname(this._sourceFilePath));
            const fileName = `${baseName}.svg`;
            defaultUri = vscode.Uri.file(path.join(sourceDir, fileName));
          } else {
            // Fallback if no source file (generated from command)
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const baseDir = workspaceFolder ? workspaceFolder.uri.fsPath : '';
            defaultUri = vscode.Uri.file(path.join(baseDir, `${message.title || 'dependency-graph'}.svg`));
          }
          
          // Show save dialog
          const saveUri = await vscode.window.showSaveDialog({
            defaultUri: defaultUri,
            filters: {
              'SVG Files': ['svg'],
              'All Files': ['*']
            },
            title: 'Export SVG'
          });
          
          if (saveUri) {
            // Write SVG content to file
            const writeData = Buffer.from(svgContent, 'utf8');
            await vscode.workspace.fs.writeFile(saveUri, writeData);
            vscode.window.showInformationMessage(`SVG exported to ${saveUri.fsPath}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to export SVG: ${errorMessage}`);
        }
      }
    });

    // Load and update content
    this._updateContent(dotContent);
  }

  private _updateContent(dotContent: string): void {
    if (!this._panel) {
      return;
    }

    // Create URIs for required script files
    const d3Uri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "js", "d3.min.js")
    );
    const d3GraphvizUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "js",
        "d3-graphviz.min.js"
      )
    );
    const graphvizUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "js",
        "graphviz.umd.js"
      )
    );

    const wasmFolderUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "js")
    );

    // HTML with d3-graphviz
    this._panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${
        this._panel.webview.cspSource
      } data:; script-src ${
      this._panel.webview.cspSource
    } 'unsafe-inline' 'unsafe-eval'; style-src ${
      this._panel.webview.cspSource
    } 'unsafe-inline'; connect-src ${
      this._panel.webview.cspSource
    }; worker-src blob:; child-src blob:; font-src ${
      this._panel.webview.cspSource
    }">
      <title>C# Dependency Graph</title>
      <script src="${d3Uri}" type="application/javascript"></script>
      <script src="${graphvizUri}" type="application/javascript"></script>
      <script src="${d3GraphvizUri}" type="application/javascript"></script>
      <style>
        body {
          margin: 0;
          padding: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .toolbar {
          padding: 10px;
          background: #f0f0f0;
          border-bottom: 1px solid #ddd;
          display: flex;
          gap: 10px;
        }
        #graph {
          flex: 1;
          overflow: auto;
          width: 100%;
          height: 100%;
        }
        .graph-container {
          width: 100%;
          height: 100%;
        }
        .error {
          color: red;
          padding: 20px;
        }
        button {
          padding: 5px 10px;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 3px;
          cursor: pointer;
        }
        button:hover {
          background: #f5f5f5;
        }
        .engine-selector {
          display: flex;
          align-items: center;
          margin-left: auto;
        }
        .engine-selector label {
          margin-right: 5px;
        }
        select {
          padding: 4px;
          border-radius: 3px;
          border: 1px solid #ccc;
        }
        .status-message {
          position: fixed;
          bottom: 10px;
          left: 10px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 5px 10px;
          border-radius: 3px;
          font-size: 12px;
          z-index: 1000;
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button id="resetZoom">Reset</button>
        <button id="exportSvg">Export SVG</button>
        <button id="debugInfo">Debug Info</button>
        <div class="engine-selector">
          <label for="engineSelect">Engine:</label>
          <select id="engineSelect">
            <option value="dot" selected>dot</option>
            <option value="circo">circo</option>
            <option value="fdp">fdp</option>
            <option value="sfdp">sfdp</option>
            <option value="neato">neato</option>
            <option value="osage">osage</option>
            <option value="patchwork">patchwork</option>
            <option value="twopi">twopi</option>
          </select>
        </div>
      </div>
      <div id="graph">
        <div class="graph-container"></div>
      </div>
      <div id="status" class="status-message" style="display: none;"></div>
      <script>
        const vscode = acquireVsCodeApi();
        const graphDiv = document.querySelector('.graph-container');
        // Display status messages
        function showStatus(message) {
          const status = document.getElementById('status');
          status.textContent = message;
          status.style.display = 'block';
          console.log("[Status]", message);
          
          // Also send to VSCode
          vscode.postMessage({
            command: 'log',
            text: message
          });
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            status.style.display = 'none';
          }, 5000);
        }
        
        // Error handling
        window.addEventListener('error', (event) => {
          vscode.postMessage({
            command: 'error',
            text: 'JavaScript error: ' + event.message
          });
          showStatus('Error: ' + event.message);
        });

        // Use the CDN version for WASM files
        const hpccWasm = window["@hpcc-js/wasm"];
        if (hpccWasm && hpccWasm.Graphviz) {
          hpccWasm.Graphviz.wasmFolder = "${wasmFolderUri}"
          showStatus("WASM configuration set");
        } else {
          showStatus("Warning: WASM configuration object not found");
        }
        
        
        
        // DOT content to render
        const dotContent = ${JSON.stringify(dotContent)};
        showStatus("DOT content loaded: " + dotContent.substring(0, 50) + "...");
        
        // Current engine
        let currentEngine = "dot";
        
        // Create the graphviz renderer
        let graphviz;
        try {
          graphviz = d3.select(".graph-container")
            .graphviz()
            .engine(currentEngine)
            .width("100%")
            .height("100%")
            .zoom(true)
            .fit(true);
          showStatus("Graphviz renderer initialized");
        } catch (error) {
          showStatus("Failed to initialize graphviz: " + error.message);
          vscode.postMessage({
            command: 'error',
            text: 'Failed to initialize graphviz: ' + error.message
          });
        }
        
        // Render the graph
        function renderGraph() {
          showStatus("Rendering graph with engine: " + currentEngine);
          try {
            if (!graphviz) {
              throw new Error("Graphviz renderer not initialized");
            }
            
            graphviz
              .engine(currentEngine)
              .renderDot(dotContent)
              .on("end", function() {
                showStatus("Graph rendering complete");
              })
              .onerror(function(error) {
                showStatus("Graph rendering error: " + error);
                vscode.postMessage({
                  command: 'error',
                  text: 'Graph rendering error: ' + error
                });
              });
          } catch (error) {
            graphDiv.innerHTML = '<div class="error">Error rendering graph: ' + error.message + '</div>';
            showStatus("Error rendering graph: " + error.message);
            vscode.postMessage({
              command: 'error',
              text: 'Error rendering graph: ' + error.message
            });
          }
        }
        
        // Add event listener for engine selection
        document.getElementById('engineSelect').addEventListener('change', (event) => {
          currentEngine = event.target.value;
          showStatus("Switching to engine: " + currentEngine);
          renderGraph();
        });
        
        document.getElementById('resetZoom').addEventListener('click', () => {
          if (graphviz) {
            graphviz.resetZoom();
            showStatus("Zoom reset");
          }
        });
        
        // Add debug button
        document.getElementById('debugInfo').addEventListener('click', () => {
          const debugInfo = {
            d3Version: d3.version,
            dotContentLength: dotContent.length,
            graphvizInitialized: !!graphviz,
            wasmAvailable: !!hpccWasm
          };
          
          showStatus("Debug info: " + JSON.stringify(debugInfo));
          vscode.postMessage({
            command: 'log',
            text: 'Debug info: ' + JSON.stringify(debugInfo, null, 2)
          });
        });
        
        // Start rendering after a short delay to ensure everything is loaded
        setTimeout(() => {
          showStatus("Starting graph rendering...");
          renderGraph();
        }, 500);

        // Export SVG functionality
document.getElementById('exportSvg').addEventListener('click', () => {
  try {
    // Get the SVG element
    const svgElement = document.querySelector('.graph-container svg');
    if (!svgElement) {
      throw new Error('SVG element not found');
    }
    
    // Clone to avoid modifying the displayed SVG
    const svgClone = svgElement.cloneNode(true);
    
    // Add XML declaration and namespace
    const svgData = new XMLSerializer().serializeToString(svgClone);
    
    // Direct transmission of SVG data instead of URL
    vscode.postMessage({
      command: 'exportSvg',
      svgData: svgData,
      title: document.title || 'dependency-graph'
    });
    
    showStatus("Preparing SVG export...");
  } catch (error) {
    showStatus("SVG export failed: " + error.message);
    vscode.postMessage({
      command: 'error',
      text: 'SVG export failed: ' + (error instanceof Error ? error.message : String(error))
    });
  }
});
      </script>
    </body>
    </html>
  `;
  }
}
