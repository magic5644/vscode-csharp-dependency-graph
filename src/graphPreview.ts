import * as vscode from "vscode";
import * as path from "path";

export class GraphPreviewProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private readonly _extensionUri: vscode.Uri;
  private _sourceFilePath: string | undefined;
  private _dotContent: string = "";
  private _cyclesOnlyDotContent: string | undefined;
  private _hasCycles: boolean = false;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public showPreview(
    dotContent: string,
    title: string,
    sourceFilePath?: string,
    cyclesOnlyDotContent?: string
  ): void {
    this._sourceFilePath = sourceFilePath;
    this._dotContent = dotContent;
    this._cyclesOnlyDotContent = cyclesOnlyDotContent;
    this._hasCycles = !!cyclesOnlyDotContent; // Si on a du contenu pour cycles-only, alors il y a des cycles
    
    // If a panel is already open, show it and update its content
    if (this._panel) {
      this._panel.reveal();
      // Also update the panel title when showing a new preview
      this._panel.title = title;
      this._updateContent(dotContent);
      return;
    }

    // Otherwise, create a new panel
    this._panel = vscode.window.createWebviewPanel(
      "vscode-csharp-dependency-graph",
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
            const baseName = path.basename(
              this._sourceFilePath,
              path.extname(this._sourceFilePath)
            );
            const fileName = `${baseName}.svg`;
            defaultUri = vscode.Uri.file(path.join(sourceDir, fileName));
          } else {
            // Fallback if no source file (generated from command)
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const baseDir = workspaceFolder ? workspaceFolder.uri.fsPath : "";
            defaultUri = vscode.Uri.file(
              path.join(baseDir, `${message.title ?? "dependency-graph"}.svg`)
            );
          }

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
          vscode.window.showErrorMessage(
            `Failed to export SVG: ${errorMessage}`
          );
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
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        button.active {
          background: #007acc;
          color: #fff;
          border-color: #007acc;
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
        .status {
          position: fixed;
          bottom: 10px;
          left: 10px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 5px 10px;
          border-radius: 3px;
          font-size: 12px;
          z-index: 1000;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .status.visible {
          opacity: 1;
        }

        /* Styles for highlighting nodes */
        .node text {
          cursor: pointer;
        }
        
        .node.highlighted polygon,
        .node.highlighted ellipse,
        .node.highlighted rect, 
        .node.highlighted circle {
          stroke: #ff6600 !important;
          stroke-width: 2px !important;
        }
        
        .node.highlighted text {
          font-weight: bold !important;
        }
        
        .node.faded {
          opacity: 0.2;
        }
        
        .edge.highlighted path {
          stroke: #ff6600 !important;
          stroke-width: 2px !important;
        }

        .edge.highlighted polygon {
        stroke: #ff6600 !important;
        fill: #ff6600 !important;
        }
        
        .edge.faded {
          opacity: 0.1;
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button id="resetBtn">Reset View</button>
        <button id="exportBtn">Export SVG</button>
        <button id="resetHighlightBtn">Clear Highlight</button>
        <button id="toggleCyclesBtn" ${!this._hasCycles ? 'disabled' : ''}>Show Cycles Only</button>
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
      <div id="status" class="status"></div>
      <script>
        // Immediately Invoked Function Expression to avoid global scope pollution
        (function() {
          // State variables
          let currentEngine = "dot";
          let highlightMode = false;
          let dotSource = ${JSON.stringify(dotContent)};
          let zoomBehavior;
          let isShowingCyclesOnly = false;
          let normalDotSource = ${JSON.stringify(dotContent)};
          let cyclesOnlyDotSource = ${JSON.stringify(this._cyclesOnlyDotContent || "")};
          let hasCycles = ${this._hasCycles};
          
          // DOM elements
          const graphContainer = document.querySelector(".graph-container");
          const statusElement = document.getElementById("status");
          const engineSelect = document.getElementById("engineSelect");
          const resetBtn = document.getElementById("resetBtn");
          const exportBtn = document.getElementById("exportBtn");
          const resetHighlightBtn = document.getElementById("resetHighlightBtn");
          const toggleCyclesBtn = document.getElementById("toggleCyclesBtn");
          
          // Message handler to communicate with VS Code extension
          const vscode = acquireVsCodeApi();
          
          // Show a status message
          function showStatus(message) {
            statusElement.textContent = message;
            statusElement.classList.add("visible");
            console.log("[Status]", message);
            
            setTimeout(() => {
              statusElement.classList.remove("visible");
            }, 3000);
          }
          
          // Initialize graphviz
          let graphviz;
          try {
            // Create graphviz instance with simpler initialization to prevent errors
            graphviz = d3.select(graphContainer)
              .graphviz()
              .engine(currentEngine)
              .width("100%")
              .height("100%")
              .zoom(true)
              .fit(true);
              
            // Set additional options after basic initialization succeeds
            if (graphviz) {
              // These options help improve edge rendering
              graphviz.tweenShapes(false);
              // Only set additional options if they're supported
              if (typeof graphviz.attributeOptions === 'function') {
                graphviz.attributeOptions({use: 'edge-usage'});
              }
            }
              
            // Initialize WASM
            const hpccWasm = window["@hpcc-js/wasm"];
            if (hpccWasm && hpccWasm.Graphviz) {
              hpccWasm.Graphviz.wasmFolder = "${wasmFolderUri}";
              console.log("WASM folder set to:", "${wasmFolderUri}");
            }
            
            showStatus("Graph renderer initialized");
          } catch (error) {
            console.error("Failed to initialize graphviz:", error);
            showStatus("Error: " + error.message);
            graphviz = null; // Ensure we don't use a partially initialized instance
          }
          
          // Toggle between normal and cycles-only view
          function toggleCyclesView() {
            isShowingCyclesOnly = !isShowingCyclesOnly;
            
            // Update button appearance
            toggleCyclesBtn.textContent = isShowingCyclesOnly ? "Show Full Graph" : "Show Cycles Only";
            toggleCyclesBtn.classList.toggle("active", isShowingCyclesOnly);
            
            // Switch the DOT source
            dotSource = isShowingCyclesOnly ? cyclesOnlyDotSource : normalDotSource;
            
            // Re-render the graph
            renderGraph();
            
            showStatus(isShowingCyclesOnly ? "Showing cycles only" : "Showing full graph");
          }
          
          // Create the graph
          function renderGraph() {
            try {
              if (!graphviz) throw new Error("Graphviz not initialized");
         
              showStatus("Rendering graph with " + currentEngine);
              
              const result = graphviz
                .engine(currentEngine)
                .renderDot(dotSource)
                .on("end", function() {
                  setupInteractivity();
                  setupZoomBehavior();
                })
                .onerror(function(error) {
                  console.error("Graph rendering error:", error);
                  showStatus("Error: " + error);
                });

              showStatus("Rendering complete "+ (result.status ? ": " + result.status : ""));
              if (result.status !== undefined && result.status != "success") {
                showStatus(result.errors && result.errors.length > 0 && result.errors[0] || result);
              }
                
            } catch (error) {
              console.error("Error rendering graph:", error);
              showStatus("Error: " + error);

              // Notify VS Code about the error
              if (vscode) {
                vscode.postMessage({
                  command: "error",
                  text: "Graph rendering error: " + error
                });
              }
            }
          }
          
          // Setup zoom behavior explicitly
          function setupZoomBehavior() {
            try {
              const svg = graphContainer.querySelector("svg");
              if (!svg) return;
              
              // Make sure we have a zoom behavior
              if (graphviz && typeof graphviz.zoomBehavior === 'function') {
                zoomBehavior = graphviz.zoomBehavior();
                
                // Ensure the zoom behavior is properly applied
                const g = svg.querySelector("g");
                if (g) {
                  // This makes sure the wheel events are processed by d3's zoom
                  d3.select(svg).call(zoomBehavior);
                  showStatus("Zoom behavior initialized");
                }
              }
            } catch (error) {
              console.error("Error setting up zoom:", error);
            }
          }
          
          // Clear any highlighting
          function clearHighlighting() {
            if (!highlightMode) return;
            
            try {
              const svg = graphContainer.querySelector("svg");
              if (!svg) return;
              
              // Reset node styles
              svg.querySelectorAll("g.node").forEach(node => {
                node.classList.remove("highlighted");
                node.classList.remove("faded");
              });
              
              // Reset edge styles
              svg.querySelectorAll("g.edge").forEach(edge => {
                edge.classList.remove("highlighted");
                edge.classList.remove("faded");
              });
              
              highlightMode = false;
              showStatus("Highlighting cleared");
            } catch (error) {
              console.error("Error clearing highlighting:", error);
            }
          }
          
          // Get a node's ID from its title element
          function getNodeId(node) {
            try {
              const titleEl = node.querySelector("title");
              return titleEl ? titleEl.textContent : null;
            } catch (error) {
              console.error("Error getting node ID:", error);
              return null;
            }
          }
          
          // Handle clicks on graph elements via event delegation
          function setupInteractivity() {
            try {
              const svg = graphContainer.querySelector("svg");
              if (!svg) return;
              
              // We no longer clone the SVG as it breaks the zoom behavior
              // Instead, we just remove existing listeners if any
              svg.removeEventListener("click", svgClickHandler);
              svg.addEventListener("click", svgClickHandler);
              
              showStatus("Graph ready");
            } catch (error) {
              console.error("Error setting up interactivity:", error);
            }
          }
          
          // SVG click handler function - separate to allow clean removal
          function svgClickHandler(event) {
            // Find if we clicked on a node or its child
            let target = event.target;
            let nodeElement = null;
            
            // Traverse up to find if we clicked in a node
            while (target && target.ownerSVGElement) {
              if (target.classList && target.classList.contains("node")) {
                nodeElement = target;
                break;
              }
              if (target.parentElement && 
                  target.parentElement.classList && 
                  target.parentElement.classList.contains("node")) {
                nodeElement = target.parentElement;
                break;
              }
              target = target.parentElement;
            }
            
            if (nodeElement) {
              // Node click
              event.stopPropagation();
              highlightNodeDependencies(nodeElement);
            } else if (target === event.currentTarget) {
              // Background click
              clearHighlighting();
            }
          }
          
          // Highlight a node and all its dependencies recursively
          function highlightNodeDependencies(nodeElement) {
            try {
              // Get the node ID
              const clickedNodeId = getNodeId(nodeElement);
              if (!clickedNodeId) return;
              
              // Clear existing highlighting - IMPORTANT: Always reset before applying new highlights
              clearHighlighting();
              
              const svg = nodeElement.ownerSVGElement;
              if (!svg) return;
              
              // First, fade all nodes and edges
              svg.querySelectorAll("g.node").forEach(node => {
                node.classList.add("faded");
                // Make sure no old highlighting classes remain
                node.classList.remove("highlighted");
              });
              
              svg.querySelectorAll("g.edge").forEach(edge => {
                edge.classList.add("faded");
                // Make sure no old highlighting classes remain
                edge.classList.remove("highlighted");
              });
              
              // Set to track visited nodes to avoid infinite recursion
              const visitedNodes = new Set();
              // Set for all nodes that should be highlighted
              const nodesToHighlight = new Set();
              // Set for all edges that should be highlighted
              const edgesToHighlight = new Set();
              
              // Add the clicked node
              nodesToHighlight.add(clickedNodeId);
              
              // Recursive function to find all connected nodes
              function findConnectedNodes(currentNodeId) {
                // Skip if we've already visited this node
                if (visitedNodes.has(currentNodeId)) return;
                visitedNodes.add(currentNodeId);
                
                // Find all edges connected to this node
                svg.querySelectorAll("g.edge").forEach(edge => {
                  const edgeId = getNodeId(edge);
                  if (!edgeId) return;
                  
                  // Parse the edge ID (format: "source->target")
                  const parts = edgeId.split("->");
                  if (parts.length !== 2) return;
                  
                  const source = parts[0].trim();
                  const target = parts[1].trim();
                  
                  // Check if this edge connects to our node
                  if (source === currentNodeId || target === currentNodeId) {
                    // Add edge to highlight list
                    edgesToHighlight.add(edge);
                    
                    // Find the node on the other end
                    const connectedNodeId = source === currentNodeId ? target : source;
                    
                    // Add connected node to highlight list
                    nodesToHighlight.add(connectedNodeId);
                    
                    // Continue traversal with the connected node
                    findConnectedNodes(connectedNodeId);
                  }
                });
              }
              
              // Start recursive traversal from the clicked node
              findConnectedNodes(clickedNodeId);
              
              // Apply highlighting to all collected nodes
              svg.querySelectorAll("g.node").forEach(node => {
                const id = getNodeId(node);
                if (nodesToHighlight.has(id)) {
                  node.classList.remove("faded");
                  if (id === clickedNodeId) {
                    // Only add the highlighted class to the original clicked node
                    node.classList.add("highlighted");
                  }
                }
              });
              
              // Apply highlighting to all collected edges
              edgesToHighlight.forEach(edge => {
                edge.classList.remove("faded");
                edge.classList.add("highlighted");
              });
              
              highlightMode = true;
            } catch (error) {
              console.error("Error highlighting node:", error);
              showStatus("Error highlighting node");
            }
          }
          
          // Export SVG
          function exportSvg() {
            try {
              const svg = graphContainer.querySelector("svg");
              if (!svg) {
                throw new Error("No SVG found to export");
              }
              
              // Get SVG as a string
              const serializer = new XMLSerializer();
              const svgString = serializer.serializeToString(svg);
              
              // Send to VS Code extension
              vscode.postMessage({
                command: "exportSvg",
                svgData: svgString,
                title: document.title || "dependency-graph"
              });
              
              showStatus("Preparing SVG export...");
            } catch (error) {
              console.error("Error exporting SVG:", error);
              showStatus("Error exporting SVG: " + error.message);
              
              // Report error to VS Code
              vscode.postMessage({
                command: "error",
                text: "SVG export error: " + error.message
              });
            }
          }
          
          // Set up button event handlers
          resetBtn.addEventListener("click", function() {
            if (graphviz) {
              graphviz.resetZoom();
              showStatus("View reset");
            }
          });
          
          exportBtn.addEventListener("click", exportSvg);
          
          resetHighlightBtn.addEventListener("click", clearHighlighting);
          
          // Add event listener for the toggle cycles button
          if (hasCycles) {
            toggleCyclesBtn.addEventListener("click", toggleCyclesView);
          }
          
          engineSelect.addEventListener("change", function() {
            currentEngine = this.value;
            showStatus("Switching to " + currentEngine + " engine");
            renderGraph();
          });
          
          // Initial render
          renderGraph();
          
          // Handle window resize
          window.addEventListener("resize", function() {
            if (graphviz) {
              try {
                graphviz.width("100%").height("100%");
              } catch (err) {
                // Ignore resize errors
              }
            }
          });
        })();
      </script>
    </body>
    </html>
  `;
  }
}
