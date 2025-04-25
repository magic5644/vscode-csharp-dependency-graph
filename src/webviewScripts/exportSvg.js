/**
 * Export functionality for saving the graph as SVG
 */

// Reference to the shared state
const _state = window.graphPreviewState;

// Import from graph renderer
import { showStatus } from './graphRenderer.js';

// DOM elements
const graphContainer = document.querySelector(".graph-container");

/**
 * Exports the current graph as SVG
 */
export function exportSvg() {
  try {
    const svg = graphContainer.querySelector("svg");
    if (!svg) {
      throw new Error("No SVG found to export");
    }
    
    // Get SVG as a string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    
    // Always use the global window.vscode directly instead of a local reference
    // This ensures we're using the same instance that was initialized in main.js
    if (!window.vscode) {
      throw new Error("VS Code API not available");
    }
    
    // Send to VS Code extension
    window.vscode.postMessage({
      command: "exportSvg",
      svgData: svgString,
      title: document.title || "dependency-graph"
    });
    
    showStatus("Preparing SVG export...");
  } catch (error) {
    console.error("Error exporting SVG:", error);
    showStatus("Error exporting SVG: " + error.message);
    
    // Report error to VS Code if available
    if (window.vscode) {
      window.vscode.postMessage({
        command: "error",
        text: "SVG export error: " + error.message
      });
    }
  }
}