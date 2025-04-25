import * as vscode from 'vscode';

/**
 * Interface for graph preview template parameters
 */
export interface GraphPreviewTemplateParams {
  cspSource: string;
  d3Uri: vscode.Uri;
  graphvizUri: vscode.Uri;
  d3GraphvizUri: vscode.Uri;
  wasmFolderUri: vscode.Uri;
  webviewScriptUri: vscode.Uri; // Added webview script URI
  dotContent: string;
  cyclesOnlyDotContent?: string;
  hasCycles: boolean;
}

/**
 * Generates the HTML template for the graph preview
 */
export function generateHtmlTemplate(params: GraphPreviewTemplateParams): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${
        params.cspSource
      } data:; script-src ${
        params.cspSource
      } 'unsafe-inline' 'unsafe-eval'; style-src ${
        params.cspSource
      } 'unsafe-inline'; connect-src ${
        params.cspSource
      }; worker-src blob:; child-src blob:; font-src ${
        params.cspSource
      }">
      <title>C# Dependency Graph</title>
      <script src="${params.d3Uri}"></script>
      <script src="${params.graphvizUri}"></script>
      <script src="${params.d3GraphvizUri}"></script>
      ${generateStyles()}
    </head>
    <body>
      ${generateToolbar(params.hasCycles)}
      <div id="graph">
        <div class="graph-container"></div>
      </div>
      <div id="status" class="status"></div>
      ${generateScripts(params)}
    </body>
    </html>
  `;
}

/**
 * Generates the CSS styles for the graph preview
 */
function generateStyles(): string {
  return `
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
        position: relative;
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
      .cycle-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        background: #e51400;
        color: white;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        pointer-events: none;
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
  `;
}

/**
 * Generates the toolbar HTML
 */
function generateToolbar(hasCycles: boolean): string {
  return `
    <div class="toolbar">
      <button id="resetBtn">Reset View</button>
      <button id="exportBtn">Export SVG</button>
      <button id="resetHighlightBtn">Clear Highlight</button>
      <button id="toggleCyclesBtn" ${!hasCycles ? 'disabled' : ''}>
        Show Cycles Only
        ${hasCycles ? `<span class="cycle-badge" id="cycleBadge"></span>` : ''}
      </button>
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
  `;
}

/**
 * Generates the JavaScript for the graph preview
 */
function generateScripts(params: GraphPreviewTemplateParams): string {
  return `
    <script>
      // State variables
      window.graphPreviewState = {
        currentEngine: "dot",
        highlightMode: false,
        dotSource: ${JSON.stringify(params.dotContent)},
        zoomBehavior: null,
        isShowingCyclesOnly: false,
        normalDotSource: ${JSON.stringify(params.dotContent)},
        cyclesOnlyDotSource: ${JSON.stringify(params.cyclesOnlyDotContent || "")},
        hasCycles: ${params.hasCycles},
        wasmFolderUri: "${params.wasmFolderUri}"
      };
      
      // Export script URIs to global scope for dynamic loading
      window.d3Uri = "${params.d3Uri}";
      window.graphvizUri = "${params.graphvizUri}";
      window.d3GraphvizUri = "${params.d3GraphvizUri}";
    </script>
    <script src="${params.webviewScriptUri}"></script>
  `;
}