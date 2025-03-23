import * as vscode from "vscode";

export class GraphPreviewProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public showPreview(dotContent: string, title: string): void {
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
        ],
      }
    );

    // Handle panel closure
    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage((message) => {
      if (message.command === "error") {
        vscode.window.showErrorMessage(message.text);
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

    // HTML with d3-graphviz
    this._panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} https: data:; script-src ${this._panel.webview.cspSource} https://cdn.jsdelivr.net 'unsafe-inline' 'unsafe-eval'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; connect-src ${this._panel.webview.cspSource} https://cdn.jsdelivr.net; worker-src blob:; child-src blob:; font-src ${this._panel.webview.cspSource}">
      <title>C# Dependency Graph</title>
      <script src="${d3Uri}"></script>
      <script src="${graphvizUri}"></script>
      <script src="${d3GraphvizUri}"></script>
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
          hpccWasm.Graphviz.wasmFolder = "https://cdn.jsdelivr.net/npm/@hpcc-js/wasm/dist";
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
      </script>
    </body>
    </html>
  `;
  }
}
