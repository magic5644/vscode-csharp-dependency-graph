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
      "csharpDependencyGraph",
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
      <title>C# Dependency Graph</title>
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
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button id="zoomIn">Zoom In</button>
        <button id="zoomOut">Zoom Out</button>
        <button id="resetZoom">Reset</button>
        <button id="fitGraph">Fit to View</button>
      </div>
      <div id="graph">
        <div class="graph-container"></div>
      </div>
      
      <script src="${d3Uri}"></script>
      <script src="${graphvizUri}"></script>
      <script src="${d3GraphvizUri}"></script>
      <script>
        // Use the CDN version for WASM files
        // The @hpcc-js/wasm library will load the WASM file dynamically
        hpccWasm = window["@hpcc-js/wasm"];
        if (hpccWasm && hpccWasm.Graphviz) {
          hpccWasm.Graphviz.wasmFolder = "https://cdn.jsdelivr.net/npm/@hpcc-js/wasm/dist";
        }
        
        const vscode = acquireVsCodeApi();
        const graphDiv = document.querySelector('.graph-container');
        
        // DOT content to render
        const dotContent = ${JSON.stringify(dotContent)};
        
        // Create the graphviz renderer
        const graphviz = d3.select(".graph-container")
          .graphviz()
          .engine("dot")
          .width("100%")
          .height("100%")
          .zoom(true)
          .fit(true);
        
        // Render the graph
        function renderGraph() {
          try {
            graphviz
              .renderDot(dotContent)
              .on("end", function() {
                console.log("Graph rendering complete");
              });
          } catch (error) {
            graphDiv.innerHTML = '<div class="error">Error rendering graph: ' + error.message + '</div>';
            vscode.postMessage({
              command: 'error',
              text: 'Error rendering graph: ' + error.message
            });
          }
        }
        
        // Add event listeners for zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => {
          const currentScale = graphviz.zoomScale();
          graphviz.zoom(true).scale(currentScale * 1.2).render();
        });
        
        document.getElementById('zoomOut').addEventListener('click', () => {
          const currentScale = graphviz.zoomScale();
          graphviz.zoom(true).scale(currentScale * 0.8).render();
        });
        
        document.getElementById('resetZoom').addEventListener('click', () => {
          graphviz.resetZoom();
        });
        
        document.getElementById('fitGraph').addEventListener('click', () => {
          graphviz.fit(true).render();
        });
        
        // Start rendering
        renderGraph();
      </script>
    </body>
    </html>
  `;
  }
}