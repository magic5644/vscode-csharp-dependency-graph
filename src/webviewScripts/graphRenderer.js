/**
 * Graph renderer module for displaying dependency graphs
 */

// Initialize the state from the window object
const state = window.graphPreviewState;

// DOM elements
const graphContainer = document.querySelector(".graph-container");
const statusElement = document.getElementById("status");
// Unused variables prefixed with underscore to satisfy ESLint
const _engineSelect = document.getElementById("engineSelect");
const _resetBtn = document.getElementById("resetBtn");
const _exportBtn = document.getElementById("exportBtn");
const _resetHighlightBtn = document.getElementById("resetHighlightBtn");
const _toggleCyclesBtn = document.getElementById("toggleCyclesBtn");

// Import the setupInteractivity function from nodeHighlighter
import { setupInteractivity } from './nodeHighlighter.js';

// Use the shared VS Code API instance from main.js
// This prevents the "An instance of the VS Code API has already been acquired" error
const vscode = window.vscode;

/**
 * Shows a status message that fades out after a few seconds
 */
export function showStatus(message) {
  statusElement.textContent = message;
  statusElement.classList.add("visible");
  console.log("[Status]", message);
  
  setTimeout(() => {
    statusElement.classList.remove("visible");
  }, 3000);
}

/**
 * Initializes the graph visualization engine
 */
export function initializeGraphviz() {
  try {
    // Create graphviz instance with simpler initialization to prevent errors
    state.graphviz = d3.select(graphContainer)
      .graphviz()
      .engine(state.currentEngine)
      .width("100%")
      .height("100%")
      .zoom(true)
      .fit(true);
      
    // Set additional options after basic initialization succeeds
    if (state.graphviz) {
      // These options help improve edge rendering
      state.graphviz.tweenShapes(false);
      // Only set additional options if they're supported
      if (typeof state.graphviz.attributeOptions === 'function') {
        state.graphviz.attributeOptions({use: 'edge-usage'});
      }
    }
      
    // Initialize WASM
    const hpccWasm = window["@hpcc-js/wasm"];
    if (hpccWasm && hpccWasm.Graphviz) {
      hpccWasm.Graphviz.wasmFolder = state.wasmFolderUri;
      console.log("WASM folder set to:", state.wasmFolderUri);
    }
    
    showStatus("Graph renderer initialized");
    return state.graphviz;
  } catch (error) {
    console.error("Failed to initialize graphviz:", error);
    showStatus("Error: " + error.message);
    return null; // Ensure we don't use a partially initialized instance
  }
}

/**
 * Renders the graph using the current engine and dot source
 */
export function renderGraph() {
  try {
    if (!state.graphviz) throw new Error("Graphviz not initialized");

    showStatus("Rendering graph with " + state.currentEngine);
    
    const result = state.graphviz
      .engine(state.currentEngine)
      .renderDot(state.dotSource)
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

/**
 * Setup zoom behavior explicitly
 */
function setupZoomBehavior() {
  try {
    const svg = graphContainer.querySelector("svg");
    if (!svg) return;
    
    // Make sure we have a zoom behavior
    if (state.graphviz && typeof state.graphviz.zoomBehavior === 'function') {
      state.zoomBehavior = state.graphviz.zoomBehavior();
      
      // Ensure the zoom behavior is properly applied
      const g = svg.querySelector("g");
      if (g) {
        // This makes sure the wheel events are processed by d3's zoom
        d3.select(svg).call(state.zoomBehavior);
        showStatus("Zoom behavior initialized");
      }
    }
  } catch (error) {
    console.error("Error setting up zoom:", error);
  }
}

/**
 * Resets the zoom and view to the default state
 */
export function resetView() {
  if (state.graphviz) {
    state.graphviz.resetZoom();
    showStatus("View reset");
  }
}